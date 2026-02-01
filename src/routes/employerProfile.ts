/**
 * Employer Profile Routes
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "../config/database.ts";
import { employerProfiles, kycRecords, KycStatuses } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate, auditUpdate } from "../services/auditService.ts";
import {
	signUploadParams,
	UploadTypes,
} from "../services/cloudinaryService.ts";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const createProfileSchema = z.object({
	companyName: z.string().min(2, "Company name is required"),
	companyType: z.enum(["startup", "sme", "enterprise", "agency"]).optional(),
	industry: z.string().optional(),
	companySize: z.enum(["1-10", "11-50", "51-200", "201-500", "500+"]).optional(),
	foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
	website: z.string().url().optional(),
	contactPersonName: z.string().optional(),
	contactEmail: z.string().email().optional(),
	contactPhone: z.string().optional(),
	address: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	country: z.string().default("India"),
	pincode: z.string().optional(),
	description: z.string().max(2000).optional(),
	culture: z.string().max(2000).optional(),
	benefits: z.array(z.string()).optional(),
	gstin: z.string().optional(),
	pan: z.string().optional(),
});

const updateProfileSchema = createProfileSchema.partial();

// ============================================
// Routes
// ============================================

/**
 * GET /profile/employer
 * Get own profile
 */
router.get(
	"/",
	authMiddleware(),
	requirePermission(Permissions.EMPLOYER_PROFILE_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const [profile] = await db
			.select()
			.from(employerProfiles)
			.where(
				and(
					eq(employerProfiles.userId, userId),
					isNull(employerProfiles.deletedAt)
				)
			)
			.limit(1);

		if (!profile) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Profile not found. Please create your company profile.",
			});
		}

		// Get verification status
		const [kycRecord] = await db
			.select({ status: kycRecords.status })
			.from(kycRecords)
			.where(
				and(
					eq(kycRecords.userId, userId),
					eq(kycRecords.status, KycStatuses.APPROVED),
					isNull(kycRecords.deletedAt)
				)
			)
			.limit(1);

		return res.status(StatusCodes.OK).json({
			profile,
			isVerified: profile.isVerified || !!kycRecord,
		});
	})
);

/**
 * POST /profile/employer
 * Create profile
 */
