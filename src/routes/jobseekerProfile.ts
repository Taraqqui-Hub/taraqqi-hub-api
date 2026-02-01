/**
 * Jobseeker Profile Routes
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "../config/database.ts";
import { jobseekerProfiles, Genders } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate, auditUpdate } from "../services/auditService.ts";
import {
	generateResumeUploadParams,
	generateProfilePhotoUploadParams,
} from "../services/cloudinaryService.ts";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const createProfileSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	dateOfBirth: z.string().optional(),
	gender: z.enum(["male", "female", "other"]).optional(),
	address: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	country: z.string().default("India"),
	pincode: z.string().optional(),
	headline: z.string().max(200).optional(),
	summary: z.string().max(2000).optional(),
	skills: z.array(z.string()).optional(),
	experienceYears: z.number().int().min(0).optional(),
	currentSalary: z.number().positive().optional(),
	expectedSalary: z.number().positive().optional(),
	jobTypes: z.array(z.string()).optional(),
	preferredLocations: z.array(z.string()).optional(),
	isOpenToWork: z.boolean().default(true),
});

const updateProfileSchema = createProfileSchema.partial();

// ============================================
// Routes
// ============================================

/**
 * GET /profile/jobseeker
 * Get own profile
 */
router.get(
	"/",
	authMiddleware(),
	requirePermission(Permissions.JOBSEEKER_PROFILE_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const [profile] = await db
			.select()
			.from(jobseekerProfiles)
			.where(
				and(
					eq(jobseekerProfiles.userId, userId),
					isNull(jobseekerProfiles.deletedAt)
				)
			)
			.limit(1);

		if (!profile) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Profile not found. Please create your profile.",
			});
		}

		return res.status(StatusCodes.OK).json({ profile });
	})
);

/**
 * POST /profile/jobseeker
 * Create profile
 */
router.post(
	"/",
	authMiddleware(),
	requirePermission(Permissions.JOBSEEKER_PROFILE_CREATE),
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
				throw new HTTPError({
					httpStatus: StatusCodes.CONFLICT,
					message: "Profile already exists. Use PATCH to update.",
				});
			}

			// Calculate profile completion
			const completion = calculateProfileCompletion(data);

			// Create profile
			const [profile] = await db
				.insert(jobseekerProfiles)
				.values({
					userId,
					firstName: data.firstName,
					lastName: data.lastName,
					dateOfBirth: data.dateOfBirth
						? new Date(data.dateOfBirth)
						: null,
					gender: data.gender as any,
					address: data.address || null,
					city: data.city || null,
					state: data.state || null,
					country: data.country,
					pincode: data.pincode || null,
					headline: data.headline || null,
					summary: data.summary || null,
					skills: data.skills || null,
					experienceYears: data.experienceYears || null,
					currentSalary: data.currentSalary?.toString() || null,
					expectedSalary: data.expectedSalary?.toString() || null,
					jobTypes: data.jobTypes || null,
					preferredLocations: data.preferredLocations || null,
					isOpenToWork: data.isOpenToWork,
					profileCompletion: completion,
				})
				.returning();

			// Audit log
			await auditCreate("jobseeker_profile", profile.id, {
				firstName: data.firstName,
				lastName: data.lastName,
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
 * PATCH /profile/jobseeker
 * Update profile
 */
router.patch(
	"/",
	authMiddleware(),
	requirePermission(Permissions.JOBSEEKER_PROFILE_UPDATE_OWN),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Get existing profile
			const [existing] = await db
				.select()
				.from(jobseekerProfiles)
				.where(
					and(
						eq(jobseekerProfiles.userId, userId),
						isNull(jobseekerProfiles.deletedAt)
					)
				)
				.limit(1);

			if (!existing) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Profile not found. Please create your profile first.",
				});
			}

			// Merge with existing for completion calculation
			const merged = { ...existing, ...data };
			const completion = calculateProfileCompletion(merged);

			// Build update object
			const updateData: Record<string, any> = {
				updatedAt: new Date(),
				profileCompletion: completion,
			};

			if (data.firstName) updateData.firstName = data.firstName;
			if (data.lastName) updateData.lastName = data.lastName;
			if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
			if (data.gender) updateData.gender = data.gender;
			if (data.address !== undefined) updateData.address = data.address || null;
			if (data.city !== undefined) updateData.city = data.city || null;
			if (data.state !== undefined) updateData.state = data.state || null;
			if (data.country) updateData.country = data.country;
			if (data.pincode !== undefined) updateData.pincode = data.pincode || null;
			if (data.headline !== undefined) updateData.headline = data.headline || null;
			if (data.summary !== undefined) updateData.summary = data.summary || null;
			if (data.skills !== undefined) updateData.skills = data.skills || null;
			if (data.experienceYears !== undefined) updateData.experienceYears = data.experienceYears;
			if (data.currentSalary !== undefined) updateData.currentSalary = data.currentSalary?.toString() || null;
			if (data.expectedSalary !== undefined) updateData.expectedSalary = data.expectedSalary?.toString() || null;
			if (data.jobTypes !== undefined) updateData.jobTypes = data.jobTypes || null;
			if (data.preferredLocations !== undefined) updateData.preferredLocations = data.preferredLocations || null;
			if (data.isOpenToWork !== undefined) updateData.isOpenToWork = data.isOpenToWork;

			const [profile] = await db
				.update(jobseekerProfiles)
				.set(updateData)
				.where(eq(jobseekerProfiles.id, existing.id))
				.returning();

			// Audit log
			await auditUpdate(
				"jobseeker_profile",
				profile.id,
				{ ...existing },
				{ ...updateData },
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
 * GET /profile/jobseeker/:id/public
 * Get public profile (gated contact info)
 */
router.get(
	"/:id/public",
	authMiddleware(),
	requirePermission(Permissions.JOBSEEKER_PROFILE_READ),
	expressAsyncHandler(async (req, res) => {
		const profileId = BigInt(req.params.id);

		const [profile] = await db
			.select({
				id: jobseekerProfiles.id,
				firstName: jobseekerProfiles.firstName,
				lastName: jobseekerProfiles.lastName,
				city: jobseekerProfiles.city,
				state: jobseekerProfiles.state,
				headline: jobseekerProfiles.headline,
				summary: jobseekerProfiles.summary,
				skills: jobseekerProfiles.skills,
				experienceYears: jobseekerProfiles.experienceYears,
				isOpenToWork: jobseekerProfiles.isOpenToWork,
				profilePhotoUrl: jobseekerProfiles.profilePhotoUrl,
				// Contact info is GATED - not included in public view
			})
			.from(jobseekerProfiles)
			.where(
				and(
					eq(jobseekerProfiles.id, profileId),
					isNull(jobseekerProfiles.deletedAt)
				)
			)
			.limit(1);

		if (!profile) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Profile not found",
			});
		}

		return res.status(StatusCodes.OK).json({
			profile,
			isPublicView: true,
			message: "Contact info requires profile unlock",
		});
	})
);

