/**
 * Applications Routes
 * Jobseeker job applications (requires verification)
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";

import { db } from "../config/database.ts";
import {
	applications,
	ApplicationStatuses,
	jobs,
	JobStatuses,
	jobseekerProfiles,
	users,
} from "../db/index.ts";
import { VerificationStatuses } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { requireVerified } from "../middleware/verificationMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate, auditUpdate } from "../services/auditService.ts";

const router = Router();

// Apply verification middleware to all application routes
router.use(authMiddleware());
router.use(requireVerified());

// ============================================
// Validation Schemas
// ============================================

const applySchema = z.object({
	jobId: z.string(),
	coverLetter: z.string().max(2000).optional(),
	expectedSalary: z.number().positive().optional(),
	noticePeriodDays: z.number().int().min(0).max(180).optional(),
	screeningAnswers: z.record(z.any()).optional(),
});

// ============================================
// Routes
// ============================================

/**
 * GET /applications
 * List my applications
 */
router.get(
	"/",
	authMiddleware(),
	requirePermission(Permissions.APPLICATIONS_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const result = await db
			.select({
				id: applications.id,
				uuid: applications.uuid,
				status: applications.status,
				appliedAt: applications.appliedAt,
				viewedAt: applications.viewedAt,
				statusChangedAt: applications.statusChangedAt,
				// Job info
				job: {
					id: jobs.id,
					uuid: jobs.uuid,
					title: jobs.title,
					slug: jobs.slug,
					city: jobs.city,
					jobType: jobs.jobType,
				},
			})
			.from(applications)
			.innerJoin(jobs, eq(applications.jobId, jobs.id))
			.where(
				and(
					eq(applications.jobseekerId, userId),
					isNull(applications.deletedAt)
				)
			)
			.orderBy(desc(applications.appliedAt));

		return res.status(StatusCodes.OK).json({ applications: result });
	})
);

/**
 * GET /applications/:id
 * Get single application
 */
router.get(
	"/:id",
	authMiddleware(),
	requirePermission(Permissions.APPLICATIONS_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const applicationId = BigInt(req.params.id);

		const [application] = await db
			.select({
				id: applications.id,
				uuid: applications.uuid,
				status: applications.status,
				coverLetter: applications.coverLetter,
				expectedSalary: applications.expectedSalary,
				noticePeriodDays: applications.noticePeriodDays,
				appliedAt: applications.appliedAt,
				viewedAt: applications.viewedAt,
				statusChangedAt: applications.statusChangedAt,
				// Job info
				job: {
					id: jobs.id,
					uuid: jobs.uuid,
					title: jobs.title,
					slug: jobs.slug,
					description: jobs.description,
					city: jobs.city,
					jobType: jobs.jobType,
					salaryMin: jobs.salaryMin,
					salaryMax: jobs.salaryMax,
				},
			})
			.from(applications)
			.innerJoin(jobs, eq(applications.jobId, jobs.id))
			.where(
				and(
					eq(applications.id, applicationId),
					eq(applications.jobseekerId, userId),
					isNull(applications.deletedAt)
				)
			)
			.limit(1);

		if (!application) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Application not found",
			});
		}

		return res.status(StatusCodes.OK).json({ application });
	})
);

/**
 * POST /applications
 * Apply to a job
 */
