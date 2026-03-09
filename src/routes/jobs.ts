/**
 * Jobs Routes - Protected with verification requirement
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { db } from "../config/database.ts";
import { Permissions } from "../config/permissions.ts";
import { jobs, JobStatuses, JobTypes, employerProfiles, applications, jobViews, savedJobs, jobseekerProfiles, userProfiles } from "../db/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission, attachPermissions } from "../middleware/rbacMiddleware.ts";
import { requireVerified } from "../middleware/verificationMiddleware.ts";
import { landingPublicRateLimiter } from "../middleware/securityMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate } from "../services/auditService.ts";
import { eq, and, isNull, desc, sql, or, like, gte, lte, inArray } from "drizzle-orm";

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
// Helper: Build job select fields (avoids repetition)
// ============================================
const jobSelectFields = (userId: bigint) => ({
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
	roleSummary: jobs.roleSummary,
	skillsRequired: jobs.skillsRequired,
	status: jobs.status,
	publishedAt: jobs.publishedAt,
	isFeatured: jobs.isFeatured,
	promotionType: jobs.promotionType,
	isUrgentHighlight: jobs.isUrgentHighlight,
	expiresAt: jobs.expiresAt,
	viewsCount: jobs.viewsCount,
	applicationsCount: jobs.applicationsCount,
	hasApplied: sql<boolean>`CASE WHEN ${applications.id} IS NOT NULL THEN true ELSE false END`,
	isSaved: sql<boolean>`CASE WHEN ${savedJobs.id} IS NOT NULL THEN true ELSE false END`,
});

// ============================================
// Public routes (no auth)
// ============================================

/** Sanitize and cap length for public landing query params (security) */
function sanitizeLandingParam(value: unknown, maxLen = 100): string {
	if (value === undefined || value === null) return "";
	const s = String(value).trim();
	return s.slice(0, maxLen);
}

/**
 * GET /jobs/landing-public
 * Highly restricted public endpoint for landing page featured opportunities only.
 * No auth. Rate-limited (30/min per IP). Used only when user is not logged in.
 * Returns top/recent jobs by location (city/state from localStorage or IP) or global recent.
 * Query params: city, state, limit (default 9, max 12)
 */
router.get(
	"/landing-public",
	landingPublicRateLimiter,
	expressAsyncHandler(async (req, res) => {
		const { city, state, limit: limitParam } = req.query;
		const limit = Math.min(Math.max(parseInt(limitParam as string) || 9, 1), 12);
		const cityStr = sanitizeLandingParam(city).toLowerCase();
		const stateStr = sanitizeLandingParam(state).toLowerCase();

		const baseConditions = [
			eq(jobs.status, JobStatuses.ACTIVE),
			isNull(jobs.deletedAt),
		];

		const selectLandingPublic = {
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
			roleSummary: jobs.roleSummary,
			skillsRequired: jobs.skillsRequired,
			publishedAt: jobs.publishedAt,
			isFeatured: jobs.isFeatured,
			isUrgentHighlight: jobs.isUrgentHighlight,
			companyName: employerProfiles.companyName,
			brandName: employerProfiles.brandName,
		};

		const orderBy = [
			desc(jobs.isFeatured),
			desc(jobs.isUrgentHighlight),
			desc(jobs.publishedAt),
		];

		let jobsList: any[] = [];

		// Tier 1: by city (location preference from localStorage or IP)
		if (cityStr) {
			jobsList = await db
				.select(selectLandingPublic)
				.from(jobs)
				.leftJoin(employerProfiles, eq(employerProfiles.userId, jobs.employerId))
				.where(and(...baseConditions, like(sql`lower(${jobs.city})`, `%${cityStr}%`)))
				.orderBy(...orderBy)
				.limit(limit);
		}
		// Tier 2: by state if no city or city had no results
		if ((!jobsList || jobsList.length === 0) && stateStr) {
			jobsList = await db
				.select(selectLandingPublic)
				.from(jobs)
				.leftJoin(employerProfiles, eq(employerProfiles.userId, jobs.employerId))
				.where(and(...baseConditions, like(sql`lower(${jobs.state})`, `%${stateStr}%`)))
				.orderBy(...orderBy)
				.limit(limit);
		}
		// Tier 3: global recent + featured (first-time or no location)
		if (!jobsList || jobsList.length === 0) {
			jobsList = await db
				.select(selectLandingPublic)
				.from(jobs)
				.leftJoin(employerProfiles, eq(employerProfiles.userId, jobs.employerId))
				.where(and(...baseConditions))
				.orderBy(...orderBy)
				.limit(limit);
		}

		const jobsResponse = jobsList.map((j: any) => ({
			uuid: j.uuid,
			title: j.title,
			slug: j.slug,
			jobType: j.jobType,
			category: j.category,
			city: j.city,
			area: j.area,
			state: j.state,
			locationType: j.locationType,
			salaryMin: j.salaryMin,
			salaryMax: j.salaryMax,
			salaryType: j.salaryType,
			hideSalary: j.hideSalary,
			minExperienceYears: j.minExperienceYears,
			maxExperienceYears: j.maxExperienceYears,
			roleSummary: j.roleSummary,
			skillsRequired: j.skillsRequired,
			publishedAt: j.publishedAt,
			isFeatured: j.isFeatured,
			isUrgentHighlight: j.isUrgentHighlight,
			company: j.brandName || j.companyName || null,
			badges: [j.isFeatured && "Featured", j.isUrgentHighlight && "Urgent"].filter(Boolean),
		}));

		return res.status(StatusCodes.OK).json({ jobs: jobsResponse });
	})
);

