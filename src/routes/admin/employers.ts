/**
 * Admin Employer Verification Routes
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

import { db } from "../../config/database.ts";
import { employerProfiles, users } from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireAdmin } from "../../middleware/adminMiddleware.ts";
import { requirePermission } from "../../middleware/rbacMiddleware.ts";
import { Permissions } from "../../config/permissions.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";
import { auditUpdate } from "../../services/auditService.ts";

const router = Router();

router.use(authMiddleware());
router.use(requireAdmin());

/**
 * GET /admin/employers
 * Get employer verification queue
 */
router.get(
	"/",
	requirePermission(Permissions.EMPLOYER_PROFILE_READ),
	expressAsyncHandler(async (req, res) => {
		const verified = req.query.verified === "true";
		const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
		const offset = parseInt(req.query.offset as string) || 0;

		const employers = await db
			.select({
				id: employerProfiles.id,
				userId: employerProfiles.userId,
				companyName: employerProfiles.companyName,
				companyType: employerProfiles.companyType,
				industry: employerProfiles.industry,
				city: employerProfiles.city,
				gstin: employerProfiles.gstin,
				pan: employerProfiles.pan,
				isVerified: employerProfiles.isVerified,
				verifiedAt: employerProfiles.verifiedAt,
				createdAt: employerProfiles.createdAt,
				userName: users.name,
				userEmail: users.email,
			})
			.from(employerProfiles)
			.innerJoin(users, eq(employerProfiles.userId, users.id))
			.where(
				and(
					eq(employerProfiles.isVerified, verified),
					isNull(employerProfiles.deletedAt)
				)
			)
			.orderBy(desc(employerProfiles.createdAt))
			.limit(limit)
			.offset(offset);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(employerProfiles)
			.where(
				and(
					eq(employerProfiles.isVerified, verified),
					isNull(employerProfiles.deletedAt)
				)
			);

		return res.status(StatusCodes.OK).json({
			employers,
			pagination: {
				total: countResult?.count || 0,
				limit,
				offset,
			},
		});
	})
);

/**
 * PATCH /admin/employers/:id/verify
 * Verify or reject employer
 */
router.patch(
	"/:id/verify",
	requirePermission(Permissions.KYC_APPROVE),
	expressAsyncHandler(
		async (data: { action: "verify" | "reject" }, req, res) => {
			const adminId = req.userId!;
			const profileId = BigInt(req.params.id);

			const [existing] = await db
				.select()
				.from(employerProfiles)
				.where(
					and(
						eq(employerProfiles.id, profileId),
						isNull(employerProfiles.deletedAt)
					)
				)
				.limit(1);

			if (!existing) {
				return res.status(StatusCodes.NOT_FOUND).json({
					error: "Employer profile not found",
				});
			}

			const isVerified = data.action === "verify";

			const [updated] = await db
				.update(employerProfiles)
				.set({
					isVerified,
					verifiedBy: isVerified ? adminId : null,
					verifiedAt: isVerified ? new Date() : null,
					updatedAt: new Date(),
				})
				.where(eq(employerProfiles.id, profileId))
				.returning();

			// Audit log
			await auditUpdate(
				"employer_verification",
				profileId,
				{ isVerified: existing.isVerified },
				{ isVerified, action: data.action },
				{
					userId: adminId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Employer ${data.action === "verify" ? "verified" : "rejected"}: ${existing.companyName}`
			);

			return res.status(StatusCodes.OK).json({
				message: `Employer ${data.action === "verify" ? "verified" : "rejected"} successfully`,
				employer: updated,
			});
		},
		{
			validationSchema: z.object({
				action: z.enum(["verify", "reject"]),
			}),
			getValue: (req) => req.body,
		}
	)
);

export default router;
