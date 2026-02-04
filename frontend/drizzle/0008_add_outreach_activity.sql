-- Outreach activity tracking for marketing
CREATE TABLE outreach_activity (
    id SERIAL PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES scan(scan_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'github_issue_opened'
    metadata JSONB DEFAULT '{}', -- issue URL, share token, etc.
    created_by TEXT NOT NULL, -- admin email
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_outreach_activity_scan_id ON outreach_activity(scan_id);
CREATE INDEX idx_outreach_activity_type ON outreach_activity(type);
CREATE INDEX idx_outreach_activity_created_at ON outreach_activity(created_at);
