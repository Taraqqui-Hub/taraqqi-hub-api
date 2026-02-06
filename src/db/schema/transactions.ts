import {
	bigint,
	bigserial,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { wallets } from "./wallets.ts";

// Transaction type enum
export enum TransactionTypes {
	CREDIT = "credit",
	DEBIT = "debit",
}

export const transactionTypeEnum = pgEnum("transaction_type", [
	"credit",
	"debit",
]);

// Transaction status enum
export enum TransactionStatuses {
	PENDING = "pending",
	COMPLETED = "completed",
	FAILED = "failed",
	REVERSED = "reversed",
}

export const transactionStatusEnum = pgEnum("transaction_status", [
	"pending",
	"completed",
	"failed",
	"reversed",
]);

// Transaction category enum
export enum TransactionCategories {
	DEPOSIT = "deposit",
	WITHDRAWAL = "withdrawal",
	REGISTRATION_FEE = "registration_fee",
	JOB_POST_FEE = "job_post_fee",
	JOB_PROMOTION = "job_promotion",
	FEATURED_JOB_FEE = "featured_job_fee",
	RESUME_UNLOCK = "resume_unlock",
	REFUND = "refund",
	BONUS = "bonus",
	SUBSCRIPTION = "subscription",
}

export const transactionCategoryEnum = pgEnum("transaction_category", [
	"deposit",
	"withdrawal",
	"registration_fee",
	"job_post_fee",
	"job_promotion",
	"featured_job_fee",
	"resume_unlock",
	"refund",
	"bonus",
	"subscription",
]);

export const transactions = pgTable(
	"transactions",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		uuid: uuid("uuid").defaultRandom().notNull().unique(),
		walletId: bigint("wallet_id", { mode: "bigint" })
			.notNull()
			.references(() => wallets.id, { onDelete: "cascade" }),

		// Transaction Details
		type: transactionTypeEnum("type").notNull(),
		category: transactionCategoryEnum("category").notNull(),
		amount: bigint("amount", { mode: "bigint" }).notNull(),
		currency: text("currency").notNull().default("INR"),

		// Balance snapshot
		balanceBefore: bigint("balance_before", { mode: "bigint" }).notNull(),
		balanceAfter: bigint("balance_after", { mode: "bigint" }).notNull(),

		// Status
		status: transactionStatusEnum("status")
			.notNull()
			.default(TransactionStatuses.PENDING),

		// Reference
		referenceId: text("reference_id"),
		referenceType: text("reference_type"),
		relatedEntityType: text("related_entity_type"),
		relatedEntityId: bigint("related_entity_id", { mode: "bigint" }),

		// Metadata
		description: text("description"),
		metadata: jsonb("metadata"),

		// Processing
		processedAt: timestamp("processed_at", { mode: "date" }),
		failedReason: text("failed_reason"),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		walletIdIdx: index("idx_transactions_wallet_id").on(table.walletId),
		statusIdx: index("idx_transactions_status").on(table.status),
		categoryIdx: index("idx_transactions_category").on(table.category),
		createdAtIdx: index("idx_transactions_created_at").on(table.createdAt),
		referenceIdIdx: index("idx_transactions_reference_id").on(table.referenceId),
	})
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
