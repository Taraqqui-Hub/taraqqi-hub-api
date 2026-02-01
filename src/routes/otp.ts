/**
 * OTP Authentication Routes
 * Handles OTP-based login and registration
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "../config/database.ts";
import { users, OtpPurposes, UserTypes } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import {
	createAccessToken,
	createRefreshToken,
	TOKEN_CONFIG,
	TokenUserData,
} from "../utils/jwt.ts";
import { createOtpToken, verifyOtpToken } from "../services/otpService.ts";
import { getUserPermissions } from "../services/permissionService.ts";
import { assignRoleToUser } from "../services/permissionService.ts";
import { RoleNames } from "../config/permissions.ts";
import { auditLogin } from "../services/auditService.ts";
import { v4 as uuidv4 } from "uuid";

const otpRouter = Router();

// ============================================
// Validation Schemas
// ============================================

const SendOtpSchema = z.object({
	phone: z
		.string()
		.regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number format")
		.optional(),
	email: z.string().email("Invalid email format").optional(),
	purpose: z
		.enum(["login", "register", "verify_phone", "verify_email"])
		.default("login"),
}).refine((data) => data.phone || data.email, {
	message: "Either phone or email is required",
});

const VerifyOtpSchema = z.object({
	phone: z.string().optional(),
	email: z.string().email().optional(),
	otp: z.string().length(6, "OTP must be 6 digits"),
	purpose: z.enum(["login", "register"]).default("login"),
}).refine((data) => data.phone || data.email, {
	message: "Either phone or email is required",
});

const RegisterSchema = z.object({
	phone: z
		.string()
		.regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number format"),
	otp: z.string().length(6, "OTP must be 6 digits"),
	userType: z.enum(["individual", "employer"]),
	email: z.string().email().optional(),
});

// ============================================
// Routes
// ============================================

/**
 * POST /auth/otp/send
 * Send OTP to phone or email
 */
