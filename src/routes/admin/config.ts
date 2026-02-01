/**
 * Admin Config Routes
 * Pricing & feature flags management
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";

import { db } from "../../config/database.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireAdmin, requireSuperAdmin } from "../../middleware/adminMiddleware.ts";
import { requirePermission } from "../../middleware/rbacMiddleware.ts";
import { Permissions } from "../../config/permissions.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";
import { auditUpdate } from "../../services/auditService.ts";

const router = Router();

router.use(authMiddleware());
router.use(requireAdmin());

// In-memory config store (in production, use Redis or DB table)
const configStore: Record<string, any> = {
	// Pricing
	resumeUnlockCost: 50, // INR
	featuredJobCost: 500, // INR
	jobPostCost: 0, // Free by default

	// Feature flags
	requireEmployerVerification: true,
	allowJobseekerWallet: false,
	maintenanceMode: false,

	// Limits
	maxActiveJobsPerEmployer: 10,
	maxApplicationsPerJob: 500,
	applicationRateLimitPerDay: 50,
};

/**
 * GET /admin/config
 * Get all configs
 */
router.get(
	"/",
	requirePermission(Permissions.ADMIN_SETTINGS),
	expressAsyncHandler(async (req, res) => {
		return res.status(StatusCodes.OK).json({
			config: configStore,
		});
	})
);

/**
 * PATCH /admin/config
 * Update configs (SUPER_ADMIN only)
 */
router.patch(
	"/",
	requireSuperAdmin(),
	requirePermission(Permissions.ADMIN_SETTINGS),
	expressAsyncHandler(
		async (data: Record<string, any>, req, res) => {
			const adminId = req.userId!;

			const oldValues: Record<string, any> = {};
			const newValues: Record<string, any> = {};

			// Update only known keys
			for (const [key, value] of Object.entries(data)) {
				if (key in configStore) {
					oldValues[key] = configStore[key];
					configStore[key] = value;
					newValues[key] = value;
				}
			}

			// Audit log
			await auditUpdate(
				"config",
				BigInt(0),
				oldValues,
				newValues,
				{
					userId: adminId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Config updated: ${Object.keys(newValues).join(", ")}`
			);

			return res.status(StatusCodes.OK).json({
				message: "Config updated successfully",
				config: configStore,
			});
		},
		{
			validationSchema: z.record(z.any()),
			getValue: (req) => req.body,
		}
	)
);

/**
 * GET /admin/config/:key
 * Get single config value
 */
router.get(
	"/:key",
	requirePermission(Permissions.ADMIN_SETTINGS),
	expressAsyncHandler(async (req, res) => {
		const key = req.params.key;

		if (!(key in configStore)) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Config key not found",
			});
		}

		return res.status(StatusCodes.OK).json({
			key,
			value: configStore[key],
		});
	})
);

export default router;
