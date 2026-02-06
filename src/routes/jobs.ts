/**
 * Jobs Routes - Protected with verification requirement
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { db } from "../config/database.ts";
import { Permissions } from "../config/permissions.ts";
import { jobs, JobStatuses, JobTypes } from "../db/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission, attachPermissions } from "../middleware/rbacMiddleware.ts";
import { requireVerified } from "../middleware/verificationMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate } from "../services/auditService.ts";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const createJobSchema = z.object({
	title: z.string().min(5, "Title must be at least 5 characters"),
	description: z.string().min(20, "Description must be at least 20 characters"),
	jobType: z.enum(["full-time", "part-time", "contract", "internship", "freelance"]),
	category: z.string().optional(),
	city: z.string().optional(),
	salaryMin: z.number().positive().optional(),
	salaryMax: z.number().positive().optional(),
	minExperienceYears: z.number().int().min(0).default(0),
});

const updateJobSchema = createJobSchema.partial();

// ============================================
// Routes (Require verification for all job operations)
// ============================================

/**
 * GET /jobs
 * List all active jobs — promoted first, then recency (requires verified user)
 */
router.get(
	"/",
	authMiddleware(),
	requireVerified(),
	requirePermission(Permissions.JOBS_READ),
	expressAsyncHandler(async (req, res) => {
		const result = await db
			.select({
				id: jobs.id,
				uuid: jobs.uuid,
				title: jobs.title,
				slug: jobs.slug,
				jobType: jobs.jobType,
				city: jobs.city,
				salaryMin: jobs.salaryMin,
				salaryMax: jobs.salaryMax,
				status: jobs.status,
				publishedAt: jobs.publishedAt,
				isFeatured: jobs.isFeatured,
				promotionType: jobs.promotionType,
				isUrgentHighlight: jobs.isUrgentHighlight,
				expiresAt: jobs.expiresAt,
			})
			.from(jobs)
			.where(
				and(
					eq(jobs.status, JobStatuses.ACTIVE),
					isNull(jobs.deletedAt)
				)
			)
			.orderBy(
				desc(jobs.isFeatured),
				desc(jobs.isUrgentHighlight),
				desc(jobs.promotedAt),
				desc(jobs.publishedAt)
			)
			.limit(50);

		return res.status(StatusCodes.OK).json(
			result.map((j) => ({
				...j,
				badges: [
					j.isFeatured && "Featured",
					j.isUrgentHighlight && "Urgent",
					j.promotionType && j.promotionType !== "featured" && j.promotionType !== "highlight"
						? "Promoted"
						: null,
				].filter(Boolean),
			}))
		);
	})
);

/**
 * GET /jobs/:id
 * Get single job details (requires verified user)
 */
router.get(
	"/:id",
	authMiddleware(),
	requireVerified(),
	requirePermission(Permissions.JOBS_READ),
	expressAsyncHandler(async (req, res) => {
		const jobId = BigInt(req.params.id);

		const [job] = await db
			.select()
			.from(jobs)
			.where(and(eq(jobs.id, jobId), isNull(jobs.deletedAt)))
			.limit(1);

		if (!job) {
			return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
		}

		const badges = [
			job.isFeatured && "Featured",
			job.isUrgentHighlight && "Urgent",
			job.promotionType && "Promoted",
		].filter(Boolean);
		return res.status(StatusCodes.OK).json({ ...job, badges });
	})
);

/**
 * POST /jobs
 * Create a new job (employer only, requires verification)
 */
router.post(
	"/",
	authMiddleware(),
	requireVerified(),
	requirePermission(Permissions.JOBS_CREATE),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Generate slug from title
			const slug = data.title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/(^-|-$)/g, "") + 
				"-" + Date.now();

			const [newJob] = await db
				.insert(jobs)
				.values({
					employerId: userId,
					title: data.title,
					slug,
					description: data.description,
					jobType: data.jobType as any,
					category: data.category || null,
					city: data.city || null,
					salaryMin: data.salaryMin?.toString() || null,
					salaryMax: data.salaryMax?.toString() || null,
					minExperienceYears: data.minExperienceYears,
					status: JobStatuses.DRAFT,
				})
				.returning({ id: jobs.id, uuid: jobs.uuid, slug: jobs.slug });

			// Audit log
			await auditCreate("job", newJob.id, {
				title: data.title,
				jobType: data.jobType,
				status: JobStatuses.DRAFT,
			}, {
				userId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			});

			return res.status(StatusCodes.CREATED).json(newJob);
		},
		{
			validationSchema: createJobSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /jobs/:id
 * Update a job (owner or admin, requires verification)
 */
router.patch(
	"/:id",
	authMiddleware(),
	requireVerified(),
	requirePermission(Permissions.JOBS_UPDATE_OWN, Permissions.JOBS_UPDATE),
	attachPermissions(),
	expressAsyncHandler(
		async (data, req, res) => {
			const jobId = BigInt(req.params.id);
			const userId = req.userId!;
			const userPermissions = req.userPermissions || [];

			// Get existing job
			const [existingJob] = await db
				.select({ id: jobs.id, employerId: jobs.employerId })
				.from(jobs)
				.where(eq(jobs.id, jobId))
				.limit(1);

			if (!existingJob) {
				return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
			}

			// Check ownership or admin permission
			const isOwner = existingJob.employerId === userId;
			const hasFullUpdatePermission = userPermissions.includes(Permissions.JOBS_UPDATE);

			if (!isOwner && !hasFullUpdatePermission) {
				return res.status(StatusCodes.FORBIDDEN).json({ 
					error: "You can only update your own jobs" 
				});
			}

			// Update job
			const [updatedJob] = await db
				.update(jobs)
				.set({
					...data,
					salaryMin: data.salaryMin?.toString(),
					salaryMax: data.salaryMax?.toString(),
					updatedAt: new Date(),
				})
				.where(eq(jobs.id, jobId))
				.returning({ id: jobs.id, uuid: jobs.uuid });

			return res.status(StatusCodes.OK).json(updatedJob);
		},
		{
			validationSchema: updateJobSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * DELETE /jobs/:id
 * Soft delete a job (owner or admin, requires verification)
 */
router.delete(
	"/:id",
	authMiddleware(),
	requireVerified(),
	requirePermission(Permissions.JOBS_DELETE_OWN, Permissions.JOBS_DELETE),
	attachPermissions(),
	expressAsyncHandler(async (req, res) => {
		const jobId = BigInt(req.params.id);
		const userId = req.userId!;
		const userPermissions = req.userPermissions || [];

		// Get existing job
		const [existingJob] = await db
			.select({ id: jobs.id, employerId: jobs.employerId })
			.from(jobs)
			.where(eq(jobs.id, jobId))
			.limit(1);

		if (!existingJob) {
			return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
		}

		// Check ownership or admin permission
		const isOwner = existingJob.employerId === userId;
		const hasFullDeletePermission = userPermissions.includes(Permissions.JOBS_DELETE);

		if (!isOwner && !hasFullDeletePermission) {
			return res.status(StatusCodes.FORBIDDEN).json({ 
				error: "You can only delete your own jobs" 
			});
		}

		// Soft delete
		await db
			.update(jobs)
			.set({ deletedAt: new Date() })
			.where(eq(jobs.id, jobId));

		return res.status(StatusCodes.NO_CONTENT).send();
	})
);

export default router;
