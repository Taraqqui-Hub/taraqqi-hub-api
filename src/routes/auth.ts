/**
 * Auth Routes
 * Email + Password authentication
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { eq, and, gt, isNull } from "drizzle-orm";

import { db } from "../config/database.ts";
import { users, userEmailVerificationCodes } from "../db/index.ts";
import expressAsyncHandler from "../utils/expressAsyncHandler.ts";
import { TOKEN_CONFIG } from "../utils/jwt.ts";
import { auditLogin } from "../services/auditService.ts";

// Auth services
import LoginService, { LoginDataSchema } from "../services/auth/login.ts";
import SignupService, { SignupDataSchema } from "../services/auth/signup.ts";
import {
	CreateRefreshTokenService,
	RefreshAccessTokenService,
	RevokeRefreshTokenService,
	RefreshTokenDataSchema,
} from "../services/auth/refreshToken.ts";
import SendResetPasswordCodeService, {
	SendResetPasswordCodeDataSchema,
} from "../services/auth/sendResetPasswordCode.ts";
import ValidateResetPasswordCodeService, {
	ValidateResetPasswordCodeDataSchema,
} from "../services/auth/validateResetPasswordCode.ts";
import ResetPasswordService, {
	ResetPasswordDataSchema,
} from "../services/auth/resetPassword.ts";
import { notifyEmailVerification } from "../services/notificationService.ts";

const authRouter = Router();

// ============================================
// Login
// ============================================
authRouter.post(
	"/login",
	expressAsyncHandler(
		async (validatedData, req, res) => {
			// Authenticate user credentials
			const loginService = new LoginService(validatedData);
			const user = await loginService.handle();

			// Create refresh token and access token
			const createRefreshTokenService = new CreateRefreshTokenService({
				userId: user.userId.toString(),
				deviceInfo: req.headers["user-agent"] || "Unknown",
				ipAddress: req.ip || req.socket.remoteAddress || "Unknown",
			});
			const tokens = await createRefreshTokenService.handle();

			// Set refresh token as httpOnly cookie
			res.cookie("refreshToken", tokens.refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "strict",
				maxAge: TOKEN_CONFIG.REFRESH_TOKEN_COOKIE_EXPIRY,
				path: "/",
			});

			// Audit log
			await auditLogin(user.userId, user.email, {
				ipAddress: req.clientIp,
				userAgent: req.clientUserAgent,
				requestId: req.requestId,
			});

			return res.status(StatusCodes.OK).json({
				message: "Login successful",
				accessToken: tokens.accessToken,
				expiresIn: tokens.accessTokenExpiresIn,
				user: {
					id: user.userId.toString(),
					uuid: user.uuid,
					email: user.email,
					name: user.name,
					phone: user.phone,
					userType: user.userType,
					verificationStatus: user.verificationStatus,
					permissions: user.permissions,
				},
			});
		},
		{
			validationSchema: LoginDataSchema,
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Signup
// ============================================
authRouter.post(
	"/signup",
	expressAsyncHandler(
		async (validatedData, req, res) => {
			const signupService = new SignupService(validatedData);
			const result = await signupService.execute();

			// Send verification email
			await notifyEmailVerification(
				result.userId,
				result.email,
				result.verificationCode,
				validatedData.name
			);

			// Create refresh token and access token
			const createRefreshTokenService = new CreateRefreshTokenService({
				userId: result.userId.toString(),
				deviceInfo: req.headers["user-agent"] || "Unknown",
				ipAddress: req.ip || req.socket.remoteAddress || "Unknown",
			});
			const tokens = await createRefreshTokenService.handle();

			// Set refresh token as httpOnly cookie
			res.cookie("refreshToken", tokens.refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "strict",
				maxAge: TOKEN_CONFIG.REFRESH_TOKEN_COOKIE_EXPIRY,
				path: "/",
			});

			return res.status(StatusCodes.CREATED).json({
				message:
					"Account created successfully. Please verify your email to continue.",
				accessToken: tokens.accessToken,
				expiresIn: tokens.accessTokenExpiresIn,
				user: {
					id: result.userId.toString(),
					email: result.email,
					verificationStatus: "draft",
					emailVerificationRequired: true,
				},
			});
		},
		{
			validationSchema: SignupDataSchema,
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Email Verification
// ============================================

// Verify email with token from link
authRouter.get(
	"/verify-email",
	expressAsyncHandler(
		async (validatedData: { token: string }, req, res) => {
			const { token } = validatedData;

			// Find verification code
			const [record] = await db
				.select({
					userId: userEmailVerificationCodes.userId,
					expiresAt: userEmailVerificationCodes.expiresAt,
				})
				.from(userEmailVerificationCodes)
				.where(eq(userEmailVerificationCodes.verificationCode, token))
				.limit(1);

			if (!record) {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "Invalid or expired verification link.",
				});
			}

			if (record.expiresAt < new Date()) {
				// Delete expired token
				await db
					.delete(userEmailVerificationCodes)
					.where(eq(userEmailVerificationCodes.verificationCode, token));

				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "Verification link has expired. Please request a new one.",
				});
			}

			// Mark email as verified
			await db
				.update(users)
				.set({
					emailVerified: true,
					updatedAt: new Date(),
				})
				.where(eq(users.id, record.userId));

			// Delete verification code
			await db
				.delete(userEmailVerificationCodes)
				.where(eq(userEmailVerificationCodes.verificationCode, token));

			return res.status(StatusCodes.OK).json({
				message: "Email verified successfully. You can now continue with registration.",
			});
		},
		{
			validationSchema: z.object({
				token: z.string().min(1, "Token is required"),
			}),
			getValue: (req) => req.query,
		}
	)
);

// Resend verification email
authRouter.post(
	"/verify-email/resend",
	expressAsyncHandler(
		async (validatedData: { email: string }, req, res) => {
			const { email } = validatedData;

			// Find user
			const [user] = await db
				.select({
					id: users.id,
					name: users.name,
					emailVerified: users.emailVerified,
				})
				.from(users)
				.where(
					and(
						eq(users.email, email),
						isNull(users.deletedAt)
					)
				)
				.limit(1);

			if (!user) {
				// Don't reveal if email exists
				return res.status(StatusCodes.OK).json({
					message: "If this email exists, a verification link has been sent.",
				});
			}

			if (user.emailVerified) {
				return res.status(StatusCodes.BAD_REQUEST).json({
					error: "Email is already verified.",
				});
			}

			// Delete old verification codes
			await db
				.delete(userEmailVerificationCodes)
				.where(eq(userEmailVerificationCodes.userId, user.id));

			// Create new verification code
			const crypto = await import("crypto");
			const verificationCode = crypto.randomBytes(32).toString("hex");

			await db.insert(userEmailVerificationCodes).values({
				userId: user.id,
				verificationCode,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
			});

			// Send email
			await notifyEmailVerification(
				user.id,
				email,
				verificationCode,
				user.name || "User"
			);

			return res.status(StatusCodes.OK).json({
				message: "If this email exists, a verification link has been sent.",
			});
		},
		{
			validationSchema: z.object({
				email: z.string().email(),
			}),
			getValue: (req) => req.body,
		}
	)
);

// ============================================
// Refresh Token
// ============================================
authRouter.post(
	"/refresh",
	expressAsyncHandler(
		async (validatedData, req, res) => {
			const refreshAccessTokenService = new RefreshAccessTokenService(
				validatedData
			);
			const tokens = await refreshAccessTokenService.handle();

			return res.status(StatusCodes.OK).json({
				message: "Session refreshed successfully.",
				accessToken: tokens.accessToken,
				expiresIn: tokens.accessTokenExpiresIn,
			});
		},
		{
			validationSchema: RefreshTokenDataSchema,
			getValue: (req) => {
				const refreshToken =
					req.cookies.refreshToken || req.body.refreshToken;
				if (!refreshToken) {
					return { refreshToken: "" };
				}
				return { refreshToken };
			},
		}
	)
);

// ============================================
// Logout
// ============================================
authRouter.delete(
	"/logout",
	expressAsyncHandler(
		async (validatedData: { refreshToken?: string }, req, res) => {
			// Revoke the refresh token if provided
			if (validatedData.refreshToken) {
				try {
					const revokeRefreshTokenService = new RevokeRefreshTokenService({
						refreshToken: validatedData.refreshToken,
					});
					await revokeRefreshTokenService.handle();
				} catch (error) {
					console.warn("Failed to revoke refresh token:", error);
				}
			}

			// Clear cookies
			res.clearCookie("auth", {
				path: "/",
				sameSite: "strict",
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
			});
			res.clearCookie("refreshToken", {
				path: "/",
				sameSite: "strict",
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
			});

			return res.status(StatusCodes.OK).json({
				message: "Logged out successfully.",
			});
		},
		{
			validationSchema: RefreshTokenDataSchema.partial(),
			getValue: (req) => {
				const refreshToken =
					req.cookies.refreshToken || req.body.refreshToken;
				return refreshToken ? { refreshToken } : {};
			},
		}
	)
);

// ============================================
// Password Reset
// ============================================

// Send password reset code
authRouter.post(
	"/reset-password/send-code",
	expressAsyncHandler(
		async (validatedData, req, res) => {
			const sendResetPasswordCodeService = new SendResetPasswordCodeService(
				validatedData
			);
			await sendResetPasswordCodeService.handle();

			return res.status(StatusCodes.OK).json({
				message:
					"If this email exists, password reset instructions have been sent.",
			});
		},
		{
			validationSchema: SendResetPasswordCodeDataSchema,
			getValue: (req) => req.body,
		}
	)
);

// Validate password reset code
authRouter.get(
	"/reset-password/validate-code",
	expressAsyncHandler(
		async (validatedData, _, res) => {
			const validateResetPasswordCodeService =
				new ValidateResetPasswordCodeService(validatedData);
			const result = await validateResetPasswordCodeService.handle();

			return res.status(StatusCodes.OK).json({
				message: "Reset code verified successfully.",
				valid: result.valid,
				userId: result.userId,
			});
		},
		{
			validationSchema: ValidateResetPasswordCodeDataSchema,
			getValue: (req) => req.query,
		}
	)
);

// Reset password
authRouter.patch(
	"/reset-password/reset",
	expressAsyncHandler(
		async (validatedData, req, res) => {
			const resetPasswordService = new ResetPasswordService(validatedData);
			await resetPasswordService.handle();

			return res.status(StatusCodes.OK).json({
				message: "Password has been reset successfully. You can now login.",
			});
		},
		{
			validationSchema: ResetPasswordDataSchema,
			getValue: (req) => req.body,
		}
	)
);

export default authRouter;
