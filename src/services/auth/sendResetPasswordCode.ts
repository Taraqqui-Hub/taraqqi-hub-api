import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { db } from "../../config/database.ts";
import { HTTPError } from "../../config/error.ts";
import ErrorMessages from "../../config/errorMessages.ts";
import { emailValidationSchema } from "../../config/zodSchemas.ts";
import { users, userResetPasswordCodes } from "../../db/index.ts";
import { Service } from "../index.ts";
import { StatusCodes } from "http-status-codes";
import { notifyPasswordReset } from "../notificationService.ts";

export const SendResetPasswordCodeDataSchema = z.object({
	email: emailValidationSchema,
});

export type SendResetPasswordCodeData = z.infer<
	typeof SendResetPasswordCodeDataSchema
>;

class SendResetPasswordCodeService extends Service<
	SendResetPasswordCodeData,
	void
> {
	async handle(): Promise<void> {
		// Find user by email
		const [user] = await db
			.select({ id: users.id, email: users.email, name: users.name })
			.from(users)
			.where(eq(users.email, this.data.email))
			.limit(1);

		// Always return success to prevent email enumeration
		if (!user) {
			console.log(
				`[ResetPassword] No user found for email: ${this.data.email}`
			);
			return;
		}

		// Generate reset code
		const resetCode = randomBytes(32).toString("hex");
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

		// Delete any existing reset codes for this user
		await db
			.delete(userResetPasswordCodes)
			.where(eq(userResetPasswordCodes.userId, user.id));

		// Create new reset code
		await db.insert(userResetPasswordCodes).values({
			id: uuidv4(),
			userId: user.id,
			resetPasswordCode: resetCode,
			expiresAt,
		});

		// Send email
		await notifyPasswordReset(
			this.data.email,
			resetCode,
			user.name || "User"
		);
	}
}

export default SendResetPasswordCodeService;
