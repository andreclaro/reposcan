-- Seed default plans (idempotent). Safe to run after migrations or purge.
-- Same values as 0000_schema.sql; ON CONFLICT (codename) skips existing rows.
INSERT INTO "plan" ("id", "name", "codename", "default", "monthly_price", "yearly_price", "quotas")
VALUES
  (gen_random_uuid()::text, 'Free', 'free', true, 0, null, '{"scans_per_month": 5}'),
  (gen_random_uuid()::text, 'Pro', 'pro', false, 2900, 29000, '{"scans_per_month": 50}'),
  (gen_random_uuid()::text, 'Custom', 'custom', false, null, null, '{"scans_per_month": -1}')
ON CONFLICT (codename) DO NOTHING;
