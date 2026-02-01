CREATE TYPE "public"."education_level" AS ENUM('no_education', '10th', '12th', 'diploma', 'ug', 'pg', 'other');--> statement-breakpoint
CREATE TYPE "public"."interest_type" AS ENUM('hobby', 'extracurricular', 'volunteering');--> statement-breakpoint
CREATE TYPE "public"."proficiency_level" AS ENUM('beginner', 'intermediate', 'advanced', 'expert');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('community_data', 'income_data', 'family_data', 'marketing', 'third_party_sharing');--> statement-breakpoint
CREATE TABLE "community_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"religion" text,
	"caste_category" text,
	"sub_caste" text,
	"minority_self_identification" text,
	"community_affiliation" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "company_contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint NOT NULL,
	"user_id" bigint,
	"contact_person_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"designation" text,
	"department" text,
	"is_primary" text DEFAULT 'false',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"company_name" text NOT NULL,
	"company_type" "company_type",
	"industry" text,
	"company_size" "company_size",
	"founded_year" integer,
	"website" text,
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
	"cin" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"verified_by" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "company_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "education_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"level" "education_level" NOT NULL,
	"institution" text,
	"board_or_university" text,
	"year_of_passing" integer,
	"grade_or_percentage" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"company_name" text,
	"job_title" text,
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"leaving_reason" text,
	"salary_range" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"father_name" text,
	"father_occupation" text,
	"father_education" text,
	"mother_name" text,
	"mother_occupation" text,
	"mother_education" text,
	"siblings_count" integer,
	"family_structure" text,
	"marital_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "family_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"interest_type" "interest_type",
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"skill_name" text NOT NULL,
	"proficiency_level" "proficiency_level",
	"years_of_experience" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "socio_economic_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"family_income_range" text,
	"earning_members_count" integer,
	"dependents_count" integer,
	"housing_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "socio_economic_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"consent_version" text,
	"consent_given_at" timestamp,
	"consent_revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"wants_job_now" boolean DEFAULT false NOT NULL,
	"open_to_future_jobs" boolean DEFAULT false NOT NULL,
	"wants_skill_programs" boolean DEFAULT false NOT NULL,
	"wants_community_programs" boolean DEFAULT false NOT NULL,
	"wants_matrimony" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" date,
	"gender" "gender",
	"nationality" text DEFAULT 'Indian',
	"current_city" text,
	"district" text,
	"state" text,
	"pincode" text,
	"mother_tongue" text,
	"languages_known" text[],
	"profile_photo_url" text,
	"profile_last_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "user_type" SET DEFAULT 'individual';--> statement-breakpoint
ALTER TABLE "kyc_records" ADD COLUMN "document_last4" text;--> statement-breakpoint
ALTER TABLE "kyc_records" ADD COLUMN "document_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trust_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "participation_mode" text;--> statement-breakpoint
ALTER TABLE "community_profiles" ADD CONSTRAINT "community_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_company_profiles_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_records" ADD CONSTRAINT "education_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_records" ADD CONSTRAINT "experience_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_profiles" ADD CONSTRAINT "family_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "socio_economic_profiles" ADD CONSTRAINT "socio_economic_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_community_profiles_user_id" ON "community_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_company_contacts_company_id" ON "company_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_company_contacts_user_id" ON "company_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_company_contacts_email" ON "company_contacts" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX "idx_company_profiles_user_id" ON "company_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_company_profiles_company_name" ON "company_profiles" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "idx_company_profiles_city" ON "company_profiles" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_company_profiles_is_verified" ON "company_profiles" USING btree ("is_verified");--> statement-breakpoint
CREATE INDEX "idx_company_profiles_deleted_at" ON "company_profiles" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_education_records_user_id" ON "education_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_education_records_level" ON "education_records" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_experience_records_user_id" ON "experience_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_experience_records_is_current" ON "experience_records" USING btree ("is_current");--> statement-breakpoint
CREATE INDEX "idx_family_profiles_user_id" ON "family_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_interests_user_id" ON "interests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_interests_type" ON "interests" USING btree ("interest_type");--> statement-breakpoint
CREATE INDEX "idx_skills_user_id" ON "skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_skills_skill_name" ON "skills" USING btree ("skill_name");--> statement-breakpoint
CREATE INDEX "idx_socio_economic_profiles_user_id" ON "socio_economic_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_consents_user_id" ON "user_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_consents_type" ON "user_consents" USING btree ("consent_type");--> statement-breakpoint
CREATE INDEX "idx_user_consents_user_type" ON "user_consents" USING btree ("user_id","consent_type");--> statement-breakpoint
CREATE INDEX "idx_user_preferences_user_id" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_user_id" ON "user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_city" ON "user_profiles" USING btree ("current_city");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_state" ON "user_profiles" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_deleted_at" ON "user_profiles" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "kyc_records" DROP COLUMN "document_number_encrypted";--> statement-breakpoint
ALTER TABLE "public"."users" ALTER COLUMN "user_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_types";--> statement-breakpoint
CREATE TYPE "public"."user_types" AS ENUM('individual', 'employer', 'admin', 'super_admin');--> statement-breakpoint
ALTER TABLE "public"."users" ALTER COLUMN "user_type" SET DATA TYPE "public"."user_types" USING "user_type"::"public"."user_types";