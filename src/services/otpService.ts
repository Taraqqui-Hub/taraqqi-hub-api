/**
 * OTP Service
 * Handles OTP generation, hashing, verification, and database operations
 */

import { eq, and, gt, lt, isNull } from "drizzle-orm";
import { hash as bcryptHash, verify as bcryptVerify } from "@node-rs/bcrypt";
import crypto from "crypto";

import { db } from "../config/database.ts";
import { otpTokens, OtpPurposes } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import { StatusCodes } from "http-status-codes";

// OTP Configuration
const OTP_CONFIG = {
	LENGTH: 6,
	EXPIRY_MINUTES: 5,
	MAX_ATTEMPTS: 3,
	RESEND_COOLDOWN_SECONDS: 60,
};

/**
 * Generate a random 6-digit OTP
 */
export function generateOtp(): string {
	// Generate cryptographically secure random number
	const buffer = crypto.randomBytes(4);
	const num = buffer.readUInt32BE(0);
	// Get last 6 digits
	const otp = (num % 1000000).toString().padStart(OTP_CONFIG.LENGTH, "0");
	return otp;
}

/**
 * Hash OTP for secure storage
 */
export async function hashOtp(otp: string): Promise<string> {
	return bcryptHash(otp, 10);
}

/**
 * Verify OTP against hash
 */
export async function verifyOtpHash(
	otp: string,
	hash: string
): Promise<boolean> {
	return bcryptVerify(otp, hash);
}

/**
 * Create OTP token in database and return the plain OTP
 */
export async function createOtpToken(
	identifier: string,
	purpose: (typeof OtpPurposes)[keyof typeof OtpPurposes],
	isEmail: boolean = false
): Promise<{ otp: string; expiresAt: Date }> {
	// Check for recent OTP to prevent spam
	const recentOtp = await db
		.select({ createdAt: otpTokens.createdAt })
		.from(otpTokens)
		.where(
			and(
				isEmail ? eq(otpTokens.email, identifier) : eq(otpTokens.phone, identifier),
				eq(otpTokens.purpose, purpose),
				isNull(otpTokens.verifiedAt),
				gt(
					otpTokens.createdAt,
					new Date(Date.now() - OTP_CONFIG.RESEND_COOLDOWN_SECONDS * 1000)
				)
			)
		)
		.limit(1);

	if (recentOtp.length > 0) {
		throw new HTTPError({
			httpStatus: StatusCodes.TOO_MANY_REQUESTS,
			message: `Please wait ${OTP_CONFIG.RESEND_COOLDOWN_SECONDS} seconds before requesting a new OTP`,
		});
	}

	// Generate OTP
	const otp = generateOtp();
	const otpHash = await hashOtp(otp);
	const expiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

	// Store in database
	await db.insert(otpTokens).values({
		phone: isEmail ? null : identifier,
		email: isEmail ? identifier : null,
		otpHash,
		purpose,
		attempts: 0,
		maxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
		expiresAt,
	});

	return { otp, expiresAt };
}

/**
 * Verify OTP token
 * Returns true if valid, throws error if invalid
 */
export async function verifyOtpToken(
	identifier: string,
	otp: string,
	purpose: (typeof OtpPurposes)[keyof typeof OtpPurposes],
	isEmail: boolean = false
): Promise<boolean> {
	// Find valid OTP token
	const [token] = await db
		.select()
		.from(otpTokens)
		.where(
			and(
				isEmail ? eq(otpTokens.email, identifier) : eq(otpTokens.phone, identifier),
				eq(otpTokens.purpose, purpose),
				isNull(otpTokens.verifiedAt),
				gt(otpTokens.expiresAt, new Date())
			)
		)
		.orderBy(otpTokens.createdAt)
		.limit(1);

	if (!token) {
		throw new HTTPError({
			httpStatus: StatusCodes.BAD_REQUEST,
			message: "Invalid or expired OTP. Please request a new one.",
		});
	}

	// Check max attempts
	if (token.attempts >= token.maxAttempts) {
		throw new HTTPError({
			httpStatus: StatusCodes.TOO_MANY_REQUESTS,
			message: "Too many failed attempts. Please request a new OTP.",
		});
	}

	// Verify OTP
	const isValid = await verifyOtpHash(otp, token.otpHash);

	if (!isValid) {
		// Increment attempts
		await db
			.update(otpTokens)
			.set({ attempts: token.attempts + 1 })
			.where(eq(otpTokens.id, token.id));

		throw new HTTPError({
			httpStatus: StatusCodes.BAD_REQUEST,
			message: "Invalid OTP. Please try again.",
			reason: {
				attemptsRemaining: token.maxAttempts - token.attempts - 1,
			},
		});
	}

	// Mark as verified
	await db
		.update(otpTokens)
		.set({ verifiedAt: new Date() })
		.where(eq(otpTokens.id, token.id));

	return true;
}

/**
 * Clean up expired OTP tokens (run via cron)
 */
export async function cleanupExpiredOtpTokens(): Promise<number> {
	const result = await db
		.delete(otpTokens)
		.where(lt(otpTokens.expiresAt, new Date()))
		.returning({ id: otpTokens.id });

	return result.length;
}

export default {
	generateOtp,
	hashOtp,
	verifyOtpHash,
	createOtpToken,
	verifyOtpToken,
	cleanupExpiredOtpTokens,
	OTP_CONFIG,
};
