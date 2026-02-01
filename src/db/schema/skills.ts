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

// Proficiency level enum
export enum ProficiencyLevels {
	BEGINNER = "beginner",
	INTERMEDIATE = "intermediate",
	ADVANCED = "advanced",
	EXPERT = "expert",
}

export const proficiencyLevelEnum = pgEnum("proficiency_level", [
	"beginner",
	"intermediate",
	"advanced",
	"expert",
]);

/**
 * SKILLS
 * ------
 * Structured skills tracking (replaces plain array in old schema).
 * Each user can have multiple skills with proficiency levels.
 */
export const skills = pgTable(
	"skills",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Skill Details
		skillName: text("skill_name").notNull(),
		proficiencyLevel: proficiencyLevelEnum("proficiency_level"),
		yearsOfExperience: integer("years_of_experience"),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_skills_user_id").on(table.userId),
		skillNameIdx: index("idx_skills_skill_name").on(table.skillName),
	})
);

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
