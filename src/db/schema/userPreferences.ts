import {
	bigint,
	bigserial,
	boolean,
	index,
	pgTable,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

/**
 * USER_PREFERENCES
 * ----------------
 * User intent modeling - critical for supporting non-job users.
 * This is how we support varied user intents cleanly.
 */
export const userPreferences = pgTable(
	"user_preferences",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Intent flags
		wantsJobNow: boolean("wants_job_now").notNull().default(false),
		openToFutureJobs: boolean("open_to_future_jobs").notNull().default(false),
		wantsSkillPrograms: boolean("wants_skill_programs").notNull().default(false),
		wantsCommunityPrograms: boolean("wants_community_programs").notNull().default(false),
		wantsMatrimony: boolean("wants_matrimony").notNull().default(false), // Future feature

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_user_preferences_user_id").on(table.userId),
	})
);

export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
