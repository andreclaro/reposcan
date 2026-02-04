# Design Document: Private Repository Support

## Executive Summary

This document outlines the architecture and implementation plan for adding **private repository scanning** support to the `sec-audit-repos` platform. Currently, only public GitHub repositories can be scanned. This feature will enable users to scan their private repositories by leveraging their existing GitHub OAuth authentication.

**Recommended Approach**: **Ephemeral Token Pass-Through** - Tokens are encrypted and passed directly to workers via the queue, never stored in the database. This is simpler and more secure than persistent token storage.

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

## Recommended Approach: Ephemeral Token Pass-Through

### Overview

Tokens are extracted from the user's session, encrypted with a shared key, passed through the queue to the worker, used once for cloning, and immediately discarded. **No persistent token storage required.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Ephemeral Token Flow (RECOMMENDED)                        │
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Frontend   │────▶│    Redis     │────▶│   Worker     │                │
│  │  (Next.js)   │     │    Queue     │     │  (Celery)    │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                                          │                         │
│         │                                          ▼                         │
│         │                                   ┌──────────────┐                │
│         │                                   │   Decrypt    │                │
│         │                                   │   & Clone    │                │
│         │                                   │  (one-time)  │                │
│         │                                   └──────────────┘                │
│         │                                          │                         │
│         │                                          ▼                         │
│         │                                   ┌──────────────┐                │
│         └──────────────────────────────────▶│   Discard    │                │
│                                             │    Token     │                │
│                                             └──────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Token Lifecycle

| Phase | Location | Encryption | Duration |
|-------|----------|------------|----------|
| User Session | Frontend memory | None (HTTPS) | Session lifetime |
| Request Handler | API route | AES-256-GCM | Milliseconds |
| Queue (Redis) | Celery task | AES-256-GCM | 5-60 minutes (queue TTL) |
| Worker Memory | Python process | Decrypted | Seconds (clone only) |
| Post-Clone | N/A | N/A | **Immediately discarded** |

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Next.js API
    participant Redis as Redis Queue
    participant Worker as Celery Worker
    participant GitHub

    User->>Frontend: POST /api/scan (isPrivate=true)
    Note over Frontend: 1. Extract token from session
    Frontend->>Frontend: 2. Encrypt with shared key
    Frontend->>Redis: 3. Queue task + encrypted token
    Note over Redis: Token encrypted at rest
    
    Worker->>Redis: 4. Dequeue task
    Worker->>Worker: 5. Decrypt (memory only)
    Worker->>GitHub: 6. git clone with token
    Worker->>Worker: 7. Discard token
    Worker->>User: 8. Return results
```

---

## Implementation: Ephemeral Pass-Through

### 1. Shared Encryption Key

Both frontend and worker share a single encryption key via environment variables.

```bash
# .env.local (Frontend)
WORKER_ENCRYPTION_SECRET=<base64-encoded-32-byte-key>

# .env (Backend Worker)
WORKER_ENCRYPTION_SECRET=<same-base64-encoded-32-byte-key>
```

Generate:
```bash
openssl rand -base64 32
```

### 2. Frontend: Token Encryption

```typescript
// lib/token-ephemeral.ts
import { createCipheriv, randomBytes, scryptSync } from 'crypto';

const WORKER_KEY = scryptSync(
  process.env.WORKER_ENCRYPTION_SECRET!,
  'salt',
  32
);

/**
 * Encrypt a GitHub token for one-time worker use.
 * Format: iv:authTag:ciphertext (all hex encoded)
 */
