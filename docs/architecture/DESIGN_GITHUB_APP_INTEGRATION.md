# GitHub App Integration for SecurityKit

## Overview

This document outlines the migration from Personal Access Tokens (PAT) to GitHub Apps for programmatic issue creation and repository access. This is the recommended architecture for production SaaS deployments.

## Current State (PAT-based)

```
┌─────────────────┐     GITHUB_TOKEN     ┌──────────────────┐
│  SecurityKit    │ ───────────────────> │  GitHub API      │
│  (single token) │                      │  (any repo)      │
└─────────────────┘                      └──────────────────┘
```

**Problems:**
- Single point of failure (token owner leaves = broken service)
- Overly broad permissions (PAT has access to all user's repos)
- Security risk (long-lived token in environment variables)
- Audit confusion (all issues appear from same user account)
- No granular control per-repository

## Proposed State (GitHub App)

```
┌─────────────────────────────────────────────────────────────┐
│                    SecurityKit SaaS                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Web App    │  │  GitHub App  │  │   Database   │      │
│  │  (Next.js)   │  │  (Backend)   │  │  (Installs)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘      │
│         │                 │                                  │
│         │  JWT Auth       │                                  │
│         │<───────────────>│                                  │
└─────────┼─────────────────┼──────────────────────────────────┘
          │                 │
          │  Installation   │  Short-lived tokens
          │  Request        │  (1 hour expiry)
          ▼                 ▼
┌─────────────────────────────────────────┐
│           GitHub Platform               │
│  ┌─────────────────────────────────┐   │
│  │  SecurityKit Bot (GitHub App)   │   │
│  │  - Issues:write permission      │   │
│  │  - Contents:read permission     │   │
│  │  - Metadata:read permission     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
           │
           │  Creates issues as
           │  "SecurityKit Bot"
           ▼
┌────────────────────────────┐
│  User's Repository         │
│  (user/repo)               │
│  - Issue #123 opened       │
│  - By SecurityKit Bot      │
└────────────────────────────┘
```

## Why GitHub App is Better

| Aspect | PAT (Current) | GitHub App (Proposed) |
|--------|---------------|----------------------|
| **Identity** | Personal user account | Dedicated bot account |
| **Token lifetime** | Never expires (until revoked) | 1 hour (auto-refresh) |
| **Permissions** | All repos user can access | Only installed repos |
| **Granularity** | All or nothing | Per-repo installation |
| **Security** | High risk if leaked | Short-lived, scoped |
| **Audit** | Issues from "John Doe" | Issues from "SecurityKit Bot" |
| **Org adoption** | Personal token per user | Org installs app once |

## Architecture Components

### 1. GitHub App Registration

**Settings:**
```yaml
Name: SecurityKit
Description: Automated security scanning and issue reporting
URL: https://securitykit.dev
Callback URL: https://securitykit.dev/api/auth/github-app/callback
Webhook URL: https://securitykit.dev/api/webhooks/github (optional)

Permissions:
  - Repository:
    - Contents: Read (to verify repo exists)
    - Issues: Write (to create issues)
    - Metadata: Read (to list repos)
  - Account:
    - Email: Read (to identify users)

Events (optional):
  - Installation
  - InstallationRepositories
```

### 2. Database Schema Updates

```sql
-- GitHub App installations
CREATE TABLE github_app_installations (
    id SERIAL PRIMARY KEY,
    installation_id BIGINT NOT NULL UNIQUE,
    account_login VARCHAR(255) NOT NULL,
    account_id BIGINT NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- 'User' or 'Organization'
    installed_by_user_id TEXT REFERENCES app_user(id),
    repositories TEXT[], -- Array of repo full names ["owner/repo"]
    permissions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_github_app_installations_account ON github_app_installations(account_login);
CREATE INDEX idx_github_app_installations_user ON github_app_installations(installed_by_user_id);

-- Link scans to installations (for audit)
ALTER TABLE outreach_activity ADD COLUMN installation_id BIGINT REFERENCES github_app_installations(id);
```

### 3. Authentication Flow

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│   Admin     │ ──1. Click "Add    │  SecurityKit │ ──2. Redirect to   │    GitHub   │
│   Dashboard │    GitHub App"     │   Backend    │    GitHub App      │   OAuth     │
└─────────────┘                    └─────────────┘                    └─────────────┘
                                                                           │
                                    ┌─────────────┐                    ┌──┴──────────┐
                                    │  SecurityKit │ <──3. User grants  │  User       │
                                    │   Backend    │     permission     │  approves   │
                                    └──────┬──────┘                    └─────────────┘
                                           │
                                           │ 4. Exchange code for
                                           │    installation token
                                           ▼
                                    ┌─────────────┐
                                    │   Store     │
                                    │ installation
                                    │ in database
                                    └─────────────┘
```

### 4. Token Management

```typescript
// lib/github-app.ts

interface InstallationToken {
  token: string;
  expiresAt: Date;
  repositorySelection: 'all' | 'selected';
}

class GitHubAppAuth {
  private appId: string;
  private privateKey: string;
  private clientId: string;
  private clientSecret: string;

  // Generate JWT for app authentication
  async generateAppJWT(): Promise<string> {
    const payload = {
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (10 * 60), // 10 minutes
      iss: this.appId
    };
    return sign(payload, this.privateKey, { algorithm: 'RS256' });
  }

  // Get installation access token
  async getInstallationToken(installationId: number): Promise<InstallationToken> {
    const jwt = await this.generateAppJWT();
    
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Accept': 'application/vnd.github+json'
        }
      }
    );

    const data = await response.json();
    return {
      token: data.token,
      expiresAt: new Date(data.expires_at),
      repositorySelection: data.repository_selection
    };
  }

  // Create issue using installation token
  async createIssue(
    installationId: number,
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[]
  ): Promise<{ issueNumber: number; issueUrl: string }> {
    const { token } = await this.getInstallationToken(installationId);
    
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify({ title, body, labels })
      }
    );

    const data = await response.json();
    return {
      issueNumber: data.number,
      issueUrl: data.html_url
    };
  }
}
```

### 5. API Endpoints

```typescript
// POST /api/admin/github-app/install
// Redirects to GitHub App installation flow

