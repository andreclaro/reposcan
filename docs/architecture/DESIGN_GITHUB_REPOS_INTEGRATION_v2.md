# GitHub Repository Integration Design v2

## Overview

This document outlines the recommended approach for integrating with GitHub repositories to enable security scanning of both public and private repositories.

## Current State

- **OAuth App** with minimal scope (`read:user user:email`)
- No repository access via OAuth
- Public repos: Can be scanned without authentication
- Private repos: Not supported

## Recommended Architecture: OAuth App + GitHub App

Use **both** OAuth App and GitHub App together - they serve different purposes:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Authentication                          │
│  ┌─────────────────┐                                            │
│  │   OAuth App     │ ◄── Sign in with GitHub                   │
│  │  (minimal scope)│    read:user user:email                    │
│  │                 │    → Identifies user, provides email        │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │   User Session  │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           │         ┌─────────────────────────────────────┐     │
│           │         │  Repository Access (Optional)       │     │
│           │         │  ┌─────────────────────────────┐    │     │
│           │         │  │   GitHub App                │    │     │
│           │         │  │  (user installation)        │    │     │
│           │         │  │                             │    │     │
│           │         │  │  Permissions:               │    │     │
│           │         │  │  - Contents: Read-only      │    │     │
│           │         │  │  - Metadata: Read-only      │    │     │
│           │         │  │                             │    │     │
│           │         │  │  User selects specific      │    │     │
│           │         │  │  repositories to share      │    │     │
│           │         │  └─────────────────────────────┘    │     │
│           │         └─────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Why use both?

| Aspect | OAuth App | GitHub App |
|--------|-----------|------------|
| **Purpose** | User authentication (who are you?) | Resource authorization (what repos?) |
| **User Experience** | "Sign in with GitHub" - familiar, simple | "Install SecurityKit" - explicit permission |
| **Scope** | read:user user:email | Repo-specific, fine-grained |
| **Token Lifetime** | Until revoked | Short-lived (1 hour), auto-refresh |

### Key Benefits

1. **Progressive permission** - Sign in with minimal OAuth, connect repos later
2. **Fine-grained control** - User selects specific repos (not all-or-nothing)
3. **Better security** - Short-lived tokens, no long-term storage needed
4. **Easy revocation** - Uninstall app = instant access removal
5. **Org-friendly** - GitHub Apps work better with organizations

---

## Implementation

### Database Schema

```typescript
// GitHub App installation tracking
export const githubAppInstallations = pgTable("github_app_installation", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  installationId: integer("installation_id").notNull().unique(),
  accountLogin: text("account_login").notNull(), // User or org name
  accountType: text("account_type").notNull(), // 'User' or 'Organization'
  repositories: jsonb("repositories").$type<string[]>(), // Selected repo names
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow()
});
```

### GitHub App Configuration

```typescript
const GITHUB_APP_CONFIG = {
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  clientId: process.env.GITHUB_APP_CLIENT_ID!,
  clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
  webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET!,
};
```

### Required Permissions

| Permission | Access Level | Purpose |
|------------|--------------|---------|
| Contents | Read-only | Clone repositories |
| Metadata | Read-only | List repositories |
| Issues | Read-only | Read security issues (optional) |

### Installation Flow

1. User clicks "Connect GitHub Repositories" in Settings
2. Redirected to GitHub App installation page
3. User selects:
   - Personal repositories (all or selected)
   - Organization repositories (requires org admin approval)
4. GitHub redirects back with `installation_id`
5. Backend exchanges for installation access token
6. Store installation ID and repository list

### Token Generation

```typescript
import { App } from 'octokit';

const app = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
});

async function getInstallationToken(installationId: number) {
  const octokit = await app.getInstallationOctokit(installationId);
  const { data } = await octokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
  });
  return data.token; // Short-lived token (1 hour)
}
```

---

## UI Design

```
┌─────────────────────────────────────────┐
│         GitHub Integration              │
├─────────────────────────────────────────┤
│                                         │
│  Status: ● Connected (OAuth)            │
│  Email: user@example.com                │
│                                         │
├─────────────────────────────────────────┤
│  Repository Access                      │
├─────────────────────────────────────────┤
│                                         │
│  GitHub App: ○ Not connected            │
│                                         │
│  [Connect GitHub Repositories]          │
│                                         │
│  ─── OR ───                             │
│                                         │
│  Public repositories can be scanned     │
│  without authentication.                │
│                                         │
└─────────────────────────────────────────┘
```

After connecting:

```
┌─────────────────────────────────────────┐
│         GitHub Integration              │
├─────────────────────────────────────────┤
│                                         │
│  Status: ● Connected (OAuth)            │
│  Email: user@example.com                │
│                                         │
├─────────────────────────────────────────┤
│  Repository Access                      │
├─────────────────────────────────────────┤
│                                         │
│  GitHub App: ● Connected                │
│  Account: andreclaro (User)             │
│  Repositories: 5 selected               │
│                                         │
│  [Manage Repositories]  [Disconnect]    │
│                                         │
│  Selected repositories:                 │
│  ☑ andreclaro/repo-1                    │
│  ☑ andreclaro/repo-2                    │
│  ☑ andreclaro/private-repo              │
│  ☑ org-name/shared-repo                 │
│                                         │
└─────────────────────────────────────────┘
```

---

## API Endpoints

### Initiate GitHub App Installation

```http
POST /api/github/install

Response: 302 Redirect
Location: https://github.com/apps/securitykit/installations/new
```

### Handle Installation Callback

