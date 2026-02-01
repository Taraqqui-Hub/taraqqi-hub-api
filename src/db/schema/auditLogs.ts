import {
	bigint,
	bigserial,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

// Audit action enum
export enum AuditActions {
	CREATE = "create",
	UPDATE = "update",
	DELETE = "delete",
	LOGIN = "login",
	LOGOUT = "logout",
	APPROVE = "approve",
	REJECT = "reject",
	EXPORT = "export",
}

export const auditActionEnum = pgEnum("audit_action", [
	"create",
	"update",
	"delete",
	"login",
	"logout",
	"approve",
	"reject",
	"export",
]);

export const auditLogs = pgTable(
	"audit_logs",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),

		// Who
		userId: bigint("user_id", { mode: "bigint" }).references(() => users.id, {
			onDelete: "set null",
		}),
		userEmail: text("user_email"),
		userType: text("user_type"),

		// What
		action: auditActionEnum("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: bigint("entity_id", { mode: "bigint" }),

		// Details
		oldValues: jsonb("old_values"),
		newValues: jsonb("new_values"),
		description: text("description"),

		// Context
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		requestId: text("request_id"),

		// Timestamps (no soft delete - audit logs are immutable)
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_audit_logs_user_id").on(table.userId),
		entityTypeIdx: index("idx_audit_logs_entity_type").on(table.entityType),
		entityIdIdx: index("idx_audit_logs_entity_id").on(table.entityId),
		actionIdx: index("idx_audit_logs_action").on(table.action),
		createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
		entityTypeIdIdx: index("idx_audit_logs_entity_type_id").on(
			table.entityType,
			table.entityId
		),
	})
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
