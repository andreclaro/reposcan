# Design Document v2: Public User Documentation Platform

## Status

Proposed

## Executive Summary

`DESIGN_DOCS.md` is directionally good, but it leaves a long-term maintenance risk: key reference content (API endpoints, scanner capabilities, and configuration) is planned as mostly manual docs. In this project, those areas change often and already have code-level sources of truth.

This v2 keeps the same core direction (Next.js-integrated docs with MDX), but improves the architecture by:

1. Defining clear content ownership and boundaries.
2. Generating reference docs from backend/frontend source of truth.
3. Adding CI guardrails to prevent docs drift.
4. Rolling out in phases with measurable acceptance criteria.

## Why v2 Is Better Than v1

The original plan is strong on UI/features, but weak on maintainability and correctness over time.

### Main gaps in v1

1. **Reference drift risk**: API and scanner docs are written manually.
2. **Boundary ambiguity**: Existing `docs/internal-guides/*.md` content is internal, but v1 treated it like user-facing migration input.
3. **No quality gates**: No CI checks for broken links, missing coverage, or stale generated docs.
4. **Package risk**: Uses `latest` dependency spec in examples.
5. **Over-scoped v1**: Interactive generators/components are useful, but not critical for launch.

### What changes in v2

1. Keep authored guides human-written.
2. Auto-generate reference pages from code and schemas.
3. Gate merges with docs sync checks and link checks.
4. Ship a reliable v1 first, then advanced interactive components in v1.1+.

## Goals

1. Publish public documentation under `/docs` in the Next.js frontend.
2. Keep docs accurate as backend/frontend code evolves.
3. Reuse relevant internal-guide material selectively, without exposing internal-only details.
4. Keep internal architecture/operations docs private to repository contributors.
5. Improve SEO and self-service support.

## Non-Goals

1. Building a full live API playground in initial release.
2. Versioned docs in initial release.
3. User-authored docs contributions in initial release.

## Current State (Repo-Accurate)

1. Internal operator/developer guides currently live in:
   - `docs/internal-guides/API.md`
   - `docs/internal-guides/CLI.md`
   - `docs/internal-guides/CONFIGURATION.md`
   - `docs/internal-guides/DOCKER.md`
2. Internal docs live in:
   - `docs/architecture/*`
   - `docs/operations/*`
3. API contract source is in FastAPI:
   - `backend/src/api/main.py`
   - `backend/src/api/models.py`
4. Scanner capability source is:
   - `backend/src/audit/scanner_config.py`

## Proposed Architecture

### Decision 1: Keep docs inside the frontend app

Public docs are served by Next.js at `/docs`, with dedicated docs layout and static generation.

Benefits:
1. Unified domain and navigation.
2. Shared styling and auth context when needed.
3. Simple deployment path.

### Decision 2: Split content into authored vs generated

Use two content classes:

1. **Authored docs** (human-maintained):
   - Getting started
   - Tutorials/guides
   - Concepts
   - FAQ/troubleshooting
2. **Generated docs** (machine-generated from source):
   - API reference pages
   - Scanner matrix/capability table
   - Environment variable reference (public-safe subset)

This avoids manual drift for fast-changing reference material.

### Decision 3: Keep `docs/internal-guides` internal; do not treat it as public docs source

Internal guides can inform public docs, but they are not canonical input for direct migration.

Public-docs authoring rule:
1. Public docs canonical source is `frontend/src/content/docs/`.
2. Internal guides remain in `docs/internal-guides/` for team use.
3. Any reused content is rewritten for external audience and scrubbed for internal context.

This keeps a clear internal/public boundary.

## Content and File Structure

```text
frontend/src/
  app/
    docs/
      layout.tsx
      page.tsx
      [[...slug]]/page.tsx
      llms.txt/route.ts
      sitemap.ts
      og/route.tsx
  content/
    docs/
      meta.json
      getting-started/
      guides/
      support/
      reference/
        api/
          index.mdx                 # generated
          scan.mdx                  # generated
          scan-status.mdx           # generated
          scanners.mdx              # generated
        scanners.mdx                # generated
        configuration.mdx           # generated (safe subset)
  components/
    docs/
      Callout.tsx
      Endpoint.tsx
      ScannerTable.tsx

scripts/
  docs/
    export_openapi.py
    export_scanner_registry.py
    export_env_reference.py
    render_reference_mdx.mjs
```

## Source-of-Truth Mapping

| Docs Topic | Source of Truth | Output |
|---|---|---|
| API endpoints and schemas | `backend/src/api/main.py`, `backend/src/api/models.py` (OpenAPI) | `frontend/src/content/docs/reference/api/*.mdx` |
| Scanner catalog and defaults | `backend/src/audit/scanner_config.py` | `frontend/src/content/docs/reference/scanners.mdx` |
| Environment variables (public) | `.env.example`, `frontend/.env.local.example` + allowlist | `frontend/src/content/docs/reference/configuration.mdx` |
| How-to guides | curated authored markdown (optionally informed by `docs/internal-guides/*`) | `frontend/src/content/docs/guides/*.mdx` |

