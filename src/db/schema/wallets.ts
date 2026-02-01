import {
	bigint,
	bigserial,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.ts";

// Wallet status enum
export enum WalletStatuses {
	ACTIVE = "active",
	FROZEN = "frozen",
	CLOSED = "closed",
}

export const walletStatusEnum = pgEnum("wallet_status", [
	"active",
	"frozen",
	"closed",
]);

export const wallets = pgTable(
	"wallets",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),

		// Balance (stored as smallest unit - paise for INR)
		balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`0`),
		currency: text("currency").notNull().default("INR"),

		// Status
		status: walletStatusEnum("status").notNull().default(WalletStatuses.ACTIVE),

		// Limits
		dailyLimit: bigint("daily_limit", { mode: "bigint" }),
		monthlyLimit: bigint("monthly_limit", { mode: "bigint" }),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		userIdIdx: index("idx_wallets_user_id").on(table.userId),
		statusIdx: index("idx_wallets_status").on(table.status),
		deletedAtIdx: index("idx_wallets_deleted_at").on(table.deletedAt),
	})
);

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