router.post(
	"/",
	authMiddleware(),
	requirePermission(Permissions.APPLICATIONS_CREATE),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if job exists and is active
			const [job] = await db
				.select({
					id: jobs.id,
					title: jobs.title,
					status: jobs.status,
					employerId: jobs.employerId,
					maxApplications: jobs.maxApplications,
					applicationsCount: jobs.applicationsCount,
					autoCloseOnLimit: jobs.autoCloseOnLimit,
				})
				.from(jobs)
				.where(
					and(eq(jobs.id, BigInt(data.jobId)), isNull(jobs.deletedAt))
				)
				.limit(1);

			if (!job) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Job not found",
				});
			}

			if (job.status !== JobStatuses.ACTIVE) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "This job is no longer accepting applications",
				});
			}

			const [currentUser] = await db
				.select({
					verificationStatus: users.verificationStatus,
				})
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);
			if (currentUser?.verificationStatus !== VerificationStatuses.VERIFIED) {
				throw new HTTPError({
					httpStatus: StatusCodes.FORBIDDEN,
					message: "Complete your profile and KYC verification to apply for jobs",
				});
			}

			const [jsProfile] = await db
				.select({
					id: jobseekerProfiles.id,
					profileCompletion: jobseekerProfiles.profileCompletion,
				})
				.from(jobseekerProfiles)
				.where(eq(jobseekerProfiles.userId, userId))
				.limit(1);
			if (!jsProfile) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "Complete your profile before applying",
				});
			}
			const completion = jsProfile.profileCompletion ?? 0;
			if (completion < 80) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: `Profile must be at least 80% complete to apply (current: ${completion}%)`,
				});
			}

			if (
				job.maxApplications != null &&
				job.applicationsCount != null &&
				job.applicationsCount >= job.maxApplications
			) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "This job has reached the maximum number of applications",
				});
			}

			// Prevent self-application (if user is the employer)
			if (job.employerId === userId) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "You cannot apply to your own job posting",
				});
			}

			// Check for duplicate application (unique constraint will also catch this)
			const [existing] = await db
				.select({ id: applications.id, status: applications.status })
				.from(applications)
				.where(
					and(
						eq(applications.jobId, BigInt(data.jobId)),
						eq(applications.jobseekerId, userId),
						isNull(applications.deletedAt)
					)
				)
				.limit(1);

			if (existing) {
				throw new HTTPError({
					httpStatus: StatusCodes.CONFLICT,
					message: "You have already applied to this job",
					reason: { status: existing.status },
				});
			}

			// Get jobseeker's resume URL
			const [profile] = await db
				.select({ resumeUrl: jobseekerProfiles.resumeUrl })
				.from(jobseekerProfiles)
				.where(eq(jobseekerProfiles.userId, userId))
				.limit(1);

			// Create application
			const [application] = await db
				.insert(applications)
				.values({
					jobId: BigInt(data.jobId),
					jobseekerId: userId,
					resumeUrl: profile?.resumeUrl || null,
					coverLetter: data.coverLetter || null,
					expectedSalary: data.expectedSalary?.toString() || null,
					noticePeriodDays: data.noticePeriodDays || null,
					screeningAnswers: data.screeningAnswers || null,
					status: ApplicationStatuses.PENDING,
				})
				.returning();

			const newCount = (job.applicationsCount ?? 0) + 1;
			await db
				.update(jobs)
				.set({
					applicationsCount: newCount,
					updatedAt: new Date(),
					...(job.maxApplications != null &&
						job.autoCloseOnLimit !== false &&
						newCount >= job.maxApplications && {
							status: JobStatuses.CLOSED,
						}),
				})
				.where(eq(jobs.id, job.id));

			// Audit log
			await auditCreate(
				"application",
				application.id,
				{
					jobId: data.jobId.toString(),
					jobTitle: job.title,
					status: ApplicationStatuses.PENDING,
				},
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Applied to job: ${job.title}`
			);

			return res.status(StatusCodes.CREATED).json({
				message: "Application submitted successfully",
				application: {
					id: application.id,
					uuid: application.uuid,
					status: application.status,
					appliedAt: application.appliedAt,
				},
			});
		},
		{
			validationSchema: applySchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * DELETE /applications/:id
 * Withdraw application
 */
router.delete(
	"/:id",
	authMiddleware(),
	requirePermission(Permissions.APPLICATIONS_WITHDRAW),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const applicationId = BigInt(req.params.id);

		// Get application
		const [application] = await db
			.select()
			.from(applications)
			.where(
				and(
					eq(applications.id, applicationId),
					eq(applications.jobseekerId, userId),
					isNull(applications.deletedAt)
				)
			)
			.limit(1);

		if (!application) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Application not found",
			});
		}

		// Can only withdraw pending/reviewed applications
		const withdrawableStatuses = [
			ApplicationStatuses.PENDING,
			ApplicationStatuses.REVIEWED,
			ApplicationStatuses.SHORTLISTED,
		];

		if (!withdrawableStatuses.includes(application.status as any)) {
			throw new HTTPError({
				httpStatus: StatusCodes.BAD_REQUEST,
				message: `Cannot withdraw application with status: ${application.status}`,
			});
		}

		// Update status to withdrawn
		await db
			.update(applications)
			.set({
				status: ApplicationStatuses.WITHDRAWN,
				statusChangedAt: new Date(),
				statusChangedBy: userId,
				updatedAt: new Date(),
			})
			.where(eq(applications.id, applicationId));

		// Audit log
		await auditUpdate(
			"application",
			application.id,
			{ status: application.status },
			{ status: ApplicationStatuses.WITHDRAWN },
			{
				userId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			},
			"Application withdrawn"
		);

		return res.status(StatusCodes.OK).json({
			message: "Application withdrawn successfully",
		});
	})
);

export default router;
