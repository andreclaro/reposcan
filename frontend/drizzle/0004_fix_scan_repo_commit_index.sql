-- Fix scan cache index: allow multiple scan rows per (repo_url, commit_hash)
-- Migration: 0004_fix_scan_repo_commit_index
--
-- The unique index idx_scan_repo_commit_unique caused UPDATE failures when
-- a second scan (same repo+commit) tried to set commit_hash—e.g. cache-hit
-- or a new request for the same repo. Cache lookup only needs a fast index,
-- not uniqueness.

DROP INDEX IF EXISTS idx_scan_repo_commit_unique;

-- Non-unique index for cache lookups (same columns, no uniqueness)
CREATE INDEX IF NOT EXISTS idx_scan_repo_commit
ON scan(repo_url, commit_hash)
WHERE commit_hash IS NOT NULL;
