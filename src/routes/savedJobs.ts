/**
 * Saved Jobs Routes
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "../config/database.ts";
import { savedJobs, jobs, employerProfiles, applications } from "../db/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";

const router = Router();

// ============================================
// Internal Helpers
// ============================================

const getJobId = async (id: string) => {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const idRegex = /^\d+$/;

	if (uuidRegex.test(id)) {
		const result = await db
			.select({ id: jobs.id })
			.from(jobs)
			.where(eq(jobs.uuid, id))
			.limit(1);
		return result[0]?.id;
	} else if (idRegex.test(id)) {
		return BigInt(id);
	}
	return null;
};

// ============================================
// Routes
// ============================================

/**
 * GET /saved-jobs
 * List all saved jobs for the current user
 */
router.get(
	"/",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
		const offset = parseInt(req.query.offset as string) || 0;

		const result = await db
			.select({
				id: jobs.id,
				uuid: jobs.uuid,
				title: jobs.title,
				slug: jobs.slug,
				jobType: jobs.jobType,
				category: jobs.category,
				city: jobs.city,
				area: jobs.area,
				state: jobs.state,
				locationType: jobs.locationType,
				salaryMin: jobs.salaryMin,
				salaryMax: jobs.salaryMax,
				salaryType: jobs.salaryType,
				hideSalary: jobs.hideSalary,
				minExperienceYears: jobs.minExperienceYears,
				maxExperienceYears: jobs.maxExperienceYears,
				publishedAt: jobs.publishedAt,
				status: jobs.status,
				expiresAt: jobs.expiresAt,
				savedAt: savedJobs.createdAt,
				company: {
					brandName: employerProfiles.brandName,
					companyName: employerProfiles.companyName,
					logoUrl: employerProfiles.logoUrl,
				},
				hasApplied: sql<boolean>`CASE WHEN ${applications.id} IS NOT NULL THEN true ELSE false END`,
			})
			.from(savedJobs)
			.innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
			.leftJoin(employerProfiles, eq(jobs.employerId, employerProfiles.userId))
			.leftJoin(
				applications,
				and(
					eq(applications.jobId, jobs.id),
					eq(applications.jobseekerId, userId),
					isNull(applications.deletedAt)
				)
			)
			.where(eq(savedJobs.userId, userId))
			.orderBy(desc(savedJobs.createdAt))
			.limit(limit)
			.offset(offset);

		return res.status(StatusCodes.OK).json(result);
	})
);

/**
 * POST /saved-jobs
 * Save a job
 */
router.post(
	"/",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const { jobId } = req.body;

		if (!jobId) {
			return res.status(StatusCodes.BAD_REQUEST).json({ error: "Job ID is required" });
		}

		const internalJobId = await getJobId(jobId);
		if (!internalJobId) {
			return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
		}

		try {
			await db
				.insert(savedJobs)
				.values({
					userId,
					jobId: internalJobId,
				})
				.onConflictDoNothing(); // Idempotent

			return res.status(StatusCodes.CREATED).json({ message: "Job saved" });
		} catch (error) {
			console.error("Error saving job:", error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to save job" });
		}
	})
);

/**
 * DELETE /saved-jobs/:id
 * Unsave a job
 */
router.delete(
	"/:id",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const jobId = req.params.id;

		const internalJobId = await getJobId(jobId);
		if (!internalJobId) {
			return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
		}

		await db
			.delete(savedJobs)
			.where(
				and(
					eq(savedJobs.userId, userId),
					eq(savedJobs.jobId, internalJobId)
				)
			);

		return res.status(StatusCodes.NO_CONTENT).send();
	})
);

/**
 * GET /saved-jobs/check/:id
 * Check if a job is saved
 */
router.get(
	"/check/:id",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const jobId = req.params.id;

		const internalJobId = await getJobId(jobId);
		if (!internalJobId) {
			return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
		}

		const [saved] = await db
			.select({ id: savedJobs.id })
			.from(savedJobs)
			.where(
				and(
					eq(savedJobs.userId, userId),
					eq(savedJobs.jobId, internalJobId)
				)
			)
			.limit(1);

		return res.status(StatusCodes.OK).json({ isSaved: !!saved });
	})
);

export default router;
