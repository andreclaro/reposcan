-- Per-customer custom price for Custom plan (monthly, in cents)
-- Migration: 0006_add_custom_price_override

ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "custom_price_override" integer;
