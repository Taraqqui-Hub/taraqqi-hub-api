/**
 * Employer Jobs Routes
 * Job posting, management, and applicant handling
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, sql, gte } from "drizzle-orm";
import slugify from "slugify";

import { db } from "../config/database.ts";
import {
	jobs,
	JobStatuses,
	applications,
	ApplicationStatuses,
	jobseekerProfiles,
	employerProfiles,
	users,
} from "../db/index.ts";
import { VerificationStatuses } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate, auditUpdate } from "../services/auditService.ts";
import { requireVerifiedEmployer } from "./employerProfile.ts";
import { deduct } from "../services/walletService.ts";
import { TransactionCategories } from "../db/index.ts";
import { notifyProfileViewedByEmployer } from "../services/notificationService.ts";

const router = Router();

// ============================================
// Config
// ============================================

const REQUIRE_VERIFICATION_FOR_POSTING = process.env.REQUIRE_EMPLOYER_VERIFICATION !== "false";
const BASE_LISTING_DAYS = 15;
const MAX_ACTIVE_JOBS_PER_EMPLOYER = parseInt(process.env.MAX_ACTIVE_JOBS_PER_EMPLOYER || "20", 10);
const MAX_PROFILE_VIEWS_PER_DAY = parseInt(process.env.MAX_PROFILE_VIEWS_PER_DAY || "100", 10);
const PROMOTION_PRICES_PAISE: Record<string, number> = {
	featured: parseInt(process.env.JOB_PROMOTION_FEATURED_PAISE || "49900", 10), // ₹499
	city_boost: parseInt(process.env.JOB_PROMOTION_CITY_BOOST_PAISE || "29900", 10), // ₹299
	extended_duration: parseInt(process.env.JOB_PROMOTION_EXTENDED_PAISE || "19900", 10), // ₹199
	highlight: parseInt(process.env.JOB_PROMOTION_HIGHLIGHT_PAISE || "9900", 10), // ₹99
};

// ============================================
// Validation Schemas
// ============================================

const createJobSchema = z.object({
	title: z.string().min(5, "Title must be at least 5 characters"),
	category: z.string().min(1, "Category is required"),
	jobType: z.enum(["full-time", "part-time", "contract", "internship", "freelance"]),
	locationType: z.enum(["onsite", "remote", "hybrid"]),
	description: z.string().min(50, "Description must be at least 50 characters"),
	roleSummary: z.string().max(500).optional(),
	requirements: z.string().optional(),
	responsibilities: z.string().optional(),
	skillsRequired: z.array(z.string()).optional(),
	experienceLevel: z.enum(["fresher", "junior", "mid", "senior", "lead", "executive"]).optional(),
	minExperienceYears: z.number().int().min(0).default(0),
	maxExperienceYears: z.number().int().min(0).optional(),
	educationRequired: z.string().optional(),
	city: z.string().optional(),
	pincode: z.string().length(6).optional(),
	district: z.string().optional(),
	area: z.string().optional(),
	state: z.string().optional(),
	address: z.string().optional(),
	salaryMin: z.number().positive().optional(),
	salaryMax: z.number().positive().optional(),
	salaryType: z.enum(["monthly", "yearly"]).optional(),
	hideSalary: z.boolean().default(false),
	isSalaryNegotiable: z.boolean().default(false),
	benefits: z.array(z.string()).optional(),
	preferredLanguage: z.string().optional(),
	freshersAllowed: z.boolean().optional(),
	ageMin: z.number().int().min(18).max(100).optional(),
	ageMax: z.number().int().min(18).max(100).optional(),
	genderPreference: z.string().optional(),
	applicationDeadline: z.string().optional(),
	maxApplications: z.number().int().positive().optional(),
	autoCloseOnLimit: z.boolean().default(false),
	isResumeRequired: z.boolean().default(false),
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
 * GET /employer/jobs/can-post
 * Pre-conditions check: can employer post a job? (account, fee paid, company profile, business verified)
 */
