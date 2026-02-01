import { bigint, bigserial, pgTable, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users.ts";
import { roles } from "./roles.ts";

export const userRoles = pgTable(
	"user_roles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		roleId: bigint("role_id", { mode: "bigint" })
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		assignedBy: bigint("assigned_by", { mode: "bigint" }).references(
			() => users.id,
			{ onDelete: "set null" }
		),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userRoleUnique: unique("uq_user_roles").on(table.userId, table.roleId),
	})
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
