/**
 * Admin Job Moderation Routes
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, sql, or } from "drizzle-orm";

import { db } from "../../config/database.ts";
import { jobs, JobStatuses, employerProfiles, users } from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireAdmin } from "../../middleware/adminMiddleware.ts";
import { requirePermission } from "../../middleware/rbacMiddleware.ts";
import { Permissions } from "../../config/permissions.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";
import { auditUpdate } from "../../services/auditService.ts";

const router = Router();

router.use(authMiddleware());
router.use(requireAdmin());

/**
 * GET /admin/jobs
 * Get all jobs for moderation
 */
router.get(
	"/",
	requirePermission(Permissions.JOBS_MODERATE),
	expressAsyncHandler(async (req, res) => {
		const status = req.query.status as string;
		const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
		const offset = parseInt(req.query.offset as string) || 0;

		const conditions = [isNull(jobs.deletedAt)];
		if (status) {
			conditions.push(eq(jobs.status, status as any));
		}

		const jobsList = await db
			.select({
				id: jobs.id,
				uuid: jobs.uuid,
				title: jobs.title,
				city: jobs.city,
				jobType: jobs.jobType,
				status: jobs.status,
				isFeatured: jobs.isFeatured,
				viewsCount: jobs.viewsCount,
				applicationsCount: jobs.applicationsCount,
				publishedAt: jobs.publishedAt,
				createdAt: jobs.createdAt,
				companyName: employerProfiles.companyName,
				employerVerified: employerProfiles.isVerified,
			})
			.from(jobs)
			.leftJoin(employerProfiles, eq(jobs.employerId, employerProfiles.userId))
			.where(and(...conditions))
			.orderBy(desc(jobs.createdAt))
			.limit(limit)
			.offset(offset);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(jobs)
			.where(and(...conditions));

		return res.status(StatusCodes.OK).json({
			jobs: jobsList,
			pagination: {
				total: countResult?.count || 0,
				limit,
				offset,
			},
		});
	})
);

/**
 * GET /admin/jobs/:id
 * Get single job details
 */
router.get(
	"/:id",
	requirePermission(Permissions.JOBS_MODERATE),
	expressAsyncHandler(async (req, res) => {
		const jobId = BigInt(req.params.id);

		const [job] = await db
			.select()
			.from(jobs)
			.where(eq(jobs.id, jobId))
			.limit(1);

		if (!job) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Job not found",
			});
		}

		return res.status(StatusCodes.OK).json({ job });
	})
);

/**
 * PATCH /admin/jobs/:id/moderate
 * Moderate job (block/unblock/feature)
 */
router.patch(
	"/:id/moderate",
	requirePermission(Permissions.JOBS_MODERATE),
	expressAsyncHandler(
		async (data: { action: "block" | "unblock" | "feature" | "unfeature" }, req, res) => {
			const adminId = req.userId!;
			const jobId = BigInt(req.params.id);

			const [existing] = await db
				.select()
				.from(jobs)
				.where(eq(jobs.id, jobId))
				.limit(1);

			if (!existing) {
				return res.status(StatusCodes.NOT_FOUND).json({
					error: "Job not found",
				});
			}

			let updateData: Record<string, any> = { updatedAt: new Date() };

			switch (data.action) {
				case "block":
					updateData.status = JobStatuses.CLOSED;
					updateData.deletedAt = new Date();
					break;
				case "unblock":
					updateData.status = JobStatuses.DRAFT;
					updateData.deletedAt = null;
					break;
				case "feature":
					updateData.isFeatured = true;
					break;
				case "unfeature":
					updateData.isFeatured = false;
					break;
			}

			const [updated] = await db
				.update(jobs)
				.set(updateData)
				.where(eq(jobs.id, jobId))
				.returning();

			// Audit log
			await auditUpdate(
				"job_moderation",
				jobId,
				{ status: existing.status, isFeatured: existing.isFeatured },
				{ action: data.action },
				{
					userId: adminId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Job ${data.action}ed: ${existing.title}`
			);

			return res.status(StatusCodes.OK).json({
				message: `Job ${data.action}ed successfully`,
				job: updated,
			});
		},
		{
			validationSchema: z.object({
				action: z.enum(["block", "unblock", "feature", "unfeature"]),
			}),
			getValue: (req) => req.body,
		}
	)
);

export default router;
