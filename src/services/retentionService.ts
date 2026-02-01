/**
 * Retention Policy Service
 * Handles data retention and cleanup
 */

import { eq, and, lt, isNull, sql } from "drizzle-orm";
import { db } from "../config/database.ts";
import { kycRecords, auditLogs } from "../db/index.ts";
import { addCleanupJob } from "./queueService.ts";

// ============================================
// Retention Configuration
// ============================================

export const RetentionConfig = {
	// KYC documents: 90 days after approval/rejection
	KYC_DOCUMENTS_DAYS: parseInt(process.env.RETENTION_KYC_DAYS || "90"),

	// Audit logs: 2 years
	AUDIT_LOGS_DAYS: parseInt(process.env.RETENTION_AUDIT_DAYS || "730"),

	// Sessions: 30 days of inactivity
	SESSIONS_DAYS: parseInt(process.env.RETENTION_SESSIONS_DAYS || "30"),
};

// ============================================
// Manual Cleanup Functions
// ============================================

/**
 * Clean up old KYC documents
 * Only deletes verified/rejected KYC older than retention period
 */
export async function cleanupKycDocuments(): Promise<number> {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - RetentionConfig.KYC_DOCUMENTS_DAYS);

	// Get records to delete (for logging)
	const toDelete = await db
		.select({ id: kycRecords.id, userId: kycRecords.userId })
		.from(kycRecords)
		.where(
			and(
				lt(kycRecords.updatedAt, cutoffDate),
				// Only delete approved/rejected, not pending
				sql`${kycRecords.status} in ('approved', 'rejected')`
			)
		);

	if (toDelete.length === 0) {
		return 0;
	}

	// Soft delete (set deletedAt)
	await db
		.update(kycRecords)
		.set({ deletedAt: new Date() })
		.where(
			and(
				lt(kycRecords.updatedAt, cutoffDate),
				sql`${kycRecords.status} in ('approved', 'rejected')`,
				isNull(kycRecords.deletedAt)
			)
		);

	console.log(`[Retention] Soft-deleted ${toDelete.length} KYC records`);
	return toDelete.length;
}

/**
 * Archive old audit logs
 * Moves to archive table or marks for cold storage
 */
export async function archiveAuditLogs(): Promise<number> {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - RetentionConfig.AUDIT_LOGS_DAYS);

	// Count logs to archive
	const [countResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(auditLogs)
		.where(lt(auditLogs.createdAt, cutoffDate));

	const count = countResult?.count || 0;

	if (count > 0) {
		// In production: move to archive table or cold storage
		// For now, just log
		console.log(`[Retention] ${count} audit logs ready for archival`);
	}

	return count;
}

// ============================================
// Schedule Cleanup Jobs
// ============================================

export async function scheduleCleanupJobs(): Promise<void> {
	// Schedule KYC cleanup
	await addCleanupJob({
		type: "kyc",
		olderThanDays: RetentionConfig.KYC_DOCUMENTS_DAYS,
	});

	// Schedule audit log archival
	await addCleanupJob({
		type: "audit_logs",
		olderThanDays: RetentionConfig.AUDIT_LOGS_DAYS,
	});

	// Schedule session cleanup
	await addCleanupJob({
		type: "sessions",
		olderThanDays: RetentionConfig.SESSIONS_DAYS,
	});

	console.log("[Retention] Cleanup jobs scheduled");
}

// ============================================
// Get Retention Info (for admin)
// ============================================

export function getRetentionPolicy() {
	return {
		kycDocuments: {
			retentionDays: RetentionConfig.KYC_DOCUMENTS_DAYS,
			description: "KYC documents are retained for verification purposes",
		},
		auditLogs: {
			retentionDays: RetentionConfig.AUDIT_LOGS_DAYS,
			description: "Audit logs are retained for compliance",
		},
		sessions: {
			retentionDays: RetentionConfig.SESSIONS_DAYS,
			description: "Inactive sessions are cleaned up",
		},
	};
}

export default {
	cleanupKycDocuments,
	archiveAuditLogs,
	scheduleCleanupJobs,
	getRetentionPolicy,
	RetentionConfig,
};
