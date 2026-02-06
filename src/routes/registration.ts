/**
 * Registration Routes
 * Multi-step registration flow for profile and KYC submission
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";

import { db } from "../config/database.ts";
import {
	users,
	jobseekerProfiles,
	employerProfiles,
	kycRecords,
	employerRegistrationPayments,
	VerificationStatuses,
	KycStatuses,
	KycDocumentTypes,
	UserTypes,
} from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import {
	requireEmailVerified,
	requireEmployerPaymentVerifiedOrVerified,
} from "../middleware/verificationMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate, auditUpdate } from "../services/auditService.ts";
import { sendEmail } from "../services/notificationService.ts";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

// Jobseeker Profile Schema
const jobseekerProfileSchema = z.object({
	firstName: z.string().min(2, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	dateOfBirth: z.string().optional(), // ISO date string
	gender: z.enum(["male", "female", "other"]).optional(),
	skills: z.array(z.string()).min(1, "At least one skill is required"),
	city: z.string().min(1, "City is required"),
	state: z.string().optional(),
	headline: z.string().max(200).optional(),
	summary: z.string().max(2000).optional(),
	experienceYears: z.number().int().min(0).max(50).optional(),
	expectedSalary: z.string().optional(),
});

// Employer Profile Schema (post-payment company details)
const employerProfileSchema = z.object({
	companyName: z.string().min(2, "Company legal name is required"),
	brandName: z.string().optional(),
	industry: z.string().min(1, "Industry is required"),
	companyType: z.union([
		z.enum(["startup", "sme", "enterprise", "agency"]),
		z.literal(""),
		z.null(),
		z.undefined()
	]).optional(),
	companySize: z.union([
		z.enum(["1-10", "11-50", "51-200", "201-500", "500+"]),
		z.literal(""),
		z.null(),
		z.undefined()
	]).optional(),
	website: z.union([z.string().url(), z.literal(""), z.null(), z.undefined()]).optional(),
	contactPersonName: z.string().min(2, "Contact person name is required"),
	contactEmail: z.union([z.string().email(), z.literal(""), z.null(), z.undefined()]).optional(),
	contactPhone: z.string().optional(),
	recruiterPhone: z.string().optional(),
	whatsappNumber: z.string().optional(),
	address: z.string().optional(),
	city: z.string().min(1, "City is required"),
	state: z.string().min(1, "State is required"),
	pincode: z.string().optional(),
	description: z.string().max(2000).optional(),
});

// KYC Document Schema (employer: gst_certificate, msme_shop_act, cin, authorized_id)
const kycDocumentSchema = z.object({
	documentType: z.enum([
		"aadhaar",
		"pan",
		"passport",
		"driving_license",
		"voter_id",
		"gst_certificate",
		"msme_shop_act",
		"cin",
		"authorized_id",
	]),
	documentNumber: z.string().min(1, "Document number is required"),
	documentUrl: z.string().url("Invalid document URL"),
	documentBackUrl: z.string().url().optional(),
	selfieUrl: z.string().url().optional(),
});

const submitKycSchema = z.object({
	documents: z.array(kycDocumentSchema).min(1, "At least one document is required"),
});

// ============================================
// Helper: Get Registration Step
// ============================================

async function getRegistrationStep(userId: bigint, userType: string) {
	const [user] = await db
		.select({
			emailVerified: users.emailVerified,
			verificationStatus: users.verificationStatus,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) return { step: 0, message: "User not found" };

	// Employer flow: 1=email (optional), 2=pay, 3=company profile, 4=KYC, 5=pending, 6=verified
	if (userType === UserTypes.EMPLOYER) {
		if (!user.emailVerified) {
			return { step: 1, message: "Please verify your email address" };
		}
		if (user.verificationStatus === VerificationStatuses.DRAFT) {
			return { step: 2, message: "Please pay the one-time onboarding fee" };
		}
		if (user.verificationStatus === VerificationStatuses.PAYMENT_VERIFIED) {
			const [profile] = await db
				.select({ id: employerProfiles.id })
				.from(employerProfiles)
				.where(eq(employerProfiles.userId, userId))
				.limit(1);
			if (!profile) {
				return { step: 3, message: "Please complete your company profile" };
			}
			return { step: 4, message: "Please submit business verification documents" };
		}
		if (
			user.verificationStatus === VerificationStatuses.SUBMITTED ||
			user.verificationStatus === VerificationStatuses.UNDER_REVIEW
		) {
			return { step: 5, message: "Your documents are being reviewed" };
		}
		if (user.verificationStatus === VerificationStatuses.VERIFIED) {
			return { step: 6, message: "Registration complete" };
		}
		if (user.verificationStatus === VerificationStatuses.REJECTED) {
			return { step: 4, message: "Please resubmit verification documents" };
		}
		return { step: 4, message: "Action required" };
	}

	// Individual flow
	if (!user.emailVerified) {
		return { step: 1, message: "Please verify your email address" };
	}
	const [profile] = await db
		.select({ id: jobseekerProfiles.id })
		.from(jobseekerProfiles)
		.where(eq(jobseekerProfiles.userId, userId))
		.limit(1);
	if (!profile) {
		return { step: 2, message: "Please complete your profile" };
	}
	if (user.verificationStatus === VerificationStatuses.DRAFT) {
		return { step: 3, message: "Please submit verification documents" };
	}
	if (
		user.verificationStatus === VerificationStatuses.SUBMITTED ||
		user.verificationStatus === VerificationStatuses.UNDER_REVIEW
	) {
		return { step: 4, message: "Your documents are being reviewed" };
	}
	if (user.verificationStatus === VerificationStatuses.VERIFIED) {
		return { step: 5, message: "Registration complete" };
	}
	return { step: 3, message: "Action required" };
}

// ============================================
// Routes
// ============================================

// Registration fee in paise (e.g. 99900 = ₹999)
const EMPLOYER_REGISTRATION_FEE_PAISE = BigInt(
	process.env.EMPLOYER_REGISTRATION_FEE_PAISE || "99900"
);

/**
 * GET /registration/employer/payment-info
 * What the employer pays and what it unlocks (no auth required for display)
 */
