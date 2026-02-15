# GitHub Repository Integration Design v2

## Overview

This document outlines design options for integrating with GitHub repositories to enable security scanning of both public and private repositories.

## Current State

- **OAuth App** with minimal scope (`read:user user:email`)
- No repository access via OAuth
- Public repos: Can be scanned without authentication
- Private repos: Not supported

## Design Options

### Option 1: Personal Access Tokens (PATs)

Users create and store their own GitHub Personal Access Tokens in our application settings.

#### Implementation

```typescript
// Database schema addition
export const userGitHubTokens = pgTable("user_github_token", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  encryptedToken: text("encrypted_token").notNull(),
  tokenHint: text("token_hint"), // Last 4 chars for display: "...ghp_xxxx"
  scopes: text("scopes"), // Stored scopes at time of save
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow()
});
```

#### Token Types

| Token Type | Granularity | Security | Setup Complexity |
|------------|-------------|----------|------------------|
| Classic PAT | All repos, all permissions | Medium (can be too broad) | Simple |
| Fine-grained PAT | Repo-specific, permission-specific | High | Medium |

#### UI Flow

1. User navigates to Settings → GitHub Token
2. Instructions shown with link to GitHub token creation page
3. User creates token with required scopes:
   - `repo` (for private repos) or `public_repo` (for public only)
   - `read:org` (if scanning org repos)
4. User pastes token into secure input field
5. Token encrypted with AES-256 and stored server-side
6. Display token hint (e.g., "ghp_...abcd") for verification

#### Security Considerations

**Pros:**
- User controls token scope and expiration
- Can use fine-grained PATs for least privilege
- Tokens never exposed to client-side JavaScript
- Encryption at rest with application-level key

**Cons:**
- Users must manually rotate tokens when expired
- Classic PATs can be overly broad
- No automatic token refresh

#### Encryption Implementation

```typescript
// lib/token-encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = scryptSync(process.env.TOKEN_ENCRYPTION_SECRET!, 'salt', 32);

export function encryptToken(token: string): { encrypted: string; iv: string; authTag: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

export function decryptToken(encrypted: string, iv: string, authTag: string): string {
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

---

### Option 2: GitHub Apps

Convert from OAuth App to GitHub App for fine-grained repository access control.

#### Architecture

```
┌─────────────────┐      Install      ┌─────────────────┐
│   GitHub App    │ ◄──────────────── │  User/Org       │
│  (SecurityKit)  │    (select repos) │                 │
└────────┬────────┘                   └─────────────────┘
         │
         │ Private Key + Installation Token
         │
┌────────▼────────┐
│  Our Backend    │
│  (scan worker)  │
└─────────────────┘
```

#### Implementation

```typescript
// GitHub App configuration
const GITHUB_APP_CONFIG = {
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  clientId: process.env.GITHUB_APP_CLIENT_ID!,
  clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
  webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET!,
};

// Database schema
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

#### Permissions Required

| Permission | Access Level | Purpose |
|------------|--------------|---------|
| Contents | Read-only | Clone repositories |
| Metadata | Read-only | List repositories |
| Issues | Read-only | Read security issues (optional) |

#### Installation Flow

1. User clicks "Connect GitHub Repositories"
2. Redirected to GitHub App installation page
3. User selects:
   - Personal repositories (all or selected)
   - Organization repositories (requires org admin approval)
4. GitHub redirects back with `installation_id`
5. Backend exchanges for installation access token
6. Store installation ID and repository list

#### Token Generation

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

#### Security Considerations

**Pros:**
- Fine-grained repository selection
- Short-lived installation tokens (auto-refresh)
- User controls which repos to grant access
- No long-term token storage needed
- Supports organizations with admin approval

**Cons:**
- More complex setup (private key management)
- Requires webhook handling for installation events
- Users must install app per-account (personal + each org)
- Migration from OAuth App requires re-authentication

---

### Option 3: Hybrid - OAuth + Optional PAT

Keep current OAuth for authentication, add optional PAT for private repo access.

#### Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Authentication                          │
│  ┌─────────────┐         ┌─────────────────────────────┐   │
│  │  OAuth App  │         │  Optional: GitHub PAT       │   │
│  │  (minimal)  │         │  (for private repos)        │   │
│  └─────────────┘         └─────────────────────────────┘   │
│        │                           │                        │
│        ▼                           ▼                        │
│  ┌─────────────┐         ┌─────────────────────────────┐   │
│  │  User ID    │         │  Encrypted Token Storage    │   │
│  │  Profile    │         │  (AES-256-GCM)              │   │
│  └─────────────┘         └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Database Schema

Same as Option 1 (PAT storage).

#### UI Design

```
┌─────────────────────────────────────────┐
│         GitHub Integration              │
├─────────────────────────────────────────┤
│                                         │
│  Status: ● Connected (oauth)            │
│  Email: user@example.com                │
│                                         │
├─────────────────────────────────────────┤
│  Private Repository Access              │
├─────────────────────────────────────────┤
│                                         │
│  [Add GitHub Token]                     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Token: [********************]   │    │
│  │                                   │    │
│  │ Scope: repo (read access)         │    │
│  │                                   │    │
│  │ [Save Token]  [Test Connection]   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ℹ Create token at:                     │
│    github.com/settings/tokens           │
│                                         │
│  Recommended: Fine-grained PAT with:    │
│  - Repository access: Selected repos    │
│  - Permissions: Contents (Read)         │
│                                         │
└─────────────────────────────────────────┘
```

