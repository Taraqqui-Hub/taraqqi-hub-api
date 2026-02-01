/**
 * User Preferences Routes
 * API for user engagement intent/preferences
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../config/database.ts";
import { userPreferences } from "../db/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";

const preferencesRouter = Router();

// Validation schema
const preferencesSchema = z.object({
	wantsJobNow: z.boolean().optional(),
	openToFutureJobs: z.boolean().optional(),
	wantsSkillPrograms: z.boolean().optional(),
	wantsCommunityPrograms: z.boolean().optional(),
});

/**
 * GET /preferences
 * Get current user's preferences
 */
preferencesRouter.get(
	"/",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const [prefs] = await db
			.select()
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId))
			.limit(1);

		if (!prefs) {
			return res.status(StatusCodes.OK).json({
				preferences: null,
				message: "No preferences set yet",
			});
		}

		return res.status(StatusCodes.OK).json({
			preferences: {
				wantsJobNow: prefs.wantsJobNow,
				openToFutureJobs: prefs.openToFutureJobs,
				wantsSkillPrograms: prefs.wantsSkillPrograms,
				wantsCommunityPrograms: prefs.wantsCommunityPrograms,
			},
		});
	})
);

/**
 * POST /preferences
 * Create or update user's preferences (upsert)
 */
preferencesRouter.post(
	"/",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if preferences exist
			const [existing] = await db
				.select({ id: userPreferences.id })
				.from(userPreferences)
				.where(eq(userPreferences.userId, userId))
				.limit(1);

			if (existing) {
				// Update existing
				await db
					.update(userPreferences)
					.set({
						wantsJobNow: data.wantsJobNow,
						openToFutureJobs: data.openToFutureJobs,
						wantsSkillPrograms: data.wantsSkillPrograms,
						wantsCommunityPrograms: data.wantsCommunityPrograms,
						updatedAt: new Date(),
					})
					.where(eq(userPreferences.id, existing.id));

				return res.status(StatusCodes.OK).json({
					message: "Preferences updated successfully",
				});
			}

			// Create new preferences
			await db.insert(userPreferences).values({
				userId,
				wantsJobNow: data.wantsJobNow ?? false,
				openToFutureJobs: data.openToFutureJobs ?? false,
				wantsSkillPrograms: data.wantsSkillPrograms ?? false,
				wantsCommunityPrograms: data.wantsCommunityPrograms ?? false,
			});

			return res.status(StatusCodes.CREATED).json({
				message: "Preferences saved successfully",
			});
		},
		{
			validationSchema: preferencesSchema,
			getValue: (req) => req.body,
		}
	)
);

export default preferencesRouter;
