/**
 * Wallet Service
 * Handles wallet operations with transaction safety
 */

import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../config/database.ts";
import {
	wallets,
	WalletStatuses,
	transactions,
	TransactionTypes,
	TransactionStatuses,
	TransactionCategories,
} from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import { StatusCodes } from "http-status-codes";
import { auditCreate } from "./auditService.ts";

// ============================================
// Types
// ============================================

export interface WalletInfo {
	id: bigint;
	userId: bigint;
	balance: bigint;
	balanceInRupees: number;
	currency: string;
	status: string;
}

export interface TransactionResult {
	transactionId: bigint;
	transactionUuid: string;
	amount: bigint;
	amountInRupees: number;
	balanceBefore: bigint;
	balanceAfter: bigint;
	status: string;
	isDuplicate?: boolean;
}

// ============================================
// Wallet Operations
// ============================================

/**
 * Get or create wallet for user
 */
export async function getOrCreateWallet(userId: bigint): Promise<WalletInfo> {
	// Try to get existing wallet
	let [wallet] = await db
		.select()
		.from(wallets)
		.where(
			and(eq(wallets.userId, userId), isNull(wallets.deletedAt))
		)
		.limit(1);

	// Create if not exists
	if (!wallet) {
		[wallet] = await db
			.insert(wallets)
			.values({
				userId,
				balance: BigInt(0),
				currency: "INR",
				status: WalletStatuses.ACTIVE,
			})
			.returning();
	}

	return {
		id: wallet.id,
		userId: wallet.userId,
		balance: wallet.balance,
		balanceInRupees: Number(wallet.balance) / 100,
		currency: wallet.currency,
		status: wallet.status,
	};
}

/**
 * Get wallet balance
 */
export async function getBalance(userId: bigint): Promise<{
	balance: bigint;
	balanceInRupees: number;
	currency: string;
}> {
	const wallet = await getOrCreateWallet(userId);
	return {
		balance: wallet.balance,
		balanceInRupees: wallet.balanceInRupees,
		currency: wallet.currency,
	};
}

/**
 * Top-up wallet (simulated payment)
 * Uses idempotency key to prevent duplicates
 */
export async function topUp(
	userId: bigint,
	amountInPaise: bigint,
	idempotencyKey: string,
	metadata?: {
		paymentMethod?: string;
		externalId?: string;
		ipAddress?: string;
		userAgent?: string;
	}
): Promise<TransactionResult> {
	// Check for existing transaction with same idempotency key
	const [existing] = await db
		.select()
		.from(transactions)
		.where(eq(transactions.referenceId, idempotencyKey))
		.limit(1);

	if (existing) {
		// Return existing transaction (idempotent)
		return {
			transactionId: existing.id,
			transactionUuid: existing.uuid,
			amount: existing.amount,
			amountInRupees: Number(existing.amount) / 100,
			balanceBefore: existing.balanceBefore,
			balanceAfter: existing.balanceAfter,
			status: existing.status,
			isDuplicate: true,
		};
	}

	// Get or create wallet
	const wallet = await getOrCreateWallet(userId);

	if (wallet.status !== WalletStatuses.ACTIVE) {
		throw new HTTPError({
			httpStatus: StatusCodes.FORBIDDEN,
			message: "Wallet is not active",
		});
	}

	// Perform atomic top-up
	const result = await db.transaction(async (tx) => {
		// Lock wallet row
		const [lockedWallet] = await tx
			.select()
			.from(wallets)
			.where(eq(wallets.id, wallet.id))
			.for("update")
			.limit(1);

		const balanceBefore = lockedWallet.balance;
		const balanceAfter = balanceBefore + amountInPaise;

		// Update balance
		await tx
			.update(wallets)
			.set({
				balance: balanceAfter,
				updatedAt: new Date(),
			})
			.where(eq(wallets.id, wallet.id));

		// Create transaction record
		const [transaction] = await tx
			.insert(transactions)
			.values({
				walletId: wallet.id,
				type: TransactionTypes.CREDIT,
				category: TransactionCategories.DEPOSIT,
				amount: amountInPaise,
				currency: wallet.currency,
				balanceBefore,
				balanceAfter,
				status: TransactionStatuses.COMPLETED,
				referenceId: idempotencyKey,
				referenceType: "top_up",
				description: `Wallet top-up: ₹${Number(amountInPaise) / 100}`,
				metadata: metadata || null,
				processedAt: new Date(),
			})
			.returning();

		return {
			transactionId: transaction.id,
			transactionUuid: transaction.uuid,
			amount: transaction.amount,
			amountInRupees: Number(transaction.amount) / 100,
			balanceBefore,
			balanceAfter,
			status: transaction.status,
		};
	});

	// Audit log (outside transaction)
	await auditCreate(
		"wallet_topup",
		result.transactionId,
		{
			amount: Number(amountInPaise) / 100,
			balanceAfter: Number(result.balanceAfter) / 100,
		},
		{
			userId,
			ipAddress: metadata?.ipAddress,
			userAgent: metadata?.userAgent,
		},
		`Wallet top-up: ₹${Number(amountInPaise) / 100}`
	);

	return result;
}

