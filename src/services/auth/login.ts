/**
 * Login Service
 * Email + Password authentication with rate limiting and verification status
 */

import { eq, and, gt, isNull } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { db } from "../../config/database.ts";
import { HTTPError } from "../../config/error.ts";
import ErrorMessages from "../../config/errorMessages.ts";
import {
	emailValidationSchema,
	getStringValidationSchema,
} from "../../config/zodSchemas.ts";
import { users, loginAttempts, VerificationStatuses } from "../../db/index.ts";
import { Service } from "../index.ts";
import { verifyPassword } from "../../utils/hashingTools.ts";
import { getUserPermissions } from "../permissionService.ts";

// Rate limiting config
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export const LoginDataSchema = z.object({
	email: emailValidationSchema,
	password: getStringValidationSchema("password"),
});

export type LoginData = z.infer<typeof LoginDataSchema>;

export interface LoginResult {
	userId: bigint;
	uuid: string;
	email: string;
	name: string | null;
	phone: string | null;
	userType: string;
	verificationStatus: string;
	emailVerified: boolean;
	permissions: string[];
}

class LoginService extends Service<LoginData, LoginResult> {
	/**
	 * Check if account is locked due to too many failed attempts
	 */
	private async checkAccountLock(): Promise<void> {
		// Check user-level lock
		const [user] = await db
			.select({
				lockedUntil: users.lockedUntil,
				failedLoginAttempts: users.failedLoginAttempts,
			})
			.from(users)
			.where(
				and(
					eq(users.email, this.data.email),
					isNull(users.deletedAt)
				)
			)
			.limit(1);

		if (user?.lockedUntil && user.lockedUntil > new Date()) {
			const remainingMinutes = Math.ceil(
				(user.lockedUntil.getTime() - Date.now()) / (1000 * 60)
			);
			throw new HTTPError({
				httpStatus: StatusCodes.TOO_MANY_REQUESTS,
				message: `Account temporarily locked due to too many failed login attempts. Try again in ${remainingMinutes} minute(s).`,
			});
		}

		// Also check login_attempts table for IP-based rate limiting
		const [attemptRecord] = await db
			.select()
			.from(loginAttempts)
			.where(
				and(
					eq(loginAttempts.identifier, this.data.email),
					gt(loginAttempts.lockedUntil, new Date())
				)
			)
			.limit(1);

		if (attemptRecord) {
			const remainingMinutes = Math.ceil(
				(attemptRecord.lockedUntil!.getTime() - Date.now()) / (1000 * 60)
			);
			throw new HTTPError({
				httpStatus: StatusCodes.TOO_MANY_REQUESTS,
				message: `Too many login attempts. Try again in ${remainingMinutes} minute(s).`,
			});
		}
	}

	/**
	 * Record failed login attempt
	 */
	private async recordFailedAttempt(userId?: bigint): Promise<void> {
		// Update user's failed attempts
		if (userId) {
			const [user] = await db
				.select({ failedLoginAttempts: users.failedLoginAttempts })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			const newAttempts = (user?.failedLoginAttempts || 0) + 1;
			const lockUntil =
				newAttempts >= MAX_FAILED_ATTEMPTS
					? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
					: null;

			await db
				.update(users)
				.set({
					failedLoginAttempts: newAttempts,
					lockedUntil: lockUntil,
				})
				.where(eq(users.id, userId));
		}

		// Also track in login_attempts table
		const [existing] = await db
			.select()
			.from(loginAttempts)
			.where(eq(loginAttempts.identifier, this.data.email))
			.limit(1);

		if (existing) {
			const newAttempts = existing.attempts + 1;
			const lockUntil =
				newAttempts >= MAX_FAILED_ATTEMPTS
					? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
					: null;

			await db
				.update(loginAttempts)
				.set({
					attempts: newAttempts,
					lockedUntil: lockUntil,
					lastAttemptAt: new Date(),
				})
				.where(eq(loginAttempts.id, existing.id));
		} else {
			await db.insert(loginAttempts).values({
				identifier: this.data.email,
				identifierType: "email",
				attempts: 1,
				lastAttemptAt: new Date(),
			});
		}
	}

	/**
	 * Reset failed attempts on successful login
	 */
	private async resetFailedAttempts(userId: bigint): Promise<void> {
		await db
			.update(users)
			.set({
				failedLoginAttempts: 0,
				lockedUntil: null,
				lastLoginAt: new Date(),
			})
			.where(eq(users.id, userId));

		await db
			.delete(loginAttempts)
			.where(eq(loginAttempts.identifier, this.data.email));
	}

	async handle(): Promise<LoginResult> {
		// Check for account lock first
		await this.checkAccountLock();

		// Find user by email
		const [user] = await db
			.select({
				id: users.id,
				uuid: users.uuid,
				email: users.email,
				name: users.name,
				phone: users.phone,
				passwordHash: users.passwordHash,
				userType: users.userType,
				verificationStatus: users.verificationStatus,
				isActive: users.isActive,
				emailVerified: users.emailVerified,
			})
			.from(users)
			.where(
				and(
					eq(users.email, this.data.email),
					isNull(users.deletedAt)
				)
			)
			.limit(1);

		if (!user) {
			// Record failed attempt even for non-existent users (to prevent enumeration)
			await this.recordFailedAttempt();
			throw new HTTPError({
				httpStatus: StatusCodes.UNAUTHORIZED,
				message: ErrorMessages.EMAIL_PASSWORD_INCORRECT,
			});
		}

		// Check if user has a password set
		if (!user.passwordHash) {
			throw new HTTPError({
				httpStatus: StatusCodes.UNAUTHORIZED,
				message: "Please reset your password to login.",
			});
		}

		// Verify password
		const isPasswordCorrect = await verifyPassword(
			this.data.password,
			user.passwordHash
		);

		if (!isPasswordCorrect) {
			await this.recordFailedAttempt(user.id);
			throw new HTTPError({
				httpStatus: StatusCodes.UNAUTHORIZED,
				message: ErrorMessages.EMAIL_PASSWORD_INCORRECT,
			});
		}

		// Check if account is active
		if (!user.isActive) {
			throw new HTTPError({
				httpStatus: StatusCodes.FORBIDDEN,
				message: "Your account has been deactivated. Please contact support.",
			});
		}

		// Check if account is suspended
		if (user.verificationStatus === VerificationStatuses.SUSPENDED) {
			throw new HTTPError({
				httpStatus: StatusCodes.FORBIDDEN,
				message: "Your account has been suspended. Please contact support.",
			});
		}

		// Reset failed attempts on successful login
		await this.resetFailedAttempts(user.id);

		// Get user permissions
		const permissions = await getUserPermissions(user.id);

		return {
			userId: user.id,
			uuid: user.uuid,
			email: user.email!,
			name: user.name,
			phone: user.phone,
			userType: user.userType,
			verificationStatus: user.verificationStatus,
			emailVerified: user.emailVerified ?? false,
			permissions,
		};
	}
}

export default LoginService;
