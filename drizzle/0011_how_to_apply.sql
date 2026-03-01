-- Add how_to_apply to jobs: "platform" | "direct" | "both"
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "how_to_apply" text DEFAULT 'platform' NOT NULL;
