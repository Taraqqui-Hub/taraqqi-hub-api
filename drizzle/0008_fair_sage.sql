ALTER TABLE "jobs" ADD COLUMN "address_line_2" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "is_resume_required" boolean DEFAULT false NOT NULL;