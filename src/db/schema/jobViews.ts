import {
	bigint,
	bigserial,
	pgTable,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { jobs } from "./jobs.ts";
import { users } from "./users.ts";

export const jobViews = pgTable(
	"job_views",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		jobId: bigint("job_id", { mode: "bigint" })
			.notNull()
			.references(() => jobs.id, { onDelete: "cascade" }),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		viewedAt: timestamp("viewed_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		uniqueView: uniqueIndex("idx_job_views_unique").on(table.jobId, table.userId),
	})
);

export type JobView = typeof jobViews.$inferSelect;
export type NewJobView = typeof jobViews.$inferInsert;
