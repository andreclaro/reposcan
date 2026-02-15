# Configuration Guide

Complete reference for environment variables used by the Security Audit application.

## Quick Reference

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379/0`) |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `AI_ANALYSIS_ENABLED` | Enable AI analysis (default: `false`) |
| `STORAGE_BACKEND` | Storage type: `local`, `s3`, or `none` (default: `local`) |

## Database Configuration

### DATABASE_URL

PostgreSQL connection string for storing findings, AI analysis, and scan metadata.

```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

**Example:**
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
```

## Task Queue Configuration

### REDIS_URL

Redis connection string for Celery task queue.

```bash
REDIS_URL=redis://localhost:6379/0
```

## Results Storage

### RESULTS_DIR

Local directory for scan results.

```bash
RESULTS_DIR=./results
```

### STORAGE_BACKEND

Storage backend for raw scanner outputs.

- `local` - Store files in local filesystem (default)
- `s3` - Store files in S3-compatible storage
- `none` - Skip file storage

### STORAGE_BASE_PATH

Base path for local storage (when `STORAGE_BACKEND=local`).

```bash
STORAGE_BASE_PATH=./results
```

## S3 Storage Configuration

Required when `STORAGE_BACKEND=s3`:

| Variable | Description |
|----------|-------------|
| `S3_BUCKET` | S3 bucket name |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `S3_ENDPOINT_URL` | Custom endpoint (optional, for MinIO, etc.) |

## AI Analysis Configuration

### AI_ANALYSIS_ENABLED

Enable AI-powered analysis for security findings.

```bash
AI_ANALYSIS_ENABLED=true
```

### AI_PROVIDER

AI provider to use:
- `anthropic` (default)
- `openai`
- `kimi`

### AI_MODEL

Model selection by provider:

**Anthropic:**
- `claude-3-opus-20240229` - Most capable
- `claude-3-sonnet-20240229` - Balanced (default)
- `claude-3-haiku-20240307` - Fastest

**OpenAI:**
- `gpt-4-turbo-preview`
- `gpt-4`
- `gpt-3.5-turbo`

**Kimi:**
- `kimi-k2.5` (default, 256K context)

### API Keys

| Provider | Variable |
|----------|----------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Kimi | `KIMI_API_KEY` or `MOONSHOT_API_KEY` |

### KIMI_API_BASE_URL

Override for regional endpoints:
```bash
KIMI_API_BASE_URL=https://api.moonshot.cn/v1  # China endpoint
```

## Next.js Webapp Configuration

### FASTAPI_BASE_URL

Base URL for FastAPI backend.

```bash
FASTAPI_BASE_URL=http://localhost:8000
```

### GitHub OAuth

| Variable | Description |
|----------|-------------|
| `AUTH_GITHUB_ID` | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth app client secret |
| `AUTH_SECRET` | NextAuth.js v5 encryption key |
| `GITHUB_TOKEN` | GitHub API token (optional, for scan caching) |

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

### DEV_BYPASS_AUTH

Bypass authentication in development:
```bash
DEV_BYPASS_AUTH=true
```

### BETA_MODE_ENABLED

Require admin approval for new accounts:
```bash
BETA_MODE_ENABLED=true
ADMIN_EMAIL=admin@example.com
```

## Contact Form Configuration

Used by `/contact` page via Resend:

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | Sender address (default: `SecurityKit <onboarding@resend.dev>`) |
| `CONTACT_EMAIL` | Recipient for contact form |

## Scan Timeouts

Optional timeouts (seconds) for subprocesses:

| Variable | Default | Description |
|----------|---------|-------------|
| `SEC_AUDIT_CLONE_TIMEOUT` | 600 | Git clone timeout |
| `SEC_AUDIT_SUBMODULES_TIMEOUT` | 300 | Submodule update timeout |
| `SEC_AUDIT_SEMGREP_TIMEOUT` | 600 | Semgrep scan timeout |
| `SEC_AUDIT_TRIVY_TIMEOUT` | 300 | Trivy scan timeout |
| `SEC_AUDIT_DOCKER_BUILD_TIMEOUT` | 600 | Docker build timeout |
| `SEC_AUDIT_ECOSYSTEM_AUDIT_TIMEOUT` | 300 | Node/Go/Rust audit timeout |

## Configuration Examples

### Minimal (Local Development)

```bash
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results
```

### With AI Analysis

```bash
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results

AI_ANALYSIS_ENABLED=true
AI_PROVIDER=anthropic
AI_MODEL=claude-3-sonnet-20240229
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### With S3 Storage

```bash
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results

STORAGE_BACKEND=s3
S3_BUCKET=my-security-audit-bucket
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Production

```bash
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql://user:password@postgres:5432/sec_audit
RESULTS_DIR=/app/results

STORAGE_BACKEND=s3
S3_BUCKET=prod-security-audit-bucket
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_ENDPOINT_URL=https://s3.amazonaws.com

AI_ANALYSIS_ENABLED=true
AI_PROVIDER=anthropic
AI_MODEL=claude-3-opus-20240229
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use `.env.local`** for local secrets (gitignored)
3. **Rotate API keys** regularly
4. **Use environment-specific configs** (dev, staging, prod)
5. **Restrict API key permissions** to minimum required scope
6. **Monitor API usage** for unauthorized access

## Environment Variable Priority

1. System environment variables (highest)
2. `.env` file
3. `.env.local` file (gitignored)
4. Default values (lowest)
