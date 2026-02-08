import {
	bigint,
	bigserial,
	index,
	pgTable,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { jobs } from "./jobs.ts";

export const savedJobs = pgTable(
	"saved_jobs",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		jobId: bigint("job_id", { mode: "bigint" })
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userJobIdx: uniqueIndex("idx_saved_jobs_user_job").on(table.userId, table.jobId),
		userIdIdx: index("idx_saved_jobs_user_id").on(table.userId),
	})
);

export type SavedJob = typeof savedJobs.$inferSelect;
export type NewSavedJob = typeof savedJobs.$inferInsert;
