# Agent API with x402 Payment Integration - Design Document

**Date:** February 2026  
**Status:** Draft  
**Author:** Claude Code  

---

## Executive Summary

This document outlines the architecture for enabling **autonomous agents** (AI agents, CLI tools, CI/CD pipelines) to access the SecurityKit API using the **x402 payment protocol** with flexible authentication options. Agents can authenticate via:

1. **x402 Crypto Payments** - Pay-per-scan with USDC on Base (no signup required)
2. **API Keys** - Traditional authentication for enterprise/CI-CD use cases
3. **SSO (Browser Auth)** - GitHub CLI-style device flow for human users

**Key Principles:**
- **Flexible authentication** - x402 payments OR API keys OR SSO
- **Frontend API entry** - Agents connect through Next.js frontend API
- **Admin configurable** - Pricing, features, and limits via admin panel
- **Agent-first UX** - Designed for programmatic access with human fallback

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AGENT ACCESS ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────────────────┐      │
│  │   Agent CLI      │    │         Next.js Frontend API              │      │
│  │                  │    │  ┌─────────────────────────────────────┐  │      │
│  │  Auth Methods:   │    │  │  /api/agent/scan        (x402)      │  │      │
│  │  • x402 Payment  │───▶│  │  /api/agent/scan        (API Key)   │  │      │
│  │  • API Key       │    │  │  /api/agent/auth/sso    (SSO flow)  │  │      │
│  │  • SSO Token     │    │  │  /api/admin/agent-config (Admin)    │  │      │
│  └──────────────────┘    │  └─────────────────────────────────────┘  │      │
│           │              └──────────────────┬─────────────────────────┘      │
│           │                                 │                                │
│           │                    ┌────────────┴────────────┐                  │
│           │                    ▼                         ▼                  │
│           │         ┌─────────────────┐      ┌─────────────────┐           │
│           │         │  x402 Middleware│      │  API Key Auth   │           │
│           │         │  @coinbase/x402 │      │  + Rate Limit   │           │
│           │         └────────┬────────┘      └────────┬────────┘           │
│           │                  │                        │                    │
│           │                  └────────────┬───────────┘                    │
│           │                               ▼                                 │
│           │                  ┌─────────────────────────┐                    │
│           └─────────────────▶│  FastAPI Backend        │                    │
│                              │  ┌─────────────────┐   │                    │
│                              │  │ Celery Worker   │   │                    │
│                              │  │ (Scan Pipeline) │   │                    │
│                              │  └─────────────────┘   │                    │
│                              └─────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### System Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Agent CLI** | Python 3.11+ | Command-line tool with multi-auth support |
| **Frontend API** | Next.js 16+ Route Handlers | Agent API entry point, auth handling |
| **x402 Middleware** | `@coinbase/x402` + `@x402/next` | Payment verification |
| **API Key Service** | Next.js + PostgreSQL | API key generation, validation |
| **SSO Service** | NextAuth.js Device Flow | Browser-based CLI authentication |
| **Admin Panel** | Next.js Admin Dashboard | Agent settings, pricing, limits |
| **FastAPI Backend** | Python + Celery | Scan execution |

---

## Authentication Methods & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTH METHOD DATA FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐      ┌─────────────────┐      ┌───────────────────┐   │
│  │   x402 Payment  │─────▶│ x402_agent_     │─────▶│  Python Backend   │   │
│  │   (Wallet Auth) │      │ scans table     │      │  (Celery Worker)  │   │
│  └─────────────────┘      └─────────────────┘      └───────────────────┘   │
│         (No user account needed)                                           │
│                                                                              │
│  ┌─────────────────┐      ┌─────────────────┐      ┌───────────────────┐   │
│  │   API Key       │─────▶│ scans table     │─────▶│  Python Backend   │   │
│  │   (User Auth)   │      │ (+ api_key_id)  │      │  (Celery Worker)  │   │
│  └─────────────────┘      └─────────────────┘      └───────────────────┘   │
│         (Linked to user account)                                           │
│                                                                              │
│  ┌─────────────────┐      ┌─────────────────┐      ┌───────────────────┐   │
│  │   SSO Token     │─────▶│ scans table     │─────▶│  Python Backend   │   │
│  │   (User Auth)   │      │ (user_id)       │      │  (Celery Worker)  │   │
│  └─────────────────┘      └─────────────────┘      └───────────────────┘   │
│         (Linked to user account)                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Method 1: x402 Payment (Pay-Per-Scan)

