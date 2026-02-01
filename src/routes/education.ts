/**
 * Education Routes
 * Manage jobseeker education records
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

import { db } from "../config/database.ts";
import { educationRecords, educationLevelEnum } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";

const router = Router();

// Validation
const educationSchema = z.object({
	level: z.enum([
		"no_education",
		"10th",
		"12th",
		"diploma",
		"ug",
		"pg",
		"other",
	]),
	institution: z.string().min(1, "Institution is required"),
	boardOrUniversity: z.string().optional(),
	yearOfPassing: z.number().int().min(1950).max(new Date().getFullYear() + 5),
	gradeOrPercentage: z.string().optional(),
});

/**
 * GET /profile/jobseeker/education
 * Get all education records for current user
 */
router.get(
	"/",
	authMiddleware(),
	// Permission check? Assuming own profile update/read permission covers this
	// But sticking to consistency
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const records = await db
			.select()
			.from(educationRecords)
			.where(eq(educationRecords.userId, userId))
			.orderBy(desc(educationRecords.yearOfPassing));

		return res.status(StatusCodes.OK).json({ records });
	})
);

/**
 * POST /profile/jobseeker/education
 * Add education record
 */
router.post(
	"/",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			const [record] = await db
				.insert(educationRecords)
				.values({
					userId,
					level: data.level as any,
					institution: data.institution,
					boardOrUniversity: data.boardOrUniversity,
					yearOfPassing: data.yearOfPassing,
					gradeOrPercentage: data.gradeOrPercentage,
				})
				.returning();

			return res.status(StatusCodes.CREATED).json({ record });
		},
		{
			validationSchema: educationSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * DELETE /profile/jobseeker/education/:id
 * Delete education record
 */
router.delete(
	"/:id",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const recordId = BigInt(req.params.id);

		const [deleted] = await db
			.delete(educationRecords)
			.where(
				and(
					eq(educationRecords.id, recordId),
					eq(educationRecords.userId, userId)
				)
			)
			.returning();

		if (!deleted) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: "Record not found",
			});
		}

		return res.status(StatusCodes.OK).json({ message: "Record deleted" });
	})
);

export default router;
