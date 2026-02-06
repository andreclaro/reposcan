-- Scanner enable/disable settings (admin-managed)
CREATE TABLE scanner_setting (
    id TEXT PRIMARY KEY,          -- scanner key, e.g. "sast"
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed all 13 scanners with defaults (dast and secrets_deep disabled by default)
INSERT INTO scanner_setting (id, enabled) VALUES
    ('sast', true),
    ('terraform', true),
    ('dockerfile', true),
    ('node', true),
    ('go', true),
    ('rust', true),
    ('secrets', true),
    ('sca', true),
    ('python', true),
    ('dockerfile_lint', true),
    ('misconfig', true),
    ('dast', false),
    ('secrets_deep', false)
ON CONFLICT (id) DO NOTHING;
