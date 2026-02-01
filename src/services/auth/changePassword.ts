import { eq } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { db } from "../../config/database.ts";
import { HTTPError } from "../../config/error.ts";
import ErrorMessages from "../../config/errorMessages.ts";
import { passwordValidationSchema } from "../../config/zodSchemas.ts";
import { users } from "../../db/index.ts";
import { Service } from "../index.ts";
import { hashPassword, verifyPassword } from "../../utils/hashingTools.ts";
import { notifyPasswordChanged } from "../notificationService.ts";

export const ChangePasswordDataSchema = z.object({
	userId: z.bigint(),
	currentPassword: z.string().min(1),
	newPassword: passwordValidationSchema,
});

export type ChangePasswordData = z.infer<typeof ChangePasswordDataSchema>;

class ChangePasswordService extends Service<ChangePasswordData, void> {
	async handle(): Promise<void> {
		// Get current user password and email
		const [user] = await db
			.select({ passwordHash: users.passwordHash, email: users.email, name: users.name })
			.from(users)
			.where(eq(users.id, this.data.userId))
			.limit(1);

		if (!user) {
			throw new HTTPError({
				httpStatus: StatusCodes.NOT_FOUND,
				message: ErrorMessages.ACCOUNT_DOES_NOT_EXIST,
			});
		}

		// Verify current password
		const isCurrentPasswordValid = await verifyPassword(
			this.data.currentPassword,
			user.passwordHash || ""
		);

		if (!isCurrentPasswordValid) {
			throw new HTTPError({
				httpStatus: StatusCodes.UNAUTHORIZED,
				message: ErrorMessages.EMAIL_PASSWORD_INCORRECT,
			});
		}

		// Hash and update new password
		const hashedPassword = await hashPassword(this.data.newPassword);

		await db
			.update(users)
			.set({
				passwordHash: hashedPassword,
				updatedAt: new Date(),
			})
			.where(eq(users.id, this.data.userId));

		// Send password changed confirmation email
		if (user.email) {
			await notifyPasswordChanged(user.email, user.name || "User");
		}
	}
}

export default ChangePasswordService;

