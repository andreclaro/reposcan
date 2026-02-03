-- Per-customer scan limit for Custom plan
-- Migration: 0005_add_user_scans_override

ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "scans_per_month_override" integer;