**Best for:** Autonomous agents, AI systems, one-off scans

**Flow:**
```
1. Agent sends request WITHOUT authentication
2. Frontend returns 402 Payment Required with x402 headers
3. Agent signs payment authorization (USDC on Base)
4. Agent retries with X-PAYMENT header
5. Frontend verifies via @coinbase/x402 facilitator
6. Scan proceeds
```

**Headers:**
```http
X-Payment: base64-encoded-payment-payload
```

**Benefits:**
- No signup, no API keys
- Wallet address = identity
- Perfect for AI agents

---

### Method 2: API Key Authentication

**Best for:** CI/CD pipelines, enterprise integrations, long-term automation

**Flow:**
```
1. User creates API key in SecurityKit dashboard (/settings/api-keys)
2. User configures CLI: sec-audit-agent auth api-key
3. CLI stores key securely (keyring/os-keychain)
4. Agent sends X-API-Key header with requests
5. Frontend validates key against database
6. Scan created in existing `scans` table with `auth_method='api_key'`
```

**Data Storage:** Scans are stored in the **existing `scans` table**, linked to the user's account:

**Headers:**
```http
X-API-Key: sk_live_abc123...
```

**API Key Features:**
- Scoped permissions (scan-only, read-only, etc.)
- Expiration dates
- Rate limiting per key
- Usage analytics
- Revocation

---

### Method 3: SSO (Browser Device Flow)

**Best for:** Human developers using CLI occasionally

**Flow (GitHub CLI-style):**
```
$ sec-audit-agent auth login

# CLI outputs:
# First copy your one-time code: ABCD-1234
# Then press [Enter] to open https://securitykit.io/cli-auth in your browser...

# User opens browser, logs in with existing account
# User enters code: ABCD-1234
# Browser confirms: "Authorize SecurityKit CLI?"
# CLI receives token and stores it

✓ Logged in as user@example.com
```

**Implementation:**
- Uses NextAuth.js device flow
- Short-lived codes (5 minutes)
- Long-lived tokens (30 days, refreshable)
- PKCE for security

**Data Storage:** Scans are stored in the **existing `scans` table** with `auth_method='sso'`, linked to the user's account.

---

### Auth Method Summary

| Auth Method | Identity | Requires Account | Scan Storage | Use Case |
|-------------|----------|------------------|--------------|----------|
| **x402** | Wallet address | ❌ No | `x402_agent_scans` | AI agents, autonomous systems |
| **API Key** | API key → User | ✅ Yes | `scans` table | CI/CD, automation |
| **SSO** | OAuth token → User | ✅ Yes | `scans` table | Human CLI users |

---

## Frontend API Endpoints (Next.js)

### Authentication Endpoints

#### POST /api/agent/auth/sso/initiate
Start device flow authentication.

**Response:**
```json
{
  "device_code": "abc123...",
  "user_code": "ABCD-1234",
  "verification_uri": "https://securitykit.io/cli-auth",
  "expires_in": 300,
  "interval": 5
}
```

#### POST /api/agent/auth/sso/token
Poll for authentication token.

**Request:**
```json
{
  "device_code": "abc123..."
}
```

**Response (pending):**
```json
{
  "status": "pending"
}
```

**Response (complete):**
```json
{
  "access_token": "sk_agent_...",
  "token_type": "bearer",
  "expires_in": 2592000
}
```

#### POST /api/agent/auth/api-key/validate
Validate API key (internal use).

---

### Scan Endpoints

All scan endpoints support multiple auth methods (automatically detected).

#### POST /api/agent/scan

**Authentication:** x402 OR X-API-Key OR Authorization Bearer

**Request (x402 flow - step 1):**
```json
{
  "repo_url": "https://github.com/user/repo.git",
  "branch": "main",
  "audit_types": ["sast", "dockerfile"]
}
```

**Response (402 Payment Required):**
```http
HTTP/1.1 402 Payment Required
X-PAYMENT-REQUIRED: eyJwYXltZW50...base64...
```