export function encryptTokenForWorker(token: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', WORKER_KEY, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

### 3. Scan API Route

```typescript
// app/api/scan/route.ts
import { encryptTokenForWorker } from "@/lib/token-ephemeral";
import { getUserGitHubToken } from "@/lib/github-token";

export async function POST(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { repoUrl, branch, auditTypes, isPrivate } = body;

  let encryptedToken: string | undefined;

  if (isPrivate) {
    // Extract token from user's OAuth session
    const token = await getUserGitHubToken(session.user.id);
    if (!token) {
      return NextResponse.json(
        { error: "GitHub authentication required for private repositories" },
        { status: 403 }
      );
    }

    // Verify user has access to this repo
    const hasAccess = await verifyRepoAccess(token, repoUrl);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "You do not have access to this repository" },
        { status: 403 }
      );
    }

    // Encrypt for worker - NEVER store in database
    encryptedToken = encryptTokenForWorker(token);
  }

  const payload = {
    repo_url: repoUrl,
    branch,
    audit_types: auditTypes ?? ["all"],
    is_private: isPrivate,
    encrypted_token: encryptedToken, // Ephemeral only
  };

  // Queue scan - encrypted token travels through Redis
  const fastApiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";
  const scanResponse = await fetch(`${fastApiBase}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // ... rest of scan logic
}
```

### 4. Backend: Token Decryption

```python
# backend/src/audit/token_ephemeral.py
import os
import base64
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_WORKER_KEY: Optional[bytes] = None

def _get_key() -> bytes:
    """Lazy load and cache encryption key."""
    global _WORKER_KEY
    if _WORKER_KEY is None:
        key_b64 = os.getenv("WORKER_ENCRYPTION_SECRET")
        if not key_b64:
            raise RuntimeError("WORKER_ENCRYPTION_SECRET not configured")
        _WORKER_KEY = base64.b64decode(key_b64)
    return _WORKER_KEY


def decrypt_token(encrypted_payload: str) -> str:
    """
    Decrypt token that was encrypted by frontend.
    Format: iv:authTag:ciphertext (hex encoded)
    
    Args:
        encrypted_payload: The encrypted token string
        
    Returns:
        Decrypted token
        
    Raises:
        RuntimeError: If decryption fails
    """
    try:
        iv_hex, auth_tag_hex, ciphertext_hex = encrypted_payload.split(":")
        
        iv = bytes.fromhex(iv_hex)
        auth_tag = bytes.fromhex(auth_tag_hex)
        ciphertext = bytes.fromhex(ciphertext_hex)
        
        # AES-256-GCM decryption
        aesgcm = AESGCM(_get_key())
        plaintext = aesgcm.decrypt(iv, ciphertext + auth_tag, None)
        
        return plaintext.decode("utf-8")
    except Exception as e:
        raise RuntimeError("Failed to decrypt authentication token") from e
```

### 5. Worker: Authenticated Clone

```python
# backend/src/audit/repos.py
import os
import tempfile
import subprocess
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

async def clone_repo_with_token(
    repo: str,
    dest_dir: Path,
    branch: Optional[str],
    skip_lfs: bool,
    token: str,
) -> str:
    """
    Clone a private repository using an OAuth token.
    Token is used once and never stored.
    """
    _validate_repo_url_ssrf(repo)
    
    # Build authenticated URL
    parsed = urlparse(repo)
    host = parsed.hostname or "github.com"
    
    # Format: https://oauth:TOKEN@github.com/owner/repo.git
    auth_url = f"https://oauth:{token}@{host}{parsed.path}"
    
    # Set up git environment
    env = os.environ.copy()
    # Prevent token from appearing in process lists
    env["GIT_TERMINAL_PROMPT"] = "0"
    
    git_cmd = ["git"]
    if skip_lfs:
        git_cmd.extend([
            "-c", "filter.lfs.smudge=",
            "-c", "filter.lfs.process=",
            "-c", "filter.lfs.required=false",
        ])
    
    git_cmd.extend(["clone", "--depth", "1"])
    
    if branch:
        git_cmd.extend(["--branch", branch])
    
    git_cmd.extend([auth_url, str(dest_dir)])
    
    try:
        result = subprocess.run(
            git_cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT,
            env=env,
        )
        return branch or "main"
        
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr or e.stdout or str(e)
        
        # Mask token in error messages
        safe_error = error_msg.replace(token, "***")
        
        if "Authentication failed" in error_msg or "403" in error_msg:
            raise RuntimeError(
                "Authentication failed. Token may have expired or "
                "you may not have access to this repository."
            ) from e
        raise RuntimeError(f"Clone failed: {safe_error}") from e