// ============================================
// Routes (Require verification for all job operations)
// ============================================

/**
 * GET /jobs
 * Smart job listing with automatic preference-based filtering
 *
 * Auto-filter logic (3-tier fallback, only when no explicit filters provided):
 *  Tier 1 — "preferred_match":  user's preferred city + preferred jobType(s)
 *  Tier 2 — "area_match":       user's city/state (no jobType filter) — if Tier 1 empty
 *  Tier 3 — "all_jobs":         no location filter — if Tier 2 empty
 *
 * When explicit filters are passed via query params, smart auto-filter is skipped
 * and normal filter logic applies (so the user has full control).
 *
 * Query params: search, city, jobType, category, minSalary, maxSalary,
 *               minExperience, maxExperience, locationType, limit, offset
 */
router.get(
	"/",
	authMiddleware(),
	requireVerified(),
	requirePermission(Permissions.JOBS_READ),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const {
			search,
			city,
			jobType,
			category,
			minSalary,
			maxSalary,
			minExperience,
			maxExperience,
			locationType,
			limit: limitParam,
			offset: offsetParam,
		} = req.query;

		const limit = Math.min(parseInt(limitParam as string) || 20, 100);
		const offset = parseInt(offsetParam as string) || 0;

		// Determine if the user passed explicit location/type filters
		const hasExplicitFilters = !!(city || jobType || search || category || locationType);

		// ── Fetch user profile for smart matching (only when no explicit filters) ──
		let userCity: string | null = null;
		let userState: string | null = null;
		let userJobTypes: string[] = [];
		let userPreferredLocations: string[] = [];
		let userSkills: string[] = [];

		if (!hasExplicitFilters) {
			// Try new userProfiles table first, fall back to legacy jobseekerProfiles
			const [userProfile] = await db
				.select({
					currentCity: userProfiles.currentCity,
					district: userProfiles.district,
					state: userProfiles.state,
				})
				.from(userProfiles)
				.where(and(eq(userProfiles.userId, userId), isNull(userProfiles.deletedAt)))
				.limit(1);

			if (userProfile) {
				userCity = userProfile.currentCity || null;
				userState = userProfile.state || null;
			} else {
				// Fall back to legacy jobseeker profile
				const [legacyProfile] = await db
					.select({
						city: jobseekerProfiles.city,
						state: jobseekerProfiles.state,
						jobTypes: jobseekerProfiles.jobTypes,
						preferredLocations: jobseekerProfiles.preferredLocations,
						skills: jobseekerProfiles.skills,
					})
					.from(jobseekerProfiles)
					.where(and(eq(jobseekerProfiles.userId, userId), isNull(jobseekerProfiles.deletedAt)))
					.limit(1);

				if (legacyProfile) {
					userCity = legacyProfile.city || null;
					userState = legacyProfile.state || null;
					userJobTypes = legacyProfile.jobTypes || [];
					userPreferredLocations = legacyProfile.preferredLocations || [];
					userSkills = legacyProfile.skills || [];
				}
			}
		}

		// ── Base conditions (always applied) ──
		const baseConditions = [
			eq(jobs.status, JobStatuses.ACTIVE),
			isNull(jobs.deletedAt),
		];

		// ── Apply explicit search/filter from query params ──
		const filterConditions: any[] = [...baseConditions];

		if (search && typeof search === "string") {
			filterConditions.push(
				or(
					like(sql`lower(${jobs.title})`, `%${search.toLowerCase()}%`),
					like(sql`lower(${jobs.description})`, `%${search.toLowerCase()}%`),
					like(sql`lower(${jobs.category})`, `%${search.toLowerCase()}%`)
				)
			);
		}
		if (city && typeof city === "string") {
			filterConditions.push(like(sql`lower(${jobs.city})`, `%${city.toLowerCase()}%`));
		}
		if (jobType && typeof jobType === "string") {
			filterConditions.push(eq(jobs.jobType, jobType as any));
		}
		if (category && typeof category === "string") {
			filterConditions.push(eq(jobs.category, category));
		}
		if (locationType && typeof locationType === "string") {
			filterConditions.push(eq(jobs.locationType, locationType as any));
		}
		if (minSalary) {
			const min = parseFloat(minSalary as string);
			filterConditions.push(gte(jobs.salaryMin, min.toString()));
		}
		if (maxSalary) {
			const max = parseFloat(maxSalary as string);
			filterConditions.push(lte(jobs.salaryMax, max.toString()));
		}
		if (minExperience !== undefined) {
			const min = parseInt(minExperience as string, 10);
			filterConditions.push(gte(jobs.minExperienceYears, min));
		}
		if (maxExperience !== undefined) {
			const max = parseInt(maxExperience as string, 10);
			filterConditions.push(
				or(
					lte(jobs.maxExperienceYears, max),
					isNull(jobs.maxExperienceYears)
				)
			);
		}

		// ── Helper to join and query ──
		const queryWithConditions = async (conditions: any[]) => {
			const result = await db
				.select(jobSelectFields(userId))
				.from(jobs)
				.leftJoin(
					applications,
					and(
						eq(applications.jobId, jobs.id),
						eq(applications.jobseekerId, userId),
						isNull(applications.deletedAt)
					)
				)
				.leftJoin(
					savedJobs,
					and(
						eq(savedJobs.jobId, jobs.id),
						eq(savedJobs.userId, userId)
					)
				)
				.where(and(...conditions))
				.orderBy(
					desc(jobs.isFeatured),
					desc(jobs.isUrgentHighlight),
					desc(jobs.promotedAt),
					desc(jobs.publishedAt)
				)
				.limit(limit)
				.offset(offset);

			const [countResult] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(jobs)
				.where(and(...conditions));

			return { result, total: countResult?.count || 0 };
		};

		// ── Smart matching (only when no explicit filters) ──
		let matchMode: "preferred_match" | "area_match" | "all_jobs" | "filtered" = "filtered";
		let finalConditions = filterConditions;
		let preferenceProfile: {
			city: string | null;
			state: string | null;
			jobTypes: string[];
		} | null = null;

		if (!hasExplicitFilters) {
			// Tier 1: Preferred city + preferred job types
			if (userCity || userJobTypes.length > 0 || userPreferredLocations.length > 0) {
				const tier1Conditions = [...baseConditions];

				// Location: preferred city OR preferred locations
				const locationOptions: any[] = [];
				if (userCity) {
					locationOptions.push(like(sql`lower(${jobs.city})`, `%${userCity.toLowerCase()}%`));
				}
				for (const loc of userPreferredLocations) {
					locationOptions.push(like(sql`lower(${jobs.city})`, `%${loc.toLowerCase()}%`));
					locationOptions.push(like(sql`lower(${jobs.state})`, `%${loc.toLowerCase()}%`));
				}
				if (locationOptions.length > 0) {
					tier1Conditions.push(or(...locationOptions)!);
				}

				// Job type preference
				if (userJobTypes.length > 0) {
					tier1Conditions.push(inArray(jobs.jobType, userJobTypes as any[]));
				}

				const { result, total } = await queryWithConditions(tier1Conditions);

				if (result.length > 0) {
					matchMode = "preferred_match";
					preferenceProfile = {
						city: userCity,
						state: userState,
						jobTypes: userJobTypes,
					};
					return res.status(StatusCodes.OK).json(buildResponse(result, { total, limit, offset }, matchMode, preferenceProfile));
				}
			}

			// Tier 2: Same city/state, no job type restriction
			if (userCity || userState) {
				const tier2Conditions = [...baseConditions];
				const locationOrs: any[] = [];
				if (userCity) {
					locationOrs.push(like(sql`lower(${jobs.city})`, `%${userCity.toLowerCase()}%`));
				}
				if (userState) {
					locationOrs.push(like(sql`lower(${jobs.state})`, `%${userState.toLowerCase()}%`));
				}
				if (locationOrs.length > 0) {
					tier2Conditions.push(or(...locationOrs)!);
				}

				const { result, total } = await queryWithConditions(tier2Conditions);

				if (result.length > 0) {
					matchMode = "area_match";
					preferenceProfile = {
						city: userCity,
						state: userState,
						jobTypes: [],
					};
					return res.status(StatusCodes.OK).json(buildResponse(result, { total, limit, offset }, matchMode, preferenceProfile));
				}
			}

			// Tier 3: Show all active jobs regardless of location
			matchMode = "all_jobs";
			finalConditions = [...baseConditions];
		}

		// ── Final query (filtered or Tier 3 fallback) ──
		const { result, total } = await queryWithConditions(finalConditions);

		return res.status(StatusCodes.OK).json(buildResponse(result, { total, limit, offset }, matchMode, preferenceProfile));
	})
);

