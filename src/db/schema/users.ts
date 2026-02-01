import {
	bigserial,
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// User role enum (renamed from user_types for clarity)
export enum UserTypes {
	INDIVIDUAL = "individual", // Previously "jobseeker" - now supports non-job users
	EMPLOYER = "employer",
	ADMIN = "admin",
	SUPER_ADMIN = "super_admin",
}

export const userTypesEnum = pgEnum("user_types", [
	"individual",
	"employer",
	"admin",
	"super_admin",
]);

// Verification status enum
export enum VerificationStatuses {
	DRAFT = "draft", // Registration incomplete
	SUBMITTED = "submitted", // KYC submitted, awaiting review
	UNDER_REVIEW = "under_review", // Admin reviewing
	VERIFIED = "verified", // Full access
	REJECTED = "rejected", // Blocked until resubmission
	SUSPENDED = "suspended", // Admin action
}

export const verificationStatusEnum = pgEnum("verification_status", [
	"draft",
	"submitted",
	"under_review",
	"verified",
	"rejected",
	"suspended",
]);

export const users = pgTable(
	"users",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		uuid: uuid("uuid").defaultRandom().notNull().unique(),

		// Profile
		name: text("name"),

		// Auth
		email: text("email"),
		phone: text("phone"), // Required for registration but not used for login
		whatsappNumber: text("whatsapp_number"), // Optional WhatsApp contact
		passwordHash: text("password_hash"),
		userType: userTypesEnum("user_type").notNull().default(UserTypes.INDIVIDUAL),

		// Verification Status
		verificationStatus: verificationStatusEnum("verification_status")
			.notNull()
			.default(VerificationStatuses.DRAFT),
		verificationSubmittedAt: timestamp("verification_submitted_at", { mode: "date" }),
		verifiedAt: timestamp("verified_at", { mode: "date" }),
		rejectedReason: text("rejected_reason"),

		// Legacy verification (for email/phone confirmation)
		emailVerified: boolean("email_verified").notNull().default(false),
		phoneVerified: boolean("phone_verified").notNull().default(false),

		// Security
		failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
		lockedUntil: timestamp("locked_until", { mode: "date" }),

		// Status
		isActive: boolean("is_active").notNull().default(true),

		// Trust & Participation (Community Platform Features)
		trustScore: integer("trust_score").notNull().default(0), // 0-100 scale
		participationMode: text("participation_mode"), // e.g., "active", "passive", "dormant"

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		lastLoginAt: timestamp("last_login_at", { mode: "date" }),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		phoneIdx: uniqueIndex("idx_users_phone").on(table.phone),
		emailIdx: index("idx_users_email").on(table.email),
		userTypeIdx: index("idx_users_user_type").on(table.userType),
		verificationStatusIdx: index("idx_users_verification_status").on(table.verificationStatus),
		deletedAtIdx: index("idx_users_deleted_at").on(table.deletedAt),
	})
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
