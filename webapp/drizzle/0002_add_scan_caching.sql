-- Add scan caching and admin query indexes
-- Migration: 0002_add_scan_caching

-- Unique constraint for scan caching (repo + commit = same scan)
-- Only applies when commit_hash is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_repo_commit_unique
ON scan(repo_url, commit_hash)
WHERE commit_hash IS NOT NULL;

-- Index for admin queries - order by created_at
CREATE INDEX IF NOT EXISTS idx_scan_created_at ON scan(created_at DESC);

-- Index for filtering by user
CREATE INDEX IF NOT EXISTS idx_scan_user_id ON scan(user_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_scan_status ON scan(status);
