/**
 * Profile Wizard Routes
 * Unified endpoints for gamified profile completion wizard
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, count } from "drizzle-orm";

import { db } from "../config/database.ts";
import {
	userProfiles,
	socioEconomicProfiles,
	familyProfiles,
	communityProfiles,
	jobseekerProfiles,
	educationRecords,
	experienceRecords,
	skills,
	interests,
} from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const personalInfoSchema = z.object({
	fullName: z.string().min(1, "Full name is required"),
	dateOfBirth: z.string().optional(),
	gender: z.enum(["male", "female", "other"]).optional(),
	nationality: z.string().optional(),
	profilePhotoUrl: z.string().optional(),
	motherTongue: z.string().optional(),
	languagesKnown: z.array(z.string()).optional(),
});

const addressSchema = z.object({
	currentCity: z.string().optional(),
	district: z.string().optional(),
	state: z.string().optional(),
	pincode: z.string().optional(),
	addressLine1: z.string().optional(),
	locality: z.string().optional(),
});

const socioEconomicSchema = z.object({
	familyIncomeRange: z.string().optional(),
	earningMembersCount: z.number().int().min(0).optional(),
	dependentsCount: z.number().int().min(0).optional(),
	housingType: z.string().optional(),
});

const familySchema = z.object({
	fatherName: z.string().optional(),
	fatherOccupation: z.string().optional(),
	fatherEducation: z.string().optional(),
	motherName: z.string().optional(),
	motherOccupation: z.string().optional(),
	motherEducation: z.string().optional(),
	siblingsCount: z.number().int().min(0).optional(),
	familyStructure: z.string().optional(),
	maritalStatus: z.string().optional(),
});

const communitySchema = z.object({
	religion: z.string().optional(),
	casteCategory: z.string().optional(),
	subCaste: z.string().optional(),
	minoritySelfIdentification: z.string().optional(),
	communityAffiliation: z.string().optional(),
	consent: z.boolean().optional(), // Must be true to save
});

// ============================================
// Wizard Status Endpoint
// ============================================

/**
 * GET /profile/wizard/status
 * Get comprehensive profile completion status with section-wise breakdown
 */
