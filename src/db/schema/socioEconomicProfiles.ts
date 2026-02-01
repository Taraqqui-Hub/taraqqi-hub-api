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
 * SOCIO_ECONOMIC_PROFILE
 * ----------------------
 * Optional socio-economic data (range-based for privacy).
 * All fields are nullable and consent-gated.
 */
export const socioEconomicProfiles = pgTable(
	"socio_economic_profiles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Economic Data (all optional, range-based)
		familyIncomeRange: text("family_income_range"), // e.g., "0-2L", "2-5L", "5-10L", "10L+"
		earningMembersCount: integer("earning_members_count"),
		dependentsCount: integer("dependents_count"),
		housingType: text("housing_type"), // owned/rented/family/hostel

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_socio_economic_profiles_user_id").on(table.userId),
	})
);

export type SocioEconomicProfile = typeof socioEconomicProfiles.$inferSelect;
export type NewSocioEconomicProfile = typeof socioEconomicProfiles.$inferInsert;
