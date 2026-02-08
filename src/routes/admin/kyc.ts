/**
 * Admin KYC Routes
 * KYC queue and review with user verification status updates
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";

import { db } from "../../config/database.ts";
import {
	kycRecords,
	KycStatuses,
	users,
	VerificationStatuses,
	refreshTokens,
	jobseekerProfiles,
	employerProfiles,
} from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireAdmin } from "../../middleware/adminMiddleware.ts";
import { requirePermission } from "../../middleware/rbacMiddleware.ts";
import { Permissions } from "../../config/permissions.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";
import { auditUpdate, auditApprove, auditReject } from "../../services/auditService.ts";
import { sendEmail } from "../../services/notificationService.ts";

const router = Router();

router.use(authMiddleware());
router.use(requireAdmin());

/**
 * GET /admin/kyc
 * Get KYC queue with user details
 */
router.get(
	"/",
	requirePermission(Permissions.KYC_READ_ALL),
	expressAsyncHandler(async (req, res) => {
		const status = (req.query.status as string) || "pending";
		const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
		const offset = parseInt(req.query.offset as string) || 0;

		const records = await db
			.select({
				id: kycRecords.id,
				userId: kycRecords.userId,
				documentType: kycRecords.documentType,
				documentNumber: kycRecords.documentNumber,
				documentUrl: kycRecords.documentUrl,
				documentBackUrl: kycRecords.documentBackUrl,
				selfieUrl: kycRecords.selfieUrl,
				status: kycRecords.status,
				rejectionReason: kycRecords.rejectionReason,
				createdAt: kycRecords.createdAt,
				userName: users.name,
				userEmail: users.email,
				userPhone: users.phone,
				userType: users.userType,
				userVerificationStatus: users.verificationStatus,
			})
			.from(kycRecords)
			.innerJoin(users, eq(kycRecords.userId, users.id))
			.where(
				and(
					eq(kycRecords.status, status as any),
					isNull(kycRecords.deletedAt)
				)
			)
			.orderBy(desc(kycRecords.createdAt))
			.limit(limit)
			.offset(offset);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(kycRecords)
			.where(
				and(
					eq(kycRecords.status, status as any),
					isNull(kycRecords.deletedAt)
				)
			);

		return res.status(StatusCodes.OK).json({
			records,
			pagination: {
				total: countResult?.count || 0,
				limit,
				offset,
			},
		});
	})
);

/**
 * GET /admin/kyc/pending
 * Get pending verifications grouped by user
 */
router.get(
	"/pending",
	requirePermission(Permissions.KYC_READ_ALL),
	expressAsyncHandler(async (req, res) => {
		const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
		const offset = parseInt(req.query.offset as string) || 0;

		// Get users with SUBMITTED or UNDER_REVIEW status
		const pendingUsers = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				phone: users.phone,
				userType: users.userType,
				verificationStatus: users.verificationStatus,
				verificationSubmittedAt: users.verificationSubmittedAt,
			})
			.from(users)
			.where(
				and(
					inArray(users.verificationStatus, [
						VerificationStatuses.SUBMITTED,
						VerificationStatuses.UNDER_REVIEW,
					]),
					isNull(users.deletedAt)
				)
			)
			.orderBy(users.verificationSubmittedAt)
			.limit(limit)
			.offset(offset);

		// Get documents for each user
		const usersWithDocs = await Promise.all(
			pendingUsers.map(async (user) => {
				const documents = await db
					.select({
						id: kycRecords.id,
						documentType: kycRecords.documentType,
						documentUrl: kycRecords.documentUrl,
						documentBackUrl: kycRecords.documentBackUrl,
						selfieUrl: kycRecords.selfieUrl,
						status: kycRecords.status,
					})
					.from(kycRecords)
					.where(
						and(
							eq(kycRecords.userId, user.id),
							isNull(kycRecords.deletedAt)
						)
					);

				return { ...user, documents };
			})
		);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(users)
			.where(
				and(
					inArray(users.verificationStatus, [
						VerificationStatuses.SUBMITTED,
						VerificationStatuses.UNDER_REVIEW,
					]),
					isNull(users.deletedAt)
				)
			);

		return res.status(StatusCodes.OK).json({
			users: usersWithDocs,
			pagination: {
				total: countResult?.count || 0,
				limit,
				offset,
			},
		});
	})
);