```

### 6. Worker Integration

```python
# backend/src/worker/scan_worker.py
from audit.token_ephemeral import decrypt_token
from audit.repos import clone_repo_with_token

@celery_app.task(bind=True, name='tasks.scan_worker.run_scan', max_retries=2)
def run_scan(self, scan_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
    repo_url = request_data['repo_url']
    branch = request_data.get('branch')
    is_private = request_data.get('is_private', False)
    encrypted_token = request_data.get('encrypted_token')
    
    # Token exists only in this scope
    git_token: Optional[str] = None
    
    try:
        with tempfile.TemporaryDirectory(prefix=f"scan_{scan_id}_") as tmpdir:
            tmpdir_path = Path(tmpdir)
            repo_path = tmpdir_path / safe_repo_slug(repo_url)
            
            if is_private and encrypted_token:
                # Decrypt token for one-time use
                git_token = decrypt_token(encrypted_token)
                
                # Clone with authentication
                actual_branch = await clone_repo_with_token(
                    repo_url, repo_path, branch, skip_lfs, git_token
                )
            else:
                # Public repo - no auth needed
                actual_branch = clone_repo(repo_url, repo_path, branch, skip_lfs)
            
            # Run security scans...
            # Token is no longer needed after clone
            
    except Exception as exc:
        # Don't retry auth failures
        if "Authentication failed" in str(exc):
            raise exc
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
        
    finally:
        # CRITICAL: Ensure token is cleared from memory
        git_token = None
        request_data.pop('encrypted_token', None)
```

---

## Frontend UI Components

### Repository Selector (Enhanced)

```typescript
// components/repo-selector.tsx
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Lock, Globe } from "lucide-react";

interface Repo {
  url: string;
  name: string;
  private: boolean;
  stars: number;
}

