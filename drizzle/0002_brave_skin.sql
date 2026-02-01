CREATE TYPE "public"."verification_status" AS ENUM('draft', 'submitted', 'under_review', 'verified', 'rejected', 'suspended');--> statement-breakpoint
ALTER TYPE "public"."kyc_document_type" ADD VALUE 'cin';--> statement-breakpoint
ALTER TYPE "public"."kyc_document_type" ADD VALUE 'authorized_id';--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"identifier_type" text DEFAULT 'email' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kyc_records" ADD COLUMN "document_number_encrypted" text;--> statement-breakpoint
ALTER TABLE "kyc_records" ADD COLUMN "selfie_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_status" "verification_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rejected_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp;--> statement-breakpoint
CREATE INDEX "idx_login_attempts_identifier" ON "login_attempts" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_locked_until" ON "login_attempts" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "idx_users_verification_status" ON "users" USING btree ("verification_status");