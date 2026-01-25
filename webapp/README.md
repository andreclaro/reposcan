# AuditKit Webapp

Next.js frontend for the sec-audit-repos FastAPI service. Includes GitHub OAuth,
an authenticated `/app` dashboard, and scan management.

## Prerequisites

- FastAPI + Celery running from the main repo (`docker-compose up -d`)
- Postgres database (local or managed)
- GitHub OAuth app (callback URL below)

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in values:

- `FASTAPI_BASE_URL` (default `http://localhost:8000`)
- `DATABASE_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `DEV_BYPASS_AUTH` (optional, set `true` to skip GitHub login in dev)

When `DEV_BYPASS_AUTH=true`, the app uses a local dev user
(`dev@local.test`) and allows direct access to `/app`.

GitHub OAuth callback URL for local dev:
`http://localhost:3000/api/auth/callback/github`

## Install & run

```bash
pnpm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sec_audit pnpm db:push
pnpm dev
```

If `drizzle-kit push` cannot find the connection, make sure `DATABASE_URL` is
available in the shell (it does not automatically load `.env.local`).

Visit:
- Landing page: `http://localhost:3000`
- Dashboard: `http://localhost:3000/app`

## Notes

- The dashboard requires GitHub login.
- Scan results are fetched from the FastAPI service and persisted per user.
