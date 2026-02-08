/**
 * Admin Platform Users Routes
 * List and manage platform users (individuals + employers) - not admin accounts
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, sql, inArray, or, like } from "drizzle-orm";

import { db } from "../../config/database.ts";
import { users, UserTypes, employerProfiles } from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireAdmin } from "../../middleware/adminMiddleware.ts";
import { requirePermission } from "../../middleware/rbacMiddleware.ts";
import { Permissions } from "../../config/permissions.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";
import { auditUpdate } from "../../services/auditService.ts";
import { notifyAccountDeactivated } from "../../services/notificationService.ts";

const router = Router();

const PLATFORM_USER_TYPES = [UserTypes.INDIVIDUAL, UserTypes.EMPLOYER];

router.use(authMiddleware());
router.use(requireAdmin());

/**
 * GET /admin/platform-users
 * List platform users (individuals and/or employers) with filters
 */
router.get(
	"/",
	requirePermission(Permissions.USERS_READ_ALL),
	expressAsyncHandler(async (req, res) => {
		const userType = (req.query.userType as string) || "all"; // all | individual | employer
		const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
		const offset = parseInt(req.query.offset as string) || 0;
		const search = (req.query.search as string)?.trim();
		const isActive = req.query.isActive; // true | false | undefined (all)

		const conditions: ReturnType<typeof eq>[] = [
			inArray(users.userType, PLATFORM_USER_TYPES),
			isNull(users.deletedAt),
		];

		if (userType !== "all") {
			conditions.push(eq(users.userType, userType as "individual" | "employer"));
		}

		if (isActive === "true") {
			conditions.push(eq(users.isActive, true));
		} else if (isActive === "false") {
			conditions.push(eq(users.isActive, false));
		}

		// Search by name, email, phone (case-insensitive)
		if (search) {
			const term = `%${search}%`;
			conditions.push(
				or(
					like(sql`lower(coalesce(${users.name}, ''))`, term.toLowerCase()),
					like(sql`lower(coalesce(${users.email}, ''))`, term.toLowerCase()),
					like(sql`lower(coalesce(${users.phone}, ''))`, term.toLowerCase())
				)!
			);
		}

		const list = await db
			.select({
				id: users.id,
				uuid: users.uuid,
				name: users.name,
				email: users.email,
				phone: users.phone,
				userType: users.userType,
				verificationStatus: users.verificationStatus,
				isActive: users.isActive,
				createdAt: users.createdAt,
				lastLoginAt: users.lastLoginAt,
			})
			.from(users)
			.where(and(...conditions))
			.orderBy(desc(users.createdAt))
			.limit(limit)
			.offset(offset);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(users)
			.where(and(...conditions));

		// Enrich with profile summary (company name for employer, etc.)
		const enriched = await Promise.all(
			list.map(async (u) => {
				let profileSummary: string | null = null;
				if (u.userType === UserTypes.EMPLOYER) {
					const [ep] = await db
						.select({ companyName: employerProfiles.companyName })
						.from(employerProfiles)
						.where(
							and(
								eq(employerProfiles.userId, u.id),
								isNull(employerProfiles.deletedAt)
							)
						)
						.limit(1);
					profileSummary = ep?.companyName ?? null;
				}
				return {
					...u,
					profileSummary,
				};
			})
		);

		return res.status(StatusCodes.OK).json({
			users: enriched,
			pagination: {
				total: countResult?.count || 0,
				limit,
				offset,
			},
		});
	})
);

/**
 * PATCH /admin/platform-users/:id/deactivate
 * Deactivate a platform user and send notification with reason
 */
router.patch(
	"/:id/deactivate",
	requirePermission(Permissions.USERS_DEACTIVATE),
	expressAsyncHandler(
		async (data: { reason: string }, req, res) => {
			const adminId = req.userId!;
			const userId = BigInt(req.params.id);

			const [user] = await db
				.select({
					id: users.id,
					name: users.name,
					email: users.email,
					userType: users.userType,
					isActive: users.isActive,
				})
				.from(users)
				.where(
					and(
						eq(users.id, userId),
						inArray(users.userType, PLATFORM_USER_TYPES),
						isNull(users.deletedAt)
					)
				)
				.limit(1);

			if (!user) {
				return res.status(StatusCodes.NOT_FOUND).json({
					error: "User not found or cannot be deactivated",
				});
			}

			if (!user.isActive) {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "User account is already deactivated",
				});
			}

			await db
				.update(users)
				.set({
					isActive: false,
					updatedAt: new Date(),
				})
				.where(eq(users.id, userId));

			await auditUpdate(
				"platform_user",
				userId,
				{ isActive: true },
				{ isActive: false, reason: data.reason },
				{
					userId: adminId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Platform user deactivated: ${user.email || user.name || userId}`
			);

			if (user.email) {
				await notifyAccountDeactivated(
					userId,
					user.email,
					data.reason,
					user.name || undefined
				);
			}

			return res.status(StatusCodes.OK).json({
				message: "User account deactivated. They have been notified with the reason provided.",
			});
		},
		{
			validationSchema: z.object({
				reason: z.string().min(10, "Reason must be at least 10 characters for transparency"),
			}),
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /admin/platform-users/:id/activate
 * Reactivate a deactivated platform user
 */
router.patch(
	"/:id/activate",
	requirePermission(Permissions.USERS_ACTIVATE),
	expressAsyncHandler(async (req, res) => {
		const adminId = req.userId!;
		const userId = BigInt(req.params.id);

		const [user] = await db
			.select({
				id: users.id,
				email: users.email,
				isActive: users.isActive,
			})
			.from(users)
			.where(
				and(
					eq(users.id, userId),
					inArray(users.userType, PLATFORM_USER_TYPES),
					isNull(users.deletedAt)
				)
			)
			.limit(1);

		if (!user) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "User not found",
			});
		}

		if (user.isActive) {
			return res.status(StatusCodes.BAD_REQUEST).json({
				error: "User account is already active",
			});
		}

		await db
			.update(users)
			.set({
				isActive: true,
				updatedAt: new Date(),
			})
			.where(eq(users.id, userId));

		await auditUpdate(
			"platform_user",
			userId,
			{ isActive: false },
			{ isActive: true },
			{
				userId: adminId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			},
			`Platform user reactivated: ${user.email || userId}`
		);

		return res.status(StatusCodes.OK).json({
			message: "User account reactivated",
		});
	})
);

export default router;
