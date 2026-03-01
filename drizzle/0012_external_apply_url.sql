-- Add external apply URL for third-party / redirect jobs
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "external_apply_url" text;
