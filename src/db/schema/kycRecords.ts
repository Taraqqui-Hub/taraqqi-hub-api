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

// KYC status enum
export enum KycStatuses {
	PENDING = "pending",
	UNDER_REVIEW = "under_review",
	APPROVED = "approved",
	REJECTED = "rejected",
}

export const kycStatusEnum = pgEnum("kyc_status", [
	"pending",
	"under_review",
	"approved",
	"rejected",
]);

// KYC document type enum
export enum KycDocumentTypes {
	// Personal documents
	AADHAAR = "aadhaar",
	PAN = "pan",
	PASSPORT = "passport",
	DRIVING_LICENSE = "driving_license",
	VOTER_ID = "voter_id",
	// Business documents
	GST_CERTIFICATE = "gst_certificate",
	MSME_SHOP_ACT = "msme_shop_act",
	CIN = "cin", // Company Identification Number
	AUTHORIZED_ID = "authorized_id", // Authorized signatory ID
}

export const kycDocumentTypeEnum = pgEnum("kyc_document_type", [
	"aadhaar",
	"pan",
	"passport",
	"driving_license",
	"voter_id",
	"gst_certificate",
	"msme_shop_act",
	"cin",
	"authorized_id",
]);

export const kycRecords = pgTable(
	"kyc_records",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		userId: bigint("user_id", { mode: "bigint" })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Document Info
		documentType: kycDocumentTypeEnum("document_type").notNull(),
		documentNumber: text("document_number").notNull(), // Plain for backward compat
		documentLast4: text("document_last4"), // Last 4 digits for display
		documentHash: text("document_hash"), // Encrypted/hashed version

		// Document URLs (Cloudinary)
		documentUrl: text("document_url").notNull(), // Front of document
		documentBackUrl: text("document_back_url"), // Back of document (if applicable)
		selfieUrl: text("selfie_url"), // Selfie holding document

		// Verification
		status: kycStatusEnum("status").notNull().default(KycStatuses.PENDING),
		rejectionReason: text("rejection_reason"),
		verifiedAt: timestamp("verified_at", { mode: "date" }),
		verifiedBy: bigint("verified_by", { mode: "bigint" }).references(
			() => users.id,
			{ onDelete: "set null" }
		),

		// Expiry (for documents like passport)
		expiresAt: timestamp("expires_at", { mode: "date" }),

		// Timestamps
		createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { mode: "date" }),
	},
	(table) => ({
		userIdIdx: index("idx_kyc_records_user_id").on(table.userId),
		statusIdx: index("idx_kyc_records_status").on(table.status),
		documentTypeIdx: index("idx_kyc_records_document_type").on(table.documentType),
		deletedAtIdx: index("idx_kyc_records_deleted_at").on(table.deletedAt),
	})
);

export type KycRecord = typeof kycRecords.$inferSelect;
export type NewKycRecord = typeof kycRecords.$inferInsert;
