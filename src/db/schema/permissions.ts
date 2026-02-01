import {
	bigserial,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const permissions = pgTable(
	"permissions",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		name: text("name").notNull(),
		resource: text("resource").notNull(),
		action: text("action").notNull(),
		description: text("description"),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		nameIdx: uniqueIndex("idx_permissions_name").on(table.name),
		resourceIdx: index("idx_permissions_resource").on(table.resource),
		actionIdx: index("idx_permissions_action").on(table.action),
		resourceActionIdx: index("idx_permissions_resource_action").on(
			table.resource,
			table.action
		),
	})
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
