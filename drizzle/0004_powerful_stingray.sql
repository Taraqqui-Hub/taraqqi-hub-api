CREATE TYPE "public"."employer_payment_status" AS ENUM('pending', 'completed', 'failed', 'refunded');--> statement-breakpoint
ALTER TYPE "public"."kyc_document_type" ADD VALUE 'msme_shop_act' BEFORE 'cin';--> statement-breakpoint
ALTER TYPE "public"."transaction_category" ADD VALUE 'registration_fee' BEFORE 'job_post_fee';--> statement-breakpoint
ALTER TYPE "public"."transaction_category" ADD VALUE 'job_promotion' BEFORE 'featured_job_fee';--> statement-breakpoint
ALTER TYPE "public"."verification_status" ADD VALUE 'payment_verified' BEFORE 'submitted';--> statement-breakpoint
CREATE TABLE "employer_registration_payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "employer_payment_status" DEFAULT 'completed' NOT NULL,
	"payment_gateway_ref" text,
	"metadata" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD COLUMN "recruiter_phone" text;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD COLUMN "authorized_person_name" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "role_summary" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_type" text DEFAULT 'yearly';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "benefits" text[];--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "preferred_language" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "freshers_allowed" boolean;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "age_min" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "age_max" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "gender_preference" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "promotion_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "promoted_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "promoted_until" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "listing_duration_days" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "is_urgent_highlight" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "auto_close_on_limit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "has_no_formal_education" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "employer_registration_payments" ADD CONSTRAINT "employer_registration_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_employer_reg_payments_user_id" ON "employer_registration_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_employer_reg_payments_status" ON "employer_registration_payments" USING btree ("status");