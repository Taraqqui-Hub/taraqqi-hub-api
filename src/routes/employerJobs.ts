/**
 * Employer Jobs Routes
 * Job posting, management, and applicant handling
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import slugify from "slugify";

import { db } from "../config/database.ts";
import {
	jobs,
	JobStatuses,
	JobTypes,
	applications,
	ApplicationStatuses,
	jobseekerProfiles,
	users,
} from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate, auditUpdate } from "../services/auditService.ts";
import { requireVerifiedEmployer } from "./employerProfile.ts";

const router = Router();

// ============================================
// Config
// ============================================

const REQUIRE_VERIFICATION_FOR_POSTING = process.env.REQUIRE_EMPLOYER_VERIFICATION !== "false";

// ============================================
// Validation Schemas
// ============================================

const createJobSchema = z.object({
	title: z.string().min(5, "Title must be at least 5 characters"),
	description: z.string().min(50, "Description must be at least 50 characters"),
	requirements: z.string().optional(),
	responsibilities: z.string().optional(),
	jobType: z.enum(["full-time", "part-time", "contract", "internship", "freelance"]),
	experienceLevel: z.enum(["fresher", "junior", "mid", "senior", "lead", "executive"]).optional(),
	category: z.string().optional(),
	skillsRequired: z.array(z.string()).optional(),
	locationType: z.enum(["onsite", "remote", "hybrid"]).optional(),
	city: z.string().min(1, "City is required"),
	state: z.string().optional(),
	address: z.string().optional(),
	salaryMin: z.number().positive().optional(),
	salaryMax: z.number().positive().optional(),
	hideSalary: z.boolean().default(false),
	minExperienceYears: z.number().int().min(0).default(0),
	maxExperienceYears: z.number().int().min(0).optional(),
	educationRequired: z.string().optional(),
	applicationDeadline: z.string().optional(),
	status: z.enum(["draft", "active"]).default("draft"),
});

const updateJobSchema = createJobSchema.partial();

const updateApplicationStatusSchema = z.object({
	status: z.enum([
		"reviewed",
		"shortlisted",
		"interview",
		"offered",
		"hired",
		"rejected",
	]),
	internalNotes: z.string().optional(),
	rating: z.number().int().min(1).max(5).optional(),
});

// ============================================
// Auto-Moderation
// ============================================

function moderateJobContent(data: { title: string; description: string }): { passed: boolean; issues: string[] } {
	const issues: string[] = [];

	// Check for contact info in description (phone numbers)
	const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
	if (phoneRegex.test(data.description)) {
		issues.push("Description cannot contain phone numbers");
	}

	// Check for email in description
	const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
	if (emailRegex.test(data.description)) {
		issues.push("Description cannot contain email addresses");
	}

	// Check for URLs (except job boards)
	const urlRegex = /https?:\/\/[^\s]+/g;
	const allowedDomains = ["linkedin.com", "indeed.com", "naukri.com"];
	const urls = data.description.match(urlRegex) || [];
	for (const url of urls) {
		const isAllowed = allowedDomains.some((d) => url.includes(d));
		if (!isAllowed) {
			issues.push("Description cannot contain direct URLs (except LinkedIn, Indeed, Naukri)");
			break;
		}
	}

	// Check title for spam patterns
	const spamPatterns = ["urgent", "immediate", "asap", "today", "!!!"];
	const titleLower = data.title.toLowerCase();
	for (const pattern of spamPatterns) {
		if (titleLower.includes(pattern)) {
			issues.push(`Title should not contain "${pattern}"`);
		}
	}

	return {
		passed: issues.length === 0,
		issues,
	};
}

// ============================================
// Routes
// ============================================

/**
 * GET /employer/jobs
 * List employer's own jobs
 */
router.get(
	"/",
	authMiddleware(),
	requirePermission(Permissions.JOBS_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const result = await db
			.select({
				id: jobs.id,
				uuid: jobs.uuid,
				title: jobs.title,
				slug: jobs.slug,
				city: jobs.city,
				jobType: jobs.jobType,
				status: jobs.status,
				viewsCount: jobs.viewsCount,
				applicationsCount: jobs.applicationsCount,
				publishedAt: jobs.publishedAt,
				createdAt: jobs.createdAt,
			})
			.from(jobs)
			.where(
				and(eq(jobs.employerId, userId), isNull(jobs.deletedAt))
			)
			.orderBy(desc(jobs.createdAt));

		return res.status(StatusCodes.OK).json({ jobs: result });
	})
);

/**
 * GET /employer/jobs/:id
 * Get single job with details
 */
