import {
	bigint,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

export const userEmailVerificationCodes = pgTable(
	"user_email_verification_codes",
	{
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		verificationCode: text("verification_code").notNull(),
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
		sentAt: timestamp("sent_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: uniqueIndex("idx_user_email_verification_codes_user_id").on(
			table.userId
		),
		verificationCodeIdx: uniqueIndex(
			"idx_user_email_verification_codes_verification_code"
		).on(table.verificationCode),
	})
);

export type UserEmailVerificationCode =
	typeof userEmailVerificationCodes.$inferSelect;
export type NewUserEmailVerificationCode =
	typeof userEmailVerificationCodes.$inferInsert;