// GET /api/admin/github-app/callback
// Handles OAuth callback from GitHub

// GET /api/admin/github-app/installations
// Lists user's installations with accessible repos

// POST /api/admin/marketing/github-issue
// Updated to use GitHub App instead of PAT
// Body: { scanId, installationId, title, body }
```

### 6. UI Changes

**Admin → GitHub App Settings Page:**

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub App Integration                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Status: ✅ Connected (as @securitykit-bot)                  │
│                                                             │
│  Installed Repositories:                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ☑ facebook/react (access granted)                    │  │
│  │  ☑ kubernetes/kubernetes                              │  │
│  │  ☐ vercel/next.js (not installed)                    │  │
│  │     [Request Access]                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Install on More Repositories]  [Disconnect]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Marketing Dialog (updated):**

```
┌─────────────────────────────────────────────────────────────┐
│  Create GitHub Issues                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GitHub App: ✅ SecurityKit Bot                             │
│                                                             │
│  Selected Repositories (3):                                 │
│  - facebook/react ✓ (has app installed)                    │
│  - kubernetes/kubernetes ✓ (has app installed)             │
│  - vercel/next.js ✗ (app not installed)                    │
│    [Request Installation]                                   │
│                                                             │
│  [Create Issues via SecurityKit Bot]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: GitHub App Registration & Setup
1. Register GitHub App in GitHub settings
2. Generate private key
3. Add credentials to environment variables
4. Create installation callback handler

### Phase 2: Database & API
1. Create `github_app_installations` table
2. Build installation OAuth flow
3. Implement token management service
4. Update issue creation API to use GitHub App

### Phase 3: UI Updates
1. Add GitHub App settings page
2. Update marketing dialogs with installation status
3. Show repository access status
4. Add "Request Installation" flow

### Phase 4: Migration & Testing
1. Test with personal org/repos
2. Test with customer organizations
3. Document migration from PAT
4. Deprecate PAT option

## Environment Variables

```bash
# GitHub App Credentials (new)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
..."
GITHUB_APP_CLIENT_ID=Iv23lixxx
GITHUB_APP_CLIENT_SECRET=xxxx
GITHUB_APP_SLUG=securitykit-bot

# Legacy (to be deprecated)
# GITHUB_TOKEN=ghp_xxx  # Remove after migration
```

## Security Considerations

### Private Key Management
- Store private key in environment variable or secret manager
- Never commit to repository
- Rotate annually
- Use separate apps for staging/production

### Token Caching
```typescript
// Cache tokens in memory with expiry check
const tokenCache = new Map<number, { token: string; expiresAt: Date }>();

async function getCachedToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  
  if (cached && cached.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    // Return cached token if not expiring in 5 minutes
    return cached.token;
  }
  
  // Fetch new token
  const { token, expiresAt } = await githubApp.getInstallationToken(installationId);
  tokenCache.set(installationId, { token, expiresAt });
  return token;
}
```

### Permission Validation
- Check installation permissions before attempting operations
- Gracefully handle permission changes (re-install required)
- Show clear error messages for missing permissions

## Rate Limiting

GitHub Apps have separate rate limits from user tokens:
- **Server-to-server requests**: 5,000 requests/hour per installation
- **User-to-server requests**: 5,000 requests/hour per user

Benefits:
- Each installation has its own rate limit
- Not shared across all users (unlike PAT)

## Migration Strategy

### From PAT to GitHub App

1. **Dual-mode support** (transition period):
   ```typescript
   if (installationId) {
     return createIssueViaApp(installationId, ...);
   } else if (process.env.GITHUB_TOKEN) {
     return createIssueViaPAT(...); // Fallback
   }
   ```

2. **Admin notification**:
   - Show banner: "Migrate to GitHub App for better security"
   - Link to settings page

3. **Graceful degradation**:
   - If GitHub App not installed, offer browser fallback
   - Or prompt to install app

## Cost Considerations

GitHub Apps are **free** for:
- Public repositories
- Open source organizations

For private repos on paid plans, the app acts on behalf of the user's subscription.

## Success Metrics

| Metric | Target |
|--------|--------|
| Installation rate | > 50% of active orgs |
| Issue creation success | > 95% via API |
| Token refresh failures | < 1% |
| User confusion reports | < 5% |

## Future Enhancements

1. **Automatic issue updates** - Update existing issues on re-scan
2. **PR comments** - Comment on pull requests with security findings
3. **Checks API** - Integrate with GitHub Checks for CI/CD
4. **Advanced permissions** - Request code scanning alerts access
5. **Organization-wide policies** - Org admins can mandate installation

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-04 | Use GitHub App over PAT | Better security, auditable, proper bot identity |
| 2026-02-04 | Support dual-mode during migration | Smooth transition, no breaking changes |
| 2026-02-04 | Cache tokens in memory | Performance, reduce API calls |

---

**Status:** Proposed  
**Priority:** High (security improvement)  
**Estimated Effort:** 2-3 days  
**Dependencies:** None (can be built alongside PAT support)
