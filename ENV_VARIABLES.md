# Environment Variables Documentation

This document describes all environment variables used by the Security Audit application.

## Quick Reference

### Required Variables

- `DATABASE_URL` - PostgreSQL connection string (required for findings storage)
- `REDIS_URL` - Redis connection string (required for Celery task queue)

### Optional Variables

- `AI_ANALYSIS_ENABLED` - Enable AI-powered analysis (default: `false`)
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` - AI provider API key (required if AI enabled)
- `STORAGE_BACKEND` - Storage backend type (default: `local`)

## Detailed Configuration

### Database Configuration

#### `DATABASE_URL`
- **Type**: String (PostgreSQL connection string)
- **Required**: Yes (for Python worker and Next.js app)
- **Format**: `postgresql://user:password@host:port/database`
- **Example**: `postgresql://postgres:postgres@localhost:5432/sec_audit`
- **Description**: PostgreSQL connection string for storing findings, AI analysis, and scan metadata.

### Task Queue Configuration

#### `REDIS_URL`
- **Type**: String (Redis connection string)
- **Required**: Yes
- **Default**: `redis://localhost:6379/0`
- **Format**: `redis://host:port/db`
- **Example**: `redis://localhost:6379/0`
- **Description**: Redis connection string for Celery task queue.

### Results Storage

#### `RESULTS_DIR`
- **Type**: String (file path)
- **Required**: No
- **Default**: `./results`
- **Description**: Local directory for storing scan results and raw scanner outputs.

### Storage Backend Configuration

#### `STORAGE_BACKEND`
- **Type**: String
- **Required**: No
- **Default**: `local`
- **Options**: 
  - `local` - Store files in local filesystem
  - `s3` - Store files in S3-compatible storage
  - `none` - Skip file storage
- **Description**: Storage backend for raw scanner outputs and large files.

#### `STORAGE_BASE_PATH`
- **Type**: String (file path)
- **Required**: No (only when `STORAGE_BACKEND=local`)
- **Default**: `./results`
- **Description**: Base path for local storage backend.

### S3 Storage Configuration

These variables are only required when `STORAGE_BACKEND=s3`.

#### `S3_BUCKET`
- **Type**: String
- **Required**: Yes (when using S3)
- **Description**: S3 bucket name for storing scan artifacts.

#### `AWS_ACCESS_KEY_ID`
- **Type**: String
- **Required**: Yes (when using S3)
- **Description**: AWS access key ID for S3 authentication.

#### `AWS_SECRET_ACCESS_KEY`
- **Type**: String
- **Required**: Yes (when using S3)
- **Description**: AWS secret access key for S3 authentication.

#### `S3_ENDPOINT_URL`
- **Type**: String (URL)
- **Required**: No
- **Description**: Custom S3 endpoint URL for S3-compatible services (e.g., MinIO, DigitalOcean Spaces).
- **Example**: `https://s3.amazonaws.com` or `https://nyc3.digitaloceanspaces.com`

### AI Analysis Configuration

#### `AI_ANALYSIS_ENABLED`
- **Type**: Boolean (string: "true" or "false")
- **Required**: No
- **Default**: `false`
- **Description**: Enable AI-powered analysis for security findings. When enabled, the scan worker will generate executive summaries, risk scores, and prioritized recommendations.

#### `AI_PROVIDER`
- **Type**: String
- **Required**: No
- **Default**: `anthropic`
- **Options**: `anthropic` or `openai`
- **Description**: AI provider to use for analysis.

#### `AI_MODEL`
- **Type**: String
- **Required**: No
- **Default**: 
  - `claude-3-opus-20240229` (for Anthropic)
  - `gpt-4-turbo-preview` (for OpenAI)
- **Anthropic Options**:
  - `claude-3-opus-20240229` - Most capable, best for complex analysis
  - `claude-3-sonnet-20240229` - Balanced performance and cost
  - `claude-3-haiku-20240307` - Fastest, most cost-effective
- **OpenAI Options**:
  - `gpt-4-turbo-preview` - Latest GPT-4 model
  - `gpt-4` - Standard GPT-4
  - `gpt-3.5-turbo` - Faster, lower cost
- **Description**: AI model to use for analysis.

#### `ANTHROPIC_API_KEY`
- **Type**: String
- **Required**: Yes (if `AI_ANALYSIS_ENABLED=true` and `AI_PROVIDER=anthropic`)
- **Description**: Anthropic API key for Claude models.
- **Format**: `sk-ant-api03-...`
- **Get it**: https://console.anthropic.com/

#### `OPENAI_API_KEY`
- **Type**: String
- **Required**: Yes (if `AI_ANALYSIS_ENABLED=true` and `AI_PROVIDER=openai`)
- **Description**: OpenAI API key for GPT models.
- **Format**: `sk-...`
- **Get it**: https://platform.openai.com/api-keys

### Next.js Webapp Configuration

#### `FASTAPI_BASE_URL`
- **Type**: String (URL)
- **Required**: No
- **Default**: `http://localhost:8000`
- **Description**: Base URL for the FastAPI backend service.

#### `GITHUB_CLIENT_ID`
- **Type**: String
- **Required**: Yes (for GitHub OAuth)
- **Description**: GitHub OAuth application client ID.

#### `GITHUB_CLIENT_SECRET`
- **Type**: String
- **Required**: Yes (for GitHub OAuth)
- **Description**: GitHub OAuth application client secret.

#### `NEXTAUTH_SECRET`
- **Type**: String
- **Required**: Yes
- **Description**: Secret key for NextAuth.js session encryption.
- **Generate**: `openssl rand -base64 32`

#### `DEV_BYPASS_AUTH`
- **Type**: Boolean (string: "true" or "false")
- **Required**: No
- **Default**: `false`
- **Description**: Bypass authentication in development mode (for testing).

## Configuration Examples

### Minimal Configuration (Local Development)

```bash
# .env
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results
```

### With AI Analysis (Anthropic)

```bash
# .env
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
# .env
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results

STORAGE_BACKEND=s3
S3_BUCKET=my-security-audit-bucket
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### Production Configuration

```bash
# .env
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

## Environment Variable Priority

1. **System environment variables** (highest priority)
2. **`.env` file** (project root)
3. **`.env.local` file** (project root, typically gitignored)
4. **Default values** (lowest priority)

## Security Best Practices

1. **Never commit API keys or secrets** to version control
2. **Use `.env.local`** for local development secrets (already in `.gitignore`)
3. **Rotate API keys regularly**
4. **Use environment-specific configurations** (dev, staging, prod)
5. **Restrict API key permissions** to minimum required scope
6. **Monitor API usage** to detect unauthorized access

## Troubleshooting

### AI Analysis Not Working

1. Check `AI_ANALYSIS_ENABLED=true` is set
2. Verify API key is correct: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
3. Check API key has sufficient credits/quota
4. Verify `DATABASE_URL` is set (required for storing AI analysis)

### Database Connection Errors

1. Verify `DATABASE_URL` format is correct
2. Check database is running and accessible
3. Verify database user has required permissions
4. Check network connectivity to database

### Storage Backend Issues

1. For S3: Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are correct
2. Check `S3_BUCKET` exists and is accessible
3. Verify IAM permissions for S3 access
4. For local storage: Check `STORAGE_BASE_PATH` is writable
