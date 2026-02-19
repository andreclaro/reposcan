# SecurityKit Webapp

Next.js frontend for the securefast FastAPI service. Includes GitHub OAuth,
an authenticated `/app` dashboard, and scan management.

## Prerequisites

- FastAPI + Celery running from the main repo (`docker compose -f docker/docker-compose.yml up -d`)
- Postgres database (local or managed)
- GitHub **OAuth App** (not a GitHub App). Use [OAuth Apps](https://github.com/settings/developers) → New OAuth App. Callback URL below.

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in values:

- `FASTAPI_BASE_URL` (default `http://localhost:8000`)
- `DATABASE_URL`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_SECRET`
- `DEV_BYPASS_AUTH` (optional, set `true` to skip GitHub login in dev)
- `BETA_MODE_ENABLED` (optional, set `true` to require admin approval for new accounts)
- `ADMIN_EMAIL` (comma-separated list of admin emails)

When `DEV_BYPASS_AUTH=true`, the app uses a local dev user
(`dev@local.test`) and allows direct access to `/app`.

### Beta Mode

When `BETA_MODE_ENABLED=true`:
- New user accounts are created with `is_enabled=false` by default
- Users cannot log in until an admin enables their account
- Admins can enable/disable users from the admin dashboard (`/app/admin/users`)
- Disabled users see a "Pending Approval" message when trying to log in

GitHub OAuth callback URL:
- Local dev: `http://localhost:3003/api/auth/callback/github`
- Production: `https://yourdomain.com/api/auth/callback/github`

**OAuth Scope:** `read:user user:email` (no repository access)
- Reads your profile and email for authentication only
- **Public repositories:** Can be scanned without authentication
- **Private repositories:** Via GitHub App (see below)

This approach respects your privacy by not requesting broad repository permissions.

### GitHub App Setup (for private repos)

For private repository scanning, create a GitHub App:

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**

2. Configure the app:
   - **GitHub App name**: `SecurityKit` (or `SecurityKit Local` for dev)
   - **Homepage URL**: `http://localhost:3003` (or your production URL)
   - **Callback URL**: `http://localhost:3003/api/github/install/callback`
   - **Webhook URL**: `http://localhost:3003/api/github/webhook` (use ngrok for local dev)
   - **Webhook secret**: Generate with `openssl rand -hex 32`

3. Permissions:
   - **Contents**: Read-only
   - **Metadata**: Read-only

4. Subscribe to events:
   - Installation
   - Installation repositories

5. Copy credentials to `.env.local`:
   ```bash
   GITHUB_APP_ID=123456
   GITHUB_APP_NAME=securitykit
   GITHUB_APP_CLIENT_ID=Iv1.xxx
   GITHUB_APP_CLIENT_SECRET=xxx
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   GITHUB_APP_WEBHOOK_SECRET=xxx
   ```

6. Run migration: `pnpm db:migrate`

**Note:** We use both OAuth App (for auth) and GitHub App (for private repos). They serve different purposes.

## Install & run

```bash
pnpm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sec_audit pnpm db:push
pnpm dev
```

If `drizzle-kit push` cannot find the connection, make sure `DATABASE_URL` is
available in the shell (it does not automatically load `.env.local`).

Visit:
- Landing page: `http://localhost:3003`
- Dashboard: `http://localhost:3003/app`

## Notes

- The dashboard requires GitHub login.
- Scan results are fetched from the FastAPI service and persisted per user.
