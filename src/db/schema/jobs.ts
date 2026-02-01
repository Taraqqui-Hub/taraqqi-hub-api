import {
	bigint,
	bigserial,
	boolean,
	decimal,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

// Job status enum
export enum JobStatuses {
	DRAFT = "draft",
	ACTIVE = "active",
	PAUSED = "paused",
	CLOSED = "closed",
	EXPIRED = "expired",
}

export const jobStatusEnum = pgEnum("job_status", [
	"draft",
	"active",
	"paused",
	"closed",
	"expired",
]);

// Job type enum
export enum JobTypes {
	FULL_TIME = "full-time",
	PART_TIME = "part-time",
	CONTRACT = "contract",
	INTERNSHIP = "internship",
	FREELANCE = "freelance",
}

export const jobTypeEnum = pgEnum("job_type", [
	"full-time",
	"part-time",
	"contract",
	"internship",
	"freelance",
]);

// Experience level enum
export enum ExperienceLevels {
	FRESHER = "fresher",
	JUNIOR = "junior",
	MID = "mid",
	SENIOR = "senior",
	LEAD = "lead",
	EXECUTIVE = "executive",
}

export const experienceLevelEnum = pgEnum("experience_level", [
	"fresher",
	"junior",
	"mid",
	"senior",
	"lead",
	"executive",
]);

// Location type enum
export enum LocationTypes {
	ONSITE = "onsite",
	REMOTE = "remote",
	HYBRID = "hybrid",
}

export const locationTypeEnum = pgEnum("location_type", [
	"onsite",
	"remote",
	"hybrid",
]);

export const jobs = pgTable(
	"jobs",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		uuid: uuid("uuid").defaultRandom().notNull().unique(),
		employerId: bigint("employer_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Job Details
		title: text("title").notNull(),
		slug: text("slug").notNull(),
		description: text("description").notNull(),
		requirements: text("requirements"),
		responsibilities: text("responsibilities"),

		// Classification
		jobType: jobTypeEnum("job_type").notNull(),
		experienceLevel: experienceLevelEnum("experience_level"),
		category: text("category"),
		skillsRequired: text("skills_required").array(),

		// Location
		locationType: locationTypeEnum("location_type"),
		city: text("city"),
		state: text("state"),
		country: text("country").default("India"),
		address: text("address"),

		// Compensation
		salaryMin: decimal("salary_min", { precision: 12, scale: 2 }),
		salaryMax: decimal("salary_max", { precision: 12, scale: 2 }),
		salaryCurrency: text("salary_currency").default("INR"),
		isSalaryNegotiable: boolean("is_salary_negotiable").notNull().default(false),
		hideSalary: boolean("hide_salary").notNull().default(false),

		// Requirements
		minExperienceYears: integer("min_experience_years").notNull().default(0),
		maxExperienceYears: integer("max_experience_years"),
		educationRequired: text("education_required"),

		// Settings
		status: jobStatusEnum("status").notNull().default(JobStatuses.DRAFT),
		isFeatured: boolean("is_featured").notNull().default(false),
		applicationDeadline: timestamp("application_deadline", { mode: "date" }),
		maxApplications: integer("max_applications"),

		// Stats
		viewsCount: integer("views_count").notNull().default(0),
		applicationsCount: integer("applications_count").notNull().default(0),

		// Publishing
		publishedAt: timestamp("published_at", { mode: "date" }),
		expiresAt: timestamp("expires_at", { mode: "date" }),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		slugIdx: uniqueIndex("idx_jobs_slug").on(table.slug),
		employerIdIdx: index("idx_jobs_employer_id").on(table.employerId),
		statusIdx: index("idx_jobs_status").on(table.status),
		cityIdx: index("idx_jobs_city").on(table.city),
		categoryIdx: index("idx_jobs_category").on(table.category),
		jobTypeIdx: index("idx_jobs_job_type").on(table.jobType),
		deletedAtIdx: index("idx_jobs_deleted_at").on(table.deletedAt),
		publishedAtIdx: index("idx_jobs_published_at").on(table.publishedAt),
	})
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
