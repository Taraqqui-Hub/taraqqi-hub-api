/**
 * Admin Audit Logs Routes
 */

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { eq, and, gte, lte, desc, sql, or, like } from "drizzle-orm";

import { db } from "../../config/database.ts";
import { auditLogs, users } from "../../db/index.ts";
import authMiddleware from "../../middleware/authMiddleware.ts";
import { requireAdmin } from "../../middleware/adminMiddleware.ts";
import { requirePermission } from "../../middleware/rbacMiddleware.ts";
import { Permissions } from "../../config/permissions.ts";
import expressAsyncHandler from "../../utils/expressAsyncHandler.ts";

const router = Router();

router.use(authMiddleware());
router.use(requireAdmin());

/**
 * GET /admin/audit-logs
 * Query audit logs
 */
router.get(
	"/",
	requirePermission(Permissions.AUDIT_LOGS_READ),
	expressAsyncHandler(async (req, res) => {
		const {
			action,
			entityType,
			userId,
			startDate,
			endDate,
			limit: limitStr,
			offset: offsetStr,
		} = req.query;

		const limit = Math.min(parseInt(limitStr as string) || 50, 100);
		const offset = parseInt(offsetStr as string) || 0;

		const conditions: any[] = [];

		if (action) {
			conditions.push(eq(auditLogs.action, action as any));
		}
		if (entityType) {
			conditions.push(eq(auditLogs.entityType, entityType as string));
		}
		if (userId) {
			conditions.push(eq(auditLogs.userId, BigInt(userId as string)));
		}
		if (startDate) {
			conditions.push(gte(auditLogs.createdAt, new Date(startDate as string)));
		}
		if (endDate) {
			conditions.push(lte(auditLogs.createdAt, new Date(endDate as string)));
		}

		const logs = await db
			.select({
				id: auditLogs.id,
				action: auditLogs.action,
				entityType: auditLogs.entityType,
				entityId: auditLogs.entityId,
				oldValues: auditLogs.oldValues,
				newValues: auditLogs.newValues,
				description: auditLogs.description,
				ipAddress: auditLogs.ipAddress,
				userId: auditLogs.userId,
				createdAt: auditLogs.createdAt,
				userName: users.name,
			})
			.from(auditLogs)
			.leftJoin(users, eq(auditLogs.userId, users.id))
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(auditLogs.createdAt))
			.limit(limit)
			.offset(offset);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(auditLogs)
			.where(conditions.length > 0 ? and(...conditions) : undefined);

		return res.status(StatusCodes.OK).json({
			logs,
			pagination: {
				total: countResult?.count || 0,
				limit,
				offset,
			},
		});
	})
);

/**
 * GET /admin/audit-logs/export
 * Export audit logs as CSV
 */
router.get(
	"/export",
	requirePermission(Permissions.AUDIT_LOGS_EXPORT),
	expressAsyncHandler(async (req, res) => {
		const { startDate, endDate, entityType, action } = req.query;

		const conditions: any[] = [];

		if (action) {
			conditions.push(eq(auditLogs.action, action as any));
		}
		if (entityType) {
			conditions.push(eq(auditLogs.entityType, entityType as string));
		}
		if (startDate) {
			conditions.push(gte(auditLogs.createdAt, new Date(startDate as string)));
		}
		if (endDate) {
			conditions.push(lte(auditLogs.createdAt, new Date(endDate as string)));
		}

		const logs = await db
			.select({
				id: auditLogs.id,
				action: auditLogs.action,
				entityType: auditLogs.entityType,
				entityId: auditLogs.entityId,
				description: auditLogs.description,
				ipAddress: auditLogs.ipAddress,
				userId: auditLogs.userId,
				createdAt: auditLogs.createdAt,
			})
			.from(auditLogs)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(auditLogs.createdAt))
			.limit(10000);

		// Generate CSV
		const headers = ["ID", "Action", "Entity Type", "Entity ID", "Description", "IP", "User ID", "Date"];
		const rows = logs.map((log) => [
			log.id.toString(),
			log.action,
			log.entityType,
			log.entityId?.toString() || "",
			log.description || "",
			log.ipAddress || "",
			log.userId?.toString() || "",
			log.createdAt?.toISOString() || "",
		]);

		const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");

		res.setHeader("Content-Type", "text/csv");
		res.setHeader("Content-Disposition", `attachment; filename=audit-logs-${Date.now()}.csv`);
		return res.send(csv);
	})
);

export default router;
