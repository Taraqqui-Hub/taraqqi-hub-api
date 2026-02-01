/**
 * Registration Routes
 * Multi-step registration flow for profile and KYC submission
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "../config/database.ts";
import {
	users,
	jobseekerProfiles,
	employerProfiles,
	kycRecords,
	VerificationStatuses,
	KycStatuses,
	KycDocumentTypes,
	UserTypes,
} from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requireEmailVerified } from "../middleware/verificationMiddleware.ts";
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

// Employer Profile Schema
const employerProfileSchema = z.object({
	companyName: z.string().min(2, "Company name is required"),
	industry: z.string().min(1, "Industry is required"),
	companyType: z.enum(["startup", "sme", "enterprise", "agency"]).optional(),
	companySize: z.enum(["1-10", "11-50", "51-200", "201-500", "500+"]).optional(),
	website: z.string().url().optional(),
	contactPersonName: z.string().min(2, "Contact person name is required"),
	contactEmail: z.string().email().optional(),
	contactPhone: z.string().optional(),
	address: z.string().min(1, "Address is required"),
	city: z.string().min(1, "City is required"),
	state: z.string().min(1, "State is required"),
	pincode: z.string().optional(),
	description: z.string().max(2000).optional(),
});

// KYC Document Schema
const kycDocumentSchema = z.object({
	documentType: z.enum([
		"aadhaar",
		"pan",
		"passport",
		"driving_license",
		"voter_id",
		"gst_certificate",
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

	// Step 1: Email verification
	if (!user.emailVerified) {
		return { step: 1, message: "Please verify your email address" };
	}

	// Step 2: Profile completion
	if (userType === UserTypes.INDIVIDUAL) {
		const [profile] = await db
			.select({ id: jobseekerProfiles.id })
			.from(jobseekerProfiles)
			.where(eq(jobseekerProfiles.userId, userId))
			.limit(1);

		if (!profile) {
			return { step: 2, message: "Please complete your profile" };
		}
	} else if (userType === UserTypes.EMPLOYER) {
		const [profile] = await db
			.select({ id: employerProfiles.id })
			.from(employerProfiles)
			.where(eq(employerProfiles.userId, userId))
			.limit(1);

		if (!profile) {
			return { step: 2, message: "Please add your company details" };
		}
	}

	// Step 3: KYC submission
	if (user.verificationStatus === VerificationStatuses.DRAFT) {
		return { step: 3, message: "Please submit verification documents" };
	}

	// Step 4: Waiting for approval
	if (
		user.verificationStatus === VerificationStatuses.SUBMITTED ||
		user.verificationStatus === VerificationStatuses.UNDER_REVIEW
	) {
		return { step: 4, message: "Your documents are being reviewed" };
	}

	// Completed
	if (user.verificationStatus === VerificationStatuses.VERIFIED) {
		return { step: 5, message: "Registration complete" };
	}

	return { step: 3, message: "Action required" };
}

// ============================================
// Routes
// ============================================

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
 * Step 2: Add company details
 */
router.post(
	"/employer/company",
	authMiddleware([UserTypes.EMPLOYER]),
	requireEmailVerified(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if profile already exists
			const [existing] = await db
				.select({ id: employerProfiles.id })
				.from(employerProfiles)
				.where(eq(employerProfiles.userId, userId))
				.limit(1);

			if (existing) {
				// Update existing profile
				await db
					.update(employerProfiles)
					.set({
						companyName: data.companyName,
						industry: data.industry,
						companyType: data.companyType as any,
						companySize: data.companySize as any,
						website: data.website || null,
						contactPersonName: data.contactPersonName,
						contactEmail: data.contactEmail || null,
						contactPhone: data.contactPhone || null,
						address: data.address,
						city: data.city,
						state: data.state,
						pincode: data.pincode || null,
						description: data.description || null,
						updatedAt: new Date(),
					})
					.where(eq(employerProfiles.id, existing.id));

				return res.status(StatusCodes.OK).json({
					message: "Company details updated successfully",
					nextStep: "/registration/employer/kyc",
				});
			}

			// Create new profile
			const [profile] = await db
				.insert(employerProfiles)
				.values({
					userId,
					companyName: data.companyName,
					industry: data.industry,
					companyType: data.companyType as any,
					companySize: data.companySize as any,
					website: data.website || null,
					contactPersonName: data.contactPersonName,
					contactEmail: data.contactEmail || null,
					contactPhone: data.contactPhone || null,
					address: data.address,
					city: data.city,
					state: data.state,
					country: "India",
					pincode: data.pincode || null,
					description: data.description || null,
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
				nextStep: "/registration/employer/kyc",
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
 * Step 3: Submit KYC documents
 */
router.post(
	"/:userType/kyc",
	authMiddleware(),
	requireEmailVerified(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;
			const { userType } = req.params;

			// Validate user type matches
			const [user] = await db
				.select({
					userType: users.userType,
					verificationStatus: users.verificationStatus,
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

			// Check if already submitted
			if (
				user.verificationStatus !== VerificationStatuses.DRAFT &&
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