```json
{
  "error": "payment_required",
  "payment_required": {
    "scheme": "exact",
    "network": "base",
    "required": {
      "amount": "10000",
      "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    },
    "pay_to": "0xSecurityKitServiceWallet...",
    "description": "Security scan for repository"
  }
}
```

**Request (x402 flow - step 2):**
```http
POST /api/agent/scan
Content-Type: application/json
X-Payment: eyJwYXltZW50...base64...

{
  "repo_url": "https://github.com/user/repo.git",
  "audit_types": ["sast"]
}
```

**Response (202 Accepted):**
```json
{
  "scan_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "payment": {
    "amount": "0.01",
    "token": "USDC",
    "network": "base"
  },
  "check_status_url": "/api/agent/scan/a1b2c3d4/status"
}
```

---

#### GET /api/agent/scan/[id]/status

**Authentication:** Same method used to create scan

**Response:**
```json
{
  "scan_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "summary": {
    "total_findings": 15,
    "critical": 2,
    "high": 5,
    "medium": 6,
    "low": 2
  },
  "results_url": "/api/agent/scan/a1b2c3d4/results"
}
```

---

#### GET /api/agent/price

Get current scan pricing (no auth required).

**Response:**
```json
{
  "scan_price": {
    "amount": "0.01",
    "currency": "USDC",
    "network": "base",
    "network_chain_id": 8453
  },
  "payment_methods": ["x402", "api_key", "sso"],
  "x402_config": {
    "accepts": [
      {
        "scheme": "exact",
        "network": "base",
        "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      }
    ]
  }
}
```

---

## x402 Integration with @coinbase/x402

### Server-Side (Next.js)

Using the official Coinbase x402 library:

```typescript
// frontend/src/lib/x402/config.ts
import { createFacilitatorConfig } from "@coinbase/x402";

export const facilitator = createFacilitatorConfig(
  process.env.CDP_API_KEY_ID!,
  process.env.CDP_API_KEY_SECRET!
);

export const X402_CONFIG = {
  recipient: process.env.X402_RECIPIENT_ADDRESS!, // Service wallet
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  network: "base" as const,
  scheme: "exact" as const,
};
```

```typescript
// frontend/src/app/api/agent/scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { paymentMiddleware } from "@x402/next";
import { facilitator, X402_CONFIG } from "@/lib/x402/config";

// Apply x402 middleware for payment verification
const middleware = paymentMiddleware(
  {
    "/api/agent/scan": {
      price: "$0.01",
      network: "base",
      payTo: X402_CONFIG.recipient,
    },
  },
  facilitator,
  { scheme: "exact" }
);

export async function POST(request: NextRequest) {
  // Check for API key auth first
  const apiKey = request.headers.get("X-API-Key");
  if (apiKey) {
    return handleApiKeyAuth(request, apiKey);
  }

  // Check for Bearer token (SSO)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return handleBearerAuth(request, authHeader);
  }

  // Fall through to x402 payment flow
  return middleware(request);
}

async function handleApiKeyAuth(request: NextRequest, apiKey: string) {
  // Validate API key against database
  const keyData = await validateApiKey(apiKey);
  if (!keyData) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Check rate limits
  if (await isRateLimited(keyData)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Proceed with scan (no payment required for API key users)
  return queueScan(request, { authType: "api_key", userId: keyData.userId });
}
```

### Client-Side (CLI)

```typescript
// agent-cli/src/payment/x402.ts
import { createPaymentPayload } from "@x402/core";
import { base } from "@x402/evm";

export async function createX402Payment(
  wallet: ethers.Wallet,
  requirements: PaymentRequirements
): Promise<string> {
  const payment = await createPaymentPayload(
    base,
    wallet,
    requirements,
    "exact"
  );

  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

// Usage in CLI
const paymentPayload = await createX402Payment(wallet, paymentRequired);
const response = await fetch("https://securitykit.io/api/agent/scan", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Payment": paymentPayload,
  },
  body: JSON.stringify(scanRequest),
});
```

---

## Admin Panel Configuration

### Admin Routes

#### GET /api/admin/agent-config
Get current agent system configuration.