router.get(
	"/status",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		// Fetch all profile data in parallel
		const [
			userProfile,
			jobseekerProfile,
			socioEconomic,
			family,
			community,
			educationCount,
			experienceCount,
			skillsCount,
			interestsCount,
		] = await Promise.all([
			db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
			db.select().from(jobseekerProfiles).where(eq(jobseekerProfiles.userId, userId)).limit(1),
			db.select().from(socioEconomicProfiles).where(eq(socioEconomicProfiles.userId, userId)).limit(1),
			db.select().from(familyProfiles).where(eq(familyProfiles.userId, userId)).limit(1),
			db.select().from(communityProfiles).where(eq(communityProfiles.userId, userId)).limit(1),
			db.select({ count: count() }).from(educationRecords).where(eq(educationRecords.userId, userId)),
			db.select({ count: count() }).from(experienceRecords).where(eq(experienceRecords.userId, userId)),
			db.select({ count: count() }).from(skills).where(eq(skills.userId, userId)),
			db.select({ count: count() }).from(interests).where(eq(interests.userId, userId)),
		]);

		const up = userProfile[0];
		const jp = jobseekerProfile[0];
		const sep = socioEconomic[0];
		const fp = family[0];
		const cp = community[0];

		// Calculate section completion
		const sections = {
			personal: {
				completed: !!(up?.fullName || (jp?.firstName && jp?.lastName)) && 
				           !!(up?.dateOfBirth || jp?.dateOfBirth) &&
				           !!(up?.gender || jp?.gender),
				xp: 20,
				fields: {
					fullName: !!(up?.fullName || (jp?.firstName && jp?.lastName)),
					dateOfBirth: !!(up?.dateOfBirth || jp?.dateOfBirth),
					gender: !!(up?.gender || jp?.gender),
					profilePhoto: !!(up?.profilePhotoUrl || jp?.profilePhotoUrl),
					languages: !!(up?.languagesKnown && up.languagesKnown.length > 0),
				},
			},
			address: {
				completed: !!(up?.currentCity || jp?.city) && !!(up?.state || jp?.state),
				xp: 15,
				fields: {
					city: !!(up?.currentCity || jp?.city),
					state: !!(up?.state || jp?.state),
					pincode: !!(up?.pincode || jp?.pincode),
				},
			},
			education: {
				completed: (educationCount[0]?.count || 0) >= 1 || up?.hasNoFormalEducation === true,
				xp: 25,
				count: educationCount[0]?.count || 0,
				hasNoFormalEducation: up?.hasNoFormalEducation || false,
			},
			skills: {
				completed: (skillsCount[0]?.count || 0) >= 3,
				xp: 20,
				count: skillsCount[0]?.count || 0,
			},
			experience: {
				completed: (experienceCount[0]?.count || 0) >= 1 || (jp?.experienceYears === 0),
				xp: 25,
				count: experienceCount[0]?.count || 0,
			},
			// Optional/Bonus sections
			family: {
				completed: !!(fp?.fatherName || fp?.motherName),
				xp: 10,
				optional: true,
				fields: fp || null,
			},
			socioEconomic: {
				completed: !!(sep?.familyIncomeRange || sep?.housingType),
				xp: 10,
				optional: true,
				fields: sep || null,
			},
			community: {
				completed: !!cp,
				xp: 10,
				optional: true,
				consentRequired: true,
				fields: cp || null,
			},
			interests: {
				completed: (interestsCount[0]?.count || 0) >= 1,
				xp: 10,
				optional: true,
				count: interestsCount[0]?.count || 0,
			},
		};

		// Calculate totals
		const requiredSections = ['personal', 'address', 'education', 'skills', 'experience'];
		const optionalSections = ['family', 'socioEconomic', 'community', 'interests'];

		let earnedXP = 0;
		let maxXP = 0;
		let completedRequired = 0;

		for (const [key, section] of Object.entries(sections)) {
			maxXP += section.xp;
			if (section.completed) {
				earnedXP += section.xp;
				if (requiredSections.includes(key)) {
					completedRequired++;
				}
			}
		}

		const completionPercentage = Math.round((earnedXP / maxXP) * 100);
		const level = earnedXP >= 100 ? 5 : earnedXP >= 75 ? 4 : earnedXP >= 50 ? 3 : earnedXP >= 25 ? 2 : 1;

		return res.status(StatusCodes.OK).json({
			sections,
			summary: {
				earnedXP,
				maxXP,
				completionPercentage,
				level,
				levelName: getLevelName(level),
				completedRequired,
				totalRequired: requiredSections.length,
				isProfileComplete: completedRequired === requiredSections.length,
			},
			profiles: {
				userProfile: up || null,
				jobseekerProfile: jp || null,
				socioEconomicProfile: sep || null,
				familyProfile: fp || null,
				communityProfile: cp || null,
			},
		});
	})
);

function getLevelName(level: number): string {
	switch (level) {
		case 1: return "Newcomer";
		case 2: return "Explorer";
		case 3: return "Rising Star";
		case 4: return "Champion";
		case 5: return "Legend";
		default: return "Newcomer";
	}
}

// ============================================
// Personal Info Section
// ============================================

/**
 * PATCH /profile/wizard/personal
 * Update personal info section (creates user_profiles record if needed)
 */
