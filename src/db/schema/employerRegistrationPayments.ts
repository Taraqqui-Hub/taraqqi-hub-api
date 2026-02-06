import {
	bigint,
	bigserial,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.ts";

export const employerPaymentStatusEnum = pgEnum("employer_payment_status", [
	"pending",
	"completed",
	"failed",
	"refunded",
]);

export const employerRegistrationPayments = pgTable(
	"employer_registration_payments",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		amountPaise: bigint("amount_paise", { mode: "bigint" }).notNull(),
		currency: text("currency").notNull().default("INR"),
		status: employerPaymentStatusEnum("status")
			.notNull()
			.default("completed"),

		paymentGatewayRef: text("payment_gateway_ref"),
		metadata: text("metadata"),

		paidAt: timestamp("paid_at", { mode: "date" }).defaultNow().notNull(),
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
	},
	(table) => ({
		userIdIdx: index("idx_employer_reg_payments_user_id").on(table.userId),
		statusIdx: index("idx_employer_reg_payments_status").on(table.status),
	})
);

export type EmployerRegistrationPayment =
	typeof employerRegistrationPayments.$inferSelect;
export type NewEmployerRegistrationPayment =
	typeof employerRegistrationPayments.$inferInsert;
