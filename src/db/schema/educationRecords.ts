import {
	bigint,
	bigserial,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

// Education level enum
export enum EducationLevels {
	NO_EDUCATION = "no_education",
	TENTH = "10th",
	TWELFTH = "12th",
	DIPLOMA = "diploma",
	UG = "ug",
	PG = "pg",
	OTHER = "other",
}

export const educationLevelEnum = pgEnum("education_level", [
	"no_education",
	"10th",
	"12th",
	"diploma",
	"ug",
	"pg",
	"other",
]);

/**
 * EDUCATION_RECORDS
 * -----------------
 * Multi-row education tracking.
 * Each user can have multiple education records (10th, 12th, UG, PG, etc.)
 */
export const educationRecords = pgTable(
	"education_records",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Education Details
		level: educationLevelEnum("level").notNull(),
		institution: text("institution"),
		boardOrUniversity: text("board_or_university"),
		yearOfPassing: integer("year_of_passing"),
		gradeOrPercentage: text("grade_or_percentage"),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_education_records_user_id").on(table.userId),
		levelIdx: index("idx_education_records_level").on(table.level),
	})
);

export type EducationRecord = typeof educationRecords.$inferSelect;
export type NewEducationRecord = typeof educationRecords.$inferInsert;
