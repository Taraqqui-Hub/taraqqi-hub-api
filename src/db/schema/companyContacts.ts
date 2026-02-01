import {
	bigint,
	bigserial,
	index,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { companyProfiles } from "./companyProfiles.ts";

/**
 * COMPANY_CONTACTS
 * ----------------
 * Contact person details for companies (split from employerProfiles).
 * Each company can have multiple contact persons.
 */
export const companyContacts = pgTable(
	"company_contacts",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		companyId: bigint("company_id", { mode: "bigint" })
			.notNull()
			.references(() => companyProfiles.id, { onDelete: "cascade" }),
		userId: bigint("user_id", { mode: "bigint" })
			.references(() => users.id, { onDelete: "set null" }),

		// Contact Person Details
		contactPersonName: text("contact_person_name").notNull(),
		contactEmail: text("contact_email"),
		contactPhone: text("contact_phone"),
		designation: text("designation"),
		department: text("department"),
		isPrimary: text("is_primary").default("false"), // Primary contact flag

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		companyIdIdx: index("idx_company_contacts_company_id").on(table.companyId),
		userIdIdx: index("idx_company_contacts_user_id").on(table.userId),
		emailIdx: index("idx_company_contacts_email").on(table.contactEmail),
	})
);

export type CompanyContact = typeof companyContacts.$inferSelect;
export type NewCompanyContact = typeof companyContacts.$inferInsert;
