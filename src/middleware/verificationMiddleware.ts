/**
 * Verification Middleware
 * Status-based access control for verified users
 */

import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { eq } from "drizzle-orm";

import { db } from "../config/database.ts";
import { users, VerificationStatuses } from "../db/index.ts";
import { HTTPError } from "../config/error.ts";

// Status messages for users
const STATUS_MESSAGES: Record<string, string> = {
	[VerificationStatuses.DRAFT]:
		"Please complete your profile and submit KYC documents to access this feature.",
	[VerificationStatuses.PAYMENT_VERIFIED]:
		"Please complete your company profile and business verification.",
	[VerificationStatuses.SUBMITTED]:
		"Your documents are being reviewed. This typically takes 1-3 business days.",
	[VerificationStatuses.UNDER_REVIEW]:
		"An admin is currently reviewing your documents. You'll be notified once complete.",
	[VerificationStatuses.REJECTED]:
		"Your verification was not approved. Please check the reason and resubmit your documents.",
	[VerificationStatuses.SUSPENDED]:
		"Your account has been suspended. Please contact support at support@equalio.com",
};

// Redirect paths for each status
const STATUS_REDIRECTS: Record<string, string> = {
	[VerificationStatuses.DRAFT]: "/complete-registration",
	[VerificationStatuses.PAYMENT_VERIFIED]: "/employer/register/company",
	[VerificationStatuses.SUBMITTED]: "/verification-pending",
	[VerificationStatuses.UNDER_REVIEW]: "/verification-pending",
	[VerificationStatuses.REJECTED]: "/verification-rejected",
	[VerificationStatuses.SUSPENDED]: "/account-suspended",
};

/**
 * Allow employer with PAYMENT_VERIFIED or VERIFIED (for company profile & KYC steps)
 */
export function requireEmployerPaymentVerifiedOrVerified() {
	return async (req: Request, res: Response, next: NextFunction) => {
		const userId = req.userId;
		if (!userId) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "Authentication required",
			});
		}
		const [user] = await db
			.select({
				userType: users.userType,
				verificationStatus: users.verificationStatus,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!user || user.userType !== "employer") {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Employer account required",
			});
		}
		if (
			user.verificationStatus !== VerificationStatuses.PAYMENT_VERIFIED &&
			user.verificationStatus !== VerificationStatuses.VERIFIED
		) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Complete registration payment first",
				code: "PAYMENT_REQUIRED",
				redirectTo: "/employer/register/payment",
			});
		}
		next();
	};
}

/**
 * Middleware to require verified users only
 * Use this for sensitive routes: jobs, applications, wallet, etc.
 */
export function requireVerified() {
	return async (req: Request, res: Response, next: NextFunction) => {
		const userId = req.userId;

		if (!userId) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "Authentication required",
			});
		}

		const [user] = await db
			.select({
				verificationStatus: users.verificationStatus,
				rejectedReason: users.rejectedReason,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "User not found",
			});
		}

		if (user.verificationStatus !== VerificationStatuses.VERIFIED) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Verification required",
				code: "VERIFICATION_REQUIRED",
				verificationStatus: user.verificationStatus,
				message: STATUS_MESSAGES[user.verificationStatus],
				redirectTo: STATUS_REDIRECTS[user.verificationStatus],
				...(user.verificationStatus === VerificationStatuses.REJECTED && {
					rejectedReason: user.rejectedReason,
				}),
			});
		}

		next();
	};
}

/**
 * Middleware to allow pending users (DRAFT, SUBMITTED, UNDER_REVIEW)
 * Use this for routes that pending users can access with limited functionality
 */
export function allowPending() {
	return async (req: Request, res: Response, next: NextFunction) => {
		const userId = req.userId;

		if (!userId) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "Authentication required",
			});
		}

		const [user] = await db
			.select({
				verificationStatus: users.verificationStatus,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "User not found",
			});
		}

		// Block suspended users
		if (user.verificationStatus === VerificationStatuses.SUSPENDED) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Account suspended",
				code: "ACCOUNT_SUSPENDED",
				message: STATUS_MESSAGES[VerificationStatuses.SUSPENDED],
			});
		}

		// Attach status to request for downstream checks
		(req as any).verificationStatus = user.verificationStatus;
		next();
	};
}

/**
 * Middleware to require email verification before proceeding
 */
export function requireEmailVerified() {
	return async (req: Request, res: Response, next: NextFunction) => {
		const userId = req.userId;

		if (!userId) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "Authentication required",
			});
		}

		const [user] = await db
			.select({
				emailVerified: users.emailVerified,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			return res.status(StatusCodes.UNAUTHORIZED).json({
				error: "User not found",
			});
		}

		if (!user.emailVerified) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Email verification required",
				code: "EMAIL_NOT_VERIFIED",
				message: "Please verify your email address to continue.",
			});
		}

		next();
	};
}

/**
 * Get verification status helper
 */
export async function getUserVerificationStatus(
	userId: bigint
): Promise<{
	status: string;
	message: string;
	redirectTo: string;
	rejectedReason?: string;
} | null> {
	const [user] = await db
		.select({
			verificationStatus: users.verificationStatus,
			rejectedReason: users.rejectedReason,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) return null;

	return {
		status: user.verificationStatus,
		message: STATUS_MESSAGES[user.verificationStatus] || "",
		redirectTo: STATUS_REDIRECTS[user.verificationStatus] || "/dashboard",
		...(user.verificationStatus === VerificationStatuses.REJECTED && {
			rejectedReason: user.rejectedReason || undefined,
		}),
	};
}

export default {
	requireVerified,
	allowPending,
	requireEmailVerified,
	getUserVerificationStatus,
};
