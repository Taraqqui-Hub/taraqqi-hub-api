import {
	bigint,
	bigserial,
	index,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

/**
 * COMMUNITY_PROFILE
 * -----------------
 * Community and background data (STRICT CONSENT required).
 * All fields are nullable and consent-gated.
 * ⚠️ This data should only be collected after explicit user consent.
 */
export const communityProfiles = pgTable(
	"community_profiles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Community Data (all optional + consent-gated)
		religion: text("religion"),
		casteCategory: text("caste_category"), // General/OBC/SC/ST
		subCaste: text("sub_caste"),
		minoritySelfIdentification: text("minority_self_identification"),
		communityAffiliation: text("community_affiliation"),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_community_profiles_user_id").on(table.userId),
	})
);

export type CommunityProfile = typeof communityProfiles.$inferSelect;
export type NewCommunityProfile = typeof communityProfiles.$inferInsert;