router.patch(
	"/personal",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if user profile exists
			const [existing] = await db
				.select()
				.from(userProfiles)
				.where(eq(userProfiles.userId, userId))
				.limit(1);

			if (existing) {
				// Update existing
				const [profile] = await db
					.update(userProfiles)
					.set({
						fullName: data.fullName || existing.fullName,
						dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : existing.dateOfBirth,
						gender: data.gender as any || existing.gender,
						nationality: data.nationality || existing.nationality,
						profilePhotoUrl: data.profilePhotoUrl || existing.profilePhotoUrl,
						motherTongue: data.motherTongue || existing.motherTongue,
						languagesKnown: data.languagesKnown || existing.languagesKnown,
						profileLastUpdatedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(userProfiles.id, existing.id))
					.returning();

				return res.status(StatusCodes.OK).json({ profile, message: "Personal info updated" });
			} else {
				// Create new
				const [profile] = await db
					.insert(userProfiles)
					.values({
						userId,
						fullName: data.fullName,
						dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
						gender: data.gender as any || null,
						nationality: data.nationality || "Indian",
						profilePhotoUrl: data.profilePhotoUrl || null,
						motherTongue: data.motherTongue || null,
						languagesKnown: data.languagesKnown || null,
					})
					.returning();

				return res.status(StatusCodes.CREATED).json({ profile, message: "Personal info saved" });
			}
		},
		{
			validationSchema: personalInfoSchema,
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Address Section
// ============================================

/**
 * PATCH /profile/wizard/address
 * Update address section
 */
router.patch(
	"/address",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if user profile exists
			const [existing] = await db
				.select()
				.from(userProfiles)
				.where(eq(userProfiles.userId, userId))
				.limit(1);

			if (existing) {
				// Update user profile address fields
				const [profile] = await db
					.update(userProfiles)
					.set({
						currentCity: data.currentCity !== undefined ? data.currentCity : existing.currentCity,
						district: data.district !== undefined ? data.district : existing.district,
						state: data.state !== undefined ? data.state : existing.state,
						pincode: data.pincode !== undefined ? data.pincode : existing.pincode,
						profileLastUpdatedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(userProfiles.id, existing.id))
					.returning();

				// Also update jobseekerProfile.address if addressLine1 is provided
				if (data.addressLine1 !== undefined) {
					const [existingJobseeker] = await db
						.select()
						.from(jobseekerProfiles)
						.where(eq(jobseekerProfiles.userId, userId))
						.limit(1);

					if (existingJobseeker) {
						await db
							.update(jobseekerProfiles)
							.set({
								address: data.addressLine1 || null,
								updatedAt: new Date(),
							})
							.where(eq(jobseekerProfiles.id, existingJobseeker.id));
					} else {
						// Create jobseeker profile if it doesn't exist
						// We need this because addressLine1 is stored in jobseeker_profiles
						const names = existing.fullName.trim().split(" ");
						const firstName = names[0];
						const lastName = names.slice(1).join(" ") || "";

						await db.insert(jobseekerProfiles).values({
							userId,
							firstName,
							lastName,
							address: data.addressLine1 || null,
							// Optional fields from current address step
							city: data.currentCity !== undefined ? data.currentCity : existing.currentCity,
							state: data.state !== undefined ? data.state : existing.state,
							pincode: data.pincode !== undefined ? data.pincode : existing.pincode,
						});
					}

				}

				return res.status(StatusCodes.OK).json({ profile, message: "Address updated" });
			} else {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "Please complete personal info first",
				});
			}
		},
		{
			validationSchema: addressSchema,
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Socio-Economic Section (Optional)
// ============================================

/**
 * PATCH /profile/wizard/socio-economic
 * Update socio-economic data
 */
router.patch(
	"/socio-economic",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			const [existing] = await db
				.select()
				.from(socioEconomicProfiles)
				.where(eq(socioEconomicProfiles.userId, userId))
				.limit(1);

			if (existing) {
				const [profile] = await db
					.update(socioEconomicProfiles)
					.set({
						familyIncomeRange: data.familyIncomeRange ?? existing.familyIncomeRange,
						earningMembersCount: data.earningMembersCount ?? existing.earningMembersCount,
						dependentsCount: data.dependentsCount ?? existing.dependentsCount,
						housingType: data.housingType ?? existing.housingType,
						updatedAt: new Date(),
					})
					.where(eq(socioEconomicProfiles.id, existing.id))
					.returning();

				return res.status(StatusCodes.OK).json({ profile, message: "Socio-economic info updated" });
			} else {
				const [profile] = await db
					.insert(socioEconomicProfiles)
					.values({
						userId,
						familyIncomeRange: data.familyIncomeRange || null,
						earningMembersCount: data.earningMembersCount || null,
						dependentsCount: data.dependentsCount || null,
						housingType: data.housingType || null,
					})
					.returning();

				return res.status(StatusCodes.CREATED).json({ profile, message: "Socio-economic info saved" });
			}
		},
		{
			validationSchema: socioEconomicSchema,
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Family Section (Optional)
// ============================================

/**
 * PATCH /profile/wizard/family
 * Update family profile
 */
router.patch(
	"/family",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			const [existing] = await db
				.select()
				.from(familyProfiles)
				.where(eq(familyProfiles.userId, userId))
				.limit(1);

			if (existing) {
				const [profile] = await db
					.update(familyProfiles)
					.set({
						fatherName: data.fatherName ?? existing.fatherName,
						fatherOccupation: data.fatherOccupation ?? existing.fatherOccupation,
						fatherEducation: data.fatherEducation ?? existing.fatherEducation,
						motherName: data.motherName ?? existing.motherName,
						motherOccupation: data.motherOccupation ?? existing.motherOccupation,
						motherEducation: data.motherEducation ?? existing.motherEducation,
						siblingsCount: data.siblingsCount ?? existing.siblingsCount,
						familyStructure: data.familyStructure ?? existing.familyStructure,
						maritalStatus: data.maritalStatus ?? existing.maritalStatus,
						updatedAt: new Date(),
					})
					.where(eq(familyProfiles.id, existing.id))
					.returning();

				return res.status(StatusCodes.OK).json({ profile, message: "Family info updated" });
			} else {
				const [profile] = await db
					.insert(familyProfiles)
					.values({
						userId,
						fatherName: data.fatherName || null,
						fatherOccupation: data.fatherOccupation || null,
						fatherEducation: data.fatherEducation || null,
						motherName: data.motherName || null,
						motherOccupation: data.motherOccupation || null,
						motherEducation: data.motherEducation || null,
						siblingsCount: data.siblingsCount || null,
						familyStructure: data.familyStructure || null,
						maritalStatus: data.maritalStatus || null,
					})
					.returning();

				return res.status(StatusCodes.CREATED).json({ profile, message: "Family info saved" });
			}
		},
		{
			validationSchema: familySchema,
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Community Section (Optional, Consent-Gated)
// ============================================

/**
 * PATCH /profile/wizard/community
 * Update community profile (requires consent)
 */
router.patch(
	"/community",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Consent required
			if (!data.consent) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "Consent is required to save community data",
				});
			}

			const [existing] = await db
				.select()
				.from(communityProfiles)
				.where(eq(communityProfiles.userId, userId))
				.limit(1);

			if (existing) {
				const [profile] = await db
					.update(communityProfiles)
					.set({
						religion: data.religion ?? existing.religion,
						casteCategory: data.casteCategory ?? existing.casteCategory,
						subCaste: data.subCaste ?? existing.subCaste,
						minoritySelfIdentification: data.minoritySelfIdentification ?? existing.minoritySelfIdentification,
						communityAffiliation: data.communityAffiliation ?? existing.communityAffiliation,
						updatedAt: new Date(),
					})
					.where(eq(communityProfiles.id, existing.id))
					.returning();

				return res.status(StatusCodes.OK).json({ profile, message: "Community info updated" });
			} else {
				const [profile] = await db
					.insert(communityProfiles)
					.values({
						userId,
						religion: data.religion || null,
						casteCategory: data.casteCategory || null,
						subCaste: data.subCaste || null,
						minoritySelfIdentification: data.minoritySelfIdentification || null,
						communityAffiliation: data.communityAffiliation || null,
					})
					.returning();

				return res.status(StatusCodes.CREATED).json({ profile, message: "Community info saved" });
			}
		},
		{
			validationSchema: communitySchema,
			getValue: (req) => req.body,
		}
	)
);

export default router;
