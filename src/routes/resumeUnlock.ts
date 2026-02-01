/**
 * Resume Unlock Routes
 * Pay credits to unlock jobseeker contact info
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { eq, and, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db } from "../config/database.ts";
import {
	jobseekerProfiles,
	TransactionCategories,
	users,
} from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate } from "../services/auditService.ts";
import { deduct } from "../services/walletService.ts";
import { notifyResumeUnlocked } from "../services/notificationService.ts";

const router = Router();

// ============================================
// Config
// ============================================

const RESUME_UNLOCK_COST = BigInt(process.env.RESUME_UNLOCK_COST || "5000"); // 50 INR in paise

// ============================================
// Routes
// ============================================

/**
 * POST /resume/unlock/:profileId
 * Unlock jobseeker contact info (atomic with idempotency)
 */
router.post(
	"/unlock/:profileId",
	authMiddleware(),
	requirePermission(Permissions.RESUME_UNLOCK),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const profileId = BigInt(req.params.profileId);
		const idempotencyKey = req.headers["idempotency-key"] as string || `unlock_${userId}_${profileId}_${uuidv4()}`;

		// Get jobseeker profile
		const [profile] = await db
			.select({
				id: jobseekerProfiles.id,
				userId: jobseekerProfiles.userId,
				firstName: jobseekerProfiles.firstName,
				lastName: jobseekerProfiles.lastName,
				headline: jobseekerProfiles.headline,
				city: jobseekerProfiles.city,
				skills: jobseekerProfiles.skills,
				experienceYears: jobseekerProfiles.experienceYears,
				resumeUrl: jobseekerProfiles.resumeUrl,
				profilePhotoUrl: jobseekerProfiles.profilePhotoUrl,
			})
			.from(jobseekerProfiles)
			.where(
				and(
					eq(jobseekerProfiles.id, profileId),
					isNull(jobseekerProfiles.deletedAt)
				)
			)
			.limit(1);

		if (!profile) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: "Profile not found",
			});
		}

		// Get user contact info
		const [userInfo] = await db
			.select({
				phone: users.phone,
				email: users.email,
			})
			.from(users)
			.where(eq(users.id, profile.userId))
			.limit(1);

		// Atomic deduction using wallet service
		const transaction = await deduct(
			userId,
			RESUME_UNLOCK_COST,
			TransactionCategories.RESUME_UNLOCK,
			{
				idempotencyKey,
				description: `Resume unlock: ${profile.firstName} ${profile.lastName}`,
				relatedEntityType: "jobseeker_profile",
				relatedEntityId: profile.id,
				metadata: {
					profileId: profile.id.toString(),
					jobseekerId: profile.userId.toString(),
				},
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
			}
		);

		// Additional audit for resume access
		if (!transaction.isDuplicate) {
			await auditCreate(
				"resume_access",
				profile.id,
				{
					jobseekerId: profile.userId.toString(),
					cost: Number(RESUME_UNLOCK_COST) / 100,
					transactionId: transaction.transactionId.toString(),
				},
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Resume accessed for ${profile.firstName} ${profile.lastName}`
			);

			// Notify jobseeker that their profile was unlocked
			if (userInfo?.email) {
				await notifyResumeUnlocked(
					profile.userId,
					userInfo.email,
					`${profile.firstName} ${profile.lastName}`
				);
			}
		}

		// Return full profile with contact info
		return res.status(StatusCodes.OK).json({
			message: transaction.isDuplicate
				? "Resume already unlocked"
				: "Resume unlocked successfully",
			profile: {
				...profile,
				phone: userInfo?.phone,
				email: userInfo?.email,
			},
			transaction: {
				id: transaction.transactionUuid,
				amount: transaction.amountInRupees,
				newBalance: Number(transaction.balanceAfter) / 100,
				isDuplicate: transaction.isDuplicate,
			},
		});
	})
);

/**
 * GET /resume/unlock/cost
 * Get current unlock cost
 */
router.get(
	"/unlock/cost",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		return res.status(StatusCodes.OK).json({
			cost: Number(RESUME_UNLOCK_COST) / 100,
			currency: "INR",
		});
	})
);

export default router;