/**
 * GET /profile/jobseeker/upload/resume
 * Get signed upload URL for resume
 */
router.get(
	"/upload/resume",
	authMiddleware(),
	requirePermission(Permissions.JOBSEEKER_PROFILE_UPDATE_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const params = generateResumeUploadParams(userId);

		return res.status(StatusCodes.OK).json({
			uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/raw/upload`,
			...params,
		});
	})
);

/**
 * GET /profile/jobseeker/upload/photo
 * Get signed upload URL for profile photo
 */
router.get(
	"/upload/photo",
	authMiddleware(),
	requirePermission(Permissions.JOBSEEKER_PROFILE_UPDATE_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const params = generateProfilePhotoUploadParams(userId);

		return res.status(StatusCodes.OK).json({
			uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/image/upload`,
			...params,
		});
	})
);

/**
 * PATCH /profile/jobseeker/resume
 * Update resume URL after Cloudinary upload
 */
router.patch(
	"/resume",
	authMiddleware(),
	requirePermission(Permissions.JOBSEEKER_PROFILE_UPDATE_OWN),
	expressAsyncHandler(
		async (data: { resumeUrl: string }, req, res) => {
			const userId = req.userId!;

			const [profile] = await db
				.update(jobseekerProfiles)
				.set({
					resumeUrl: data.resumeUrl,
					updatedAt: new Date(),
				})
				.where(eq(jobseekerProfiles.userId, userId))
				.returning({ id: jobseekerProfiles.id, resumeUrl: jobseekerProfiles.resumeUrl });

			if (!profile) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Profile not found",
				});
			}

			// Audit log for resume upload
			await auditUpdate(
				"jobseeker_profile",
				profile.id,
				{},
				{ resumeUrl: data.resumeUrl },
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				"Resume uploaded"
			);

			return res.status(StatusCodes.OK).json({
				message: "Resume updated successfully",
				resumeUrl: profile.resumeUrl,
			});
		},
		{
			validationSchema: z.object({
				resumeUrl: z.string().url("Invalid resume URL"),
			}),
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Helpers
// ============================================

function calculateProfileCompletion(data: Record<string, any>): number {
	const weights = {
		firstName: 10,
		lastName: 10,
		headline: 10,
		summary: 10,
		skills: 15,
		experienceYears: 10,
		city: 5,
		resumeUrl: 15,
		profilePhotoUrl: 5,
		expectedSalary: 5,
		jobTypes: 5,
	};

	let total = 0;
	let earned = 0;

	for (const [field, weight] of Object.entries(weights)) {
		total += weight;
		const value = data[field];
		if (value && (Array.isArray(value) ? value.length > 0 : true)) {
			earned += weight;
		}
	}

	return Math.round((earned / total) * 100);
}

export default router;
