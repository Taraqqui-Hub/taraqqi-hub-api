/**
 * Upload Routes
 * Sign and confirm Cloudinary uploads
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import {
	signUploadParams,
	validateCloudinaryUrl,
	getUploadConfig,
	UploadTypes,
	type UploadType,
} from "../services/cloudinaryService.ts";
import { auditCreate } from "../services/auditService.ts";

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const signSchema = z.object({
	uploadType: z.enum([
		UploadTypes.RESUME,
		UploadTypes.KYC_DOCUMENT,
		UploadTypes.PROFILE_PHOTO,
		UploadTypes.COMPANY_LOGO,
	]),
});

const confirmSchema = z.object({
	uploadType: z.enum([
		UploadTypes.RESUME,
		UploadTypes.KYC_DOCUMENT,
		UploadTypes.PROFILE_PHOTO,
		UploadTypes.COMPANY_LOGO,
	]),
	url: z.string().url(),
	publicId: z.string().optional(),
	metadata: z.record(z.any()).optional(),
});

// ============================================
// Routes
// ============================================

/**
 * POST /upload/sign
 * Get signed params for direct Cloudinary upload
 */
router.post(
	"/sign",
	authMiddleware(),
	expressAsyncHandler(
		async (data: { uploadType: UploadType }, req, res) => {
			const userId = req.userId!;

			const params = signUploadParams(data.uploadType, userId);
			const config = getUploadConfig(data.uploadType);

			return res.status(StatusCodes.OK).json({
				params,
				config,
				uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/${params.resourceType}/upload`,
			});
		},
		{
			validationSchema: signSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * POST /upload/confirm
 * Validate uploaded URL and confirm
 */
router.post(
	"/confirm",
	authMiddleware(),
	expressAsyncHandler(
		async (
			data: { uploadType: UploadType; url: string; publicId?: string; metadata?: Record<string, any> },
			req,
			res
		) => {
			const userId = req.userId!;

			// Validate URL
			const validation = validateCloudinaryUrl(data.url, data.uploadType);

			if (!validation.valid) {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "Invalid upload",
					reason: validation.error,
				});
			}

			// Audit log
			await auditCreate(
				"file_upload",
				BigInt(0),
				{
					uploadType: data.uploadType,
					publicId: validation.publicId,
					format: validation.format,
					metadata: data.metadata,
				},
				{
					userId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`File uploaded: ${data.uploadType}`
			);

			return res.status(StatusCodes.OK).json({
				success: true,
				url: data.url,
				publicId: validation.publicId,
				format: validation.format,
			});
		},
		{
			validationSchema: confirmSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * GET /upload/config/:uploadType
 * Get upload config for a type
 */
router.get(
	"/config/:uploadType",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const uploadType = req.params.uploadType as UploadType;

		try {
			const config = getUploadConfig(uploadType);
			return res.status(StatusCodes.OK).json(config);
		} catch (err) {
			return res.status(StatusCodes.BAD_REQUEST).json({
				error: "Invalid upload type",
			});
		}
	})
);

export default router;