router.get(
	"/can-post",
	authMiddleware(),
	requirePermission(Permissions.JOBS_CREATE),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const [user] = await db
			.select({
				userType: users.userType,
				verificationStatus: users.verificationStatus,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user || user.userType !== "employer") {
			return res.status(StatusCodes.OK).json({
				allowed: false,
				missingSteps: ["Employer account required"],
			});
		}

		const missingSteps: string[] = [];
		if (user.verificationStatus !== VerificationStatuses.VERIFIED) {
			if (user.verificationStatus === VerificationStatuses.DRAFT) {
				missingSteps.push("Pay registration fee");
			} else if (user.verificationStatus === VerificationStatuses.PAYMENT_VERIFIED) {
				missingSteps.push("Complete company profile and business verification");
			} else if (
				user.verificationStatus === VerificationStatuses.SUBMITTED ||
				user.verificationStatus === VerificationStatuses.UNDER_REVIEW
			) {
				missingSteps.push("Wait for business verification to complete");
			} else if (user.verificationStatus === VerificationStatuses.REJECTED) {
				missingSteps.push("Resubmit business verification documents");
			} else {
				missingSteps.push("Complete verification");
			}
		}

		const [profile] = await db
			.select({ id: employerProfiles.id })
			.from(employerProfiles)
			.where(eq(employerProfiles.userId, userId))
			.limit(1);
		if (!profile) {
			missingSteps.push("Complete company profile");
		}

		const allowed = missingSteps.length === 0;
		if (allowed) {
			const [activeCount] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(jobs)
				.where(
					and(
						eq(jobs.employerId, userId),
						eq(jobs.status, JobStatuses.ACTIVE),
						isNull(jobs.deletedAt)
					)
				);
			if (activeCount && activeCount.count >= MAX_ACTIVE_JOBS_PER_EMPLOYER) {
				return res.status(StatusCodes.OK).json({
					allowed: false,
					reason: "Max active jobs limit reached",
					maxActiveJobs: MAX_ACTIVE_JOBS_PER_EMPLOYER,
				});
			}
		}

		return res.status(StatusCodes.OK).json({
			allowed,
			...(missingSteps.length > 0 && { missingSteps }),
		});
	})
);

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

			if (data.locationType !== "remote" && !data.city?.trim()) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "City is required when work mode is not Remote",
				});
			}

			const [activeCount] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(jobs)
				.where(
					and(
						eq(jobs.employerId, userId),
						eq(jobs.status, JobStatuses.ACTIVE),
						isNull(jobs.deletedAt)
					)
				);
			if (activeCount && activeCount.count >= MAX_ACTIVE_JOBS_PER_EMPLOYER) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: `Maximum ${MAX_ACTIVE_JOBS_PER_EMPLOYER} active jobs allowed. Pause or close one to post another.`,
				});
			}

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

			const now = new Date();
			const listingDays = BASE_LISTING_DAYS;
			const expiresAt = data.status === "active"
				? new Date(now.getTime() + listingDays * 24 * 60 * 60 * 1000)
				: null;

			// Create job (base listing)
			const [job] = await db
				.insert(jobs)
				.values({
					employerId: userId,
					title: data.title,
					slug: uniqueSlug,
					description: data.description,
					roleSummary: data.roleSummary || null,
					requirements: data.requirements || null,
					responsibilities: data.responsibilities || null,
					jobType: data.jobType as any,
					experienceLevel: data.experienceLevel as any,
					category: data.category || null,
					skillsRequired: data.skillsRequired || null,
					locationType: data.locationType as any,
					pincode: data.pincode || null,
					city: data.city || null,
					district: data.district || null,
					area: data.area || null,
					state: data.state || null,
					address: data.address || null,
					salaryMin: data.salaryMin?.toString() || null,
					salaryMax: data.salaryMax?.toString() || null,
					salaryType: data.salaryType || "yearly",
					hideSalary: data.hideSalary,
					isSalaryNegotiable: data.isSalaryNegotiable ?? false,
					benefits: data.benefits?.length ? data.benefits : null,
					minExperienceYears: data.minExperienceYears,
					maxExperienceYears: data.maxExperienceYears || null,
					educationRequired: data.educationRequired || null,
					preferredLanguage: data.preferredLanguage || null,
					freshersAllowed: data.freshersAllowed ?? null,
					ageMin: data.ageMin ?? null,
					ageMax: data.ageMax ?? null,
					genderPreference: data.genderPreference || null,
					applicationDeadline: data.applicationDeadline
						? new Date(data.applicationDeadline)
						: null,
					maxApplications: data.maxApplications ?? null,
					autoCloseOnLimit: data.autoCloseOnLimit ?? false,
					isResumeRequired: data.isResumeRequired ?? false,
					status: data.status as any,
					listingDurationDays: listingDays,
					expiresAt,
					publishedAt: data.status === "active" ? now : null,
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
			if (data.roleSummary !== undefined) updateData.roleSummary = data.roleSummary || null;
			if (data.requirements !== undefined) updateData.requirements = data.requirements || null;
			if (data.responsibilities !== undefined) updateData.responsibilities = data.responsibilities || null;
			if (data.jobType) updateData.jobType = data.jobType;
			if (data.experienceLevel !== undefined) updateData.experienceLevel = data.experienceLevel;
			if (data.category !== undefined) updateData.category = data.category || null;
			if (data.skillsRequired !== undefined) updateData.skillsRequired = data.skillsRequired || null;
			if (data.locationType !== undefined) updateData.locationType = data.locationType;
			if (data.pincode !== undefined) updateData.pincode = data.pincode || null;
			if (data.city !== undefined) updateData.city = data.city || null;
			if (data.district !== undefined) updateData.district = data.district || null;
			if (data.area !== undefined) updateData.area = data.area || null;
			if (data.state !== undefined) updateData.state = data.state || null;
			if (data.address !== undefined) updateData.address = data.address || null;
			if (data.salaryMin !== undefined) updateData.salaryMin = data.salaryMin?.toString() || null;
			if (data.salaryMax !== undefined) updateData.salaryMax = data.salaryMax?.toString() || null;
			if (data.salaryType !== undefined) updateData.salaryType = data.salaryType || null;
			if (data.hideSalary !== undefined) updateData.hideSalary = data.hideSalary;
			if (data.isSalaryNegotiable !== undefined) updateData.isSalaryNegotiable = data.isSalaryNegotiable;
			if (data.benefits !== undefined) updateData.benefits = data.benefits?.length ? data.benefits : null;
			if (data.minExperienceYears !== undefined) updateData.minExperienceYears = data.minExperienceYears;
			if (data.maxExperienceYears !== undefined) updateData.maxExperienceYears = data.maxExperienceYears;
			if (data.educationRequired !== undefined) updateData.educationRequired = data.educationRequired || null;
			if (data.preferredLanguage !== undefined) updateData.preferredLanguage = data.preferredLanguage || null;
			if (data.freshersAllowed !== undefined) updateData.freshersAllowed = data.freshersAllowed;
			if (data.ageMin !== undefined) updateData.ageMin = data.ageMin;
			if (data.ageMax !== undefined) updateData.ageMax = data.ageMax;
			if (data.genderPreference !== undefined) updateData.genderPreference = data.genderPreference || null;
			if (data.applicationDeadline !== undefined) {
				updateData.applicationDeadline = data.applicationDeadline
					? new Date(data.applicationDeadline)
					: null;
			}
			if (data.maxApplications !== undefined) updateData.maxApplications = data.maxApplications;
			if (data.autoCloseOnLimit !== undefined) updateData.autoCloseOnLimit = data.autoCloseOnLimit;
			if (data.isResumeRequired !== undefined) updateData.isResumeRequired = data.isResumeRequired;
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

// Promotion options for frontend
const PROMOTION_OPTIONS = [
	{
		type: "featured",
		label: "Featured Job",
		description: "Top of search results",
		pricePaise: PROMOTION_PRICES_PAISE.featured,
		durationDays: 7,
	},
	{
		type: "city_boost",
		label: "City Boost",
		description: "More visibility in your city",
		pricePaise: PROMOTION_PRICES_PAISE.city_boost,
		durationDays: 7,
	},
	{
		type: "extended_duration",
		label: "Extended Duration",
		description: "30 days instead of 15",
		pricePaise: PROMOTION_PRICES_PAISE.extended_duration,
		durationDays: 15,
	},
	{
		type: "highlight",
		label: "Urgent Hiring",
		description: "Highlight badge on listing",
		pricePaise: PROMOTION_PRICES_PAISE.highlight,
		durationDays: 7,
	},
];

/**
 * GET /employer/jobs/promotion-options
 * List promotion types and prices
 */
router.get(
	"/promotion-options",
	authMiddleware(),
	requirePermission(Permissions.JOBS_READ_OWN),
	expressAsyncHandler(async (_req, res) => {
		return res.status(StatusCodes.OK).json({
			options: PROMOTION_OPTIONS.map((o) => ({
				...o,
				priceRupees: o.pricePaise / 100,
			})),
		});
	})
);

const promoteJobSchema = z.object({
	promotionType: z.enum(["featured", "city_boost", "extended_duration", "highlight"]),
});

/**
 * POST /employer/jobs/:id/promote
 * Apply paid promotion to a job (deducts from wallet)
 */
router.post(
	"/:id/promote",
	authMiddleware(),
	requirePermission(Permissions.JOBS_UPDATE_OWN),
	requireVerifiedEmployer(),
	expressAsyncHandler(
		async (data, req, res) => {
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
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "Job not found",
				});
			}

			const option = PROMOTION_OPTIONS.find((o) => o.type === data.promotionType);
			if (!option) {
				throw new HTTPError({
					httpStatus: StatusCodes.BAD_REQUEST,
					message: "Invalid promotion type",
				});
			}

			const amountPaise = BigInt(option.pricePaise);
			const idempotencyKey = `job_promote_${jobId}_${data.promotionType}_${Date.now()}`;

			await deduct(
				userId,
				amountPaise,
				TransactionCategories.JOB_PROMOTION,
				{
					idempotencyKey,
					description: `Job promotion: ${option.label} - ${job.title}`,
					relatedEntityType: "job",
					relatedEntityId: jobId,
					metadata: { promotionType: data.promotionType },
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
				}
			);

			const now = new Date();
			const promotedUntil = new Date(now.getTime() + option.durationDays * 24 * 60 * 60 * 1000);
			const updateData: Record<string, any> = {
				promotionType: data.promotionType,
				promotedAt: now,
				promotedUntil,
				updatedAt: now,
			};
			if (data.promotionType === "featured") updateData.isFeatured = true;
			if (data.promotionType === "highlight") updateData.isUrgentHighlight = true;
			if (data.promotionType === "extended_duration") {
				updateData.listingDurationDays = 30;
				updateData.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
			}

			await db
				.update(jobs)
				.set(updateData)
				.where(eq(jobs.id, jobId));

			const [updated] = await db
				.select()
				.from(jobs)
				.where(eq(jobs.id, jobId))
				.limit(1);

			return res.status(StatusCodes.OK).json({
				message: "Job promoted successfully",
				job: updated,
			});
		},
		{
			validationSchema: promoteJobSchema,
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
				// Jobseeker info
				profile: {
					id: jobseekerProfiles.id,
					firstName: jobseekerProfiles.firstName,
					lastName: jobseekerProfiles.lastName,
					headline: jobseekerProfiles.headline,
					city: jobseekerProfiles.city,
					experienceYears: jobseekerProfiles.experienceYears,
					skills: jobseekerProfiles.skills,
					profilePhotoUrl: jobseekerProfiles.profilePhotoUrl,
					resumeUrl: jobseekerProfiles.resumeUrl,
				},
				// User contact info
				contact: {
					email: users.email,
					phone: users.phone,
				},
			})
			.from(applications)
			.innerJoin(
				jobseekerProfiles,
				eq(applications.jobseekerId, jobseekerProfiles.userId)
			)
			.innerJoin(
				users,
				eq(applications.jobseekerId, users.id)
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
 * POST /employer/jobs/applications/:id/view
 * Mark application as viewed (employer opened candidate profile). Sets status to REVIEWED, viewedAt, notifies candidate.
 */
router.post(
	"/applications/:id/view",
	authMiddleware(),
	requirePermission(Permissions.APPLICATIONS_READ_ALL),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const applicationId = BigInt(req.params.id);

		const [app] = await db
			.select({
				id: applications.id,
				jobId: applications.jobId,
				jobseekerId: applications.jobseekerId,
				status: applications.status,
				viewedAt: applications.viewedAt,
				jobEmployerId: jobs.employerId,
				jobTitle: jobs.title,
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

		if (!app || app.jobEmployerId !== userId) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: "Application not found",
			});
		}

		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const [viewCount] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(applications)
			.innerJoin(jobs, eq(applications.jobId, jobs.id))
			.where(
				and(
					eq(jobs.employerId, userId),
					gte(applications.viewedAt, since)
				)
			);
		if (viewCount && viewCount.count >= MAX_PROFILE_VIEWS_PER_DAY) {
			throw new HTTPError({
				httpStatus: StatusCodes.TOO_MANY_REQUESTS,
				message: `Daily profile view limit (${MAX_PROFILE_VIEWS_PER_DAY}) reached. Try again tomorrow.`,
			});
		}

		const now = new Date();
		await db
			.update(applications)
			.set({
				viewedAt: now,
				status: ApplicationStatuses.REVIEWED,
				statusChangedAt: now,
				statusChangedBy: userId,
				updatedAt: now,
			})
			.where(eq(applications.id, applicationId));

		const [company] = await db
			.select({ companyName: employerProfiles.companyName })
			.from(employerProfiles)
			.where(eq(employerProfiles.userId, userId))
			.limit(1);
		const [jobseekerUser] = await db
			.select({ email: users.email, name: users.name })
			.from(users)
			.where(eq(users.id, app.jobseekerId))
			.limit(1);
		// Only notify if this is the first time viewing
		if (!app.viewedAt && jobseekerUser?.email) {
			await notifyProfileViewedByEmployer(
				app.jobseekerId,
				jobseekerUser.email,
				company?.companyName || "A company",
				app.jobTitle,
				jobseekerUser.name || undefined
			);
		}

		return res.status(StatusCodes.OK).json({
			message: "Application marked as viewed",
			viewedAt: now,
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
