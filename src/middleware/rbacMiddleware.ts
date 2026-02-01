import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { HTTPError } from "../config/error.ts";
import { Permission } from "../config/permissions.ts";
import {
	getUserPermissions,
	hasAnyPermission,
	hasAllPermissions,
} from "../services/permissionService.ts";

/**
 * RBAC Middleware - Requires user to have AT LEAST ONE of the specified permissions
 *
 * @example
 * // Single permission
 * router.post('/jobs', authMiddleware(), requirePermission(Permissions.JOBS_CREATE), handler);
 *
 * // Multiple permissions (OR logic - user needs ANY one)
 * router.get('/jobs/:id', authMiddleware(), requirePermission(Permissions.JOBS_READ, Permissions.JOBS_READ_OWN), handler);
 */
export const requirePermission = (...requiredPermissions: Permission[]) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const userId = req.userId;

			if (!userId) {
				return next(
					new HTTPError({
						httpStatus: StatusCodes.UNAUTHORIZED,
						message: "Authentication required",
					})
				);
			}

			// Check if user has any of the required permissions
			const hasAccess = await hasAnyPermission(userId, requiredPermissions);

			if (!hasAccess) {
				return next(
					new HTTPError({
						httpStatus: StatusCodes.FORBIDDEN,
						message: "Insufficient permissions",
						reason: {
							required: requiredPermissions,
							message: "You do not have permission to perform this action",
						},
					})
				);
			}

			next();
		} catch (error) {
			console.error("RBAC middleware error:", error);
			return next(
				new HTTPError({
					httpStatus: StatusCodes.INTERNAL_SERVER_ERROR,
					message: "Permission check failed",
				})
			);
		}
	};
};

/**
 * RBAC Middleware - Requires user to have ALL of the specified permissions
 *
 * @example
 * router.delete('/users/:id', authMiddleware(), requireAllPermissions(Permissions.USERS_DELETE, Permissions.USERS_READ), handler);
 */
export const requireAllPermissions = (...requiredPermissions: Permission[]) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const userId = req.userId;

			if (!userId) {
				return next(
					new HTTPError({
						httpStatus: StatusCodes.UNAUTHORIZED,
						message: "Authentication required",
					})
				);
			}

			// Check if user has all required permissions
			const hasAccess = await hasAllPermissions(userId, requiredPermissions);

			if (!hasAccess) {
				return next(
					new HTTPError({
						httpStatus: StatusCodes.FORBIDDEN,
						message: "Insufficient permissions",
						reason: {
							required: requiredPermissions,
							message: "You do not have all required permissions",
						},
					})
				);
			}

			next();
		} catch (error) {
			console.error("RBAC middleware error:", error);
			return next(
				new HTTPError({
					httpStatus: StatusCodes.INTERNAL_SERVER_ERROR,
					message: "Permission check failed",
				})
			);
		}
	};
};

/**
 * Middleware to attach user permissions to request object
 * Useful when you need to check permissions in the handler
 *
 * @example
 * router.get('/dashboard', authMiddleware(), attachPermissions(), handler);
 * // In handler: req.userPermissions contains all user permissions
 */
export const attachPermissions = () => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const userId = req.userId;

			if (userId) {
				req.userPermissions = await getUserPermissions(userId);
			}

			next();
		} catch (error) {
			console.error("Attach permissions error:", error);
			next();
		}
	};
};

export default {
	requirePermission,
	requireAllPermissions,
	attachPermissions,
};
