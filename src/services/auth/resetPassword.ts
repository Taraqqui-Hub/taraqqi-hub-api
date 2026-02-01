import { and, eq, gt } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { db } from "../../config/database.ts";
import { HTTPError } from "../../config/error.ts";
import ErrorMessages from "../../config/errorMessages.ts";
import {
	getStringValidationSchema,
	passwordValidationSchema,
} from "../../config/zodSchemas.ts";
import { users, userResetPasswordCodes } from "../../db/index.ts";
import { Service } from "../index.ts";
import { hashPassword } from "../../utils/hashingTools.ts";
import { notifyPasswordChanged } from "../notificationService.ts";

export const ResetPasswordDataSchema = z.object({
	code: getStringValidationSchema("code"),
	newPassword: passwordValidationSchema,
});

export type ResetPasswordData = z.infer<typeof ResetPasswordDataSchema>;

class ResetPasswordService extends Service<ResetPasswordData, void> {
	async handle(): Promise<void> {
		// Find and validate reset code
		const [resetRecord] = await db
			.select({
				id: userResetPasswordCodes.id,
				userId: userResetPasswordCodes.userId,
				expiresAt: userResetPasswordCodes.expiresAt,
				usedAt: userResetPasswordCodes.usedAt,
			})
			.from(userResetPasswordCodes)
			.where(
				and(
					eq(userResetPasswordCodes.resetPasswordCode, this.data.code),
					gt(userResetPasswordCodes.expiresAt, new Date())
				)
			)
			.limit(1);

		if (!resetRecord || resetRecord.usedAt) {
			throw new HTTPError({
				httpStatus: StatusCodes.BAD_REQUEST,
				message: ErrorMessages.INVALID_RESET_PASSWORD_CODE,
			});
		}

		// Hash new password and update user
		const hashedPassword = await hashPassword(this.data.newPassword);

		// Get user email for confirmation
		const [user] = await db
			.select({ email: users.email, name: users.name })
			.from(users)
			.where(eq(users.id, resetRecord.userId))
			.limit(1);

		await db.transaction(async (tx) => {
			// Update user's password
			await tx
				.update(users)
				.set({
					passwordHash: hashedPassword,
					updatedAt: new Date(),
				})
				.where(eq(users.id, resetRecord.userId));

			// Mark reset code as used
			await tx
				.update(userResetPasswordCodes)
				.set({ usedAt: new Date() })
				.where(eq(userResetPasswordCodes.id, resetRecord.id));
		});

		// Send password changed confirmation email
		if (user?.email) {
			await notifyPasswordChanged(user.email, user.name || "User");
		}
	}
}

export default ResetPasswordService;

