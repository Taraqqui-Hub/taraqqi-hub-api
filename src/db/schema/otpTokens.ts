import {
	bigserial,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

// OTP purpose enum
export enum OtpPurposes {
	LOGIN = "login",
	REGISTER = "register",
	RESET_PASSWORD = "reset_password",
	VERIFY_PHONE = "verify_phone",
	VERIFY_EMAIL = "verify_email",
}

export const otpPurposeEnum = pgEnum("otp_purpose", [
	"login",
	"register",
	"reset_password",
	"verify_phone",
	"verify_email",
]);

export const otpTokens = pgTable(
	"otp_tokens",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),

		// Target
		phone: text("phone"),
		email: text("email"),
		otpHash: text("otp_hash").notNull(),
		purpose: otpPurposeEnum("purpose").notNull(),

		// Rate limiting
		attempts: integer("attempts").notNull().default(0),
		maxAttempts: integer("max_attempts").notNull().default(3),

		// Expiry
		expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
		verifiedAt: timestamp("verified_at", { mode: "date" }),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		phoneIdx: index("idx_otp_tokens_phone").on(table.phone),
		emailIdx: index("idx_otp_tokens_email").on(table.email),
		purposeIdx: index("idx_otp_tokens_purpose").on(table.purpose),
		expiresAtIdx: index("idx_otp_tokens_expires_at").on(table.expiresAt),
	})
);

export type OtpToken = typeof otpTokens.$inferSelect;
export type NewOtpToken = typeof otpTokens.$inferInsert;
