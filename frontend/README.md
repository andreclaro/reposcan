# SecurityKit Webapp

Next.js frontend for the sec-audit-repos FastAPI service. Includes GitHub OAuth,
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

GitHub OAuth callback URLs for local dev (add all to your OAuth app):
- `http://localhost:3003/api/auth/callback/github` (basic login)
- `http://localhost:3003/api/auth/callback/github-public` (public repos)
- `http://localhost:3003/api/auth/callback/github-private` (private repos)

For production, add your domain equivalents:
- `https://yourdomain.com/api/auth/callback/github`
- `https://yourdomain.com/api/auth/callback/github-public`
- `https://yourdomain.com/api/auth/callback/github-private`

**OAuth Scopes:** The app offers three login options:
- **Basic** (`read:user user:email`): Only profile and email, no repository access
- **Public Repos** (`public_repo`): Read-only access to your public repositories
- **Private Repos** (`repo`): Access to public and private repositories

For server-side scanning without OAuth, add a `GITHUB_TOKEN` in your settings.

**OAuth App vs GitHub App:** This app uses a [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) (client ID + client secret) for "Sign in with GitHub". That is different from [GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app) (App ID, private key, user access tokens). Use **Developer settings → OAuth Apps**, not GitHub Apps.

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
