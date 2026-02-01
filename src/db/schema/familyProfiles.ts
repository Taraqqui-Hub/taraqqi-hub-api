import {
	bigint,
	bigserial,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

/**
 * FAMILY_PROFILE
 * --------------
 * Family data for future features (matrimony, etc.)
 * ❌ Frontend hidden for now
 * ✔ DB ready
 */
export const familyProfiles = pgTable(
	"family_profiles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Father Details
		fatherName: text("father_name"),
		fatherOccupation: text("father_occupation"),
		fatherEducation: text("father_education"),

		// Mother Details
		motherName: text("mother_name"),
		motherOccupation: text("mother_occupation"),
		motherEducation: text("mother_education"),

		// Family Structure
		siblingsCount: integer("siblings_count"),
		familyStructure: text("family_structure"), // nuclear/joint/single-parent
		maritalStatus: text("marital_status"), // single/married/divorced/widowed

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_family_profiles_user_id").on(table.userId),
	})
);

export type FamilyProfile = typeof familyProfiles.$inferSelect;
export type NewFamilyProfile = typeof familyProfiles.$inferInsert;
