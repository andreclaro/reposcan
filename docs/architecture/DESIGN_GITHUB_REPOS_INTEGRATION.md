# GitHub Repository Access Integration - Design Document

## Overview

This document outlines the design for integrating GitHub repository access into the Security Audit platform, enabling users to scan their **private repositories** in addition to public ones. The integration leverages the existing GitHub OAuth authentication and extends it with additional permissions to read repository data.

## Goals

1. **Access Private Repositories**: Allow authenticated users to view and scan their private GitHub repositories
2. **Repository Listing**: Display a list of user's GitHub repositories with metadata (stars, language, visibility)
3. **Seamless Scanning**: Enable one-click scanning of any accessible repository
4. **Permission Management**: Handle OAuth scopes and token refresh transparently
5. **Security First**: Store minimal data, use short-lived tokens, respect user permissions

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GitHub Repository Access Flow                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │────▶│  GitHub OAuth │────▶│  Repository  │────▶│  Scan        │
│   Login      │     │  + Repo Scope │     │  List        │     │  Selection   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Store       │     │  Fetch       │     │  Display     │     │  Queue       │
│  User Token  │     │  Repos via   │     │  Repo Cards  │     │  Scan Job    │
│  (encrypted) │     │  GitHub API  │     │  with Meta   │     │  with Token  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Next.js Application                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  Repository      │  │  GitHub Token    │  │  Scan Interface          │  │
│  │  Browser         │  │  Manager         │  │  (Public + Private)      │  │
│  │  (UI Component)  │  │  (Encryption)    │  │                          │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
└───────────┼─────────────────────┼─────────────────────────┼────────────────┘
            │                     │                         │
            │                     │                         │
            ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database (PostgreSQL)                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  user_repos      │  │  github_tokens   │  │  scans                   │  │
│  │  (cached repos)  │  │  (encrypted)     │  │  (with repo ref)         │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
            │                     │                         │
            │                     │                         │
            ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            External Services                                 │
│  ┌──────────────────────────────────┐      ┌──────────────────────────────┐ │
│  │  GitHub API                      │      │  Celery Worker               │ │
│  │  - List repos                    │      │  - Clone with OAuth token    │ │
│  │  - Get repo metadata             │      │  - Scan private repos        │ │
│  │  - Refresh tokens                │      │  - Store results             │ │
│  └──────────────────────────────────┘      └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## OAuth Scopes and Permissions

### Required Scopes

| Scope | Purpose | Reason |
|-------|---------|--------|
| `read:user` | Read user profile | Already have this for login |
| `user:email` | Read user email | Already have this for login |
| **`repo`** | **Full control of private repositories** | **Required for private repo access** |
| `read:org` | Read organization membership | Optional: for org repos |

### Scope Migration Strategy

Existing users with only `read:user` and `user:email` scopes need to re-authorize:

1. **Detection**: Check stored token scope on login
2. **Re-authorization Prompt**: Show UI explaining why additional permissions are needed
3. **Graceful Degradation**: Allow login but restrict private repo access until re-authorized

```typescript
// Scope check logic
function hasRequiredScopes(scopes: string[]): boolean {
  return scopes.includes('repo') || scopes.includes('public_repo');
}
```

## Database Schema Changes

### New Tables

#### 1. `user_github_tokens` - Encrypted Token Storage

```sql
CREATE TABLE user_github_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Encrypted token (AES-256-GCM)
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT, -- GitHub doesn't always provide refresh tokens
  
  -- Token metadata
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMP WITH TIME ZONE, -- null for GitHub (tokens don't expire)
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Unique constraint: one token per user
  UNIQUE(user_id)
);

CREATE INDEX idx_user_github_tokens_user_id ON user_github_tokens(user_id);
```

#### 2. `user_repositories` - Cached Repository List

```sql
CREATE TABLE user_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- GitHub repository data
  github_id BIGINT NOT NULL, -- GitHub's repo ID
  node_id TEXT, -- GraphQL node ID
  
  -- Repository info
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL, -- "owner/name"
  description TEXT,
  
  -- Visibility and access
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_fork BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  default_branch TEXT DEFAULT 'main',
  language TEXT,
  stars_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  
  -- URLs
  html_url TEXT NOT NULL,
  clone_url TEXT NOT NULL,
  ssh_url TEXT,
  
  -- Caching
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: one entry per user per repo
  UNIQUE(user_id, github_id)
);

CREATE INDEX idx_user_repositories_user_id ON user_repositories(user_id);
CREATE INDEX idx_user_repositories_github_id ON user_repositories(github_id);
CREATE INDEX idx_user_repositories_full_name ON user_repositories(full_name);
CREATE INDEX idx_user_repositories_is_private ON user_repositories(is_private);
```

