/**
 * Experience Routes
 * Manage jobseeker work experience records
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

import { db } from "../config/database.ts";
import { experienceRecords } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";

const router = Router();

// Validation Schema
const experienceSchema = z.object({
	companyName: z.string().min(1, "Company name is required"),
	jobTitle: z.string().min(1, "Job title is required"),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	isCurrent: z.boolean().default(false),
	leavingReason: z.string().optional(),
	salaryRange: z.string().optional(),
});

const updateExperienceSchema = experienceSchema.partial();

/**
 * GET /profile/jobseeker/experience
 * Get all experience records for current user
 */
router.get(
	"/",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const records = await db
			.select()
			.from(experienceRecords)
			.where(eq(experienceRecords.userId, userId))
			.orderBy(desc(experienceRecords.startDate));

		return res.status(StatusCodes.OK).json({ records });
	})
);

/**
 * POST /profile/jobseeker/experience
 * Add experience record
 */
router.post(
	"/",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			const [record] = await db
				.insert(experienceRecords)
				.values({
					userId,
					companyName: data.companyName,
					jobTitle: data.jobTitle,
					startDate: data.startDate ? new Date(data.startDate) : null,
					endDate: data.endDate ? new Date(data.endDate) : null,
					isCurrent: data.isCurrent,
					leavingReason: data.leavingReason || null,
					salaryRange: data.salaryRange || null,
				})
				.returning();

			return res.status(StatusCodes.CREATED).json({ record });
		},
		{
			validationSchema: experienceSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /profile/jobseeker/experience/:id
 * Update experience record
 */
router.patch(
	"/:id",
	authMiddleware(),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;
			const recordId = BigInt(req.params.id);

			// Build update object
			const updateData: Record<string, any> = {
				updatedAt: new Date(),
			};

			if (data.companyName !== undefined) updateData.companyName = data.companyName;
			if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle;
			if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
			if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
			if (data.isCurrent !== undefined) updateData.isCurrent = data.isCurrent;
			if (data.leavingReason !== undefined) updateData.leavingReason = data.leavingReason || null;
			if (data.salaryRange !== undefined) updateData.salaryRange = data.salaryRange || null;

			const [record] = await db
				.update(experienceRecords)
				.set(updateData)
				.where(
					and(
						eq(experienceRecords.id, recordId),
						eq(experienceRecords.userId, userId)
					)
				)
				.returning();

			if (!record) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Experience record not found",
				});
			}

			return res.status(StatusCodes.OK).json({ record });
		},
		{
			validationSchema: updateExperienceSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * DELETE /profile/jobseeker/experience/:id
 * Delete experience record
 */
router.delete(
	"/:id",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const recordId = BigInt(req.params.id);

		const [deleted] = await db
			.delete(experienceRecords)
			.where(
				and(
					eq(experienceRecords.id, recordId),
					eq(experienceRecords.userId, userId)
				)
			)
			.returning();

		if (!deleted) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: "Experience record not found",
			});
		}

		return res.status(StatusCodes.OK).json({ message: "Experience record deleted" });
	})
);

export default router;
