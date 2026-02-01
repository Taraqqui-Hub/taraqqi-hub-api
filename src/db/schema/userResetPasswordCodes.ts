import {
	bigint,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

export const userResetPasswordCodes = pgTable("user_reset_password_codes", {
	id: text("id").primaryKey(),
	userId: bigint("user_id", { mode: "bigint" })
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	resetPasswordCode: text("reset_password_code").notNull(),
	expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
	createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { precision: 3 }).defaultNow().notNull(),
	sentAt: timestamp("sent_at", { precision: 3 }).defaultNow().notNull(),
	usedAt: timestamp("used_at", { precision: 3 }),
	attempts: integer("attempts").default(0),
});

export type UserResetPasswordCode = typeof userResetPasswordCodes.$inferSelect;
export type NewUserResetPasswordCode =
	typeof userResetPasswordCodes.$inferInsert;