#### 3. Update `scans` table

Add reference to user repository for tracking:

```sql
-- Add optional reference to user's cached repository
ALTER TABLE scans ADD COLUMN user_repository_id UUID REFERENCES user_repositories(id);
ALTER TABLE scans ADD COLUMN clone_method VARCHAR(20) DEFAULT 'https'; -- 'https', 'ssh', 'token'
```

### Encryption Strategy

GitHub tokens must be encrypted at rest using **AES-256-GCM**:

```typescript
// Encryption service
interface TokenEncryption {
  // Encrypt token before storage
  encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string };
  
  // Decrypt token for use
  decrypt(ciphertext: string, iv: string, tag: string): string;
}

// Environment variables required:
// TOKEN_ENCRYPTION_KEY - 32-byte base64 encoded key
```

## API Endpoints

### New API Routes

#### 1. List User Repositories

```typescript
// GET /api/github/repos
// Query params: ?page=1&per_page=30&visibility=all|public|private

interface ListReposResponse {
  repositories: GitHubRepository[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
  };
  lastSynced: string;
}

interface GitHubRepository {
  id: string; // our UUID
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  description: string;
  isPrivate: boolean;
  isFork: boolean;
  defaultBranch: string;
  language: string;
  starsCount: number;
  forksCount: number;
  htmlUrl: string;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}
```

#### 2. Sync Repositories

```typescript
// POST /api/github/repos/sync
// Forces a refresh of the repository list from GitHub

interface SyncReposResponse {
  success: boolean;
  syncedCount: number;
  removedCount: number; // repos no longer accessible
  errors?: string[];
}
```

#### 3. Get Repository Details

```typescript
// GET /api/github/repos/:owner/:name

interface RepoDetailsResponse extends GitHubRepository {
  branches: string[];
  lastScan?: {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    createdAt: string;
  };
  canScan: boolean; // user has permission and token is valid
}
```

#### 4. Initiate Scan from Repository

```typescript
// POST /api/github/repos/:owner/:name/scan
// Body: { branch?: string, scanners?: string[] }

interface ScanFromRepoResponse {
  scanId: string;
  status: 'queued';
  message: string;
}
```

#### 5. OAuth Token Management

```typescript
// GET /api/github/token/status
// Check if user has valid token with required scopes

interface TokenStatusResponse {
  hasToken: boolean;
  hasRequiredScopes: boolean;
  scopes: string[];
  needsReauthorization: boolean;
}

// POST /api/github/token/refresh
// Manually trigger token refresh (if refresh token exists)
```

## Frontend Components

### 1. Repository Browser (`/app/repos`)

```typescript
// Main repository listing page
interface RepositoryBrowserProps {
  initialRepos: GitHubRepository[];
}

// Features:
// - Search/filter by name
// - Filter by visibility (public/private/all)
// - Sort by stars, updated date, name
// - Paginated loading
// - "Sync" button to refresh from GitHub
// - Scan button for each repo
```

### 2. Repository Card

```typescript
interface RepositoryCardProps {
  repo: GitHubRepository;
  onScan: (repo: GitHubRepository) => void;
  lastScan?: ScanSummary;
}

// Visual elements:
// - Repo name with owner
// - Private/Public badge
// - Language badge
// - Star count
// - Fork count
// - Last updated
// - Quick scan button
```

### 3. Scope Upgrade Prompt

```typescript
interface ScopeUpgradePromptProps {
  currentScopes: string[];
  requiredScopes: string[];
  onAuthorize: () => void;
}

// Shown when user needs to re-authorize for private repo access
```

### 4. Scan Modal from Repository

```typescript
interface RepoScanModalProps {
  repo: GitHubRepository;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (options: ScanOptions) => void;
}

// Pre-fills repo URL, allows branch selection
// Shows available branches fetched from GitHub API
```

## Worker Integration

### Updated Scan Flow

```typescript
// Modified worker to support authenticated cloning
interface ScanJobPayload {
  repoUrl: string;
  branch?: string;
  scanners: string[];
  
  // New: Authentication for private repos
  authentication?: {
    type: 'oauth' | 'token' | 'ssh';
    // For OAuth: encrypted token reference
    tokenRef?: string;
    // Or inline (decrypted at worker)
    accessToken?: string;
  };
}

// Worker decryption flow:
// 1. Receive job with tokenRef
// 2. Fetch encrypted token from DB
// 3. Decrypt using worker-side encryption key
// 4. Use token for git clone: https://<token>@github.com/owner/repo.git
// 5. Clear token from memory after clone
```