```http
GET /api/github/install/callback?installation_id=123&setup_action=install

Response: 302 Redirect
Location: /app/settings?github=connected
```

### Get Installation Status

```http
GET /api/github/install

Response: 200 OK
{
  "connected": true,
  "installationId": 123,
  "accountLogin": "andreclaro",
  "accountType": "User",
  "repositories": ["repo-1", "repo-2", "private-repo"]
}
```

### List Available Repositories

```http
GET /api/github/repos?installation_id=123

Response: 200 OK
{
  "repositories": [
    { "name": "repo-1", "fullName": "andreclaro/repo-1", "private": false },
    { "name": "private-repo", "fullName": "andreclaro/private-repo", "private": true }
  ]
}
```

### Disconnect GitHub App

```http
DELETE /api/github/install

Response: 200 OK
{
  "success": true
}
```

---

## Security Considerations

### Pros

- **Fine-grained repository selection** - Users choose which repos to share
- **Short-lived tokens** - Installation tokens expire after 1 hour
- **Automatic refresh** - No manual token rotation needed
- **User-controlled access** - Can revoke access anytime by uninstalling app
- **Organization support** - Proper admin approval workflow for orgs
- **No token storage** - Only installation ID stored, tokens generated on-demand

### Implementation Security

```
┌─────────────────────────────────────────────────────────┐
│  Security Requirements                                    │
├─────────────────────────────────────────────────────────┤
│  Private Key: Stored in environment variable             │
│  Key Rotation: Quarterly (manual regeneration)           │
│  Webhook Verification: HMAC-SHA256 signature check       │
│  Access Logging: All repo access logged                  │
│  Token Lifetime: 1 hour (GitHub-enforced)                │
│  Token Scope: Installation tokens scoped to selected     │
│               repositories only                          │
└─────────────────────────────────────────────────────────┘
```

---

## Webhook Handling

GitHub App sends webhooks for installation events:

```typescript
// app/api/github/webhook/route.ts
import { verifyWebhookSignature } from '@/lib/github-webhook';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  
  if (!verifyWebhookSignature(body, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  const event = JSON.parse(body);
  
  switch (event.action) {
    case 'created':
      // Installation created - store in database
      await storeInstallation(event.installation);
      break;
      
    case 'deleted':
      // Installation deleted - remove from database
      await removeInstallation(event.installation.id);
      break;
      
    case 'suspend':
      // Installation suspended - mark as inactive
      await suspendInstallation(event.installation.id);
      break;
  }
  
  return new Response('OK');
}
```

---

## Migration Plan

### Phase 1: GitHub App Setup

1. Create GitHub App in GitHub Marketplace
   - Set name, description, homepage URL
   - Configure callback URL: `/api/github/install/callback`
   - Setup webhook URL: `/api/github/webhook`
   - Request permissions: Contents (read), Metadata (read)
   - Subscribe to events: Installation, Repository

2. Database migration
   ```sql
   CREATE TABLE github_app_installation (
     id SERIAL PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     installation_id INTEGER NOT NULL UNIQUE,
     account_login TEXT NOT NULL,
     account_type TEXT NOT NULL, -- 'User' or 'Organization'
     repositories JSONB DEFAULT '[]',
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(user_id, installation_id)
   );
   
   CREATE INDEX idx_github_app_installation_user_id ON github_app_installation(user_id);
   CREATE INDEX idx_github_app_installation_installation_id ON github_app_installation(installation_id);
   ```

3. Environment variables
   ```bash
   GITHUB_APP_ID=123456
   GITHUB_APP_CLIENT_ID=Iv1.xxx
   GITHUB_APP_CLIENT_SECRET=xxx
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   GITHUB_APP_WEBHOOK_SECRET=xxx
   ```

### Phase 2: API Implementation

1. Installation flow endpoints
2. Webhook handler
3. Token generation service
4. Repository listing API

### Phase 3: UI Implementation

1. Settings page - GitHub integration section
2. Repository picker/modal
3. Connection status indicator
4. Disconnect functionality

### Phase 4: Worker Integration

Update scan worker to use GitHub App installation tokens:

```typescript
// In scan worker
async function getTokenForRepo(userId: string, repoUrl: string) {
  // Check if user has GitHub App installation
  const installation = await getInstallationForUser(userId);
  
  if (installation && hasRepoAccess(installation, repoUrl)) {
    // Generate short-lived installation token
    return await generateInstallationToken(installation.installationId);
  }
  
  // Fall back to server token (for public repos)
  return process.env.GITHUB_TOKEN;
}
```

---

## Environment Variables

```bash
# OAuth App (existing)
AUTH_GITHUB_ID=xxx
AUTH_GITHUB_SECRET=xxx

# GitHub App (new)
GITHUB_APP_ID=xxx
GITHUB_APP_CLIENT_ID=Iv1.xxx
GITHUB_APP_CLIENT_SECRET=xxx
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
GITHUB_APP_WEBHOOK_SECRET=xxx

# Server token (for public repos, optional)
GITHUB_TOKEN=ghp_xxx
```

---

## Conclusion

**Recommended approach: OAuth App + GitHub App**

This provides:
- Simple authentication with OAuth
- Fine-grained repository access with GitHub App
- Progressive permission model
- Best security practices (short-lived tokens)
- Excellent user experience

**Key Principles:**
1. **Separation of concerns** - OAuth for auth, GitHub App for repos
2. **User control** - Explicit repository selection
3. **Security** - Short-lived tokens, no long-term storage
4. **Flexibility** - Optional GitHub App installation
