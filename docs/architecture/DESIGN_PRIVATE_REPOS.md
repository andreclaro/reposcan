# Design Document: Private Repository Support

## Executive Summary

This document outlines the architecture and implementation plan for adding **private repository scanning** support to the `sec-audit-repos` platform. Currently, only public GitHub repositories can be scanned. This feature will enable users to scan their private repositories by leveraging their existing GitHub OAuth authentication.

## Current State

### Existing Authentication Flow
- Users authenticate via **NextAuth.js** with **GitHub OAuth**
- GitHub access tokens are stored in the `accounts` table
- Tokens are currently used only for GitHub API calls (rate limiting)
- Repository access is limited to **public repos only**

### Current Repository Access
```typescript
// Current: Only public repos via GitHub API
GET /api/github/repos?owner=username
// Filters: .filter((repo: any) => !repo.private)
```

### Current Clone Process
- Backend clones repos using anonymous HTTPS
- No authentication credentials passed to workers
- SSH URLs supported but no SSH keys configured

---

## Proposed Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Private Repository Flow                              │
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Frontend   │────▶│   Backend    │────▶│   Worker     │                │
│  │  (Next.js)   │     │   (Python)   │     │  (Celery)    │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                   │                    │                          │
│         ▼                   ▼                    ▼                          │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                    GitHub OAuth Token Flow                          │   │
│  │                                                                     │   │
│  │  1. User signs in with GitHub (already implemented)                │   │
│  │  2. Token stored in accounts.access_token                         │   │
│  │  3. Token passed to worker via encrypted queue                      │   │
│  │  4. Worker uses token for git operations                            │   │
│  │                                                                     │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Components

### 1. Database Schema Changes

#### 1.1 Repository Access Tracking (Optional Enhancement)

```typescript
// New table: user_repositories
// Tracks which repos user has granted access to

export const userRepositories = pgTable(
  "user_repository",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repoUrl: text("repo_url").notNull(), // Normalized URL
    repoName: text("repo_name").notNull(), // owner/repo format
    isPrivate: boolean("is_private").notNull().default(false),
    // Permission level GitHub granted
    permissions: jsonb("permissions").$type<{
      admin: boolean;
      push: boolean;
      pull: boolean;
    }>(),
    // Encrypted credential reference (not the actual token)
    credentialRef: text("credential_ref"), // Reference to secure token storage
    lastAccessedAt: timestamp("last_accessed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => [
    unique("user_repo_unique").on(table.userId, table.repoUrl),
    index("idx_user_repos_user_id").on(table.userId),
    index("idx_user_repos_url").on(table.repoUrl),
  ]
);
```

#### 1.2 Scan Request Enhancement

```typescript
// Existing scans table - add credential reference
export const scans = pgTable("scan", {
  // ... existing fields ...
  
  // NEW: Credential reference for private repo access
  credentialRef: text("credential_ref"), // Encrypted token reference
  repoVisibility: text("repo_visibility").default("public"), // 'public' | 'private'
  
  // ... rest of fields ...
});
```

### 2. Token Management Architecture

#### 2.1 Token Encryption Strategy

```typescript
// lib/token-vault.ts
// Secure token storage and retrieval

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ENCRYPTION_KEY = scryptSync(
  process.env.TOKEN_ENCRYPTION_SECRET!,
  'salt',
  32
);

export interface TokenVault {
  // Store token, return reference ID
  storeToken(userId: string, token: string): Promise<string>;
  
  // Retrieve token by reference
  retrieveToken(credentialRef: string): Promise<string | null>;
  
  // Delete token
  deleteToken(credentialRef: string): Promise<void>;
  
  // Rotate encryption keys
  rotateKey(oldKey: string, newKey: string): Promise<void>;
}

// Implementation using AES-256-GCM
export class SecureTokenVault implements TokenVault {
  async storeToken(userId: string, token: string): Promise<string> {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    const ref = generateSecureRef();
    
    // Store in database
    await db.insert(encryptedTokens).values({
      ref,
      userId,
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });
    
    return ref;
  }
  
  async retrieveToken(credentialRef: string): Promise<string | null> {
    const record = await db.query.encryptedTokens.findFirst({
      where: eq(encryptedTokens.ref, credentialRef),
    });
    
    if (!record || record.expiresAt < new Date()) {
      return null;
    }
    
    const decipher = createDecipheriv(
      'aes-256-gcm',
      ENCRYPTION_KEY,
      Buffer.from(record.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(record.authTag, 'hex'));
    
    let decrypted = decipher.update(record.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

#### 2.2 Environment Variables

```bash
# .env.local / .env.example

