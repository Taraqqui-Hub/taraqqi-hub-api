/**
 * Admin Users Routes
 * Manage admin accounts (SUPER_ADMIN only)
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull, desc, sql, or } from "drizzle-orm";
import bcrypt from "bcrypt";

import { db } from "../../config/database.ts";
import { users, UserTypes, userRoles, roles } from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireSuperAdmin } from "../../middleware/adminMiddleware.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";
import { auditCreate, auditUpdate } from "../../services/auditService.ts";

const router = Router();

router.use(authMiddleware());
router.use(requireSuperAdmin());

/**
 * GET /admin/users
 * List admin users
 */
router.get(
	"/",
	expressAsyncHandler(async (req, res) => {
		const admins = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				phone: users.phone,
				userType: users.userType,
				isActive: users.isActive,
				emailVerified: users.emailVerified,
				createdAt: users.createdAt,
				lastLoginAt: users.lastLoginAt,
			})
			.from(users)
			.where(
				and(
					eq(users.userType, UserTypes.ADMIN),
					isNull(users.deletedAt)
				)
			)
			.orderBy(desc(users.createdAt));

		return res.status(StatusCodes.OK).json({ admins });
	})
);

/**
 * POST /admin/users
 * Create new admin user
 */
router.post(
	"/",
	expressAsyncHandler(
		async (data: { name: string; email: string; password: string; userType: string }, req, res) => {
			const superAdminId = req.userId!;

			// Check email uniqueness
			const [existing] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, data.email))
				.limit(1);

			if (existing) {
				return res.status(StatusCodes.CONFLICT).json({
					error: "Email already registered",
				});
			}

			// Only allow creating admin users
			if (data.userType !== "admin") {
				return res.status(StatusCodes.FORBIDDEN).json({
					error: "Can only create admin accounts",
				});
			}

			// Hash password
			const passwordHash = await bcrypt.hash(data.password, 10);

			// Create user
			const [newUser] = await db
				.insert(users)
				.values({
					name: data.name,
					email: data.email,
					phone: data.email, // Use email as placeholder phone for admin
					passwordHash,
					userType: UserTypes.ADMIN,
					isActive: true,
					emailVerified: true, // Admin-created accounts are pre-verified
				})
				.returning({
					id: users.id,
					name: users.name,
					email: users.email,
					userType: users.userType,
				});

			// Assign admin role
			const [adminRole] = await db
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.name, "admin"))
				.limit(1);

			if (adminRole) {
				await db.insert(userRoles).values({
					userId: newUser.id,
					roleId: adminRole.id,
				});
			}

			// Audit log
			await auditCreate(
				"admin_user",
				newUser.id,
				{ name: data.name, email: data.email },
				{
					userId: superAdminId,
					ipAddress: req.clientIp,
					userAgent: req.clientUserAgent,
					requestId: req.requestId,
				},
				`Admin user created: ${data.name}`
			);

			return res.status(StatusCodes.CREATED).json({
				message: "Admin user created successfully",
				user: newUser,
			});
		},
		{
			validationSchema: z.object({
				name: z.string().min(2),
				email: z.string().email(),
				password: z.string().min(8),
				userType: z.enum(["admin"]),
			}),
			getValue: (req) => req.body,
		}
	)
);

/**
 * PATCH /admin/users/:id/deactivate
 * Deactivate admin user
 */
router.patch(
	"/:id/deactivate",
	expressAsyncHandler(async (req, res) => {
		const superAdminId = req.userId!;
		const userId = BigInt(req.params.id);

		// Cannot deactivate self
		if (userId === superAdminId) {
			return res.status(StatusCodes.BAD_REQUEST).json({
				error: "Cannot deactivate your own account",
			});
		}

		const [updated] = await db
			.update(users)
			.set({
				isActive: false,
				updatedAt: new Date(),
			})
			.where(eq(users.id, userId))
			.returning({ id: users.id, name: users.name });

		if (!updated) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "User not found",
			});
		}

		// Audit log
		await auditUpdate(
			"admin_user",
			userId,
			{ isActive: true },
			{ isActive: false },
			{
				userId: superAdminId,
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			},
			`Admin user deactivated: ${updated.name}`
		);

		return res.status(StatusCodes.OK).json({
			message: "Admin user deactivated",
		});
	})
);

export default router;
