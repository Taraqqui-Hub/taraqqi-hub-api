/**
 * KYC Routes
 * Submit and view KYC documents
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";

import { db } from "../config/database.ts";
import { kycRecords, KycStatuses, KycDocumentTypes } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import { requirePermission } from "../middleware/rbacMiddleware.ts";
import { Permissions } from "../config/permissions.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { auditCreate } from "../services/auditService.ts";
import { generateKycDocumentUploadParams } from "../services/cloudinaryService.ts";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const submitKycSchema = z.object({
	documentType: z.enum([
		"aadhaar",
		"pan",
		"passport",
		"driving_license",
		"voter_id",
	]),
	documentNumber: z.string().min(1, "Document number is required"),
	documentUrl: z.string().url("Invalid document URL"),
	documentBackUrl: z.string().url().optional(),
	selfieUrl: z.string().url("Invalid selfie URL").optional(),
});

// ============================================
// Routes
// ============================================

/**
 * GET /kyc
 * Get my KYC status
 */
router.get(
	"/",
	authMiddleware(),
	requirePermission(Permissions.KYC_READ_OWN),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		const records = await db
			.select()
			.from(kycRecords)
			.where(
				and(eq(kycRecords.userId, userId), isNull(kycRecords.deletedAt))
			)
			.orderBy(desc(kycRecords.createdAt));

		// Get overall KYC status
		const hasApproved = records.some((r) => r.status === KycStatuses.APPROVED);
		const hasPending = records.some(
			(r) =>
				r.status === KycStatuses.PENDING ||
				r.status === KycStatuses.UNDER_REVIEW
		);

		let overallStatus: "not_submitted" | "pending" | "approved" | "rejected" =
			"not_submitted";

		if (hasApproved) {
			overallStatus = "approved";
		} else if (hasPending) {
			overallStatus = "pending";
		} else if (records.length > 0) {
			overallStatus = "rejected";
		}

		return res.status(StatusCodes.OK).json({
			overallStatus,
			isVerified: hasApproved,
			records: records.map((r) => ({
				...r,
				id: r.id.toString(),
				userId: r.userId.toString(),
			})),
		});
	})
);

/**
 * POST /kyc
 * Submit KYC document
 */
router.post(
	"/",
	authMiddleware(),
	requirePermission(Permissions.KYC_SUBMIT),
	expressAsyncHandler(
		async (data, req, res) => {
			const userId = req.userId!;

			// Check if same document type already submitted and pending/approved
			const [existing] = await db
				.select({ id: kycRecords.id, status: kycRecords.status })
				.from(kycRecords)
				.where(
					and(
						eq(kycRecords.userId, userId),
						eq(kycRecords.documentType, data.documentType as any),
						isNull(kycRecords.deletedAt)
					)
				)
				.limit(1);

			if (existing) {
				if (
					existing.status === KycStatuses.APPROVED ||
					existing.status === KycStatuses.PENDING ||
					existing.status === KycStatuses.UNDER_REVIEW
				) {
					throw new HTTPError({
						httpStatus: StatusCodes.CONFLICT,
						message: `This document type is already ${existing.status}. Please wait for review or submit a different document type.`,
					});
				}
			}

			// Create KYC record
			const [record] = await db
				.insert(kycRecords)
				.values({
					userId,
					documentType: data.documentType as any,
					documentNumber: data.documentNumber,
					documentUrl: data.documentUrl,
					documentBackUrl: data.documentBackUrl || null,
					selfieUrl: data.selfieUrl || null,
					status: KycStatuses.PENDING,
				})
				.returning();

			// Audit log
			await auditCreate(
				"kyc",
				record.id,
				{
					documentType: data.documentType,
					status: KycStatuses.PENDING,
				},
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				"KYC document submitted"
			);

			return res.status(StatusCodes.CREATED).json({
				message: "KYC document submitted successfully. Pending verification.",
				record: {
					...record,
					id: record.id.toString(),
					userId: record.userId.toString(),
				},
			});
		},
		{
			validationSchema: submitKycSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * GET /kyc/upload/:documentType
 * Get signed upload URL for KYC document
 */
router.get(
	"/upload/:documentType",
	authMiddleware(),
	requirePermission(Permissions.KYC_SUBMIT),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;
		const documentType = req.params.documentType;

		// Validate document type
		const validTypes = [
			"aadhaar",
			"pan",
			"passport",
			"driving_license",
			"voter_id",
			"selfie",
		];
		if (!validTypes.includes(documentType)) {
			throw new HTTPError({
				httpStatus: StatusCodes.BAD_REQUEST,
				message: "Invalid document type",
			});
		}

		const params = generateKycDocumentUploadParams(userId);

		return res.status(StatusCodes.OK).json({
			uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/image/upload`,
			...params,
		});
	})
);

/**
 * Check if user has verified KYC
 */
export async function hasVerifiedKyc(userId: bigint): Promise<boolean> {
	const [record] = await db
		.select({ id: kycRecords.id })
		.from(kycRecords)
		.where(
			and(
				eq(kycRecords.userId, userId),
				eq(kycRecords.status, KycStatuses.APPROVED),
				isNull(kycRecords.deletedAt)
			)
		)
		.limit(1);

	return !!record;
}

/**
 * Middleware to require verified KYC
 */
export function requireVerifiedKyc() {
	return async (req: any, res: any, next: any) => {
		const userId = req.userId;

		if (!userId) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "Authentication required",
			});
		}

		const isVerified = await hasVerifiedKyc(userId);

		if (!isVerified) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "KYC verification required",
				code: "KYC_REQUIRED",
				message:
					"Please complete KYC verification to access this feature.",
			});
		}

		next();
	};
}

export default router;