# Token encryption (required for private repo support)
TOKEN_ENCRYPTION_SECRET=<32-byte-random-string>

# Optional: Token expiration (default: 24 hours)
TOKEN_EXPIRY_HOURS=24

# Optional: Redis for token caching
REDIS_TOKEN_CACHE_URL=redis://localhost:6379/1
```

### 3. API Layer Changes

#### 3.1 Frontend API Route Updates

```typescript
// app/api/scan/route.ts

import { getUserGitHubToken } from "@/lib/github-token";
import { SecureTokenVault } from "@/lib/token-vault";

export async function POST(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { repoUrl, branch, auditTypes, forceRescan, isPrivate } = body;

  // Check if this is a private repository request
  let credentialRef: string | undefined;
  
  if (isPrivate) {
    // Get user's GitHub token
    const githubToken = await getUserGitHubToken(session.user.id);
    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub authentication required for private repositories" },
        { status: 403 }
      );
    }

    // Verify user has access to this private repo
    const hasAccess = await verifyRepoAccess(githubToken, repoUrl);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "You do not have access to this repository" },
        { status: 403 }
      );
    }

    // Store token securely and get reference
    const vault = new SecureTokenVault();
    credentialRef = await vault.storeToken(session.user.id, githubToken);
  }

  // Pass credential reference to backend
  const payload = {
    repo_url: repoUrl,
    branch,
    audit_types: auditTypes,
    force_rescan: forceRescan,
    credential_ref: credentialRef, // NEW
    repo_visibility: isPrivate ? "private" : "public", // NEW
  };

  // ... rest of the scan logic ...
}
```

#### 3.2 GitHub Repository Listing (Updated)

```typescript
// app/api/github/repos/route.ts

export async function GET(request: Request) {
  // ... existing auth checks ...

  // NEW: Support fetching private repos
  const { searchParams } = new URL(request.url);
  const includePrivate = searchParams.get("include_private") === "true";

  let token = await getUserGitHubToken(session.user.id);
  
  if (includePrivate && !token) {
    return NextResponse.json(
      { error: "GitHub OAuth required for private repositories" },
      { status: 403 }
    );
  }

  // ... existing token fallback logic ...

  // UPDATED: Fetch private repos if requested and authorized
  const reposUrl = includePrivate
    ? `https://api.github.com/user/repos?affiliation=owner,collaborator&sort=updated&direction=desc&page=${page}&per_page=${perPage}`
    : `https://api.github.com/users/${encodeURIComponent(owner)}/repos?type=all&sort=updated&direction=desc&page=${page}&per_page=${perPage}`;

  const response = await fetch(reposUrl, { headers });
  
  // UPDATED: Return both public and private repos (filtered by visibility)
  const repos = data.map((repo: any) => ({
    url: repo.html_url,
    name: repo.full_name,
    stars: repo.stargazers_count || 0,
    private: repo.private, // NEW
    permissions: repo.permissions, // NEW
  }));

  // Filter based on includePrivate flag
  const filteredRepos = includePrivate 
    ? repos 
    : repos.filter((r: any) => !r.private);

  return NextResponse.json({
    repositories: filteredRepos,
    count: filteredRepos.length,
    owner,
    includePrivate: !!includePrivate,
  });
}
```

### 4. Backend Changes

#### 4.1 API Models Update

```python
# backend/src/api/models.py