// ── Response builder ──
function buildResponse(
	result: any[],
	pagination: { total: number; limit: number; offset: number },
	matchMode: string,
	preferenceProfile: any
) {
	return {
		jobs: result.map((j) => ({
			...j,
			hasApplied: j.hasApplied,
			isSaved: j.isSaved,
			badges: [
				j.isFeatured && "Featured",
				j.isUrgentHighlight && "Urgent",
				j.promotionType && j.promotionType !== "featured" && j.promotionType !== "highlight"
					? "Promoted"
					: null,
			].filter(Boolean),
		})),
		pagination: {
			total: pagination.total,
			limit: pagination.limit,
			offset: pagination.offset,
			hasMore: pagination.offset + result.length < pagination.total,
		},
		matchMode,
		preferenceProfile,
	};
}

/**
 * GET /jobs/landing
 * Authenticated endpoint for landing page — returns featured opportunities for the logged-in user.
 * Uses user's profile (city, state, job types, preferred locations) for personalized results.
 * Tier 1: preferred city + job types → Tier 2: city/state → Tier 3: all active (featured + recent).
 * Any verified user (jobseeker or employer) can access.
 */
router.get(
	"/landing",
	authMiddleware(),
	requireVerified(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const limit = 12;

		const baseConditions = [
			eq(jobs.status, JobStatuses.ACTIVE),
			isNull(jobs.deletedAt),
		];

		// Load user profile for personalization
		let userCity: string | null = null;
		let userState: string | null = null;
		let userJobTypes: string[] = [];
		let userPreferredLocations: string[] = [];

		const [userProfile] = await db
			.select({
				currentCity: userProfiles.currentCity,
				district: userProfiles.district,
				state: userProfiles.state,
			})
			.from(userProfiles)
			.where(and(eq(userProfiles.userId, userId), isNull(userProfiles.deletedAt)))
			.limit(1);

		if (userProfile) {
			userCity = userProfile.currentCity || null;
			userState = userProfile.state || null;
		} else {
			const [legacyProfile] = await db
				.select({
					city: jobseekerProfiles.city,
					state: jobseekerProfiles.state,
					jobTypes: jobseekerProfiles.jobTypes,
					preferredLocations: jobseekerProfiles.preferredLocations,
				})
				.from(jobseekerProfiles)
				.where(and(eq(jobseekerProfiles.userId, userId), isNull(jobseekerProfiles.deletedAt)))
				.limit(1);
			if (legacyProfile) {
				userCity = legacyProfile.city || null;
				userState = legacyProfile.state || null;
				userJobTypes = legacyProfile.jobTypes || [];
				userPreferredLocations = legacyProfile.preferredLocations || [];
			}
		}

		const selectLandingFields = {
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
			roleSummary: jobs.roleSummary,
			skillsRequired: jobs.skillsRequired,
			publishedAt: jobs.publishedAt,
			isFeatured: jobs.isFeatured,
			isUrgentHighlight: jobs.isUrgentHighlight,
			companyName: employerProfiles.companyName,
			brandName: employerProfiles.brandName,
		};

		const orderBy = [
			desc(jobs.isFeatured),
			desc(jobs.isUrgentHighlight),
			desc(jobs.publishedAt),
		];

		const runQuery = async (conditions: any[]) =>
			db
				.select(selectLandingFields)
				.from(jobs)
				.leftJoin(employerProfiles, eq(employerProfiles.userId, jobs.employerId))
				.where(and(...conditions))
				.orderBy(...orderBy)
				.limit(limit);

		let result: any[] = [];

		// Tier 1: preferred city + job types
		if (userCity || userJobTypes.length > 0 || userPreferredLocations.length > 0) {
			const tier1Conditions = [...baseConditions];
			const locationOptions: any[] = [];
			if (userCity) {
				locationOptions.push(like(sql`lower(${jobs.city})`, `%${userCity.toLowerCase()}%`));
			}
			for (const loc of userPreferredLocations) {
				locationOptions.push(like(sql`lower(${jobs.city})`, `%${loc.toLowerCase()}%`));
				locationOptions.push(like(sql`lower(${jobs.state})`, `%${loc.toLowerCase()}%`));
			}
			if (locationOptions.length > 0) {
				tier1Conditions.push(or(...locationOptions)!);
			}
			if (userJobTypes.length > 0) {
				tier1Conditions.push(inArray(jobs.jobType, userJobTypes as any[]));
			}
			result = await runQuery(tier1Conditions);
		}

		// Tier 2: city/state only
		if (!result || result.length === 0) {
			const tier2Conditions = [...baseConditions];
			const locationOrs: any[] = [];
			if (userCity) {
				locationOrs.push(like(sql`lower(${jobs.city})`, `%${userCity.toLowerCase()}%`));
			}
			if (userState) {
				locationOrs.push(like(sql`lower(${jobs.state})`, `%${userState.toLowerCase()}%`));
			}
			if (locationOrs.length > 0) {
				tier2Conditions.push(or(...locationOrs)!);
				result = await runQuery(tier2Conditions);
			}
		}

		// Tier 3: all active (featured + recent)
		if (!result || result.length === 0) {
			result = await runQuery(baseConditions);
		}

		const jobsList = result.map((j: any) => ({
			...j,
			company: j.brandName || j.companyName || null,
			badges: [j.isFeatured && "Featured", j.isUrgentHighlight && "Urgent"].filter(Boolean),
		}));

		return res.status(StatusCodes.OK).json({ jobs: jobsList });
	})
);

