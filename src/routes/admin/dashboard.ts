/**
 * Admin Dashboard Routes
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { eq, sql, and, isNull, gte } from "drizzle-orm";

import { db } from "../../config/database.ts";
import {
	users,
	UserTypes,
	jobs,
	applications,
	transactions,
	kycRecords,
	KycStatuses,
	employerProfiles,
} from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireAdmin } from "../../middleware/adminMiddleware.ts";
import { requirePermission } from "../../middleware/rbacMiddleware.ts";
import { Permissions } from "../../config/permissions.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";

const router = Router();

// Apply admin middleware to all routes
router.use(authMiddleware());
router.use(requireAdmin());

/**
 * GET /admin/dashboard
 * Get dashboard metrics
 */
router.get(
	"/dashboard",
	requirePermission(Permissions.ADMIN_DASHBOARD),
	expressAsyncHandler(async (req, res) => {
		// Get date ranges
		const now = new Date();
		// Ensure this is strictly a string passed to the query
		const startOfMonth = `\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}-01`;
		console.log("Dashboard startOfMonth:", startOfMonth, typeof startOfMonth);

		// User counts (individual = jobseekers / non-employer users)
		const [userCounts] = await db
			.select({
				total: sql<number>`count(*)::int`,
				employers: sql<number>`count(*) filter (where ${users.userType} = 'employer')::int`,
				jobseekers: sql<number>`count(*) filter (where ${users.userType} = 'individual')::int`,
				admins: sql<number>`count(*) filter (where ${users.userType} in ('admin', 'super_admin'))::int`,
				thisMonth: sql<number>`count(*) filter (where ${users.createdAt} >= ${startOfMonth})::int`,
			})
			.from(users)
			.where(isNull(users.deletedAt));

		// Job counts
		const [jobCounts] = await db
			.select({
				total: sql<number>`count(*)::int`,
				active: sql<number>`count(*) filter (where ${jobs.status} = 'active')::int`,
				draft: sql<number>`count(*) filter (where ${jobs.status} = 'draft')::int`,
				thisMonth: sql<number>`count(*) filter (where ${jobs.createdAt} >= ${startOfMonth})::int`,
			})
			.from(jobs)
			.where(isNull(jobs.deletedAt));

		// Application counts
		const [applicationCounts] = await db
			.select({
				total: sql<number>`count(*)::int`,
				pending: sql<number>`count(*) filter (where ${applications.status} = 'pending')::int`,
				hired: sql<number>`count(*) filter (where ${applications.status} = 'hired')::int`,
				thisMonth: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${startOfMonth})::int`,
			})
			.from(applications)
			.where(isNull(applications.deletedAt));

		// Revenue (total credits added)
		const [revenue] = await db
			.select({
				total: sql<number>`coalesce(sum(${transactions.amount})::bigint, 0)`,
				thisMonth: sql<number>`coalesce(sum(case when ${transactions.createdAt} >= ${startOfMonth} then ${transactions.amount} else 0 end)::bigint, 0)`,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.type, "credit"),
					eq(transactions.status, "completed")
				)
			);

		// Pending items
		const [pendingKyc] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(kycRecords)
			.where(
				and(
					eq(kycRecords.status, KycStatuses.PENDING),
					isNull(kycRecords.deletedAt)
				)
			);

		const [pendingEmployers] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(employerProfiles)
			.where(
				and(
					eq(employerProfiles.isVerified, false),
					isNull(employerProfiles.deletedAt)
				)
			);

		return res.status(StatusCodes.OK).json({
			users: {
				total: userCounts?.total || 0,
				employers: userCounts?.employers || 0,
				jobseekers: userCounts?.jobseekers || 0,
				admins: userCounts?.admins || 0,
				newThisMonth: userCounts?.thisMonth || 0,
			},
			jobs: {
				total: jobCounts?.total || 0,
				active: jobCounts?.active || 0,
				draft: jobCounts?.draft || 0,
				newThisMonth: jobCounts?.thisMonth || 0,
			},
			applications: {
				total: applicationCounts?.total || 0,
				pending: applicationCounts?.pending || 0,
				hired: applicationCounts?.hired || 0,
				newThisMonth: applicationCounts?.thisMonth || 0,
			},
			revenue: {
				totalInRupees: Number(revenue?.total || 0) / 100,
				thisMonthInRupees: Number(revenue?.thisMonth || 0) / 100,
			},
			pending: {
				kyc: pendingKyc?.count || 0,
				employers: pendingEmployers?.count || 0,
			},
		});
	})
);

export default router;
