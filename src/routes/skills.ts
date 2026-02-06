/**
 * Skills Routes
 * Manage jobseeker skills with proficiency levels
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "../config/database.ts";
import { skills } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";

const router = Router();

// Validation Schema
const skillSchema = z.object({
	skillName: z.string().min(1, "Skill name is required"),
	proficiencyLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
	yearsOfExperience: z.number().int().min(0).max(50).optional(),
});

const updateSkillSchema = skillSchema.partial();

/**
 * GET /profile/jobseeker/skills
 * Get all skills for current user
 */
router.get(
	"/",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const userSkills = await db
			.select()
			.from(skills)
			.where(eq(skills.userId, userId));

		return res.status(StatusCodes.OK).json({ skills: userSkills });
	})
);

/**
 * POST /profile/jobseeker/skills
 * Add skill
 */
router.post(
	"/",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check for duplicate skill
			const existingSkills = await db
				.select()
				.from(skills)
				.where(
					and(
						eq(skills.userId, userId),
						eq(skills.skillName, data.skillName.toLowerCase())
					)
				);

			if (existingSkills.length > 0) {
				throw new HTTPError({
					httpStatus: StatusCodes.CONFLICT,
					message: "This skill already exists in your profile",
				});
			}

			const [skill] = await db
				.insert(skills)
				.values({
					userId,
					skillName: data.skillName.toLowerCase(),
					proficiencyLevel: data.proficiencyLevel as any || null,
					yearsOfExperience: data.yearsOfExperience || null,
				})
				.returning();

			return res.status(StatusCodes.CREATED).json({ skill });
		},
		{
			validationSchema: skillSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * POST /profile/jobseeker/skills/bulk
 * Add multiple skills at once
 */
router.post(
	"/bulk",
	authMiddleware(),
	expressAsyncHandler(
		async (data: { skills: string[] }, req, res) => {
			const userId = req.userId!;

			// Get existing skills
			const existingSkills = await db
				.select({ skillName: skills.skillName })
				.from(skills)
				.where(eq(skills.userId, userId));

			const existingNames = new Set(existingSkills.map(s => s.skillName?.toLowerCase()));

			// Filter out duplicates
			const newSkillNames = data.skills
				.map(s => s.toLowerCase().trim())
				.filter(s => s && !existingNames.has(s));

			if (newSkillNames.length === 0) {
				return res.status(StatusCodes.OK).json({ 
					message: "No new skills to add",
					addedCount: 0 
				});
			}

			// Insert all new skills
			const insertedSkills = await db
				.insert(skills)
				.values(newSkillNames.map(skillName => ({
					userId,
					skillName,
					proficiencyLevel: null,
					yearsOfExperience: null,
				})))
				.returning();

			return res.status(StatusCodes.CREATED).json({ 
				skills: insertedSkills,
				addedCount: insertedSkills.length
			});
		},
		{
			validationSchema: z.object({
				skills: z.array(z.string()).min(1, "At least one skill is required"),
			}),
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /profile/jobseeker/skills/:id
 * Update skill
 */
router.patch(
	"/:id",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;
			const skillId = BigInt(req.params.id);

			const updateData: Record<string, any> = {
				updatedAt: new Date(),
			};

			if (data.skillName !== undefined) updateData.skillName = data.skillName.toLowerCase();
			if (data.proficiencyLevel !== undefined) updateData.proficiencyLevel = data.proficiencyLevel;
			if (data.yearsOfExperience !== undefined) updateData.yearsOfExperience = data.yearsOfExperience;

			const [skill] = await db
				.update(skills)
				.set(updateData)
				.where(
					and(
						eq(skills.id, skillId),
						eq(skills.userId, userId)
					)
				)
				.returning();

			if (!skill) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Skill not found",
				});
			}

			return res.status(StatusCodes.OK).json({ skill });
		},
		{
			validationSchema: updateSkillSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * DELETE /profile/jobseeker/skills/:id
 * Delete skill
 */
router.delete(
	"/:id",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const skillId = BigInt(req.params.id);

		const [deleted] = await db
			.delete(skills)
			.where(
				and(
					eq(skills.id, skillId),
					eq(skills.userId, userId)
				)
			)
			.returning();

		if (!deleted) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: "Skill not found",
			});
		}

		return res.status(StatusCodes.OK).json({ message: "Skill deleted" });
	})
);

export default router;
