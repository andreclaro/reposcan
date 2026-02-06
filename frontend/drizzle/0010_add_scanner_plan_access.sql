-- Per-plan scanner access control columns
ALTER TABLE scanner_setting ADD COLUMN free_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE scanner_setting ADD COLUMN pro_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE scanner_setting ADD COLUMN custom_enabled BOOLEAN NOT NULL DEFAULT true;

-- Set initial defaults:
-- Free plan: restrict dast, secrets_deep, misconfig, dockerfile_lint, sca
UPDATE scanner_setting SET free_enabled = false WHERE id IN ('dast', 'secrets_deep', 'misconfig', 'dockerfile_lint', 'sca');
-- Pro plan: restrict dast only
UPDATE scanner_setting SET pro_enabled = false WHERE id = 'dast';
-- Custom plan: everything enabled (default true already covers this)
