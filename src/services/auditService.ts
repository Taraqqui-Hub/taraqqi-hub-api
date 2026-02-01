import { db } from "../config/database.ts";
import { auditLogs, AuditActions } from "../db/index.ts";

/**
 * Context for audit logging
 */
export interface AuditContext {
	userId?: bigint;
	userEmail?: string;
	userType?: string;
	ipAddress?: string;
	userAgent?: string;
	requestId?: string;
}

/**
 * Audit log entry data
 */
export interface AuditLogEntry {
	action: (typeof AuditActions)[keyof typeof AuditActions];
	entityType: string;
	entityId?: bigint;
	oldValues?: Record<string, unknown>;
	newValues?: Record<string, unknown>;
	description?: string;
	context: AuditContext;
}

/**
 * Create an audit log entry
 *
 * @example
 * await auditLog({
 *   action: AuditActions.CREATE,
 *   entityType: 'job',
 *   entityId: job.id,
 *   newValues: { title: job.title, status: job.status },
 *   description: 'Created new job posting',
 *   context: {
 *     userId: req.userId,
 *     ipAddress: req.clientIp,
 *     userAgent: req.userAgent,
 *     requestId: req.requestId,
 *   },
 * });
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
	try {
		await db.insert(auditLogs).values({
			userId: entry.context.userId || null,
			userEmail: entry.context.userEmail || null,
			userType: entry.context.userType || null,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId || null,
			oldValues: entry.oldValues || null,
			newValues: entry.newValues || null,
			description: entry.description || null,
			ipAddress: entry.context.ipAddress || null,
			userAgent: entry.context.userAgent || null,
			requestId: entry.context.requestId || null,
		});
	} catch (error) {
		// Log error but don't throw - audit logging should not break the main flow
		console.error("[AuditService] Failed to create audit log:", error);
	}
}

/**
 * Create an audit log for entity creation
 */
export async function auditCreate(
	entityType: string,
	entityId: bigint,
	newValues: Record<string, unknown>,
	context: AuditContext,
	description?: string
): Promise<void> {
	await auditLog({
		action: AuditActions.CREATE,
		entityType,
		entityId,
		newValues,
		description: description || `Created ${entityType}`,
		context,
	});
}

/**
 * Create an audit log for entity update
 */
export async function auditUpdate(
	entityType: string,
	entityId: bigint,
	oldValues: Record<string, unknown>,
	newValues: Record<string, unknown>,
	context: AuditContext,
	description?: string
): Promise<void> {
	await auditLog({
		action: AuditActions.UPDATE,
		entityType,
		entityId,
		oldValues,
		newValues,
		description: description || `Updated ${entityType}`,
		context,
	});
}

/**
 * Create an audit log for entity deletion
 */
export async function auditDelete(
	entityType: string,
	entityId: bigint,
	oldValues: Record<string, unknown>,
	context: AuditContext,
	description?: string
): Promise<void> {
	await auditLog({
		action: AuditActions.DELETE,
		entityType,
		entityId,
		oldValues,
		description: description || `Deleted ${entityType}`,
		context,
	});
}

/**
 * Create an audit log for user login
 */
export async function auditLogin(
	userId: bigint,
	userEmail: string,
	context: Omit<AuditContext, "userId" | "userEmail">
): Promise<void> {
	await auditLog({
		action: AuditActions.LOGIN,
		entityType: "user",
		entityId: userId,
		description: "User logged in",
		context: {
			...context,
			userId,
			userEmail,
		},
	});
}

/**
 * Create an audit log for user logout
 */
export async function auditLogout(
	userId: bigint,
	userEmail: string,
	context: Omit<AuditContext, "userId" | "userEmail">
): Promise<void> {
	await auditLog({
		action: AuditActions.LOGOUT,
		entityType: "user",
		entityId: userId,
		description: "User logged out",
		context: {
			...context,
			userId,
			userEmail,
		},
	});
}

/**
 * Create an audit log for approval actions
 */
export async function auditApprove(
	entityType: string,
	entityId: bigint,
	context: AuditContext,
	description?: string
): Promise<void> {
	await auditLog({
		action: AuditActions.APPROVE,
		entityType,
		entityId,
		description: description || `Approved ${entityType}`,
		context,
	});
}

/**
 * Create an audit log for rejection actions
 */
export async function auditReject(
	entityType: string,
	entityId: bigint,
	context: AuditContext,
	reason?: string
): Promise<void> {
	await auditLog({
		action: AuditActions.REJECT,
		entityType,
		entityId,
		newValues: reason ? { reason } : undefined,
		description: `Rejected ${entityType}`,
		context,
	});
}

export default {
	auditLog,
	auditCreate,
	auditUpdate,
	auditDelete,
	auditLogin,
	auditLogout,
	auditApprove,
	auditReject,
};