**Response:**
```json
{
  "x402": {
    "enabled": true,
    "scan_price": "0.01",
    "currency": "USDC",
    "network": "base",
    "recipient_address": "0x...",
    "min_amount": "0.005",
    "max_amount": "1.00"
  },
  "api_keys": {
    "enabled": true,
    "max_keys_per_user": 10,
    "default_rate_limit": 100,
    "expiration_options": [30, 90, 365]
  },
  "sso": {
    "enabled": true,
    "token_expiry_days": 30
  },
  "rate_limits": {
    "x402_per_hour": 100,
    "api_key_per_hour": 1000,
    "sso_per_hour": 100
  }
}
```

#### PUT /api/admin/agent-config
Update agent configuration.

**Request:**
```json
{
  "x402": {
    "scan_price": "0.02"
  },
  "rate_limits": {
    "x402_per_hour": 50
  }
}
```

---

### Admin UI Page

**Location:** `/admin/agents` (super-admin only)

**Sections:**

1. **Pricing Configuration**
   - Scan price input (USDC)
   - Currency selector (USDC, ETH)
   - Network selector (Base, Ethereum)
   - Min/max transaction limits

2. **API Key Management**
   - Global API key settings
   - View all active keys (with revoke option)
   - Audit log of key usage

3. **Rate Limiting**
   - Per-auth-method rate limits
   - Burst allowance configuration
   - IP-based vs key-based limiting

4. **Usage Analytics**
   - Scans by auth method (x402 vs API key vs SSO)
   - Revenue from x402 payments
   - Top API key users
   - Geographic distribution

5. **System Status**
   - x402 facilitator health
   - Payment verification latency
   - Failed payment rate

---

## Agent CLI Design

### Authentication Commands

```bash
# View current auth status
sec-audit-agent auth status

# Authenticate with SSO (browser flow)
sec-audit-agent auth login
# Opens browser, user enters code, CLI receives token

# Authenticate with API key
sec-audit-agent auth api-key
# Prompts for API key, stores securely

# Authenticate with x402 (just configure wallet)
sec-audit-agent auth wallet --private-key $PRIVATE_KEY
# No "login" - each scan pays individually

# Logout (clear stored credentials)
sec-audit-agent auth logout
```

### Configuration Storage

```yaml
# ~/.securitykit/config.yaml
api_url: https://securitykit.io
auth:
  method: sso  # sso | api_key | x402
  sso_token: <encrypted>  # Stored in keyring
  api_key: <encrypted>    # Stored in keyring
  wallet:
    address: "0x..."
    # Private key NEVER stored in config, only in keyring
defaults:
  audit_types: [sast, dockerfile]
  output_format: json
```

### Scan Command with Auth Auto-Detection

```bash
# Auto-detects auth method from stored config
sec-audit-agent scan --repo https://github.com/user/repo.git

# Force specific auth method
sec-audit-agent scan --repo <url> --auth-method x402
sec-audit-agent scan --repo <url> --auth-method api-key

# CI mode (uses API key, fails on any issue)
sec-audit-agent scan \
  --repo https://github.com/user/repo.git \
  --ci \
  --fail-on critical,high \
  --auth-method api-key \
  --api-key $SECURITYKIT_API_KEY
```

---

## Database Schema Updates

### API Keys Table

```sql
CREATE TABLE api_keys (
    id SERIAL PRIMARY KEY,
    key_id TEXT UNIQUE NOT NULL,           -- sk_live_abc123 (prefix + hash)
    key_hash TEXT NOT NULL,                -- bcrypt hash of full key
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Metadata
    name TEXT NOT NULL,                    -- "Production CI"
    description TEXT,
    scopes JSONB DEFAULT '["scan"]',
    
    -- Limits
    rate_limit_per_hour INTEGER DEFAULT 100,
    
    -- Expiration
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    revoked_at TIMESTAMP,
    revoked_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_id ON api_keys(key_id);
```

### x402 Agent Scans Table

This table is **only for x402 payment-based scans**. Each scan is tied to a wallet address and payment transaction.

