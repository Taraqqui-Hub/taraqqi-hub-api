/**
 * Interests Routes
 * Manage jobseeker hobbies, extracurriculars, and volunteering
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "../config/database.ts";
import { interests } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";

const router = Router();

// Validation Schema
const interestSchema = z.object({
	interestType: z.enum(["hobby", "extracurricular", "volunteering"]).optional(),
	description: z.string().min(1, "Description is required"),
});

/**
 * GET /profile/jobseeker/interests
 * Get all interests for current user
 */
router.get(
	"/",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const userInterests = await db
			.select()
			.from(interests)
			.where(eq(interests.userId, userId));

		return res.status(StatusCodes.OK).json({ interests: userInterests });
	})
);

/**
 * POST /profile/jobseeker/interests
 * Add interest
 */
router.post(
	"/",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			const [interest] = await db
				.insert(interests)
				.values({
					userId,
					interestType: data.interestType as any || null,
					description: data.description,
				})
				.returning();

			return res.status(StatusCodes.CREATED).json({ interest });
		},
		{
			validationSchema: interestSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * DELETE /profile/jobseeker/interests/:id
 * Delete interest
 */
router.delete(
	"/:id",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const interestId = BigInt(req.params.id);

		const [deleted] = await db
			.delete(interests)
			.where(
				and(
					eq(interests.id, interestId),
					eq(interests.userId, userId)
				)
			)
			.returning();

		if (!deleted) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: "Interest not found",
			});
		}

		return res.status(StatusCodes.OK).json({ message: "Interest deleted" });
	})
);

export default router;