router.post(
	"/",
	authMiddleware(),
	requirePermission(Permissions.EMPLOYER_PROFILE_CREATE),
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
				throw new HTTPError({
					httpStatus: StatusCodes.CONFLICT,
					message: "Profile already exists. Use PATCH to update.",
				});
			}

			// Create profile
			const [profile] = await db
				.insert(employerProfiles)
				.values({
					userId,
					companyName: data.companyName,
					companyType: data.companyType as any,
					industry: data.industry || null,
					companySize: data.companySize as any,
					foundedYear: data.foundedYear || null,
					website: data.website || null,
					contactPersonName: data.contactPersonName || null,
					contactEmail: data.contactEmail || null,
					contactPhone: data.contactPhone || null,
					address: data.address || null,
					city: data.city || null,
					state: data.state || null,
					country: data.country,
					pincode: data.pincode || null,
					description: data.description || null,
					culture: data.culture || null,
					benefits: data.benefits || null,
					gstin: data.gstin || null,
					pan: data.pan || null,
				})
				.returning();

			// Audit log
			await auditCreate("employer_profile", profile.id, {
				companyName: data.companyName,
			}, {
				userId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			});

			return res.status(StatusCodes.CREATED).json({ profile });
		},
		{
			validationSchema: createProfileSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /profile/employer
 * Update profile
 */
router.patch(
	"/",
	authMiddleware(),
	requirePermission(Permissions.EMPLOYER_PROFILE_UPDATE_OWN),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Get existing profile
			const [existing] = await db
				.select()
				.from(employerProfiles)
				.where(
					and(
						eq(employerProfiles.userId, userId),
						isNull(employerProfiles.deletedAt)
					)
				)
				.limit(1);

			if (!existing) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Profile not found. Please create your company profile first.",
				});
			}

			// Build update object
			const updateData: Record<string, any> = {
				updatedAt: new Date(),
			};

			if (data.companyName) updateData.companyName = data.companyName;
			if (data.companyType) updateData.companyType = data.companyType;
			if (data.industry !== undefined) updateData.industry = data.industry || null;
			if (data.companySize) updateData.companySize = data.companySize;
			if (data.foundedYear !== undefined) updateData.foundedYear = data.foundedYear;
			if (data.website !== undefined) updateData.website = data.website || null;
			if (data.contactPersonName !== undefined) updateData.contactPersonName = data.contactPersonName || null;
			if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail || null;
			if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone || null;
			if (data.address !== undefined) updateData.address = data.address || null;
			if (data.city !== undefined) updateData.city = data.city || null;
			if (data.state !== undefined) updateData.state = data.state || null;
			if (data.country) updateData.country = data.country;
			if (data.pincode !== undefined) updateData.pincode = data.pincode || null;
			if (data.description !== undefined) updateData.description = data.description || null;
			if (data.culture !== undefined) updateData.culture = data.culture || null;
			if (data.benefits !== undefined) updateData.benefits = data.benefits || null;
			if (data.gstin !== undefined) updateData.gstin = data.gstin || null;
			if (data.pan !== undefined) updateData.pan = data.pan || null;

			const [profile] = await db
				.update(employerProfiles)
				.set(updateData)
				.where(eq(employerProfiles.id, existing.id))
				.returning();

			// Audit log
			await auditUpdate(
				"employer_profile",
				profile.id,
				{ companyName: existing.companyName },
				{ companyName: updateData.companyName || existing.companyName },
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				}
			);

			return res.status(StatusCodes.OK).json({ profile });
		},
		{
			validationSchema: updateProfileSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * GET /profile/employer/upload/logo
 * Get signed upload URL for company logo
 */
router.get(
	"/upload/logo",
	authMiddleware(),
	requirePermission(Permissions.EMPLOYER_PROFILE_UPDATE_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const params = signUploadParams(UploadTypes.COMPANY_LOGO, userId);

		return res.status(StatusCodes.OK).json({
			uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/image/upload`,
			...params,
		});
	})
);

/**
 * PATCH /profile/employer/logo
 * Update logo URL after upload
 */
router.patch(
	"/logo",
	authMiddleware(),
	requirePermission(Permissions.EMPLOYER_PROFILE_UPDATE_OWN),
	expressAsyncHandler(
		async (data: { logoUrl: string }, req, res) => {
			const userId = req.userId!;

			const [profile] = await db
				.update(employerProfiles)
				.set({
					logoUrl: data.logoUrl,
					updatedAt: new Date(),
				})
				.where(eq(employerProfiles.userId, userId))
				.returning({ id: employerProfiles.id, logoUrl: employerProfiles.logoUrl });

			if (!profile) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Profile not found",
				});
			}

			return res.status(StatusCodes.OK).json({
				message: "Logo updated successfully",
				logoUrl: profile.logoUrl,
			});
		},
		{
			validationSchema: z.object({
				logoUrl: z.string().url("Invalid logo URL"),
			}),
			getValue: (req) => req.body,
		}
	)
);

/**
 * Check if employer is verified (for use in other routes)
 */
export async function isEmployerVerified(userId: bigint): Promise<boolean> {
	const [profile] = await db
		.select({ isVerified: employerProfiles.isVerified })
		.from(employerProfiles)
		.where(
			and(
				eq(employerProfiles.userId, userId),
				isNull(employerProfiles.deletedAt)
			)
		)
		.limit(1);

	if (profile?.isVerified) return true;

	// Also check KYC
	const [kycRecord] = await db
		.select({ id: kycRecords.id })
		.from(kycRecords)
		.where(
			and(
				eq(kycRecords.userId, userId),
				eq(kycRecords.status, KycStatuses.APPROVED),
				isNull(kycRecords.deletedAt)
			)
		)
		.limit(1);

	return !!kycRecord;
}

/**
 * Middleware to require verified employer
 */
export function requireVerifiedEmployer() {
	return async (req: any, res: any, next: any) => {
		const userId = req.userId;

		if (!userId) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "Authentication required",
			});
		}

		const verified = await isEmployerVerified(userId);

		if (!verified) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Business verification required",
				code: "VERIFICATION_REQUIRED",
				message: "Please complete business verification to post jobs.",
			});
		}

		next();
	};
}

export default router;