from typing import Optional
from pydantic import BaseModel, Field

class ScanRequest(BaseModel):
    repo_url: str = Field(..., description="Repository URL to scan")
    branch: Optional[str] = Field(None, description="Branch to scan (default: auto-detect)")
    audit_types: List[str] = Field(default=["all"], description="List of audit types")
    credential_ref: Optional[str] = Field(None, description="Reference to encrypted Git token")
    repo_visibility: str = Field("public", description="Repository visibility: public or private")
    force_rescan: bool = Field(False, description="Force rescan even if cached")
    skip_lfs: bool = Field(False, description="Skip Git LFS files")
```

#### 4.2 Token Retrieval Service

```python
# backend/src/audit/token_vault.py

import os
import json
import base64
from typing import Optional
from datetime import datetime, timedelta
import httpx

class TokenVaultClient:
    """Client to retrieve encrypted tokens from frontend API."""
    
    def __init__(self):
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        self.api_secret = os.getenv("WORKER_API_SECRET")  # Shared secret
    
    async def get_token(self, credential_ref: str) -> Optional[str]:
        """
        Retrieve decrypted token from frontend API.
        
        Security: Uses shared secret authentication between worker and frontend.
        Tokens are never stored in the worker or passed in Celery tasks.
        """
        if not credential_ref:
            return None
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.frontend_url}/api/internal/token",
                headers={
                    "Authorization": f"Bearer {self.api_secret}",
                    "Content-Type": "application/json",
                },
                json={"credential_ref": credential_ref},
                timeout=10.0,
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            return data.get("token")

# Alternative: Direct Redis token cache (if implemented)
class RedisTokenCache:
    """Direct Redis access for token retrieval (faster)."""
    
    def __init__(self, redis_url: str):
        import redis
        self.client = redis.from_url(redis_url, decode_responses=True)
        self.encryption_key = os.getenv("TOKEN_ENCRYPTION_SECRET")
    
    def get_token(self, credential_ref: str) -> Optional[str]:
        """Retrieve and decrypt token from Redis cache."""
        encrypted = self.client.get(f"token:{credential_ref}")
        if not encrypted:
            return None
        
        # Decrypt token
        return decrypt_token(encrypted, self.encryption_key)
```

#### 4.3 Enhanced Repository Cloning

```python
# backend/src/audit/repos.py

import os
import tempfile
from typing import Optional
from pathlib import Path
import subprocess

async def clone_repo_with_auth(
    repo: str,
    dest_dir: Path,
    branch: Optional[str],
    skip_lfs: bool,
    credential_ref: Optional[str] = None,
    token_vault: Optional[TokenVaultClient] = None,
) -> str:
    """
    Clone a Git repository with optional authentication.
    
    Args:
        repo: Repository URL
        dest_dir: Destination directory
        branch: Branch to clone
        skip_lfs: Skip Git LFS files
        credential_ref: Reference to encrypted token
        token_vault: Token vault client for retrieving credentials
    
    Returns:
        Branch name that was cloned
    """
    # Validate URL
    _validate_repo_url_ssrf(repo)
    
    # Get token if credential reference provided
    token = None
    if credential_ref and token_vault:
        token = await token_vault.get_token(credential_ref)
        if not token:
            raise RuntimeError("Failed to retrieve authentication credentials")
    
    # Configure git credential helper
    env = os.environ.copy()
    git_config_dir = None
    
    try:
        if token:
            # Create temporary git credential helper
            git_config_dir = Path(tempfile.mkdtemp(prefix="git_cred_"))
            credential_helper = git_config_dir / "git-credential-helper.sh"
            
            # Parse URL to extract host
            parsed = urlparse(repo)
            host = parsed.hostname or "github.com"
            
            # Write credential helper script
            credential_helper.write_text(
                f'#!/bin/sh\necho "username=oauth\npassword={token}"\n',
                encoding="utf-8"
            )
            credential_helper.chmod(0o700)
            
            # Configure git to use helper
            env["GIT_CONFIG_GLOBAL"] = str(git_config_dir / ".gitconfig")
            gitconfig = git_config_dir / ".gitconfig"
            gitconfig.write_text(f"""[credential]
    helper = {credential_helper}
[credential "https://{host}"]
    username = oauth
""")
        
        # Build git clone command
        git_cmd = ["git"]
        if skip_lfs:
            git_cmd.extend([
                "-c", "filter.lfs.smudge=",
                "-c", "filter.lfs.process=",
                "-c", "filter.lfs.required=false",
            ])
        
        git_cmd.append("clone")
        
        # Detect default branch if not specified
        if not branch:
            branch = await get_default_branch(repo, token)
        
        git_cmd.extend(["--branch", branch])
        git_cmd.extend([repo, str(dest_dir)])
        
        # Execute clone
        result = subprocess.run(
            git_cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT,
            env=env,
        )
        
        return branch
        
    except subprocess.CalledProcessError as e:
        # Check for authentication errors
        error_msg = e.stderr or e.stdout or str(e)
        if "Authentication failed" in error_msg or "403" in error_msg:
            raise RuntimeError(
                "Authentication failed. Please ensure you have access to this repository "
                "and your GitHub token has not expired."
            ) from e
        raise RuntimeError(f"Failed to clone repository: {error_msg}") from e
        
    finally:
        # Cleanup credential helper
        if git_config_dir and git_config_dir.exists():
            import shutil
            shutil.rmtree(git_config_dir, ignore_errors=True)


