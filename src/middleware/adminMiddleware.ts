/**
 * Admin Middleware
 * Restricts access to ADMIN and SUPER_ADMIN users
 * Super admin has higher privileges and can manage admin accounts
 */

import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { UserTypes } from "../db/index.ts";

/**
 * Require ADMIN or SUPER_ADMIN user type
 * Both admin and super_admin can access admin panel
 */
export function requireAdmin() {
	return (req: Request, res: Response, next: NextFunction) => {
		const userType = req.userType;

		if (!userType || (userType !== UserTypes.ADMIN && userType !== UserTypes.SUPER_ADMIN)) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Admin access required",
				code: "ADMIN_ACCESS_REQUIRED",
			});
		}

		next();
	};
}

/**
 * Require SUPER_ADMIN user type only
 * Only super admins can create/manage admin accounts
 */
export function requireSuperAdmin() {
	return (req: Request, res: Response, next: NextFunction) => {
		const userType = req.userType;

		if (!userType || userType !== UserTypes.SUPER_ADMIN) {
			return res.status(StatusCodes.FORBIDDEN).json({
				error: "Super admin access required",
				code: "SUPER_ADMIN_ACCESS_REQUIRED",
			});
		}

		next();
	};
}

export default {
	requireAdmin,
	requireSuperAdmin,
};
