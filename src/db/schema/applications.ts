import {
	bigint,
	bigserial,
	decimal,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { jobs } from "./jobs.ts";

// Application status enum
export enum ApplicationStatuses {
	PENDING = "pending",
	REVIEWED = "reviewed",
	SHORTLISTED = "shortlisted",
	INTERVIEW = "interview",
	OFFERED = "offered",
	HIRED = "hired",
	REJECTED = "rejected",
	WITHDRAWN = "withdrawn",
}

export const applicationStatusEnum = pgEnum("application_status", [
	"pending",
	"reviewed",
	"shortlisted",
	"interview",
	"offered",
	"hired",
	"rejected",
	"withdrawn",
]);

export const applications = pgTable(
	"applications",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		uuid: uuid("uuid").defaultRandom().notNull().unique(),
		jobId: bigint("job_id", { mode: "bigint" })
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		jobseekerId: bigint("jobseeker_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Application Data
		resumeUrl: text("resume_url"),
		coverLetter: text("cover_letter"),
		expectedSalary: decimal("expected_salary", { precision: 12, scale: 2 }),
		noticePeriodDays: integer("notice_period_days"),

		// Screening answers (JSONB for flexibility)
		screeningAnswers: jsonb("screening_answers"),

		// Status
		status: applicationStatusEnum("status")
			.notNull()
			.default(ApplicationStatuses.PENDING),
		statusChangedAt: timestamp("status_changed_at", { mode: "date" }),
		statusChangedBy: bigint("status_changed_by", { mode: "bigint" }).references(
			() => users.id,
			{ onDelete: "set null" }
		),

		// Notes (employer internal)
		internalNotes: text("internal_notes"),
		rating: integer("rating"),

		// Timestamps
		appliedAt: timestamp("applied_at", { mode: "date" }).defaultNow().notNull(),
		viewedAt: timestamp("viewed_at", { mode: "date" }),
		shortlistedAt: timestamp("shortlisted_at", { mode: "date" }),

		// Standard timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		jobJobseekerUnique: unique("uq_applications_job_jobseeker").on(
			table.jobId,
			table.jobseekerId
		),
		jobIdIdx: index("idx_applications_job_id").on(table.jobId),
		jobseekerIdIdx: index("idx_applications_jobseeker_id").on(table.jobseekerId),
		statusIdx: index("idx_applications_status").on(table.status),
		deletedAtIdx: index("idx_applications_deleted_at").on(table.deletedAt),
	})
);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