async def get_default_branch(repo: str, token: Optional[str] = None) -> str:
    """
    Detect default branch with optional authentication.
    """
    env = os.environ.copy()
    
    if token:
        # Create Authorization header for git ls-remote
        import base64
        auth = base64.b64encode(f"oauth:{token}".encode()).decode()
        env["GIT_ASKPASS"] = "echo"
        env["GIT_USERNAME"] = "oauth"
        env["GIT_PASSWORD"] = token
    
    # ... rest of implementation ...
```

### 5. Worker Integration

```python
# backend/src/worker/scan_worker.py

from audit.token_vault import TokenVaultClient

@celery_app.task(bind=True, name='tasks.scan_worker.run_scan', max_retries=3)
def run_scan(self, scan_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
    repo_url = request_data['repo_url']
    branch = request_data.get('branch')
    audit_types = request_data.get('audit_types', [])
    credential_ref = request_data.get('credential_ref')  # NEW
    repo_visibility = request_data.get('repo_visibility', 'public')  # NEW
    
    # Initialize token vault client for private repos
    token_vault = None
    if repo_visibility == 'private' and credential_ref:
        token_vault = TokenVaultClient()
    
    # ... existing setup code ...
    
    try:
        # Clone repository with authentication if needed
        with tempfile.TemporaryDirectory(prefix=f"scan_{scan_id}_") as tmpdir:
            tmpdir_path = Path(tmpdir)
            repo_path = tmpdir_path / safe_repo_slug(repo_url)
            
            # UPDATED: Use authenticated clone for private repos
            if credential_ref:
                from audit.repos import clone_repo_with_auth
                actual_branch = await clone_repo_with_auth(
                    repo_url,
                    repo_path,
                    branch,
                    skip_lfs,
                    credential_ref=credential_ref,
                    token_vault=token_vault,
                )
            else:
                actual_branch = clone_repo(repo_url, repo_path, branch, skip_lfs)
            
            # ... rest of scan logic ...
            
    except Exception as exc:
        # Handle authentication errors specifically
        if "Authentication failed" in str(exc):
            # Don't retry auth failures
            raise exc
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

### 6. Frontend UI Components

#### 6.1 Repository Selector (Enhanced)

```typescript
// components/repo-selector.tsx

import { useState } from "react";
import { useSession } from "next-auth/react";

interface RepoSelectorProps {
  onSelect: (repo: { url: string; name: string; private: boolean }) => void;
}

export function RepoSelector({ onSelect }: RepoSelectorProps) {
  const { data: session } = useSession();
  const [includePrivate, setIncludePrivate] = useState(false);
  const [repos, setRepos] = useState([]);
  
  const fetchRepos = async () => {
    const response = await fetch(
      `/api/github/repos?include_private=${includePrivate}`
    );
    const data = await response.json();
    setRepos(data.repositories);
  };
  
  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includePrivate}
            onChange={(e) => setIncludePrivate(e.target.checked)}
            disabled={!session?.user}
          />
          Include private repositories
        </label>
        {!session?.user && (
          <span className="text-sm text-gray-500">
            Sign in with GitHub to access private repos
          </span>
        )}
      </div>
      
      <div className="repo-list">
        {repos.map((repo) => (
          <button
            key={repo.name}
            onClick={() => onSelect(repo)}
            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded"
          >
            {repo.private && (
              <Lock className="w-4 h-4 text-amber-500" />
            )}
            <span>{repo.name}</span>
            {repo.private && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                Private
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

#### 6.2 Scan Form (Updated)

```typescript
// components/scan-form.tsx

export function ScanForm() {
  const [repoUrl, setRepoUrl] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoUrl,
        isPrivate, // Pass visibility to backend
        auditTypes: ["all"],
      }),
    });
    
    // ... handle response ...
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
      />
      
      <label className="flex items-center gap-2 mt-4">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        This is a private repository
      </label>
      
      <button type="submit">Start Scan</button>
    </form>
  );
}
```

---

## Security Considerations

### 1. Token Security

| Layer | Protection |
|-------|------------|
| **At Rest** | AES-256-GCM encryption in database |
| **In Transit** | HTTPS only, TLS 1.3 |
| **In Memory** | Cleared immediately after use |
| **Expiration** | 24-hour TTL on encrypted tokens |
| **Audit** | Log all token access with user/session |

### 2. Access Control

```typescript
// Verify user has access to private repo
async function verifyRepoAccess(
  token: string, 
  repoUrl: string
): Promise<boolean> {
  const { owner, repo } = parseGitHubRepo(repoUrl);
  
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );
  
  if (!response.ok) {
    return false;
  }
  
  const data = await response.json();
  
  // Verify user has pull access
  return data.permissions?.pull === true;
}
```

### 3. Audit Logging

```typescript
// Log all private repo access
async function logPrivateRepoAccess({
  userId,
  repoUrl,
  action, // 'clone', 'scan', 'view'
  success,
  error,
}: LogEntry) {
  await db.insert(auditLogs).values({
    userId,
    repoUrl,
    action,
    success,
    error,
    ipAddress: request.ip,
    userAgent: request.headers.get('user-agent'),
    timestamp: new Date(),
  });
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Tasks**:
1. Database migrations
   - Create `encrypted_tokens` table
   - Add `credential_ref` and `repo_visibility` to `scans` table
   - Optional: Create `user_repositories` table

2. Token vault implementation
   - Encryption/decryption service
   - Token storage and retrieval API
   - Expiration and cleanup logic

3. Environment setup
   - Add `TOKEN_ENCRYPTION_SECRET` to config
   - Update Docker Compose for local dev

**Deliverables**:
- Token vault operational
- Secure token storage/retrieval working

---

### Phase 2: Backend Integration (Week 2)

**Tasks**:
1. Update Python backend
   - Add `credential_ref` to API models
   - Implement `TokenVaultClient`
   - Create `clone_repo_with_auth()` function
   - Update worker to handle private repos

2. Internal API
   - Create `/api/internal/token` endpoint
   - Implement shared secret authentication

3. Error handling
   - Auth failure detection
   - Token expiration handling
   - Retry logic for transient failures

**Deliverables**:
- Backend can clone private repos with tokens
- Authentication errors handled gracefully

---

### Phase 3: Frontend Integration (Week 3)

**Tasks**:
1. Update scan API route
   - Accept `isPrivate` flag
   - Store tokens securely
   - Pass credential ref to backend

2. Update GitHub repos API
   - Support `include_private` parameter
   - Return private repos when authorized

3. UI Components
   - Private repo indicator in lists
   - Visibility toggle in scan form
   - Authentication prompt for private repos

**Deliverables**:
- Users can select and scan private repos
- UI clearly indicates private vs public

---

### Phase 4: Security Hardening (Week 4)

**Tasks**:
1. Security review
   - Penetration testing
   - Token leak detection
   - Access control verification

2. Audit logging
   - Implement comprehensive logging
   - Log retention policies
   - Alerting for suspicious activity

3. Documentation
   - Security runbook
   - Incident response procedures
   - User documentation

**Deliverables**:
- Security audit passed
- Logging and monitoring in place
- Documentation complete

---

## Testing Strategy

### Unit Tests

```python
# tests/test_token_vault.py

async def test_token_encryption_decryption():
    vault = SecureTokenVault()
    token = "ghp_test_token_12345"
    user_id = "user_123"
    
    ref = await vault.storeToken(user_id, token)
    retrieved = await vault.retrieveToken(ref)
    
    assert retrieved == token

async def test_token_expiration():
    vault = SecureTokenVault()
    token = "ghp_test_token_12345"
    
    ref = await vault.storeToken("user_123", token, expires_in_seconds=1)
    await asyncio.sleep(2)
    
    retrieved = await vault.retrieveToken(ref)
    assert retrieved is None
```

### Integration Tests

```python
# tests/test_private_repo_clone.py

@pytest.mark.integration
async def test_clone_private_repo():
    """Test cloning a real private repo (requires test credentials)."""
    token = os.getenv("TEST_GITHUB_TOKEN")
    repo_url = "https://github.com/test-org/private-test-repo"
    
    with tempfile.TemporaryDirectory() as tmpdir:
        dest = Path(tmpdir) / "repo"
        
        branch = await clone_repo_with_auth(
            repo_url,
            dest,
            branch="main",
            skip_lfs=True,
            token=token,
        )
        
        assert dest.exists()
        assert (dest / ".git").exists()
```

---

## Deployment Considerations

### Environment Variables

```bash
# Required for private repo support
TOKEN_ENCRYPTION_SECRET=<generate-with-openssl-rand-base64-32>
WORKER_API_SECRET=<generate-with-openssl-rand-base64-32>

# Optional
TOKEN_EXPIRY_HOURS=24
REDIS_TOKEN_CACHE_URL=redis://localhost:6379/1
```

### Database Migrations

```sql
-- migrations/0009_private_repo_support.sql

-- Encrypted token storage
CREATE TABLE encrypted_tokens (
    id SERIAL PRIMARY KEY,
    ref TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    encrypted_data TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    accessed_at TIMESTAMP
);

CREATE INDEX idx_encrypted_tokens_ref ON encrypted_tokens(ref);
CREATE INDEX idx_encrypted_tokens_user ON encrypted_tokens(user_id);
CREATE INDEX idx_encrypted_tokens_expires ON encrypted_tokens(expires_at);

-- Add columns to scans table
ALTER TABLE scans 
    ADD COLUMN credential_ref TEXT,
    ADD COLUMN repo_visibility TEXT DEFAULT 'public';

CREATE INDEX idx_scans_credential ON scans(credential_ref);

-- Audit log for private repo access
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    repo_url TEXT NOT NULL,
    action TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    error TEXT,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Private repo scan success rate | >95% |
| Token security incidents | 0 |
| Average scan time (private vs public) | <10% difference |
| User adoption (private repos) | 30% of scans within 3 months |

---

## Future Enhancements

1. **GitLab Support**: Extend to GitLab private repos
2. **Bitbucket Support**: Add Bitbucket Cloud support
3. **Self-Hosted GitHub**: GitHub Enterprise Server support
4. **SSH Key Authentication**: Alternative to OAuth tokens
5. **Repository Webhooks**: Auto-scan on push events
6. **Fine-Grained Permissions**: Branch-level access control

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-04  
**Author**: Architecture Team
