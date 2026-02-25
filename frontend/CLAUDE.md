# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 16 SaaS frontend for the RepoScan security scanning platform. Provides GitHub OAuth authentication, a scan dashboard, AI analysis views, Stripe billing, and admin controls.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (localhost:3003)
pnpm build            # Build for production
pnpm lint             # Run ESLint

# Database (Drizzle ORM)
pnpm db:generate      # Generate migration from schema changes
pnpm db:push          # Push schema directly to database (dev)
pnpm db:migrate       # Apply migrations via script
```

Note: `drizzle-kit push` requires `DATABASE_URL` in the shell environment; it does not load `.env.local`.

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router (React 19)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: NextAuth.js v5 with GitHub OAuth
- **Payments**: Stripe (subscriptions, usage-based billing)
- **Styling**: Tailwind CSS 4 + shadcn/ui patterns

### Key Directories

```
src/
├── app/
│   ├── (auth)/           # Auth pages (login, etc.)
│   ├── app/              # Protected dashboard routes
│   │   ├── scans/        # User scan list and details
│   │   ├── admin/        # Admin dashboard (users, plans, all scans)
│   │   ├── profile/      # User profile
│   │   └── tools/        # Batch scanning tools (GitHub org/user scanner, batch upload)
│   ├── api/              # API routes
│   │   ├── scan/         # Scan creation and status
│   │   ├── scans/        # Per-scan endpoints (findings, AI, share)
│   │   ├── admin/        # Admin-only endpoints
│   │   ├── billing/      # Stripe checkout/portal
│   │   └── webhooks/     # Stripe webhooks
│   └── share/            # Public share pages
├── components/           # React components (shadcn/ui style)
├── db/
│   └── schema.ts         # Drizzle schema (all tables)
├── lib/
│   ├── server-auth.ts    # Server-side auth helper (use in API routes)
│   ├── admin-auth.ts     # Admin email check
│   ├── usage.ts          # Plan limits and quota tracking
│   ├── github.ts         # GitHub API helpers
│   ├── validators.ts     # Zod schemas for request validation
│   ├── stripe/           # Stripe client and helpers
│   └── plans/            # Plan management functions
├── auth.ts               # NextAuth configuration
└── auth.config.ts        # Auth providers setup
```

### Data Flow

1. User authenticates via GitHub OAuth (NextAuth)
2. Frontend calls `/api/scan` to queue a scan
3. Next.js API route validates, checks quota, calls FastAPI backend
4. FastAPI queues Celery task, returns `scan_id`
5. Frontend polls `/api/scan/[scanId]/status` until complete
6. Results stored in PostgreSQL, optionally processed for AI analysis

### Database Tables (src/db/schema.ts)

- `app_user` - Users with billing and plan info
- `plan` - Subscription plans with quotas
- `scan` - Scan records with status and finding counts
- `finding` - Normalized vulnerability findings (indexed by severity, category, CWE/CVE)
- `ai_analysis` - AI-generated summaries and recommendations
- `usage_record` - Per-user billing period usage tracking
- `scan_share` - Public share links with expiration

### Authentication Patterns

**In API routes:**
```typescript
import { getServerAuth } from "@/lib/server-auth";

const session = await getServerAuth();
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Admin check:**
```typescript
import { isAdmin } from "@/lib/admin-auth";

if (!isAdmin(session.user.email)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### Environment Variables

Required in `.env.local`:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` - OAuth app credentials
- `AUTH_SECRET` - Session encryption key
- `FASTAPI_BASE_URL` - Backend service URL (default `http://localhost:8000`)

Optional:
- `DEV_BYPASS_AUTH=true` - Skip GitHub login in dev (uses `dev@local.test`)
- `BETA_MODE_ENABLED=true` - Require admin approval for new accounts
- `ADMIN_EMAIL` - Comma-separated admin emails

## Code Conventions

### Path Aliases
Use `@/` for imports from `src/`:
```typescript
import { db } from "@/db";
import { scans } from "@/db/schema";
```

### Validation
Use Zod schemas from `src/lib/validators.ts` for request validation:
```typescript
const parsed = scanRequestSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
```

### Database Queries
Use Drizzle ORM query builder:
```typescript
import { db } from "@/db";
import { scans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const results = await db
  .select()
  .from(scans)
  .where(eq(scans.userId, userId))
  .orderBy(desc(scans.createdAt));
```

## Development Setup

1. Start backend services: `docker compose -f docker/docker-compose.yml up -d` (from repo root)
2. Copy `.env.local.example` to `.env.local` and configure
3. Push schema: `DATABASE_URL=... pnpm db:push`
4. Start dev server: `pnpm dev`
5. Visit `http://localhost:3003`

With `DEV_BYPASS_AUTH=true`, you can access `/app` without GitHub OAuth.
