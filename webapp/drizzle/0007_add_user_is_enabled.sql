-- Add is_enabled column to app_user table for beta mode
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "is_enabled" boolean DEFAULT true NOT NULL;

-- Update existing users to be enabled by default
UPDATE "app_user" SET "is_enabled" = true WHERE "is_enabled" IS NULL;
