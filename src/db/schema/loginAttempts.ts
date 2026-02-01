import {
	bigserial,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

/**
 * Login Attempts Table
 * Tracks failed login attempts for rate limiting and security
 */
export const loginAttempts = pgTable(
	"login_attempts",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),

		// Identifier (email or IP address)
		identifier: text("identifier").notNull(),
		identifierType: text("identifier_type").notNull().default("email"), // "email" or "ip"

		// Attempt tracking
		attempts: integer("attempts").notNull().default(0),
		lockedUntil: timestamp("locked_until", { mode: "date" }),

		// Timestamps
		lastAttemptAt: timestamp("last_attempt_at", { mode: "date" }).defaultNow().notNull(),
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		identifierIdx: index("idx_login_attempts_identifier").on(table.identifier),
		lockedUntilIdx: index("idx_login_attempts_locked_until").on(table.lockedUntil),
	})
);

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
