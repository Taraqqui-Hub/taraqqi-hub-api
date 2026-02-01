/**
 * Admin Middleware
 * Restricts access to ADMIN users only
 */

import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { UserTypes } from "../db/index.ts";

/**
 * Require ADMIN user type
 */
export function requireAdmin() {
	return (req: Request, res: Response, next: NextFunction) => {
		const userType = (req as any).userType;

		if (!userType || userType !== UserTypes.ADMIN) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Admin access required",
				code: "ADMIN_ACCESS_REQUIRED",
			});
		}

		next();
	};
}

/**
 * Require ADMIN user type (alias for super admin check)
 * Since we removed super_admin, this is the same as requireAdmin
 */
export function requireSuperAdmin() {
	return requireAdmin();
}

export default {
	requireAdmin,
	requireSuperAdmin,
};
