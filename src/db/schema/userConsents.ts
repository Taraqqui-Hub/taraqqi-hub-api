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

// Consent type enum
export enum ConsentTypes {
	COMMUNITY_DATA = "community_data",
	INCOME_DATA = "income_data",
	FAMILY_DATA = "family_data",
	MARKETING = "marketing",
	THIRD_PARTY_SHARING = "third_party_sharing",
}

export const consentTypeEnum = pgEnum("consent_type", [
	"community_data",
	"income_data",
	"family_data",
	"marketing",
	"third_party_sharing",
]);

/**
 * USER_CONSENTS
 * -------------
 * Consent tracking system for legal protection.
 * Tracks when users give/revoke consent for data collection.
 */
export const userConsents = pgTable(
	"user_consents",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Consent Details
		consentType: consentTypeEnum("consent_type").notNull(),
		consentVersion: text("consent_version"), // e.g., "v1.0", "v2.0"
		consentGivenAt: timestamp("consent_given_at", { mode: "date" }),
		consentRevokedAt: timestamp("consent_revoked_at", { mode: "date" }),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_user_consents_user_id").on(table.userId),
		typeIdx: index("idx_user_consents_type").on(table.consentType),
		userTypeUnique: index("idx_user_consents_user_type").on(table.userId, table.consentType),
	})
);

export type UserConsent = typeof userConsents.$inferSelect;
export type NewUserConsent = typeof userConsents.$inferInsert;
