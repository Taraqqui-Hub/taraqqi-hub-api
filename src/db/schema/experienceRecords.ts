import {
	bigint,
	bigserial,
	boolean,
	date,
	index,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

/**
 * EXPERIENCE_RECORDS
 * ------------------
 * Detailed work history (multi-row).
 * Each user can have multiple experience records.
 */
export const experienceRecords = pgTable(
	"experience_records",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Work Details
		companyName: text("company_name"),
		jobTitle: text("job_title"),
		startDate: date("start_date", { mode: "date" }),
		endDate: date("end_date", { mode: "date" }),
		isCurrent: boolean("is_current").notNull().default(false),
		leavingReason: text("leaving_reason"),
		salaryRange: text("salary_range"),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_experience_records_user_id").on(table.userId),
		isCurrentIdx: index("idx_experience_records_is_current").on(table.isCurrent),
	})
);

export type ExperienceRecord = typeof experienceRecords.$inferSelect;
export type NewExperienceRecord = typeof experienceRecords.$inferInsert;