router.get(
	"/:id",
	authMiddleware(),
	requirePermission(Permissions.JOBS_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const jobId = BigInt(req.params.id);

		const [job] = await db
			.select()
			.from(jobs)
			.where(
				and(
					eq(jobs.id, jobId),
					eq(jobs.employerId, userId),
					isNull(jobs.deletedAt)
				)
			)
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
 * POST /employer/jobs
 * Create job posting
 */
router.post(
	"/",
	authMiddleware(),
	requirePermission(Permissions.JOBS_CREATE),
	...(REQUIRE_VERIFICATION_FOR_POSTING ? [requireVerifiedEmployer()] : []),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Auto-moderation
			const moderation = moderateJobContent({
				title: data.title,
				description: data.description,
			});

			if (!moderation.passed) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "Job content failed moderation",
					reason: { issues: moderation.issues },
				});
			}

			// Generate slug
			const baseSlug = slugify(data.title, { lower: true, strict: true });
			const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

			// Create job
			const [job] = await db
				.insert(jobs)
				.values({
					employerId: userId,
					title: data.title,
					slug: uniqueSlug,
					description: data.description,
					requirements: data.requirements || null,
					responsibilities: data.responsibilities || null,
					jobType: data.jobType as any,
					experienceLevel: data.experienceLevel as any,
					category: data.category || null,
					skillsRequired: data.skillsRequired || null,
					locationType: data.locationType as any,
					city: data.city,
					state: data.state || null,
					address: data.address || null,
					salaryMin: data.salaryMin?.toString() || null,
					salaryMax: data.salaryMax?.toString() || null,
					hideSalary: data.hideSalary,
					minExperienceYears: data.minExperienceYears,
					maxExperienceYears: data.maxExperienceYears || null,
					educationRequired: data.educationRequired || null,
					applicationDeadline: data.applicationDeadline
						? new Date(data.applicationDeadline)
						: null,
					status: data.status as any,
					publishedAt: data.status === "active" ? new Date() : null,
				})
				.returning();

			// Audit log
			await auditCreate("job", job.id, {
				title: data.title,
				status: data.status,
			}, {
				userId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			});

			return res.status(StatusCodes.CREATED).json({
				message: "Job created successfully",
				job,
			});
		},
		{
			validationSchema: createJobSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /employer/jobs/:id
 * Update job
 */
router.patch(
	"/:id",
	authMiddleware(),
	requirePermission(Permissions.JOBS_UPDATE_OWN),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;
			const jobId = BigInt(req.params.id);

			// Get existing job
			const [existing] = await db
				.select()
				.from(jobs)
				.where(
					and(
						eq(jobs.id, jobId),
						eq(jobs.employerId, userId),
						isNull(jobs.deletedAt)
					)
				)
				.limit(1);

			if (!existing) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Job not found",
				});
			}

			// Auto-moderation if title or description changed
			if (data.title || data.description) {
				const moderation = moderateJobContent({
					title: data.title || existing.title,
					description: data.description || existing.description,
				});

				if (!moderation.passed) {
					throw new HTTPError({
						httpStatus: StatusCodes.BAD_REQUEST,
						message: "Job content failed moderation",
						reason: { issues: moderation.issues },
					});
				}
			}

			// Build update object
			const updateData: Record<string, any> = { updatedAt: new Date() };

			if (data.title) updateData.title = data.title;
			if (data.description) updateData.description = data.description;
			if (data.requirements !== undefined) updateData.requirements = data.requirements || null;
			if (data.responsibilities !== undefined) updateData.responsibilities = data.responsibilities || null;
			if (data.jobType) updateData.jobType = data.jobType;
			if (data.experienceLevel !== undefined) updateData.experienceLevel = data.experienceLevel;
			if (data.category !== undefined) updateData.category = data.category || null;
			if (data.skillsRequired !== undefined) updateData.skillsRequired = data.skillsRequired || null;
			if (data.locationType !== undefined) updateData.locationType = data.locationType;
			if (data.city) updateData.city = data.city;
			if (data.state !== undefined) updateData.state = data.state || null;
			if (data.address !== undefined) updateData.address = data.address || null;
			if (data.salaryMin !== undefined) updateData.salaryMin = data.salaryMin?.toString() || null;
			if (data.salaryMax !== undefined) updateData.salaryMax = data.salaryMax?.toString() || null;
			if (data.hideSalary !== undefined) updateData.hideSalary = data.hideSalary;
			if (data.minExperienceYears !== undefined) updateData.minExperienceYears = data.minExperienceYears;
			if (data.maxExperienceYears !== undefined) updateData.maxExperienceYears = data.maxExperienceYears;
			if (data.educationRequired !== undefined) updateData.educationRequired = data.educationRequired || null;
			if (data.applicationDeadline !== undefined) {
				updateData.applicationDeadline = data.applicationDeadline
					? new Date(data.applicationDeadline)
					: null;
			}
			if (data.status) {
				updateData.status = data.status;
				if (data.status === "active" && !existing.publishedAt) {
					updateData.publishedAt = new Date();
				}
			}

			const [job] = await db
				.update(jobs)
				.set(updateData)
				.where(eq(jobs.id, jobId))
				.returning();

			return res.status(StatusCodes.OK).json({ job });
		},
		{
			validationSchema: updateJobSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * DELETE /employer/jobs/:id
 * Close/delete job
 */
router.delete(
	"/:id",
	authMiddleware(),
	requirePermission(Permissions.JOBS_DELETE_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const jobId = BigInt(req.params.id);

		const [job] = await db
			.update(jobs)
			.set({
				status: JobStatuses.CLOSED,
				deletedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(jobs.id, jobId),
					eq(jobs.employerId, userId),
					isNull(jobs.deletedAt)
				)
			)
			.returning({ id: jobs.id });

		if (!job) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Job not found",
			});
		}

		return res.status(StatusCodes.OK).json({
			message: "Job closed successfully",
		});
	})
);