otpRouter.post(
	"/send",
	expressAsyncHandler(
		async (data, req, res) => {
			const identifier = data.phone || data.email!;
			const isEmail = !data.phone;
			const purpose = data.purpose as (typeof OtpPurposes)[keyof typeof OtpPurposes];

			// For login, check if user exists
			if (purpose === OtpPurposes.LOGIN) {
				const [existingUser] = await db
					.select({ id: users.id })
					.from(users)
					.where(
						and(
							isEmail
								? eq(users.email, identifier)
								: eq(users.phone, identifier),
							isNull(users.deletedAt)
						)
					)
					.limit(1);

				if (!existingUser) {
					throw new HTTPError({
						httpStatus: StatusCodes.NOT_FOUND,
						message: "No account found with this phone number. Please register first.",
					});
				}
			}

			// For registration, check if user already exists
			if (purpose === OtpPurposes.REGISTER) {
				const [existingUser] = await db
					.select({ id: users.id })
					.from(users)
					.where(
						and(
							isEmail
								? eq(users.email, identifier)
								: eq(users.phone, identifier),
							isNull(users.deletedAt)
						)
					)
					.limit(1);

				if (existingUser) {
					throw new HTTPError({
						httpStatus: StatusCodes.CONFLICT,
						message: "An account with this phone number already exists. Please login instead.",
					});
				}
			}

			// Create OTP token
			const { otp, expiresAt } = await createOtpToken(identifier, purpose, isEmail);

			// TODO: Send OTP via SMS/Email service
			// For development, log the OTP
			console.log(`[OTP] ${identifier}: ${otp} (expires: ${expiresAt.toISOString()})`);

			return res.status(StatusCodes.OK).json({
				message: `OTP sent to ${isEmail ? "email" : "phone"}`,
				expiresAt: expiresAt.toISOString(),
				// Only include OTP in development for testing
				...(process.env.NODE_ENV === "development" && { otp }),
			});
		},
		{
			validationSchema: SendOtpSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * POST /auth/otp/verify
 * Verify OTP and issue tokens for existing users (login)
 */
otpRouter.post(
	"/verify",
	expressAsyncHandler(
		async (data, req, res) => {
			const identifier = data.phone || data.email!;
			const isEmail = !data.phone;
			const purpose = data.purpose as (typeof OtpPurposes)[keyof typeof OtpPurposes];

			// Verify OTP
			await verifyOtpToken(identifier, data.otp, purpose, isEmail);

			// Get user
			const [user] = await db
				.select({
					id: users.id,
					uuid: users.uuid,
					phone: users.phone,
					email: users.email,
					userType: users.userType,
					isActive: users.isActive,
				})
				.from(users)
				.where(
					and(
						isEmail
							? eq(users.email, identifier)
							: eq(users.phone, identifier),
						isNull(users.deletedAt)
					)
				)
				.limit(1);

			if (!user) {
				throw new HTTPError({
					httpStatus: StatusCodes.NOT_FOUND,
					message: "User not found. Please register first.",
				});
			}

			if (!user.isActive) {
				throw new HTTPError({
					httpStatus: StatusCodes.FORBIDDEN,
					message: "Your account has been deactivated. Please contact support.",
				});
			}

			// Get user permissions
			const permissions = await getUserPermissions(user.id);

			// Update last login
			await db
				.update(users)
				.set({
					lastLoginAt: new Date(),
					phoneVerified: !isEmail ? true : undefined,
					emailVerified: isEmail ? true : undefined,
				})
				.where(eq(users.id, user.id));

			// Create tokens
			const tokenData: TokenUserData = {
				id: user.id.toString(),
				uuid: user.uuid,
				userType: user.userType as "jobseeker" | "employer" | "admin",
				permissions,
			};

			const refreshTokenId = uuidv4();
			const [accessToken, refreshToken] = await Promise.all([
				createAccessToken(tokenData),
				createRefreshToken(tokenData, refreshTokenId),
			]);

			// Store refresh token in database
			// (You may want to use the existing refreshTokens table)

			// Set refresh token as httpOnly cookie
			res.cookie("refreshToken", refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "strict",
				maxAge: TOKEN_CONFIG.REFRESH_TOKEN_COOKIE_EXPIRY,
				path: "/",
			});

			// Audit log
			await auditLogin(user.id, user.email || user.phone || "Unknown", {
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			});

			return res.status(StatusCodes.OK).json({
				message: "Login successful",
				accessToken,
				expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY,
				user: {
					id: user.id.toString(),
					uuid: user.uuid,
					phone: user.phone,
					email: user.email,
					userType: user.userType,
					permissions,
				},
			});
		},
		{
			validationSchema: VerifyOtpSchema,
			getValue: (req) => req.body,
		}
	)
);

/**
 * POST /auth/otp/register
 * Register new user with OTP verification
 */
otpRouter.post(
	"/register",
	expressAsyncHandler(
		async (data, req, res) => {
			// Verify OTP first
			await verifyOtpToken(data.phone, data.otp, OtpPurposes.REGISTER, false);

			// Check if user already exists
			const [existingUser] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.phone, data.phone))
				.limit(1);

			if (existingUser) {
				throw new HTTPError({
					httpStatus: StatusCodes.CONFLICT,
					message: "An account with this phone number already exists.",
				});
			}

			// Create user
			const [newUser] = await db
				.insert(users)
				.values({
					phone: data.phone,
					email: data.email || null,
					userType: data.userType as any,
					phoneVerified: true,
					isActive: true,
				})
				.returning({
					id: users.id,
					uuid: users.uuid,
					phone: users.phone,
					email: users.email,
					userType: users.userType,
				});

			// Assign default role based on user type
			const roleName =
				data.userType === "employer"
					? RoleNames.EMPLOYER
					: RoleNames.INDIVIDUAL;
			await assignRoleToUser(newUser.id, roleName);

			// Get permissions for the new user
			const permissions = await getUserPermissions(newUser.id);

			// Create tokens
			const tokenData: TokenUserData = {
				id: newUser.id.toString(),
				uuid: newUser.uuid,
				userType: newUser.userType as "jobseeker" | "employer" | "admin",
				permissions,
			};

			const refreshTokenId = uuidv4();
			const [accessToken, refreshToken] = await Promise.all([
				createAccessToken(tokenData),
				createRefreshToken(tokenData, refreshTokenId),
			]);

			// Set refresh token as httpOnly cookie
			res.cookie("refreshToken", refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "strict",
				maxAge: TOKEN_CONFIG.REFRESH_TOKEN_COOKIE_EXPIRY,
				path: "/",
			});

			return res.status(StatusCodes.CREATED).json({
				message: "Registration successful",
				accessToken,
				expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY,
				user: {
					id: newUser.id.toString(),
					uuid: newUser.uuid,
					phone: newUser.phone,
					email: newUser.email,
					userType: newUser.userType,
					permissions,
				},
			});
		},
		{
			validationSchema: RegisterSchema,
			getValue: (req) => req.body,
		}
	)
);

export default otpRouter;
