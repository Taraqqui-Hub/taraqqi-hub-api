import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { db } from "../config/database.ts";
import { HTTPError } from "../config/error.ts";
import { users, UserTypes } from "../db/index.ts";
import { TokenType, verifyAccessToken } from "../utils/jwt.ts";

const authMiddlewareCreator =
	(userTypesAllowed: UserTypes[] = []) =>
	async (req: Request, res: Response, next: NextFunction) => {
		const UnauthorizedError = new HTTPError({
			httpStatus: StatusCodes.UNAUTHORIZED,
		});
		const ForbiddenError = new HTTPError({
			httpStatus: StatusCodes.FORBIDDEN,
		});

		// Try to get token from Authorization header first, then fallback to cookies
		let authToken: string | undefined;

		const authHeader = req.headers.authorization;
		if (authHeader && authHeader.startsWith("Bearer ")) {
			authToken = authHeader.split(" ")[1];
		} else {
			authToken = req.cookies.auth;
		}

		if (!authToken) return next(UnauthorizedError);

		try {
			// Verify access token
			const payload = await verifyAccessToken(authToken);

			if (payload.type !== TokenType.ACCESS) {
				throw new Error("Invalid token type");
			}

			const userId = BigInt(payload.id);
			const result = await db
				.select({
					userType: users.userType,
				})
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			if (!result.length) {
				console.log("🔴 Someone is trying to hack us!!!");
				throw UnauthorizedError;
			}

			// Check user type permissions
			const userType = result[0].userType as UserTypes;
			if (userTypesAllowed.length && !userTypesAllowed.includes(userType))
				return next(ForbiddenError);

			req.userId = userId;
			return next();
		} catch (error) {
			console.log("Auth middleware error:", error);
			return next(UnauthorizedError);
		}
	};

export default authMiddlewareCreator;