## Generation Pipeline

### Commands

Add repo-level commands:

```bash
make docs-sync     # regenerate generated docs artifacts
make docs-check    # verify clean tree after docs-sync + run link checks
```

Add frontend commands:

```bash
pnpm docs:sync
pnpm docs:check
```

### Pipeline Steps

1. Export OpenAPI JSON from FastAPI app (without running the server).
2. Export scanner registry JSON from `scanner_config.py`.
3. Export allowlisted env vars from example files.
4. Render generated MDX pages from templates.
5. Build docs pages and validate links.

### Design choice

Generated MDX/JSON artifacts are **committed** to git.

Reason:
1. Frontend-only deploys should not require Python runtime.
2. Reviewers can diff reference changes in pull requests.

## Navigation and UX

### Routes

1. `/docs` - docs home.
2. `/docs/getting-started/*`
3. `/docs/guides/*`
4. `/docs/reference/*`
5. `/docs/support/*`

### Entry points

1. Add `Docs` link to marketing nav in `frontend/src/app/page.tsx`.
2. Add `Docs` link to authenticated nav in `frontend/src/components/app-nav.tsx`.
3. Keep docs public (no auth required).

### Search and discoverability

1. Enable docs search (framework built-in).
2. Generate sitemap for docs routes.
3. Expose `llms.txt` for LLM-friendly indexing.

## SEO and Metadata

1. Each doc page defines title, description, and canonical URL.
2. OG image route supports title/subtitle rendering.
3. Add structured data for technical documentation pages.

## Security and Compliance Considerations

1. Docs content is local and reviewed in git (no untrusted remote MDX).
2. Environment reference generation uses explicit allowlist to avoid accidental secret disclosure.
3. No operational/internal runbook details in public docs.
4. Keep CSP compatible with docs route behavior.

## Phased Rollout

### Phase 0: Compatibility Spike (1-2 days)

1. Validate docs framework with current Next.js version in this repo.
2. Render one sample MDX page and one generated reference page.
3. Confirm build and routing behavior.

Exit criteria:
1. `pnpm build` passes.
2. `/docs` and one nested page render successfully.

### Phase 1: Foundation (2-3 days)

1. Add docs route/layout and base theme.
2. Add navigation links.
3. Add authored skeleton pages and information architecture.

Exit criteria:
1. All top-level docs sections accessible.
2. Mobile and desktop layout verified.

### Phase 2: Generated References (2-4 days)

1. Implement `docs:sync` generators.
2. Generate API reference from OpenAPI.
3. Generate scanner and configuration reference pages.

Exit criteria:
1. Generated reference pages exist and build.
2. `docs:check` fails when generated docs are stale.

### Phase 3: Migration and Hardening (2-3 days)

1. Author public guides; selectively adapt safe material from `docs/internal-guides/*`.
2. Add troubleshooting and FAQ.
3. Add CI checks: link checker, frontmatter validation, stale-generation check.

Exit criteria:
1. Internal guides remain internal and are not exposed in public docs navigation.
2. CI blocks broken links and stale docs artifacts.

### Phase 4: Post-Launch Enhancements (optional)

1. Interactive config generator.
2. Rich scanner comparison visualizations.
3. "Was this helpful?" feedback loop.

## CI Quality Gates

1. `pnpm docs:sync && git diff --exit-code` must pass in CI.
2. `pnpm build` must pass.
3. Link check must pass for internal links.
4. Optional: docs coverage check for public API operations.

## Success Metrics

1. Reduction in support requests for setup/API usage topics.
2. Zero broken docs links in CI on main branch.
3. No API endpoint drift between code and docs (enforced by generation).
4. Growth in docs page traffic and organic entry points.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Docs framework incompatibility with current Next.js | Delivery delay | Phase 0 spike + fallback to native MDX rendering |
| Generated docs become noisy in PRs | Review friction | Stable sorting/templates, deterministic output |
| Public docs leak internal-only settings | Security/reputation risk | Allowlist-based env docs generator + review checklist |
| Internal/public boundary blur | Confusion and leakage risk | Keep strict source ownership and review checklist for reused content |

## Acceptance Criteria

1. `/docs` is live and public in frontend.
2. API and scanner reference content is generated from source of truth.
3. Required public guide coverage exists without exposing internal-guide content directly.
4. CI prevents stale generated docs and broken links.
5. Internal architecture/operations docs remain outside public docs site.

## References

1. `docs/architecture/DESIGN_DOCS.md` (v1 baseline)
2. `backend/src/api/main.py`
3. `backend/src/api/models.py`
4. `backend/src/audit/scanner_config.py`
5. `docs/internal-guides/API.md`
6. `docs/internal-guides/CLI.md`
7. `docs/internal-guides/CONFIGURATION.md`
8. `docs/internal-guides/DOCKER.md`
