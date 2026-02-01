import { and, eq, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { db } from "../../config/database.ts";
import { refreshTokens, users } from "../../db/index.ts";
import { Service } from "../index.ts";
import {
	createAccessToken,
	createRefreshToken,
	TOKEN_CONFIG,
	verifyRefreshToken,
	TokenUserData,
} from "../../utils/jwt.ts";
import { getUserPermissions } from "../permissionService.ts";

// Validation schemas
export const CreateRefreshTokenDataSchema = z.object({
	userId: z.string(),
	deviceInfo: z.string().optional(),
	ipAddress: z.string().optional(),
});

export const RefreshTokenDataSchema = z.object({
	refreshToken: z.string().min(1, "Refresh token is required"),
});

// Type definitions
export interface CreateRefreshTokenData {
	userId: string;
	deviceInfo?: string;
	ipAddress?: string;
}

export interface RefreshTokenData {
	refreshToken: string;
}

export interface TokenPair {
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresIn: number;
	refreshTokenExpiresIn: number;
}

/**
 * Helper to get user data for token creation
 */
async function getTokenUserData(userId: bigint): Promise<TokenUserData> {
	const [user] = await db
		.select({
			id: users.id,
			uuid: users.uuid,
			userType: users.userType,
		})
		.from(users)
		.where(and(eq(users.id, userId), isNull(users.deletedAt)))
		.limit(1);

	if (!user) {
		throw new Error("User not found");
	}

	const permissions = await getUserPermissions(userId);

	return {
		id: user.id.toString(),
		uuid: user.uuid,
		userType: user.userType as "jobseeker" | "employer" | "admin",
		permissions,
	};
}

// Create refresh token service
export class CreateRefreshTokenService extends Service<
	CreateRefreshTokenData,
	TokenPair
> {
	async handle(): Promise<TokenPair> {
		const tokenId = uuidv4();
		const expiresAt = new Date(
			Date.now() + TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY * 1000
		);
		const userId = BigInt(this.data.userId);

		// Get user data for token
		const userData = await getTokenUserData(userId);

		// Create refresh token record in database
		await db.insert(refreshTokens).values({
			id: tokenId,
			userId,
			token: tokenId,
			expiresAt,
			deviceInfo: this.data.deviceInfo || null,
			ipAddress: this.data.ipAddress || null,
			isActive: true,
		});

		// Generate JWT tokens with full user data
		const accessToken = await createAccessToken(userData);
		const refreshToken = await createRefreshToken(userData, tokenId);

		return {
			accessToken,
			refreshToken,
			accessTokenExpiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY,
			refreshTokenExpiresIn: TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY,
		};
	}
}

// Refresh access token service
export class RefreshAccessTokenService extends Service<
	RefreshTokenData,
	{ accessToken: string; accessTokenExpiresIn: number }
> {
	async handle(): Promise<{
		accessToken: string;
		accessTokenExpiresIn: number;
	}> {
		// Verify the refresh token JWT
		const payload = await verifyRefreshToken(this.data.refreshToken);

		// Check if refresh token exists and is active in database
		const [tokenRecord] = await db
			.select()
			.from(refreshTokens)
			.where(
				and(
					eq(refreshTokens.id, payload.tokenId!),
					eq(refreshTokens.isActive, true)
				)
			);

		if (!tokenRecord) {
			throw new Error("Invalid or expired refresh token");
		}

		// Check if token has expired
		if (tokenRecord.expiresAt < new Date()) {
			// Mark token as inactive
			await db
				.update(refreshTokens)
				.set({ isActive: false })
				.where(eq(refreshTokens.id, payload.tokenId!));

			throw new Error("Refresh token has expired");
		}

		// Update last used timestamp
		await db
			.update(refreshTokens)
			.set({ lastUsedAt: new Date() })
			.where(eq(refreshTokens.id, payload.tokenId!));

		// Get fresh user data (permissions might have changed)
		const userData = await getTokenUserData(tokenRecord.userId);

		// Generate new access token with fresh permissions
		const accessToken = await createAccessToken(userData);

		return {
			accessToken,
			accessTokenExpiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY,
		};
	}
}

// Revoke refresh token service
export class RevokeRefreshTokenService extends Service<
	RefreshTokenData,
	boolean
> {
	async handle(): Promise<boolean> {
		try {
			// Verify the refresh token JWT to get the token ID
			const payload = await verifyRefreshToken(this.data.refreshToken);

			// Mark token as inactive in database
			const result = await db
				.update(refreshTokens)
				.set({ isActive: false })
				.where(eq(refreshTokens.id, payload.tokenId!))
				.returning({ id: refreshTokens.id });

			return result.length > 0;
		} catch (error) {
			// If token is invalid, consider it already revoked
			return false;
		}
	}
}

// Revoke all refresh tokens service
export class RevokeAllRefreshTokensService extends Service<
	{ userId: string },
	boolean
> {
	async handle(): Promise<boolean> {
		// Mark all user's refresh tokens as inactive
		const result = await db
			.update(refreshTokens)
			.set({ isActive: false })
			.where(eq(refreshTokens.userId, BigInt(this.data.userId)))
			.returning({ id: refreshTokens.id });

		return result.length > 0;
	}
}
