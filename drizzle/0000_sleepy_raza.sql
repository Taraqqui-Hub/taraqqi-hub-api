CREATE TYPE "public"."application_status" AS ENUM('pending', 'reviewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'login', 'logout', 'approve', 'reject', 'export');--> statement-breakpoint
CREATE TYPE "public"."company_size" AS ENUM('1-10', '11-50', '51-200', '201-500', '500+');--> statement-breakpoint
CREATE TYPE "public"."company_type" AS ENUM('startup', 'sme', 'enterprise', 'agency');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('fresher', 'junior', 'mid', 'senior', 'lead', 'executive');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'active', 'paused', 'closed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('full-time', 'part-time', 'contract', 'internship', 'freelance');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('onsite', 'remote', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."kyc_document_type" AS ENUM('aadhaar', 'pan', 'passport', 'driving_license', 'voter_id', 'gst_certificate');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'under_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'register', 'reset_password', 'verify_phone', 'verify_email');--> statement-breakpoint
CREATE TYPE "public"."transaction_category" AS ENUM('deposit', 'withdrawal', 'job_post_fee', 'featured_job_fee', 'refund', 'bonus', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."user_types" AS ENUM('jobseeker', 'employer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."wallet_status" AS ENUM('active', 'frozen', 'closed');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"job_id" bigint NOT NULL,
	"jobseeker_id" bigint NOT NULL,
	"resume_url" text,
	"cover_letter" text,
	"expected_salary" numeric(12, 2),
	"notice_period_days" integer,
	"screening_answers" jsonb,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"status_changed_at" timestamp,
	"status_changed_by" bigint,
	"internal_notes" text,
	"rating" integer,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"viewed_at" timestamp,
	"shortlisted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "applications_uuid_unique" UNIQUE("uuid"),
	CONSTRAINT "uq_applications_job_jobseeker" UNIQUE("job_id","jobseeker_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"user_email" text,
	"user_type" text,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint,
	"old_values" jsonb,
	"new_values" jsonb,
	"description" text,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"company_name" text NOT NULL,
	"company_type" "company_type",
	"industry" text,
	"company_size" "company_size",
	"founded_year" integer,
	"website" text,
	"contact_person_name" text,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"city" text,
	"state" text,
	"country" text DEFAULT 'India',
	"pincode" text,
	"logo_url" text,
	"cover_image_url" text,
	"description" text,
	"culture" text,
	"benefits" text[],
	"gstin" text,
	"pan" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"verified_by" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "employer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" bigint NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"requirements" text,
	"responsibilities" text,
	"job_type" "job_type" NOT NULL,
	"experience_level" "experience_level",
	"category" text,
	"skills_required" text[],
	"location_type" "location_type",
	"city" text,
	"state" text,
	"country" text DEFAULT 'India',
	"address" text,
	"salary_min" numeric(12, 2),
	"salary_max" numeric(12, 2),
	"salary_currency" text DEFAULT 'INR',
	"is_salary_negotiable" boolean DEFAULT false NOT NULL,
	"hide_salary" boolean DEFAULT false NOT NULL,
	"min_experience_years" integer DEFAULT 0 NOT NULL,
	"max_experience_years" integer,
	"education_required" text,
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"application_deadline" timestamp,
	"max_applications" integer,
	"views_count" integer DEFAULT 0 NOT NULL,
	"applications_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "jobs_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "jobseeker_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" date,
	"gender" "gender",
	"address" text,
	"city" text,
	"state" text,
	"country" text DEFAULT 'India',
	"pincode" text,
	"headline" text,
	"summary" text,
	"skills" text[],
	"experience_years" integer,
	"current_salary" numeric(12, 2),
	"expected_salary" numeric(12, 2),
	"resume_url" text,
	"profile_photo_url" text,
	"job_types" text[],
	"preferred_locations" text[],
	"is_open_to_work" boolean DEFAULT true NOT NULL,
	"profile_completion" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "jobseeker_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "kyc_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"document_type" "kyc_document_type" NOT NULL,
	"document_number" text NOT NULL,
	"document_url" text NOT NULL,
	"document_back_url" text,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"verified_at" timestamp,
	"verified_by" bigint,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "otp_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone" text,
	"email" text,
	"otp_hash" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"device_info" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"role_id" bigint NOT NULL,
	"permission_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_role_permissions" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" bigint NOT NULL,
	"type" "transaction_type" NOT NULL,
	"category" "transaction_category" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"balance_before" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"reference_id" text,
	"reference_type" text,
	"related_entity_type" text,
	"related_entity_id" bigint,
	"description" text,
	"metadata" jsonb,
	"processed_at" timestamp,
	"failed_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "user_email_verification_codes" (
	"user_id" bigint NOT NULL,
	"verification_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reset_password_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"reset_password_code" text NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"sent_at" timestamp (3) DEFAULT now() NOT NULL,
	"used_at" timestamp (3),
	"attempts" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	"assigned_by" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_roles" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"phone" text NOT NULL,
	"password_hash" text,
	"user_type" "user_types" DEFAULT 'jobseeker' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "users_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "wallet_status" DEFAULT 'active' NOT NULL,
	"daily_limit" bigint,
	"monthly_limit" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_jobseeker_id_users_id_fk" FOREIGN KEY ("jobseeker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD CONSTRAINT "employer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD CONSTRAINT "employer_profiles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobseeker_profiles" ADD CONSTRAINT "jobseeker_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_verification_codes" ADD CONSTRAINT "user_email_verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reset_password_codes" ADD CONSTRAINT "user_reset_password_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_applications_job_id" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_applications_jobseeker_id" ON "applications" USING btree ("jobseeker_id");--> statement-breakpoint
CREATE INDEX "idx_applications_status" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_applications_deleted_at" ON "applications" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity_type" ON "audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity_id" ON "audit_logs" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity_type_id" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_employer_profiles_user_id" ON "employer_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_employer_profiles_company_name" ON "employer_profiles" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "idx_employer_profiles_city" ON "employer_profiles" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_employer_profiles_is_verified" ON "employer_profiles" USING btree ("is_verified");--> statement-breakpoint
CREATE INDEX "idx_employer_profiles_deleted_at" ON "employer_profiles" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_jobs_slug" ON "jobs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_jobs_employer_id" ON "jobs" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_city" ON "jobs" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_jobs_category" ON "jobs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_jobs_job_type" ON "jobs" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "idx_jobs_deleted_at" ON "jobs" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_published_at" ON "jobs" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_jobseeker_profiles_user_id" ON "jobseeker_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_jobseeker_profiles_city" ON "jobseeker_profiles" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_jobseeker_profiles_is_open_to_work" ON "jobseeker_profiles" USING btree ("is_open_to_work");--> statement-breakpoint
CREATE INDEX "idx_jobseeker_profiles_deleted_at" ON "jobseeker_profiles" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_kyc_records_user_id" ON "kyc_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_kyc_records_status" ON "kyc_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_kyc_records_document_type" ON "kyc_records" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "idx_kyc_records_deleted_at" ON "kyc_records" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_otp_tokens_phone" ON "otp_tokens" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_otp_tokens_email" ON "otp_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_otp_tokens_purpose" ON "otp_tokens" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "idx_otp_tokens_expires_at" ON "otp_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_permissions_name" ON "permissions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_permissions_resource" ON "permissions" USING btree ("resource");--> statement-breakpoint
CREATE INDEX "idx_permissions_action" ON "permissions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_permissions_resource_action" ON "permissions" USING btree ("resource","action");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_roles_name" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_roles_deleted_at" ON "roles" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_wallet_id" ON "transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transactions_category" ON "transactions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_transactions_created_at" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_reference_id" ON "transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_email_verification_codes_user_id" ON "user_email_verification_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_email_verification_codes_verification_code" ON "user_email_verification_codes" USING btree ("verification_code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_phone" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_user_type" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "idx_users_deleted_at" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_wallets_user_id" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_wallets_status" ON "wallets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_wallets_deleted_at" ON "wallets" USING btree ("deleted_at");