router.get(
	"/employer/payment-info",
	expressAsyncHandler(async (_req, res) => {
		const amountRupees = Number(EMPLOYER_REGISTRATION_FEE_PAISE) / 100;
		return res.status(StatusCodes.OK).json({
			amountPaise: EMPLOYER_REGISTRATION_FEE_PAISE.toString(),
			amountRupees,
			currency: "INR",
			oneTime: true,
			whatsIncluded: [
				"Company profile creation",
				"Job posting access",
				"Viewing applicants",
				"Profile views",
				"Basic support",
			],
		});
	})
);

/**
 * GET /registration/employer/my-payment
 * Get current employer's registration payment (for billing page)
 */
router.get(
	"/employer/my-payment",
	authMiddleware([UserTypes.EMPLOYER]),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const [payment] = await db
			.select({
				id: employerRegistrationPayments.id,
				amountPaise: employerRegistrationPayments.amountPaise,
				currency: employerRegistrationPayments.currency,
				status: employerRegistrationPayments.status,
				paidAt: employerRegistrationPayments.paidAt,
			})
			.from(employerRegistrationPayments)
			.where(eq(employerRegistrationPayments.userId, userId))
			.orderBy(desc(employerRegistrationPayments.paidAt))
			.limit(1);

		if (!payment) {
			return res.status(StatusCodes.OK).json({ payment: null });
		}

		return res.status(StatusCodes.OK).json({
			payment: {
				...payment,
				amountRupees: Number(payment.amountPaise) / 100,
			},
		});
	})
);

