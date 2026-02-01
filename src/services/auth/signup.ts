/**
 * Signup Service
 * Email + Password registration with verification status
 */

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";

import { db } from "../../config/database.ts";
import { HTTPError } from "../../config/error.ts";
import ErrorMessages from "../../config/errorMessages.ts";
import {
	emailValidationSchema,
	passwordValidationSchema,
	getPhoneValidationSchema,
} from "../../config/zodSchemas.ts";
import {
	users,
	userEmailVerificationCodes,
	VerificationStatuses,
	UserTypes,
} from "../../db/index.ts";
import { Service } from "../index.ts";
import { hashPassword } from "../../utils/hashingTools.ts";
import { assignRoleToUser } from "../permissionService.ts";
import { RoleNames } from "../../config/permissions.ts";

export const SignupDataSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters").max(100),
	email: emailValidationSchema,
	phone: getPhoneValidationSchema("Phone").optional(),
	password: passwordValidationSchema,
	userType: z.enum(["individual", "employer"]),
});

export type SignupData = z.infer<typeof SignupDataSchema>;

export interface SignupResult {
	userId: bigint;
	email: string;
	verificationCode: string;
}

class SignupService extends Service<SignupData, SignupResult> {
	async validate(): Promise<string | undefined> {
		// Check if email already exists
		const [existingEmail] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, this.data.email))
			.limit(1);

		if (existingEmail) {
			return "An account with this email already exists. Please login instead.";
		}

		// Check if phone already exists (if provided)
        if (this.data.phone) {
            const [existingPhone] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.phone, this.data.phone))
                .limit(1);

            if (existingPhone) {
                return "An account with this phone number already exists. Please login instead.";
            }
        }

		return undefined;
	}

	async handle(): Promise<SignupResult> {
		const hashedPassword = await hashPassword(this.data.password);
		const verificationCode = randomBytes(32).toString("hex"); // Token for email link

		const result = await db.transaction(async (tx) => {
			// Create user with DRAFT status
			const [newUser] = await tx
				.insert(users)
				.values({
					name: this.data.name,
					email: this.data.email,
					phone: this.data.phone,
					passwordHash: hashedPassword,
					userType: this.data.userType,
					verificationStatus: VerificationStatuses.DRAFT,
					emailVerified: false,
					phoneVerified: false,
					isActive: true,
				})
				.returning({ id: users.id, email: users.email });

			// Store email verification token
			await tx.insert(userEmailVerificationCodes).values({
				userId: newUser.id,
				verificationCode: verificationCode,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
			});

			// Assign default role based on user type
			const roleName =
				this.data.userType === "employer"
					? RoleNames.EMPLOYER
					: RoleNames.INDIVIDUAL;
			await assignRoleToUser(newUser.id, roleName, undefined, tx);

			return newUser;
		});

		// TODO: Send verification email with link
		console.log(
			`[Signup] Email verification link for ${this.data.email}: ${process.env.FRONTEND_URL}/verify-email?token=${verificationCode}`
		);

		return {
			userId: result.id,
			email: result.email!,
			verificationCode,
		};
	}
}

export default SignupService;
