/**
 * Admin User Management Routes (SUPER_ADMIN only)
 * Super admins can create and manage admin accounts
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";

import { db } from "../../config/database.ts";
import { users, UserTypes } from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireSuperAdmin } from "../../middleware/adminMiddleware.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";
import { auditCreate } from "../../services/auditService.ts";

const router = Router();

// All routes require super admin access
router.use(authMiddleware());
router.use(requireSuperAdmin());

/**
 * GET /admin/admin-users
 * List all admin users (both admin and super_admin)
 */
router.get(
	"/",
	expressAsyncHandler(async (req, res) => {
		const adminList = await db
			.select({
				id: users.id,
				uuid: users.uuid,
				name: users.name,
				email: users.email,
				phone: users.phone,
				userType: users.userType,
				isActive: users.isActive,
				createdAt: users.createdAt,
				lastLoginAt: users.lastLoginAt,
			})
			.from(users)
			.where(
				and(
					inArray(users.userType, [UserTypes.ADMIN, UserTypes.SUPER_ADMIN]),
					isNull(users.deletedAt)
				)
			)
			.orderBy(desc(users.createdAt));

		return res.status(StatusCodes.OK).json({
			admins: adminList,
		});
	})
);

/**
 * POST /admin/admin-users
 * Create a new admin user (SUPER_ADMIN only)
 */
router.post(
	"/",
	expressAsyncHandler(
		async (data: { email: string; password: string; name?: string }, req, res) => {
			const superAdminId = req.userId!;

			// Check if email already exists
			const [existingUser] = await db
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.email, data.email), isNull(users.deletedAt)))
				.limit(1);

			if (existingUser) {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "User with this email already exists",
				});
			}

			// Hash password
			const passwordHash = await bcrypt.hash(data.password, 12);

			// Create admin user
			const [newAdmin] = await db
				.insert(users)
				.values({
					email: data.email,
					name: data.name || null,
					passwordHash,
					userType: UserTypes.ADMIN,
					emailVerified: true, // Auto-verify admin accounts
					verificationStatus: "verified",
					isActive: true,
				})
				.returning({
					id: users.id,
					uuid: users.uuid,
					email: users.email,
					name: users.name,
					userType: users.userType,
					createdAt: users.createdAt,
				});

			// Audit log
			await auditCreate(
				"admin_user",
				newAdmin.id,
				{
					email: newAdmin.email,
					name: newAdmin.name,
					userType: newAdmin.userType,
				},
				{
					userId: superAdminId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`New admin user created: ${newAdmin.email}`
			);

			return res.status(StatusCodes.CREATED).json({
				message: "Admin user created successfully",
				admin: {
					id: newAdmin.id.toString(),
					uuid: newAdmin.uuid,
					email: newAdmin.email,
					name: newAdmin.name,
					userType: newAdmin.userType,
					createdAt: newAdmin.createdAt,
				},
			});
		},
		{
			validationSchema: z.object({
				email: z.string().email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
				name: z.string().optional(),
			}),
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /admin/admin-users/:id/deactivate
 * Deactivate an admin user
 */
router.patch(
	"/:id/deactivate",
	expressAsyncHandler(async (req, res) => {
		const superAdminId = req.userId!;
		const adminId = BigInt(req.params.id);

		// Prevent self-deactivation
		if (adminId === superAdminId) {
			return res.status(StatusCodes.BAD_REQUEST).json({
				error: "You cannot deactivate your own account",
			});
		}

		const [admin] = await db
			.select({
				id: users.id,
				email: users.email,
				userType: users.userType,
				isActive: users.isActive,
			})
			.from(users)
			.where(
				and(
					eq(users.id, adminId),
					inArray(users.userType, [UserTypes.ADMIN, UserTypes.SUPER_ADMIN]),
					isNull(users.deletedAt)
				)
			)
			.limit(1);

		if (!admin) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Admin user not found",
			});
		}

		if (!admin.isActive) {
			return res.status(StatusCodes.BAD_REQUEST).json({
				error: "Admin user is already deactivated",
			});
		}

		await db
			.update(users)
			.set({
				isActive: false,
				updatedAt: new Date(),
			})
			.where(eq(users.id, adminId));

		return res.status(StatusCodes.OK).json({
			message: "Admin user deactivated successfully",
		});
	})
);

/**
 * PATCH /admin/admin-users/:id/activate
 * Reactivate an admin user
 */
router.patch(
	"/:id/activate",
	expressAsyncHandler(async (req, res) => {
		const adminId = BigInt(req.params.id);

		const [admin] = await db
			.select({
				id: users.id,
				isActive: users.isActive,
			})
			.from(users)
			.where(
				and(
					eq(users.id, adminId),
					inArray(users.userType, [UserTypes.ADMIN, UserTypes.SUPER_ADMIN]),
					isNull(users.deletedAt)
				)
			)
			.limit(1);

		if (!admin) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "Admin user not found",
			});
		}

		if (admin.isActive) {
			return res.status(StatusCodes.BAD_REQUEST).json({
				error: "Admin user is already active",
			});
		}

		await db
			.update(users)
			.set({
				isActive: true,
				updatedAt: new Date(),
			})
			.where(eq(users.id, adminId));

		return res.status(StatusCodes.OK).json({
			message: "Admin user reactivated successfully",
		});
	})
);

export default router;