/**
 * POST /registration/employer/complete-payment
 * Record registration payment and set status to PAYMENT_VERIFIED (MVP: simulate or use paymentReference)
 */
const completePaymentSchema = z.object({
	paymentReference: z.string().optional(),
	simulate: z.boolean().optional().default(false),
});
router.post(
	"/employer/complete-payment",
	authMiddleware([UserTypes.EMPLOYER]),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			const [user] = await db
				.select({
					id: users.id,
					verificationStatus: users.verificationStatus,
				})
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			if (!user || user.verificationStatus !== VerificationStatuses.DRAFT) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message:
						user?.verificationStatus === VerificationStatuses.PAYMENT_VERIFIED
							? "Registration fee already paid."
							: "Only employers in draft status can complete payment.",
				});
			}

			// Idempotency: already paid with this reference?
			if (data.paymentReference) {
				const [existing] = await db
					.select({ id: employerRegistrationPayments.id })
					.from(employerRegistrationPayments)
					.where(eq(employerRegistrationPayments.userId, userId))
					.limit(1);
				if (existing) {
					await db
						.update(users)
						.set({
							verificationStatus: VerificationStatuses.PAYMENT_VERIFIED,
							updatedAt: new Date(),
						})
						.where(eq(users.id, userId));
					return res.status(StatusCodes.OK).json({
						message: "Payment already recorded",
						verificationStatus: VerificationStatuses.PAYMENT_VERIFIED,
						nextStep: "/employer/register/company",
					});
				}
			}

			await db.transaction(async (tx) => {
				await tx.insert(employerRegistrationPayments).values({
					userId,
					amountPaise: EMPLOYER_REGISTRATION_FEE_PAISE,
					currency: "INR",
					status: "completed",
					paymentGatewayRef: data.paymentReference || null,
					metadata: data.simulate ? JSON.stringify({ simulate: true }) : null,
				});
				await tx
					.update(users)
					.set({
						verificationStatus: VerificationStatuses.PAYMENT_VERIFIED,
						updatedAt: new Date(),
					})
					.where(eq(users.id, userId));
			});

			await auditCreate(
				"employer_registration_payment",
				userId,
				{ amountPaise: EMPLOYER_REGISTRATION_FEE_PAISE.toString() },
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				}
			);

			return res.status(StatusCodes.OK).json({
				message: "Payment successful. You can now complete your company profile.",
				verificationStatus: VerificationStatuses.PAYMENT_VERIFIED,
				nextStep: "/employer/register/company",
			});
		},
		{
			validationSchema: completePaymentSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * GET /registration/status
 * Get current registration step and status
 */
router.get(
	"/status",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const [user] = await db
			.select({
				userType: users.userType,
				verificationStatus: users.verificationStatus,
				emailVerified: users.emailVerified,
				rejectedReason: users.rejectedReason,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: "User not found",
			});
		}

		const stepInfo = await getRegistrationStep(userId, user.userType);

		return res.status(StatusCodes.OK).json({
			currentStep: stepInfo.step,
			message: stepInfo.message,
			userType: user.userType,
			verificationStatus: user.verificationStatus,
			emailVerified: user.emailVerified,
			...(user.verificationStatus === VerificationStatuses.REJECTED && {
				rejectedReason: user.rejectedReason,
			}),
		});
	})
);

/**
 * POST /registration/jobseeker/profile
 * Step 2: Complete jobseeker profile
 */
