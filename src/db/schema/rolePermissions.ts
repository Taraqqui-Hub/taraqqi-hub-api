import { bigint, bigserial, pgTable, timestamp, unique } from "drizzle-orm/pg-core";
import { roles } from "./roles.ts";
import { permissions } from "./permissions.ts";

export const rolePermissions = pgTable(
	"role_permissions",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		roleId: bigint("role_id", { mode: "bigint" })
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		permissionId: bigint("permission_id", { mode: "bigint" })
			.notNull()
			.references(() => permissions.id, { onDelete: "cascade" }),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		rolePermissionUnique: unique("uq_role_permissions").on(
			table.roleId,
			table.permissionId
		),
	})
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
