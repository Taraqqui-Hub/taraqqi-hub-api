import {
	bigint,
	bigserial,
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

// Company type enum
export enum CompanyTypes {
	STARTUP = "startup",
	SME = "sme",
	ENTERPRISE = "enterprise",
	AGENCY = "agency",
}

export const companyTypeEnum = pgEnum("company_type", [
	"startup",
	"sme",
	"enterprise",
	"agency",
]);

// Company size enum
export enum CompanySizes {
	TINY = "1-10",
	SMALL = "11-50",
	MEDIUM = "51-200",
	LARGE = "201-500",
	ENTERPRISE = "500+",
}

export const companySizeEnum = pgEnum("company_size", [
	"1-10",
	"11-50",
	"51-200",
	"201-500",
	"500+",
]);

export const employerProfiles = pgTable(
	"employer_profiles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Company Info
		companyName: text("company_name").notNull(),
		companyType: companyTypeEnum("company_type"),
		industry: text("industry"),
		companySize: companySizeEnum("company_size"),
		foundedYear: integer("founded_year"),
		website: text("website"),

		// Contact
		contactPersonName: text("contact_person_name"),
		contactEmail: text("contact_email"),
		contactPhone: text("contact_phone"),
		address: text("address"),
		city: text("city"),
		state: text("state"),
		country: text("country").default("India"),
		pincode: text("pincode"),

		// Branding (Cloudinary URLs)
		logoUrl: text("logo_url"),
		coverImageUrl: text("cover_image_url"),

		// About
		description: text("description"),
		culture: text("culture"),
		benefits: text("benefits").array(),

		// Verification
		gstin: text("gstin"),
		pan: text("pan"),
		isVerified: boolean("is_verified").notNull().default(false),
		verifiedAt: timestamp("verified_at", { mode: "date" }),
		verifiedBy: bigint("verified_by", { mode: "bigint" }).references(
			() => users.id,
			{ onDelete: "set null" }
		),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		userIdIdx: index("idx_employer_profiles_user_id").on(table.userId),
		companyNameIdx: index("idx_employer_profiles_company_name").on(
			table.companyName
		),
		cityIdx: index("idx_employer_profiles_city").on(table.city),
		isVerifiedIdx: index("idx_employer_profiles_is_verified").on(
			table.isVerified
		),
		deletedAtIdx: index("idx_employer_profiles_deleted_at").on(table.deletedAt),
	})
);

export type EmployerProfile = typeof employerProfiles.$inferSelect;
export type NewEmployerProfile = typeof employerProfiles.$inferInsert;