router.post(
	"/jobseeker/profile",
	authMiddleware([UserTypes.INDIVIDUAL]),
	requireEmailVerified(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if profile already exists
			const [existing] = await db
				.select({ id: jobseekerProfiles.id })
				.from(jobseekerProfiles)
				.where(eq(jobseekerProfiles.userId, userId))
				.limit(1);

			if (existing) {
				// Update existing profile
				await db
					.update(jobseekerProfiles)
					.set({
						firstName: data.firstName,
						lastName: data.lastName,
						dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
						gender: data.gender as any,
						skills: data.skills,
						city: data.city,
						state: data.state || null,
						headline: data.headline || null,
						summary: data.summary || null,
						experienceYears: data.experienceYears || null,
						expectedSalary: data.expectedSalary || null,
						updatedAt: new Date(),
					})
					.where(eq(jobseekerProfiles.id, existing.id));

				return res.status(StatusCodes.OK).json({
					message: "Profile updated successfully",
					nextStep: "/registration/jobseeker/kyc",
				});
			}

			// Create new profile
			const [profile] = await db
				.insert(jobseekerProfiles)
				.values({
					userId,
					firstName: data.firstName,
					lastName: data.lastName,
					dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
					gender: data.gender as any,
					skills: data.skills,
					city: data.city,
					state: data.state || null,
					headline: data.headline || null,
					summary: data.summary || null,
					experienceYears: data.experienceYears || null,
					expectedSalary: data.expectedSalary || null,
					profileCompletion: 50, // Basic profile done
				})
				.returning({ id: jobseekerProfiles.id });

			await auditCreate("jobseeker_profile", profile.id, { userId }, {
				userId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			});

			return res.status(StatusCodes.CREATED).json({
				message: "Profile created successfully",
				nextStep: "/registration/jobseeker/kyc",
			});
		},
		{
			validationSchema: jobseekerProfileSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * POST /registration/employer/company
 * Step 4 (post-payment): Add company details
 */
router.post(
	"/employer/company",
	authMiddleware([UserTypes.EMPLOYER]),
	requireEmployerPaymentVerifiedOrVerified(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if profile already exists
			const [existing] = await db
				.select({ id: employerProfiles.id })
				.from(employerProfiles)
				.where(eq(employerProfiles.userId, userId))
				.limit(1);

			// Clean data helper (empty string -> null)
			const cleanData = {
				...data,
				brandName: data.brandName || null,
				companyType: (data.companyType || null) as any,
				companySize: (data.companySize || null) as any,
				website: data.website || null,
				contactEmail: data.contactEmail || null,
				contactPhone: data.contactPhone || null,
				recruiterPhone: data.recruiterPhone || null,
				whatsappNumber: data.whatsappNumber || null,
				address: data.address || null,
				pincode: data.pincode || null,
				description: data.description || null,
				benefits: (data.benefits && data.benefits.length > 0) ? data.benefits : null,
			};

			if (existing) {
				// Update existing profile
				await db
					.update(employerProfiles)
					.set({
						companyName: data.companyName,
						industry: data.industry,
						contactPersonName: data.contactPersonName,
						city: data.city,
						state: data.state,
						updatedAt: new Date(),
						// Optional fields
						brandName: cleanData.brandName,
						companyType: cleanData.companyType,
						companySize: cleanData.companySize,
						website: cleanData.website,
						contactEmail: cleanData.contactEmail,
						contactPhone: cleanData.contactPhone,
						recruiterPhone: cleanData.recruiterPhone,
						whatsappNumber: cleanData.whatsappNumber,
						address: cleanData.address,
						pincode: cleanData.pincode,
						description: cleanData.description,
					})
					.where(eq(employerProfiles.id, existing.id));

				return res.status(StatusCodes.OK).json({
					message: "Company details updated successfully",
					nextStep: "/kyc",
				});
			}

			// Create new profile
			const [profile] = await db
				.insert(employerProfiles)
				.values({
					userId,
					companyName: data.companyName,
					industry: data.industry,
					contactPersonName: data.contactPersonName,
					city: data.city,
					state: data.state,
					country: "India",
					// Optional fields
					brandName: cleanData.brandName,
					companyType: cleanData.companyType,
					companySize: cleanData.companySize,
					website: cleanData.website,
					contactEmail: cleanData.contactEmail,
					contactPhone: cleanData.contactPhone,
					recruiterPhone: cleanData.recruiterPhone,
					whatsappNumber: cleanData.whatsappNumber,
					address: cleanData.address,
					pincode: cleanData.pincode,
					description: cleanData.description,
				})
				.returning({ id: employerProfiles.id });

			await auditCreate("employer_profile", profile.id, { companyName: data.companyName }, {
				userId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			});

			return res.status(StatusCodes.CREATED).json({
				message: "Company details added successfully",
				nextStep: "/kyc",
			});
		},
		{
			validationSchema: employerProfileSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * POST /registration/jobseeker/kyc
 * POST /registration/employer/kyc
 * Step 3 (jobseeker) / Step 4 (employer): Submit KYC documents
 */
router.post(
	"/:userType/kyc",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;
			const { userType } = req.params;

			// Validate user type matches
			const [user] = await db
				.select({
					userType: users.userType,
					verificationStatus: users.verificationStatus,
					emailVerified: users.emailVerified,
					email: users.email,
				})
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			if (!user) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "User not found",
				});
			}

			if (user.userType !== userType) {
				throw new HTTPError({
					httpStatus: StatusCodes.FORBIDDEN,
					message: "User type mismatch",
				});
			}

			// Jobseeker must have verified email; employer can be PAYMENT_VERIFIED
			if (user.userType === UserTypes.INDIVIDUAL && !user.emailVerified) {
				throw new HTTPError({
					httpStatus: StatusCodes.FORBIDDEN,
					message: "Please verify your email first",
				});
			}
			if (
				user.userType === UserTypes.EMPLOYER &&
				user.verificationStatus !== VerificationStatuses.PAYMENT_VERIFIED &&
				user.verificationStatus !== VerificationStatuses.VERIFIED
			) {
				throw new HTTPError({
					httpStatus: StatusCodes.FORBIDDEN,
					message: "Complete registration payment and company profile first",
				});
			}

			// Check if already submitted (allow DRAFT, PAYMENT_VERIFIED, or REJECTED to submit)
			if (
				user.verificationStatus !== VerificationStatuses.DRAFT &&
				user.verificationStatus !== VerificationStatuses.PAYMENT_VERIFIED &&
				user.verificationStatus !== VerificationStatuses.REJECTED
			) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "KYC already submitted. Please wait for review.",
				});
			}

			// Delete old KYC records if resubmitting
			if (user.verificationStatus === VerificationStatuses.REJECTED) {
				await db
					.delete(kycRecords)
					.where(eq(kycRecords.userId, userId));
			}

			// Insert KYC documents
			const documents = data.documents.map((doc: any) => ({
				userId,
				documentType: doc.documentType as any,
				documentNumber: doc.documentNumber,
				documentUrl: doc.documentUrl,
				documentBackUrl: doc.documentBackUrl || null,
				selfieUrl: doc.selfieUrl || null,
				status: KycStatuses.PENDING,
			}));

			await db.insert(kycRecords).values(documents);

			// Update user verification status to SUBMITTED
			await db
				.update(users)
				.set({
					verificationStatus: VerificationStatuses.SUBMITTED,
					verificationSubmittedAt: new Date(),
					rejectedReason: null, // Clear previous rejection
					updatedAt: new Date(),
				})
				.where(eq(users.id, userId));

			// Audit log
			await auditCreate(
				"kyc_submission",
				userId,
				{ documentCount: documents.length },
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				}
			);

			// Send confirmation email
			if (user.email) {
				await sendEmail(user.email, "kyc_submitted", {
					userName: user.email.split("@")[0],
				});
			}

			return res.status(StatusCodes.OK).json({
				message:
					"Documents submitted successfully. You'll be notified once verification is complete (typically 1-3 business days).",
				verificationStatus: VerificationStatuses.SUBMITTED,
			});
		},
		{
			validationSchema: submitKycSchema,
			getValue: (req) => req.body,
		}
	)
);

export default router;
