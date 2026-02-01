import {
	bigint,
	bigserial,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

// Interest type enum
export enum InterestTypes {
	HOBBY = "hobby",
	EXTRACURRICULAR = "extracurricular",
	VOLUNTEERING = "volunteering",
}

export const interestTypeEnum = pgEnum("interest_type", [
	"hobby",
	"extracurricular",
	"volunteering",
]);

/**
 * INTERESTS
 * ---------
 * Hobbies, extracurriculars, and volunteering activities.
 */
export const interests = pgTable(
	"interests",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Interest Details
		interestType: interestTypeEnum("interest_type"),
		description: text("description"),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_interests_user_id").on(table.userId),
		typeIdx: index("idx_interests_type").on(table.interestType),
	})
);

export type Interest = typeof interests.$inferSelect;
export type NewInterest = typeof interests.$inferInsert;
