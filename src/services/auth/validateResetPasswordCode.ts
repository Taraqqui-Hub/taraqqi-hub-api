import { and, eq, gt } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { db } from "../../config/database.ts";
import { HTTPError } from "../../config/error.ts";
import ErrorMessages from "../../config/errorMessages.ts";
import { getStringValidationSchema } from "../../config/zodSchemas.ts";
import { userResetPasswordCodes } from "../../db/index.ts";
import { Service } from "../index.ts";

export const ValidateResetPasswordCodeDataSchema = z.object({
	code: getStringValidationSchema("code"),
});

export type ValidateResetPasswordCodeData = z.infer<
	typeof ValidateResetPasswordCodeDataSchema
>;

class ValidateResetPasswordCodeService extends Service<
	ValidateResetPasswordCodeData,
	{ valid: boolean; userId: string }
> {
	async handle(): Promise<{ valid: boolean; userId: string }> {
		const [resetRecord] = await db
			.select({
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

		return {
			valid: true,
			userId: resetRecord.userId.toString(),
		};
	}
}

export default ValidateResetPasswordCodeService;