---

### Option 4: GitHub App with OAuth Fallback

Primary: GitHub App for repo access
Fallback: OAuth for users who don't want to install app

#### Architecture

```
                    ┌─────────────────────┐
                    │   User Login        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌─────────────────┐ ┌─────────────┐ ┌──────────────┐
    │  GitHub App     │ │   OAuth     │ │   Email/Pass │
    │  (Recommended)  │ │  (Fallback) │ │   (Fallback) │
    └────────┬────────┘ └──────┬──────┘ └──────┬───────┘
             │                 │               │
             ▼                 ▼               ▼
    ┌─────────────────┐ ┌─────────────┐ ┌──────────────┐
    │ Repo Access +   │ │  Auth Only  │ │  Auth Only   │
    │  Auth           │ │  (PAT req)  │ │  (PAT req)   │
    └─────────────────┘ └─────────────┘ └──────────────┘
```

---

## Comparison Matrix

| Criteria | PAT Only | GitHub App | Hybrid (OAuth+PAT) | GitHub App + OAuth |
|----------|----------|------------|-------------------|-------------------|
| **Setup Complexity** | Low | High | Low | Medium |
| **User Experience** | Medium | High | Medium | High |
| **Security** | Medium-High | High | Medium-High | High |
| **Granularity** | High (fine-grained) | High | High | High |
| **Token Rotation** | Manual | Automatic | Manual | Automatic |
| **Org Support** | Yes | Yes (admin approval) | Yes | Yes |
| **Migration Effort** | Low | High | Low | Medium |
| **Maintenance** | Low | Medium | Low | Medium |

---

## Recommendation

### Phase 1: Hybrid (OAuth + Optional PAT) - Immediate

**Rationale:**
- Minimal changes to existing architecture
- Quick implementation (1-2 days)
- Users can start scanning private repos immediately
- Supports fine-grained PATs for security-conscious users

**Implementation:**
1. Add `user_github_tokens` table
2. Add token encryption utilities
3. Create API endpoints:
   - `POST /api/github/token` - Save token
   - `DELETE /api/github/token` - Remove token
   - `GET /api/github/token` - Get token status (hint only)
4. Update profile page with token management UI
5. Update scan worker to use user token when available

### Phase 2: GitHub App - Future

**Rationale:**
- Best long-term user experience
- Automatic token management
- Native repository picker
- Better for enterprise/organization adoption

**Implementation:**
1. Create GitHub App in marketplace
2. Implement installation flow
3. Add webhook handlers
4. Migrate existing users (optional)
5. Deprecate PAT option (optional)

---

## Security Requirements

### Token Storage

```
┌─────────────────────────────────────────────────────────┐
│  Encryption Requirements                                │
├─────────────────────────────────────────────────────────┤
│  Algorithm: AES-256-GCM                                 │
│  Key Management: Environment variable (KMS recommended) │
│  Key Rotation: Quarterly                                │
│  Access Logging: All token access logged                │
│  Retention: Tokens deleted on account deletion          │
└─────────────────────────────────────────────────────────┘
```

### Access Controls

- Tokens only decrypted in scan worker (server-side)
- Never log full tokens
- Token hints visible to user for identification
- Rate limiting on token save/delete endpoints

---

## API Endpoints

### Save GitHub Token

```http
POST /api/github/token
Content-Type: application/json

{
  "token": "github_pat_xxx"
}

Response: 200 OK
{
  "success": true,
  "hint": "...abcd"
}
```

### Get Token Status

```http
GET /api/github/token

Response: 200 OK
{
  "hasToken": true,
  "hint": "...abcd",
  "scopes": ["repo"]
}
```

### Delete Token

```http
DELETE /api/github/token

Response: 200 OK
{
  "success": true
}
```

### Test Token

```http
POST /api/github/token/test

Response: 200 OK
{
  "valid": true,
  "scopes": ["repo", "read:org"],
  "rateLimit": {
    "limit": 5000,
    "remaining": 4999
  }
}
```

---

## Migration Plan

1. **Database Migration**
   ```sql
   CREATE TABLE user_github_token (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
     encrypted_token TEXT NOT NULL,
     iv TEXT NOT NULL,
     auth_tag TEXT NOT NULL,
     token_hint TEXT,
     scopes TEXT,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(user_id)
   );
   
   CREATE INDEX idx_user_github_token_user_id ON user_github_token(user_id);
   ```

2. **Environment Variables**
   ```bash
   # Add to .env.local
   TOKEN_ENCRYPTION_SECRET=<generate with openssl rand -base64 32>
   ```

3. **Feature Flag**
   - Add `GITHUB_TOKEN_ENABLED` feature flag
   - Gradually roll out to users

---

## Conclusion

**Recommended approach: Hybrid (OAuth + Optional PAT)**

This provides immediate value with minimal engineering effort while leaving the door open for GitHub App migration in the future.

**Key Principles:**
1. Privacy-first: OAuth only requests minimal permissions
2. User control: Optional PAT with fine-grained scope selection
3. Security: Server-side encryption, never expose tokens to client
4. Simplicity: Single OAuth flow, optional enhancement for power users