```sql
CREATE TABLE x402_agent_scans (
    id SERIAL PRIMARY KEY,
    scan_id UUID UNIQUE NOT NULL,
    
    -- x402 identity (wallet address = agent identity)
    wallet_address TEXT NOT NULL,
    
    -- x402 payment details
    payment_payload JSONB NOT NULL,         -- Full x402 payment payload
    payment_scheme TEXT NOT NULL,           -- 'exact'
    payment_network TEXT NOT NULL,          -- 'base'
    payment_token TEXT NOT NULL,            -- USDC contract address
    payment_amount TEXT NOT NULL,           -- Amount in smallest unit
    payment_amount_usd DECIMAL(10, 4),      -- Normalized USD amount
    
    -- Payment verification
    payment_verified_at TIMESTAMP NOT NULL,
    facilitator_verified BOOLEAN DEFAULT false,
    
    -- Repository info
    repo_url TEXT NOT NULL,
    branch TEXT,
    audit_types JSONB NOT NULL,
    
    -- Scan status (mirrors Python backend scan status)
    status TEXT NOT NULL DEFAULT 'queued',
    python_scan_id TEXT,  -- Reference to Python backend scan
    
    -- Results summary (denormalized for quick queries)
    findings_count INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0,
    
    -- Storage
    results_s3_path TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_x402_agent_scans_wallet ON x402_agent_scans(wallet_address);
CREATE INDEX idx_x402_agent_scans_status ON x402_agent_scans(status);
CREATE INDEX idx_x402_agent_scans_created ON x402_agent_scans(created_at);
```

### API Key / SSO Scans

Scans authenticated via **API Key** or **SSO** are stored in the existing `scans` table and linked to the user's account:

```sql
-- Existing scans table - add reference to API key if used
ALTER TABLE scans ADD COLUMN api_key_id INTEGER REFERENCES api_keys(id);
ALTER TABLE scans ADD COLUMN auth_method TEXT DEFAULT 'web';  -- 'web' | 'api_key' | 'sso'
```

### Admin Configuration Table

