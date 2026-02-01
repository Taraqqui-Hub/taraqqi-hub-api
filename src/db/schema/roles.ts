import {
	bigserial,
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const roles = pgTable(
	"roles",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		isSystem: boolean("is_system").notNull().default(false),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		nameIdx: uniqueIndex("idx_roles_name").on(table.name),
		deletedAtIdx: index("idx_roles_deleted_at").on(table.deletedAt),
	})
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