/**
 * GET /jobs/:id
 * Get single job details with company info (requires verified user)
 * Tracks job view (increments viewsCount)
 * Supports both ID (numeric) and UUID lookup
 */
router.get(
	"/:id",
	authMiddleware(),
	requireVerified(),
	requirePermission(Permissions.JOBS_READ),
	expressAsyncHandler(async (req, res) => {
		const paramId = req.params.id;
		const userId = req.userId!;
		
		// Check if param is UUID, numeric ID, or slug
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		const idRegex = /^\d+$/;

		let whereCondition;
		if (uuidRegex.test(paramId)) {
			whereCondition = and(eq(jobs.uuid, paramId), isNull(jobs.deletedAt));
		} else if (idRegex.test(paramId)) {
			whereCondition = and(eq(jobs.id, BigInt(paramId)), isNull(jobs.deletedAt));
		} else {
			whereCondition = and(eq(jobs.slug, paramId), isNull(jobs.deletedAt));
		}

		const [job] = await db
			.select({
				id: jobs.id,
				uuid: jobs.uuid,
				title: jobs.title,
				slug: jobs.slug,
				description: jobs.description,
				roleSummary: jobs.roleSummary,
				requirements: jobs.requirements,
				responsibilities: jobs.responsibilities,
				jobType: jobs.jobType,
				category: jobs.category,
				experienceLevel: jobs.experienceLevel,
				skillsRequired: jobs.skillsRequired,
				locationType: jobs.locationType,
				city: jobs.city,
				area: jobs.area,
				district: jobs.district,
				state: jobs.state,
				pincode: jobs.pincode,
				address: jobs.address,
				addressLine2: jobs.addressLine2,
				salaryMin: jobs.salaryMin,
				salaryMax: jobs.salaryMax,
				salaryType: jobs.salaryType,
				hideSalary: jobs.hideSalary,
				isSalaryNegotiable: jobs.isSalaryNegotiable,
				benefits: jobs.benefits,
				minExperienceYears: jobs.minExperienceYears,
				maxExperienceYears: jobs.maxExperienceYears,
				educationRequired: jobs.educationRequired,
				preferredLanguage: jobs.preferredLanguage,
				freshersAllowed: jobs.freshersAllowed,
				ageMin: jobs.ageMin,
				ageMax: jobs.ageMax,
				genderPreference: jobs.genderPreference,
				applicationDeadline: jobs.applicationDeadline,
				maxApplications: jobs.maxApplications,
				status: jobs.status,
				isFeatured: jobs.isFeatured,
				promotionType: jobs.promotionType,
				isUrgentHighlight: jobs.isUrgentHighlight,
				expiresAt: jobs.expiresAt,
				viewsCount: jobs.viewsCount,
				applicationsCount: jobs.applicationsCount,
				publishedAt: jobs.publishedAt,
				createdAt: jobs.createdAt,
				employerId: jobs.employerId,
				isResumeRequired: jobs.isResumeRequired,
				howToApply: jobs.howToApply,
				externalApplyUrl: jobs.externalApplyUrl,
			})
			.from(jobs)
			.where(whereCondition)
			.limit(1);

		if (!job) {
			return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
		}

		if (job.status !== JobStatuses.ACTIVE) {
			return res.status(StatusCodes.NOT_FOUND).json({ error: "Job not found" });
		}

		const [companyRow] = await db
			.select({
				companyName: employerProfiles.companyName,
				brandName: employerProfiles.brandName,
				logoUrl: employerProfiles.logoUrl,
				industry: employerProfiles.industry,
				companySize: employerProfiles.companySize,
				isVerified: employerProfiles.isVerified,
				contactPhone: employerProfiles.contactPhone,
				whatsappNumber: employerProfiles.whatsappNumber,
				showCallToApplicants: employerProfiles.showCallToApplicants,
				showWhatsAppToApplicants: employerProfiles.showWhatsAppToApplicants,
			})
			.from(employerProfiles)
			.where(eq(employerProfiles.userId, job.employerId))
			.limit(1);

		// Expose contact when employer has enabled visibility AND job allows direct contact (direct or both)
		const howToApply = (job as { howToApply?: string }).howToApply ?? "platform";
		const allowDirectContact = howToApply === "direct" || howToApply === "both";
		const company = companyRow ? {
			companyName: companyRow.companyName,
			brandName: companyRow.brandName,
			logoUrl: companyRow.logoUrl,
			industry: companyRow.industry,
			companySize: companyRow.companySize,
			isVerified: companyRow.isVerified,
			...(allowDirectContact && companyRow.showCallToApplicants !== false && companyRow.contactPhone
				? { contactPhone: companyRow.contactPhone }
				: {}),
			...(allowDirectContact && companyRow.showWhatsAppToApplicants !== false && companyRow.whatsappNumber
				? { whatsappNumber: companyRow.whatsappNumber }
				: {}),
		} : null;

		const [hasApplied] = await db
			.select({ id: applications.id })
			.from(applications)
			.where(
				and(
					eq(applications.jobId, job.id),
					eq(applications.jobseekerId, userId),
					isNull(applications.deletedAt)
				)
			)
			.limit(1);
		
		const [isSaved] = await db
			.select({ id: savedJobs.id })
			.from(savedJobs)
			.where(
				and(
					eq(savedJobs.jobId, job.id),
					eq(savedJobs.userId, userId)
				)
			)
			.limit(1);

		// Check for unique view
		const [existingView] = await db
			.select()
			.from(jobViews)
			.where(
				and(
					eq(jobViews.jobId, job.id),
					eq(jobViews.userId, userId)
				)
			)
			.limit(1);

		if (!existingView) {
			await db.transaction(async (tx) => {
				// Record the view
				await tx.insert(jobViews).values({
					jobId: job.id,
					userId: userId,
				});

				// Increment counter
				await tx
					.update(jobs)
					.set({
						viewsCount: sql`${jobs.viewsCount} + 1`,
						updatedAt: new Date(),
					})
					.where(eq(jobs.id, job.id));
			});
		}

		const badges = [
			job.isFeatured && "Featured",
			job.isUrgentHighlight && "Urgent",
			job.promotionType && "Promoted",
		].filter(Boolean);

		return res.status(StatusCodes.OK).json({
			...job,
			badges,
			company,
			hasApplied: !!hasApplied,
			isSaved: !!isSaved,
		});
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