/**
 * GET /admin/kyc/:userId
 * Get user KYC details with profile snapshot
 */
router.get(
	"/:userId",
	requirePermission(Permissions.KYC_READ_ALL),
	expressAsyncHandler(async (req, res) => {
		const userId = BigInt(req.params.userId);

		// Get user details
		const [user] = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				phone: users.phone,
				userType: users.userType,
				verificationStatus: users.verificationStatus,
				verificationSubmittedAt: users.verificationSubmittedAt,
				verifiedAt: users.verifiedAt,
				rejectedReason: users.rejectedReason,
				createdAt: users.createdAt,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "User not found",
			});
		}

		// Get KYC documents
		const documents = await db
			.select()
			.from(kycRecords)
			.where(
				and(
					eq(kycRecords.userId, userId),
					isNull(kycRecords.deletedAt)
				)
			);

		// Get profile based on user type
		let profile: any = null;
		if (user.userType === "individual") {
			const [jp] = await db
				.select()
				.from(jobseekerProfiles)
				.where(eq(jobseekerProfiles.userId, userId))
				.limit(1);
			profile = jp || null;
		} else if (user.userType === "employer") {
			const [ep] = await db
				.select()
				.from(employerProfiles)
				.where(eq(employerProfiles.userId, userId))
				.limit(1);
			profile = ep || null;
		}

		return res.status(StatusCodes.OK).json({
			user,
			profile,
			documents,
		});
	})
);

/**
 * POST /admin/kyc/:userId/approve
 * Approve user's KYC and set status to VERIFIED
 */
router.post(
	"/:userId/approve",
	requirePermission(Permissions.KYC_APPROVE),
	expressAsyncHandler(async (req, res) => {
		const adminId = req.userId!;
		const userId = BigInt(req.params.userId);

		// Get user
		const [user] = await db
			.select({
				id: users.id,
				email: users.email,
				name: users.name,
				userType: users.userType,
				verificationStatus: users.verificationStatus,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "User not found",
			});
		}

		if (user.verificationStatus === VerificationStatuses.VERIFIED) {
			return res.status(StatusCodes.BAD_REQUEST).json({
				error: "User is already verified",
			});
		}

		// Update all pending KYC records to APPROVED
		await db
			.update(kycRecords)
			.set({
				status: KycStatuses.APPROVED,
				verifiedBy: adminId,
				verifiedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(kycRecords.userId, userId),
					eq(kycRecords.status, KycStatuses.PENDING),
					isNull(kycRecords.deletedAt)
				)
			);

		// Update user verification status to VERIFIED
		await db
			.update(users)
			.set({
				verificationStatus: VerificationStatuses.VERIFIED,
				verifiedAt: new Date(),
				rejectedReason: null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, userId));

		// Audit log
		await auditApprove("user_verification", userId, {
			userId: adminId,
			ipAddress: req.clientIp,
			userAgent: req.clientUserAgent,
			requestId: req.requestId,
		}, `Approved verification for user ${user.email || userId}`);

		// Send email notification (with userType for template)
		if (user.email) {
			await sendEmail(user.email, "kyc_approved", {
				userName: user.name || user.email.split("@")[0],
				userType: user.userType,
			});
		}

		return res.status(StatusCodes.OK).json({
			message: "User verification approved successfully",
			verificationStatus: VerificationStatuses.VERIFIED,
		});
	})
);

/**
 * POST /admin/kyc/:userId/reject
 * Reject user's KYC with reason
 */