### Git Clone with OAuth

```typescript
// Construct authenticated URL
function getAuthenticatedCloneUrl(
  repo: Repository, 
  accessToken: string
): string {
  // For HTTPS OAuth
  return `https://${accessToken}@github.com/${repo.fullName}.git`;
}

// Security note: Token is in URL but only used in subprocess
// subprocess env is isolated and cleared after clone
```

## Security Considerations

### 1. Token Storage
- ✅ AES-256-GCM encryption at rest
- ✅ Separate encryption key from database
- ✅ Tokens never logged or exposed in UI
- ✅ Short-lived memory usage only

### 2. Access Control
- ✅ User can only access their own tokens
- ✅ Repository list scoped to user's visible repos
- ✅ Row-level security in database

### 3. Audit Logging
```typescript
// Log all token usage
interface TokenAuditLog {
  id: string;
  userId: string;
  action: 'created' | 'used' | 'refreshed' | 'revoked';
  repoId?: string;
  scanId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}
```

### 4. Token Lifecycle
- Tokens fetched from GitHub OAuth
- Stored encrypted immediately
- Decrypted only in worker during clone
- Memory cleared after use
- Tokens revoked on user deletion

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Database schema migrations
- [ ] Encryption service implementation
- [ ] Token storage API
- [ ] Update OAuth flow with `repo` scope

### Phase 2: Repository API (Week 1-2)
- [ ] GitHub API client for repository listing
- [ ] `/api/github/repos` endpoints
- [ ] Repository sync logic
- [ ] Caching strategy

### Phase 3: Frontend (Week 2)
- [ ] Repository browser page
- [ ] Repository card components
- [ ] Scope upgrade prompt
- [ ] Scan modal integration

### Phase 4: Worker Integration (Week 2-3)
- [ ] Update scan job payload
- [ ] Token decryption in worker
- [ ] Authenticated git clone
- [ ] Error handling for auth failures

### Phase 5: Testing & Polish (Week 3)
- [ ] Unit tests for encryption
- [ ] Integration tests for GitHub API
- [ ] E2E tests for private repo scanning
- [ ] Documentation updates

## Environment Variables

New variables required:

```bash
# Token Encryption (required)
TOKEN_ENCRYPTION_KEY=base64-encoded-32-byte-key

# GitHub OAuth (update existing)
# Ensure GitHub OAuth App has correct callback URL
# and requests 'repo' scope

# Optional: GitHub App mode (for higher rate limits)
# GITHUB_APP_ID=...
# GITHUB_APP_PRIVATE_KEY=...
```

## Migration Guide

### For Existing Users

1. **First Login After Update**: Users will see scope upgrade prompt
2. **Re-authorization**: One-click to grant private repo access
3. **Repository Sync**: Automatic sync after authorization
4. **Existing Scans**: Unaffected, still linked by URL

### Database Migration

```sql
-- Run these migrations
-- 1. Create user_github_tokens table
-- 2. Create user_repositories table
-- 3. Update scans table with repo reference
-- 4. Backfill: Existing users have no tokens, will prompt on next login
```

## Open Questions

1. **Organization Access**: Should we support organization-level repository access? Requires `read:org` scope.

2. **Token Refresh**: GitHub tokens don't expire by default. Do we need proactive refresh logic?

3. **Rate Limiting**: How do we handle GitHub API rate limits? Cache duration strategy?

4. **SSH Support**: Should we support SSH keys for cloning instead of HTTPS with tokens?

5. **Webhook Integration**: Should we implement webhooks for automatic repository sync?

## Appendix: GitHub API Reference

### Key Endpoints Used

```
# List user repositories
GET https://api.github.com/user/repos
  ?type=all|owner|member
  &sort=created|updated|pushed|full_name
  &direction=asc|desc
  &page=1
  &per_page=100

# Get repository details
GET https://api.github.com/repos/{owner}/{repo}

# List branches
GET https://api.github.com/repos/{owner}/{repo}/branches

# Get authenticated user
GET https://api.github.com/user
```

### Rate Limits

- Authenticated: 5,000 requests/hour
- Cache repository list for 5 minutes
- Use conditional requests (ETag) for optimization

---

**Document Version**: 1.0  
**Created**: 2026-02-01  
**Status**: Draft - Pending Review
