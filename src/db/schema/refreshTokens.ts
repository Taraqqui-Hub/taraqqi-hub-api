import {
	bigint,
	boolean,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: bigint("user_id", { mode: "bigint" })
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	isActive: boolean("is_active").notNull().default(true),
	deviceInfo: text("device_info"),
	ipAddress: text("ip_address"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
