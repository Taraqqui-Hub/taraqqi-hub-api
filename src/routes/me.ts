/**
 * Auth Me Route
 * Get current authenticated user with verification status and permissions
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { eq } from "drizzle-orm";

import { db } from "../config/database.ts";
import { users, jobseekerProfiles, employerProfiles, userPreferences } from "../db/index.ts";
import authMiddleware from "../middleware/authMiddleware.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { z } from "zod";
import { getUserPermissions, getUserRoles } from "../services/permissionService.ts";
import { getUserVerificationStatus } from "../middleware/verificationMiddleware.ts";
import { getPhoneValidationSchema } from "../config/zodSchemas.ts";

const meRouter = Router();

/**
 * GET /auth/me
 * Get current authenticated user with roles, permissions, and verification status
 */
meRouter.get(
	"/",
	authMiddleware(),
	expressAsyncHandler(async (req, res) => {
		const userId = req.userId!;

		// Get user details
		const [user] = await db
			.select({
				id: users.id,
				uuid: users.uuid,
				name: users.name,
				phone: users.phone,
				whatsappNumber: users.whatsappNumber,
				email: users.email,
				userType: users.userType,
				verificationStatus: users.verificationStatus,
				emailVerified: users.emailVerified,
				phoneVerified: users.phoneVerified,
				rejectedReason: users.rejectedReason,
				isActive: users.isActive,
				createdAt: users.createdAt,
				lastLoginAt: users.lastLoginAt,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			return res.status(StatusCodes.NOT_FOUND).json({
				error: "User not found",
			});
		}

		// Get roles and permissions
		const [roles, permissions] = await Promise.all([
			getUserRoles(userId),
			getUserPermissions(userId),
		]);

		// Get verification status info (for redirect messages)
		const verificationInfo = await getUserVerificationStatus(userId);

		// Check if user has set preferences
		const [preferencesRecord] = await db
			.select({ id: userPreferences.id })
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId))
			.limit(1);
		const hasPreferences = !!preferencesRecord;

		// Get profile completion status
		let profileComplete = false;
		let profileCompletionPercentage = 0;

		if (user.userType === "individual") {
			const [profile] = await db
				.select({ 
					id: jobseekerProfiles.id,
					completion: jobseekerProfiles.profileCompletion 
				})
				.from(jobseekerProfiles)
				.where(eq(jobseekerProfiles.userId, userId))
				.limit(1);
			
			if (profile) {
				profileComplete = true;
				profileCompletionPercentage = profile.completion || 0;
			}
		} else if (user.userType === "employer") {
			const [profile] = await db
				.select({ id: employerProfiles.id })
				.from(employerProfiles)
				.where(eq(employerProfiles.userId, userId))
				.limit(1);
			
			if (profile) {
				profileComplete = true;
				// For employers, assume 100% if profile exists for now (or implement similar logic)
				profileCompletionPercentage = 100;
			}
		}

		return res.status(StatusCodes.OK).json({
			user: {
				id: user.id.toString(),
				uuid: user.uuid,
				name: user.name,
				phone: user.phone,
				whatsappNumber: user.whatsappNumber,
				email: user.email,
				userType: user.userType,
				verificationStatus: user.verificationStatus,
				emailVerified: user.emailVerified,
				phoneVerified: user.phoneVerified,
				isActive: user.isActive,
				createdAt: user.createdAt,
				lastLoginAt: user.lastLoginAt,
				profileComplete,
				profileCompletionPercentage,
				hasPreferences,
				rejectedReason: user.rejectedReason,
			},
			verification: verificationInfo,
			roles: roles.map((r) => r.name),
			permissions,
		});
	})
);

/**
 * PATCH /auth/me
 * Update current user profile (name, phone)
 */
meRouter.patch(
	"/",
	authMiddleware(),
	expressAsyncHandler(
		async (validatedData: { name?: string; phone?: string; whatsappNumber?: string }, req, res) => {
			const userId = req.userId!;
			const { name, phone, whatsappNumber } = validatedData;

			if (!name && !phone && !whatsappNumber) {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "At least one field (name, phone, whatsappNumber) is required",
				});
			}

			const updateData: any = {
				updatedAt: new Date(),
			};

			if (name) updateData.name = name;
			if (phone) updateData.phone = phone;
			if (whatsappNumber) updateData.whatsappNumber = whatsappNumber;

			// Update user
			await db.update(users).set(updateData).where(eq(users.id, userId));

			return res.status(StatusCodes.OK).json({
				message: "Profile updated successfully",
			});
		},
		{
			validationSchema: z.object({
				name: z.string().min(2).max(100).optional(),
				phone: getPhoneValidationSchema("Phone").optional(),
				whatsappNumber: getPhoneValidationSchema("WhatsApp").optional(),
			}),
			getValue: (req) => req.body,
		}
	)
);

export default meRouter;