router.post(
	"/:userId/reject",
	requirePermission(Permissions.KYC_APPROVE),
	expressAsyncHandler(
		async (data: { reason: string }, req, res) => {
			const adminId = req.userId!;
			const userId = BigInt(req.params.userId);

			// Get user
			const [user] = await db
				.select({
					id: users.id,
					email: users.email,
					name: users.name,
					verificationStatus: users.verificationStatus,
				})
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			if (!user) {
				return res.status(StatusCodes.NOT_FOUND).json({
					error: "User not found",
				});
			}

			if (user.verificationStatus === VerificationStatuses.REJECTED) {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "User is already rejected",
				});
			}

			// Update all pending KYC records to REJECTED
			await db
				.update(kycRecords)
				.set({
					status: KycStatuses.REJECTED,
					rejectionReason: data.reason,
					verifiedBy: adminId,
					verifiedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(kycRecords.userId, userId),
						eq(kycRecords.status, KycStatuses.PENDING),
						isNull(kycRecords.deletedAt)
					)
				);

			// Update user verification status to REJECTED
			await db
				.update(users)
				.set({
					verificationStatus: VerificationStatuses.REJECTED,
					rejectedReason: data.reason,
					updatedAt: new Date(),
				})
				.where(eq(users.id, userId));

			// Invalidate all refresh tokens for this user (force re-login)
			await db
				.delete(refreshTokens)
				.where(eq(refreshTokens.userId, userId));

			// Audit log
			await auditReject("user_verification", userId, {
				userId: adminId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			}, data.reason);

			// Send email notification
			if (user.email) {
				await sendEmail(user.email, "kyc_rejected", {
					userName: user.name || user.email.split("@")[0],
					reason: data.reason,
				});
			}

			return res.status(StatusCodes.OK).json({
				message: "User verification rejected",
				verificationStatus: VerificationStatuses.REJECTED,
			});
		},
		{
			validationSchema: z.object({
				reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
			}),
			getValue: (req) => req.body,
		}
	)
);

/**
 * POST /admin/kyc/:userId/request-resubmission
 * Request user to resubmit documents (back to DRAFT)
 */
router.post(
	"/:userId/request-resubmission",
	requirePermission(Permissions.KYC_APPROVE),
	expressAsyncHandler(
		async (data: { reason: string }, req, res) => {
			const adminId = req.userId!;
			const userId = BigInt(req.params.userId);

			// Get user
			const [user] = await db
				.select({
					id: users.id,
					email: users.email,
					name: users.name,
				})
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			if (!user) {
				return res.status(StatusCodes.NOT_FOUND).json({
					error: "User not found",
				});
			}

			// Delete old KYC records
			await db
				.update(kycRecords)
				.set({ deletedAt: new Date() })
				.where(eq(kycRecords.userId, userId));

			// Reset user to DRAFT status
			await db
				.update(users)
				.set({
					verificationStatus: VerificationStatuses.DRAFT,
					rejectedReason: data.reason,
					verificationSubmittedAt: null,
					updatedAt: new Date(),
				})
				.where(eq(users.id, userId));

			// Audit log
			await auditUpdate(
				"user_verification",
				userId,
				{ action: "request_resubmission" },
				{ reason: data.reason },
				{
					userId: adminId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Requested resubmission for user ${user.email || userId}`
			);

			// Send email notification
			if (user.email) {
				await sendEmail(user.email, "kyc_rejected", {
					userName: user.name || user.email.split("@")[0],
					reason: data.reason,
				});
			}

			return res.status(StatusCodes.OK).json({
				message: "Resubmission requested. User will be notified.",
				verificationStatus: VerificationStatuses.DRAFT,
			});
		},
		{
			validationSchema: z.object({
				reason: z.string().min(10, "Reason must be at least 10 characters"),
			}),
			getValue: (req) => req.body,
		}
	)
);

export default router;