```sql
CREATE TABLE agent_config (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by TEXT REFERENCES users(id)
);

-- Default config
INSERT INTO agent_config (key, value) VALUES
('x402_config', '{"enabled": true, "scan_price": "0.01", "currency": "USDC", "network": "base"}'::jsonb),
('api_key_config', '{"enabled": true, "max_per_user": 10, "default_rate_limit": 100}'::jsonb),
('sso_config', '{"enabled": true, "token_expiry_days": 30}'::jsonb),
('rate_limits', '{"x402_per_hour": 100, "api_key_per_hour": 1000, "sso_per_hour": 100}'::jsonb);
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

**Frontend:**
- [ ] Install `@coinbase/x402` and `@x402/next` packages
- [ ] Create x402 configuration module
- [ ] Create `/api/agent/price` endpoint
- [ ] Create database migrations (api_keys, x402_agent_scans, agent_config, scans.api_key_id)

**Dependencies:**
```bash
# Frontend
npm install @coinbase/x402 @x402/next
npm install @x402/core @x402/evm  # For types
```

### Phase 2: x402 Payment Flow (Week 2-3)

- [ ] Implement `/api/agent/scan` with x402 middleware
- [ ] Create payment verification logic
- [ ] Test end-to-end with USDC on Base Sepolia
- [ ] Handle 402 responses in CLI

### Phase 3: API Key Authentication (Week 3-4)

- [ ] Create API key generation UI in user settings
- [ ] Implement API key validation middleware
- [ ] Add rate limiting per key
- [ ] Create API key usage analytics

**User Settings Page:**
```
Settings → API Keys
├─ [Generate New Key]
├─ Active Keys:
│  ├─ "Production CI" (sk_live_abc...)
│  │   Created: 2026-01-15 | Last used: 2 hours ago
│  │   [Revoke]
│  └─ "Local Dev" (sk_live_def...)
│      Created: 2026-01-20 | Expires: 2026-04-20
│      [Revoke]
```

### Phase 4: SSO Device Flow (Week 4-5)

- [ ] Create device flow endpoints (`/api/agent/auth/sso/*`)
- [ ] Create CLI auth page (`/cli-auth`)
- [ ] Implement token generation and storage
- [ ] Add to CLI: `sec-audit-agent auth login`

### Phase 5: Admin Panel (Week 5-6)

- [ ] Create `/admin/agents` page
- [ ] Pricing configuration UI
- [ ] Rate limiting controls
- [ ] Usage analytics dashboard
- [ ] API key audit log

### Phase 6: CLI Polish (Week 6-7)

- [ ] Multi-auth support in CLI
- [ ] Secure credential storage (keyring)
- [ ] Auto-detection of auth method
- [ ] CI/CD mode
- [ ] Publish to PyPI

---

## Environment Variables

```bash
# x402 Configuration
X402_ENABLED=true
X402_RECIPIENT_ADDRESS=0xServiceWalletAddress
CDP_API_KEY_ID=your-cdp-key-id
CDP_API_KEY_SECRET=your-cdp-secret

# Default pricing
X402_SCAN_PRICE_USD=0.01
X402_CURRENCY=USDC
X402_NETWORK=base

# Rate limiting
RATE_LIMIT_X402_HOUR=100
RATE_LIMIT_API_KEY_HOUR=1000
RATE_LIMIT_SSO_HOUR=100

# SSO
SSO_TOKEN_EXPIRY_DAYS=30
SSO_DEVICE_CODE_EXPIRY_MINUTES=5
```

---

## Security Considerations

### API Key Security

1. **Storage:** Keys stored as bcrypt hashes, never plaintext
2. **Prefix:** `sk_live_` for production, `sk_test_` for testnet
3. **Rotation:** Support key rotation without downtime
4. **Auditing:** Log all key usage with IP and timestamp

### x402 Security

1. **Facilitator:** Use Coinbase hosted facilitator for verification
2. **Replay Protection:** Each payment payload includes unique nonce
3. **Expiration:** Payment authorizations expire after 1 hour
4. **Settlement:** Payments settled on-chain after verification

### SSO Security

1. **Device Flow:** Short-lived codes (5 min) with polling
2. **PKCE:** Proof Key for Code Exchange
3. **Token Storage:** Encrypted at rest in CLI keyring
4. **Refresh:** Automatic token refresh before expiry

---

## Monitoring & Analytics

### Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| x402 verification latency | Facilitator | > 5 seconds |
| Failed payment rate | x402 middleware | > 10% |
| API key auth failures | API key middleware | > 5% |
| Scans per auth method | x402_agent_scans + scans tables | Track distribution |
| Revenue (x402) | x402_amount_usd | Daily target |
| CLI SSO completion rate | SSO logs | < 80% |

### Dashboards

**Admin Dashboard:**
- Real-time scan volume by auth method
- Revenue from x402 payments
- API key usage heatmap
- Error rates by endpoint

---

## Appendix A: Complete CLI Examples

### Full x402 Flow

```bash
# Install
pip install securitykit-agent

# Configure wallet
sec-audit-agent auth wallet --private-key $WALLET_KEY

# Check price
sec-audit-agent price
# Output: Scan price: $0.01 USDC on Base

# Scan (auto-pays)
sec-audit-agent scan \
  --repo https://github.com/user/repo.git \
  --audits sast,dockerfile \
  --wait
```

### Full API Key Flow

```bash
# In browser: Go to https://securitykit.io/settings/api-keys
# Create new key: sk_live_abc123...

# In CLI
sec-audit-agent auth api-key
Enter API key: sk_live_abc123...
✓ Authenticated as user@example.com

# Scan (uses API key)
sec-audit-agent scan --repo https://github.com/user/repo.git
```

### Full SSO Flow

```bash
sec-audit-agent auth login

First copy your one-time code: XKCD-1337
Then press [Enter] to open https://securitykit.io/cli-auth...

# Browser opens, user logs in, enters code
# CLI receives token

✓ Logged in as user@example.com

# Scan (uses SSO token)
sec-audit-agent scan --repo https://github.com/user/repo.git
```

---

## Appendix B: Frontend Page Specifications

See original document sections:
- Landing Page Integration
- /agents Page
- SKILL.md

**Additional Pages:**

### /settings/api-keys (User Settings)

- List all API keys with metadata
- Generate new key modal
- Show key only once after creation
- Revoke key with confirmation
- Usage stats per key

### /cli-auth (SSO Device Flow)

- Display: "Enter the code shown in your terminal"
- Code input field
- If user not logged in: show login form first
- "Authorize SecurityKit CLI?" confirmation
- Success/error messages

---

## Document Information

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-02-12 | Claude Code | Initial draft |
| 0.2 | 2026-02-12 | Claude Code | Updated to use @coinbase/x402, multi-auth, admin panel |

---

**Next Steps:**
1. Review updated design
2. Set up CDP API keys for x402 facilitator: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
3. Create feature branch for agent API
4. Begin Phase 1 implementation