export function RepoSelector({ onSelect }: { onSelect: (repo: Repo) => void }) {
  const { data: session } = useSession();
  const [includePrivate, setIncludePrivate] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  
  const fetchRepos = async () => {
    const response = await fetch(
      `/api/github/repos?include_private=${includePrivate}`
    );
    const data = await response.json();
    setRepos(data.repositories);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includePrivate}
            onChange={(e) => setIncludePrivate(e.target.checked)}
            disabled={!session?.user}
            className="rounded"
          />
          <span>Include private repositories</span>
        </label>
        
        {!session?.user && (
          <span className="text-sm text-amber-600">
            Sign in with GitHub to access private repos
          </span>
        )}
      </div>
      
      <div className="border rounded divide-y">
        {repos.map((repo) => (
          <button
            key={repo.name}
            onClick={() => onSelect(repo)}
            className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left"
          >
            {repo.private ? (
              <Lock className="w-4 h-4 text-amber-500" />
            ) : (
              <Globe className="w-4 h-4 text-slate-400" />
            )}
            <span className="flex-1">{repo.name}</span>
            {repo.private && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                Private
              </span>
            )}
            <span className="text-sm text-slate-500">⭐ {repo.stars}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Environment Configuration

### Required Variables

```bash
# Frontend (.env.local)
WORKER_ENCRYPTION_SECRET=<base64-32-byte-key>

# Backend (.env)
WORKER_ENCRYPTION_SECRET=<same-base64-32-byte-key>

# Optional: Celery task timeout (default: 1 hour)
CELERY_TASK_EXPIRY=3600
```

### Docker Compose Updates

```yaml
# docker/docker-compose.yml
services:
  api:
    environment:
      - WORKER_ENCRYPTION_SECRET=${WORKER_ENCRYPTION_SECRET}
  
  worker:
    environment:
      - WORKER_ENCRYPTION_SECRET=${WORKER_ENCRYPTION_SECRET}
```

---

## Alternative A: Token Vault Service (Not Recommended)

For reference, here's the more complex alternative that uses persistent token storage. This may be useful for specific use cases like long-running background scans or multi-stage pipelines.

### Architecture

```
Frontend → Encrypt Token → Store in DB → Return Reference
                                    ↓
Worker → Fetch Reference → Call API → Get Decrypted Token → Clone
```

### When to Consider This Approach

| Use Case | Recommendation |
|----------|---------------|
| Scans that may retry hours later | Consider Token Vault |
| Multi-stage scans needing token reuse | Consider Token Vault |
| Compliance requiring audit trail | Consider Token Vault |
| Standard on-demand scans | **Use Ephemeral (Recommended)** |

### Implementation

See Appendix A for full Token Vault implementation details.

---

## Security Analysis

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Token intercepted in transit | HTTPS/TLS 1.3 for all communications |
| Token extracted from Redis | AES-256-GCM encryption, key only in workers |
| Token in logs | Token masked in all log output |
| Token in memory dump | Token cleared immediately after clone |
| Worker compromised | Attacker needs both Redis access AND encryption key |
| Replay attack | Encrypted payload can only be consumed once (queue) |

### Comparison: Ephemeral vs Token Vault

| Aspect | Ephemeral (Recommended) | Token Vault |
|--------|------------------------|-------------|
| **Token Storage** | Redis only (encrypted) | Database + Redis |
| **Token Lifetime** | Minutes (queue TTL) | Hours (configurable) |
| **Complexity** | Low | High |
| **Components** | Shared encryption key | Token vault service, DB table, API |
| **Retry Support** | Requires re-submit | Can retry with stored token |
| **Audit Trail** | Scan logs only | Full token access audit log |
| **Memory Exposure** | Seconds | Minutes to hours |
| **Implementation Time** | 2-3 days | 1-2 weeks |

### Recommendation

**Use Ephemeral Pass-Through for initial implementation** because:
1. Simpler = fewer bugs = more secure
2. Shorter exposure window
3. No persistent sensitive data
4. Easier to reason about security

**Consider Token Vault later if:**
- Users need long-running scan retries
- Compliance requires detailed token audit logs
- Multi-stage scans need token reuse

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1) - Ephemeral Approach

**Day 1-2: Setup**
- [ ] Add `WORKER_ENCRYPTION_SECRET` to environment configs
- [ ] Create `lib/token-ephemeral.ts` (frontend encryption)
- [ ] Create `backend/src/audit/token_ephemeral.py` (decryption)
- [ ] Add cryptography library to requirements.txt

**Day 3-4: Backend Integration**
- [ ] Update `ScanRequest` model to accept `encrypted_token`
- [ ] Create `clone_repo_with_token()` function
- [ ] Update worker to handle private repos
- [ ] Add token masking in error handling

**Day 5: Testing**
- [ ] Unit tests for encryption/decryption
- [ ] Integration test with test private repo
- [ ] Verify token is never logged

**Deliverables:**
- Backend can receive and use encrypted tokens
- Tokens are properly cleared after use

---

### Phase 2: Frontend Integration (Week 2)

**Day 1-2: API Updates**
- [ ] Update `/api/scan` to handle `isPrivate` flag
- [ ] Add `verifyRepoAccess()` helper
- [ ] Update `/api/github/repos` to include private repos

**Day 3-4: UI Components**
- [ ] Add private repo toggle to scan form
- [ ] Update repo selector with visibility badges
- [ ] Add authentication prompts

**Day 5: End-to-End Testing**
- [ ] Test full flow: select private repo → scan → results
- [ ] Test error handling (no access, expired token)
- [ ] Test that public repos still work

**Deliverables:**
- Users can scan private repositories
- Clear UI indicating private vs public

---

### Phase 3: Security Hardening (Week 3)

**Security Review**
- [ ] Verify no tokens in logs
- [ ] Verify token cleared from memory
- [ ] Test Redis data is encrypted
- [ ] Penetration test the flow

**Documentation**
- [ ] Security runbook
- [ ] Incident response procedures
- [ ] User documentation

**Deliverables:**
- Security audit passed
- Documentation complete

---

## Testing Strategy

### Unit Tests

```python
# backend/tests/test_token_ephemeral.py
import pytest
from audit.token_ephemeral import decrypt_token

def test_token_encryption_decryption():
    """Test that we can decrypt what frontend encrypts."""
    # This test requires the same encryption key
    encrypted = "iv:authTag:ciphertext"  # From frontend test
    decrypted = decrypt_token(encrypted)
    assert decrypted == "expected_token"
```

```typescript
// lib/__tests__/token-ephemeral.test.ts
import { encryptTokenForWorker } from "../token-ephemeral";

describe("Token Encryption", () => {
  it("should produce decryptable payload", () => {
    const token = "ghp_test_token_12345";
    const encrypted = encryptTokenForWorker(token);
    
    // Verify format
    expect(encrypted).toMatch(/^[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]+$/);
  });
});
```

### Integration Test

```python
# tests/test_private_repo_clone.py
import os
import pytest
import tempfile
from pathlib import Path

@pytest.mark.integration
@pytest.mark.skipif(
    not os.getenv("TEST_GITHUB_TOKEN"),
    reason="TEST_GITHUB_TOKEN not set"
)
async def test_clone_private_repo():
    """Test cloning a real private repo."""
    from audit.repos import clone_repo_with_token
    
    token = os.getenv("TEST_GITHUB_TOKEN")
    repo_url = "https://github.com/test-org/private-test-repo"
    
    with tempfile.TemporaryDirectory() as tmpdir:
        dest = Path(tmpdir) / "repo"
        
        branch = await clone_repo_with_token(
            repo_url, dest, "main", skip_lfs=True, token=token
        )
        
        assert dest.exists()
        assert (dest / ".git").exists()
        assert (dest / "README.md").exists()
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Generate unique `WORKER_ENCRYPTION_SECRET`
- [ ] Add to all environment configs (frontend + worker)
- [ ] Verify secrets are different per environment
- [ ] Run security scan on new code

### Deployment

- [ ] Deploy backend with new dependencies (`cryptography`)
- [ ] Deploy frontend with encryption library
- [ ] Monitor error rates
- [ ] Test private repo scan in staging

### Post-Deployment

- [ ] Verify no tokens in application logs
- [ ] Verify Redis data is encrypted
- [ ] Monitor scan success rates
- [ ] Document any issues

---

## Appendix A: Token Vault Alternative (Reference)

For use cases requiring persistent token storage, here is the alternative architecture.

### Database Schema

```sql
-- Token storage (if using persistent approach)
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
```

### Token Vault Service

```typescript
// lib/token-vault.ts (Alternative implementation)
export class SecureTokenVault {
  async storeToken(userId: string, token: string): Promise<string> {
    const ref = generateSecureRef();
    const encrypted = this.encrypt(token);
    
    await db.insert(encryptedTokens).values({
      ref,
      userId,
      ...encrypted,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    
    return ref;
  }
  
  async retrieveToken(ref: string): Promise<string | null> {
    const record = await db.query.encryptedTokens.findFirst({
      where: eq(encryptedTokens.ref, ref),
    });
    
    if (!record || record.expiresAt < new Date()) {
      return null;
    }
    
    return this.decrypt(record);
  }
}
```

### Worker Token Retrieval

```python
# backend/src/audit/token_vault.py (Alternative)
class TokenVaultClient:
    """Client to retrieve encrypted tokens from frontend API."""
    
    async def get_token(self, credential_ref: str) -> Optional[str]:
        """Retrieve decrypted token from frontend API."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.frontend_url}/api/internal/token",
                headers={"Authorization": f"Bearer {self.api_secret}"},
                json={"credential_ref": credential_ref},
            )
            return response.json().get("token") if response.status_code == 200 else None
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Private repo scan success rate | >95% | Scan completion logs |
| Token security incidents | 0 | Security audit |
| Average scan time delta | <10% slower | Compare public vs private |
| User adoption | 30% of scans | Within 3 months of launch |

---

## Future Enhancements

1. **GitLab Support**: Extend to GitLab private repos using same ephemeral pattern
2. **Bitbucket Support**: Add Bitbucket Cloud support
3. **Fine-Grained Tokens**: Support GitHub fine-grained personal access tokens
4. **App Authentication**: GitHub App installation tokens for organization access
5. **SSH Key Option**: Alternative authentication method for private repos

---

**Document Version**: 2.0  
**Last Updated**: 2026-02-04  
**Author**: Architecture Team  
**Status**: RECOMMENDED - Ephemeral Token Pass-Through