/**
 * GET /employer/jobs/:id/applicants
 * List applicants for a job
 */
router.get(
	"/:id/applicants",
	authMiddleware(),
	requirePermission(Permissions.APPLICATIONS_READ_ALL),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const jobId = BigInt(req.params.id);

		// Verify ownership
		const [job] = await db
			.select({ id: jobs.id, title: jobs.title })
			.from(jobs)
			.where(
				and(
					eq(jobs.id, jobId),
					eq(jobs.employerId, userId),
					isNull(jobs.deletedAt)
				)
			)
			.limit(1);

		if (!job) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Job not found",
			});
		}

		// Get applicants with profile info
		const applicants = await db
			.select({
				id: applications.id,
				uuid: applications.uuid,
				status: applications.status,
				coverLetter: applications.coverLetter,
				expectedSalary: applications.expectedSalary,
				noticePeriodDays: applications.noticePeriodDays,
				rating: applications.rating,
				internalNotes: applications.internalNotes,
				appliedAt: applications.appliedAt,
				viewedAt: applications.viewedAt,
				// Jobseeker basic info (no contact - gated)
				profile: {
					id: jobseekerProfiles.id,
					firstName: jobseekerProfiles.firstName,
					lastName: jobseekerProfiles.lastName,
					headline: jobseekerProfiles.headline,
					city: jobseekerProfiles.city,
					experienceYears: jobseekerProfiles.experienceYears,
					skills: jobseekerProfiles.skills,
					profilePhotoUrl: jobseekerProfiles.profilePhotoUrl,
				},
			})
			.from(applications)
			.innerJoin(
				jobseekerProfiles,
				eq(applications.jobseekerId, jobseekerProfiles.userId)
			)
			.where(
				and(
					eq(applications.jobId, jobId),
					isNull(applications.deletedAt)
				)
			)
			.orderBy(desc(applications.appliedAt));

		return res.status(StatusCodes.OK).json({
			job: { id: job.id, title: job.title },
			applicants,
		});
	})
);

/**
 * PATCH /employer/jobs/applications/:id/status
 * Update application status
 */
router.patch(
	"/applications/:id/status",
	authMiddleware(),
	requirePermission(Permissions.APPLICATIONS_UPDATE_STATUS),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;
			const applicationId = BigInt(req.params.id);

			// Get application and verify job ownership
			const [application] = await db
				.select({
					id: applications.id,
					status: applications.status,
					jobId: applications.jobId,
					jobEmployerId: jobs.employerId,
				})
				.from(applications)
				.innerJoin(jobs, eq(applications.jobId, jobs.id))
				.where(
					and(
						eq(applications.id, applicationId),
						isNull(applications.deletedAt)
					)
				)
				.limit(1);

			if (!application) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Application not found",
				});
			}

			if (application.jobEmployerId !== userId) {
				throw new HTTPError({
					httpStatus: StatusCodes.FORBIDDEN,
					message: "You do not have permission to update this application",
				});
			}

			// Update status
			const [updated] = await db
				.update(applications)
				.set({
					status: data.status as any,
					statusChangedAt: new Date(),
					statusChangedBy: userId,
					internalNotes: data.internalNotes || null,
					rating: data.rating || null,
					viewedAt: application.status === ApplicationStatuses.PENDING
						? new Date()
						: undefined,
					updatedAt: new Date(),
				})
				.where(eq(applications.id, applicationId))
				.returning();

			// Audit log
			await auditUpdate(
				"application",
				application.id,
				{ status: application.status },
				{ status: data.status },
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Application status changed to ${data.status}`
			);

			return res.status(StatusCodes.OK).json({
				message: "Application status updated",
				application: updated,
			});
		},
		{
			validationSchema: updateApplicationStatusSchema,
			getValue: (req) => req.body,
		}
	)
);

export default router;