/**
 * Deduct from wallet (atomic)
 */
export async function deduct(
	userId: bigint,
	amountInPaise: bigint,
	category: TransactionCategories,
	options: {
		idempotencyKey?: string;
		description: string;
		relatedEntityType?: string;
		relatedEntityId?: bigint;
		metadata?: Record<string, any>;
		ipAddress?: string;
		userAgent?: string;
	}
): Promise<TransactionResult> {
	// Check for existing transaction with same idempotency key
	if (options.idempotencyKey) {
		const [existing] = await db
			.select()
			.from(transactions)
			.where(eq(transactions.referenceId, options.idempotencyKey))
			.limit(1);

		if (existing) {
			return {
				transactionId: existing.id,
				transactionUuid: existing.uuid,
				amount: existing.amount,
				amountInRupees: Number(existing.amount) / 100,
				balanceBefore: existing.balanceBefore,
				balanceAfter: existing.balanceAfter,
				status: existing.status,
				isDuplicate: true,
			};
		}
	}

	// Get wallet
	const wallet = await getOrCreateWallet(userId);

	if (wallet.status !== WalletStatuses.ACTIVE) {
		throw new HTTPError({
			httpStatus: StatusCodes.FORBIDDEN,
			message: "Wallet is not active",
		});
	}

	// Perform atomic deduction
	const result = await db.transaction(async (tx) => {
		// Lock wallet row with FOR UPDATE
		const [lockedWallet] = await tx
			.select()
			.from(wallets)
			.where(eq(wallets.id, wallet.id))
			.for("update")
			.limit(1);

		// Check sufficient balance
		if (lockedWallet.balance < amountInPaise) {
			throw new HTTPError({
				httpStatus: StatusCodes.PAYMENT_REQUIRED,
				message: "Insufficient balance",
				reason: {
					required: Number(amountInPaise) / 100,
					available: Number(lockedWallet.balance) / 100,
				},
			});
		}

		const balanceBefore = lockedWallet.balance;
		const balanceAfter = balanceBefore - amountInPaise;

		// Update balance
		await tx
			.update(wallets)
			.set({
				balance: balanceAfter,
				updatedAt: new Date(),
			})
			.where(eq(wallets.id, wallet.id));

		// Create transaction record
		const [transaction] = await tx
			.insert(transactions)
			.values({
				walletId: wallet.id,
				type: TransactionTypes.DEBIT,
				category,
				amount: amountInPaise,
				currency: wallet.currency,
				balanceBefore,
				balanceAfter,
				status: TransactionStatuses.COMPLETED,
				referenceId: options.idempotencyKey || null,
				referenceType: "deduction",
				relatedEntityType: options.relatedEntityType || null,
				relatedEntityId: options.relatedEntityId || null,
				description: options.description,
				metadata: options.metadata || null,
				processedAt: new Date(),
			})
			.returning();

		return {
			transactionId: transaction.id,
			transactionUuid: transaction.uuid,
			amount: transaction.amount,
			amountInRupees: Number(transaction.amount) / 100,
			balanceBefore,
			balanceAfter,
			status: transaction.status,
		};
	});

	// Audit log
	await auditCreate(
		"wallet_deduction",
		result.transactionId,
		{
			category,
			amount: Number(amountInPaise) / 100,
			balanceAfter: Number(result.balanceAfter) / 100,
			...options.metadata,
		},
		{
			userId,
			ipAddress: options.ipAddress,
			userAgent: options.userAgent,
		},
		options.description
	);

	return result;
}

/**
 * Get transaction history for user
 */
export async function getTransactionHistory(
	userId: bigint,
	limit: number = 50,
	offset: number = 0
): Promise<{
	transactions: any[];
	total: number;
}> {
	const wallet = await getOrCreateWallet(userId);

	const results = await db
		.select({
			id: transactions.id,
			uuid: transactions.uuid,
			type: transactions.type,
			category: transactions.category,
			amount: transactions.amount,
			balanceBefore: transactions.balanceBefore,
			balanceAfter: transactions.balanceAfter,
			status: transactions.status,
			description: transactions.description,
			createdAt: transactions.createdAt,
		})
		.from(transactions)
		.where(eq(transactions.walletId, wallet.id))
		.orderBy(sql`${transactions.createdAt} DESC`)
		.limit(limit)
		.offset(offset);

	// Get total count
	const [countResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(transactions)
		.where(eq(transactions.walletId, wallet.id));

	return {
		transactions: results.map((t) => ({
			...t,
			amountInRupees: Number(t.amount) / 100,
			balanceBeforeInRupees: Number(t.balanceBefore) / 100,
			balanceAfterInRupees: Number(t.balanceAfter) / 100,
		})),
		total: countResult?.count || 0,
	};
}

export default {
	getOrCreateWallet,
	getBalance,
	topUp,
	deduct,
	getTransactionHistory,
};
