import { default as jwt, JwtPayload } from "jsonwebtoken";

const { sign: jwtSign, verify: jwtVerify } = jwt;

// Token types
export enum TokenType {
	ACCESS = "access",
	REFRESH = "refresh",
}

// Token configuration
export const TOKEN_CONFIG = {
	ACCESS_TOKEN_EXPIRY: 15 * 60, // 15 minutes
	REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60, // 7 days
	REFRESH_TOKEN_COOKIE_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

/**
 * Enhanced token payload with role and permissions
 */
export interface TokenPayload extends JwtPayload {
	id: string;
	uuid: string;
	type: TokenType;
	userType: "jobseeker" | "employer" | "admin";
	permissions: string[];
	tokenId?: string; // For refresh tokens
}

/**
 * Data needed to create tokens
 */
export interface TokenUserData {
	id: string;
	uuid: string;
	userType: "jobseeker" | "employer" | "admin";
	permissions: string[];
}

export const createJWT = (payload: object, expiresIn: number): Promise<string> =>
	new Promise((resolve, reject) =>
		jwtSign(
			payload,
			process.env.JWT_SECRET as string,
			{
				algorithm: "HS256",
				expiresIn,
			},
			(err, token) => (err ? reject(err) : resolve(token as string))
		)
	);

export const verifyJWT = (token: string): Promise<TokenPayload> =>
	new Promise((resolve, reject) =>
		jwtVerify(
			token,
			process.env.JWT_SECRET as string,
			{
				algorithms: ["HS256"],
			},
			(err, decoded) =>
				err ? reject(err) : resolve(decoded as TokenPayload)
		)
	);

/**
 * Create an access token with user data and permissions
 */
export const createAccessToken = (userData: TokenUserData): Promise<string> => {
	const payload: Partial<TokenPayload> = {
		id: userData.id,
		uuid: userData.uuid,
		type: TokenType.ACCESS,
		userType: userData.userType,
		permissions: userData.permissions,
	};
	return createJWT(payload, TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY);
};

/**
 * Create a refresh token
 */
export const createRefreshToken = (
	userData: TokenUserData,
	tokenId: string
): Promise<string> => {
	const payload: Partial<TokenPayload> = {
		id: userData.id,
		uuid: userData.uuid,
		type: TokenType.REFRESH,
		userType: userData.userType,
		permissions: userData.permissions,
		tokenId,
	};
	return createJWT(payload, TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY);
};

/**
 * Verify an access token
 */
export const verifyAccessToken = async (
	token: string
): Promise<TokenPayload> => {
	const payload = await verifyJWT(token);
	if (payload.type !== TokenType.ACCESS) {
		throw new Error("Invalid token type");
	}
	return payload;
};

/**
 * Verify a refresh token
 */
export const verifyRefreshToken = async (
	token: string
): Promise<TokenPayload> => {
	const payload = await verifyJWT(token);
	if (payload.type !== TokenType.REFRESH) {
		throw new Error("Invalid token type");
	}
	return payload;
};

/**
 * Decode token without verification (for debugging)
 */
export const decodeToken = (token: string): TokenPayload | null => {
	try {
		return jwt.decode(token) as TokenPayload;
	} catch {
		return null;
	}
};
