/**
 * Wallet Routes (requires verification)
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

import { db } from "../config/database.ts";
import { users } from "../db/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { requireVerified } from "../middleware/verificationMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import {
	getOrCreateWallet,
	getBalance,
	topUp,
	getTransactionHistory,
} from "../services/walletService.ts";
import { notifyPaymentSuccess } from "../services/notificationService.ts";

const router = Router();

// Apply verification middleware to all wallet routes
router.use(authMiddleware());
router.use(requireVerified());

// ============================================
// Validation Schemas
// ============================================

const topUpSchema = z.object({
	amount: z.number().positive().min(10, "Minimum top-up is ₹10").max(100000),
	idempotencyKey: z.string().optional(),
	paymentMethod: z.enum(["card", "upi", "netbanking", "wallet"]).optional(),
});

// ============================================
// Routes
// ============================================

/**
 * GET /wallet
 * Get wallet info and balance
 */
router.get(
	"/",
	authMiddleware(),
	requirePermission(Permissions.WALLET_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const wallet = await getOrCreateWallet(userId);

		return res.status(StatusCodes.OK).json({
			wallet: {
				id: wallet.id.toString(),
				balance: wallet.balanceInRupees,
				currency: wallet.currency,
				status: wallet.status,
			},
		});
	})
);

/**
 * GET /wallet/balance
 * Get just the balance
 */
router.get(
	"/balance",
	authMiddleware(),
	requirePermission(Permissions.WALLET_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const { balanceInRupees, currency } = await getBalance(userId);

		return res.status(StatusCodes.OK).json({
			balance: balanceInRupees,
			currency,
		});
	})
);

/**
 * POST /wallet/topup
 * Top-up wallet (simulated payment)
 */
router.post(
	"/topup",
	authMiddleware(),
	requirePermission(Permissions.WALLET_READ_OWN), // All users can top up
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Convert amount from rupees to paise
			const amountInPaise = BigInt(Math.round(data.amount * 100));

			// Generate idempotency key if not provided
			const idempotencyKey = data.idempotencyKey || `topup_${userId}_${uuidv4()}`;

			const result = await topUp(userId, amountInPaise, idempotencyKey, {
				paymentMethod: data.paymentMethod,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
			});

			// Send email notification for successful payment
			if (!result.isDuplicate) {
				const [user] = await db
					.select({ email: users.email, name: users.name })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);

				if (user?.email) {
					await notifyPaymentSuccess(
						userId,
						user.email,
						data.amount,
						result.transactionUuid,
						Number(result.balanceAfter) / 100,
						user.name || undefined
					);
				}
			}

			return res.status(StatusCodes.OK).json({
				success: true,
				message: result.isDuplicate
					? "Payment already processed"
					: "Top-up successful",
				transaction: {
					id: result.transactionUuid,
					amount: result.amountInRupees,
					newBalance: Number(result.balanceAfter) / 100,
					status: result.status,
					isDuplicate: result.isDuplicate,
				},
			});
		},
		{
			validationSchema: topUpSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * GET /wallet/transactions
 * Get transaction history
 */
router.get(
	"/transactions",
	authMiddleware(),
	requirePermission(Permissions.TRANSACTIONS_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
		const offset = parseInt(req.query.offset as string) || 0;

		const { transactions, total } = await getTransactionHistory(
			userId,
			limit,
			offset
		);

		return res.status(StatusCodes.OK).json({
			transactions: transactions.map((t) => ({
				id: t.uuid,
				type: t.type,
				category: t.category,
				amount: t.amountInRupees,
				balanceBefore: t.balanceBeforeInRupees,
				balanceAfter: t.balanceAfterInRupees,
				status: t.status,
				description: t.description,
				date: t.createdAt,
			})),
			pagination: {
				total,
				limit,
				offset,
				hasMore: offset + transactions.length < total,
			},
		});
	})
);

export default router;
