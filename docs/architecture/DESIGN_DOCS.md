# Design Document: User Documentation Site

## Overview

This document outlines the design for adding a **public user documentation site** to the SecurityKit web application. This is separate from our internal documentation in `/docs/` (architecture decisions, design docs, operations guides).

The user-facing documentation will be:
- **Location**: Integrated into the Next.js frontend (`frontend/src/app/docs/`)
- **Format**: MDX files in `frontend/src/content/docs/`
- **Framework**: Fumadocs (similar to IndieKit's approach)
- **Purpose**: Help users understand, configure, and use SecurityKit

**Distinction from Internal Docs:**
| Type | Location | Audience | Content |
|------|----------|----------|---------|
| **User Docs** | `frontend/src/content/docs/` | Customers, users | How-to guides, API reference, troubleshooting |
| **Internal Docs** | `/docs/` | Team, developers | Architecture, design decisions, operations |

Existing internal docs remain in place for team reference.

## Goals

1. **User Onboarding**: Help users understand the service and get started quickly
2. **API Documentation**: Provide complete API reference for developers
3. **Feature Discovery**: Showcase scanner capabilities and configuration options
4. **Self-Service Support**: Reduce support burden with comprehensive troubleshooting guides
5. **SEO & Marketing**: Improve search visibility and organic discovery

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Docs Framework | [Fumadocs](https://fumadocs.vercel.app/) | Modern documentation framework for Next.js |
| Content Format | MDX | Markdown with React component support |
| Search | Fumadocs Search | Built-in fuzzy search with keyboard shortcuts |
| Icons | Lucide React | Consistent iconography |
| Styling | Tailwind CSS | Match existing design system |
| OG Images | Dynamic API Route | Auto-generated social preview images |

## Features

### Core Documentation Features

- **🤖 AI-Ready**: Automatic `llms.txt` generation for LLM consumption
- **🔍 Built-in Search**: Lightning-fast fuzzy search across all content
- **🖼️ Auto OG Images**: Social media cards for every page
- **📋 Copy as Markdown**: One-click copy for sharing
- **🗺️ Automatic Sitemap**: SEO-optimized sitemap generation
- **📱 Mobile Responsive**: Perfect experience on all devices
- **🎨 Icon Support**: Lucide icons for visual hierarchy

### SecurityKit-Specific Features

- **Interactive API Examples**: Copy-paste ready cURL commands
- **Scanner Comparison**: Side-by-side scanner capability matrix
- **Environment Config Generator**: Interactive config builder
- **Scan Result Examples**: Sample findings with explanations

## Content Structure

User documentation lives in the frontend codebase:

```
frontend/src/content/docs/
├── meta.json                    # Root navigation config
│
├── getting-started/
│   ├── meta.json
│   ├── index.mdx               # Introduction & overview
│   ├── quickstart.mdx          # 5-minute quick start
│   └── installation.mdx        # Detailed installation
│
├── features/
│   ├── meta.json
│   ├── index.mdx               # Features overview
│   ├── sast.mdx                # Semgrep static analysis
│   ├── containers.mdx          # Dockerfile scanning
│   ├── infrastructure.mdx      # Terraform/IaC scanning
│   ├── dependencies.mdx        # Node/Go/Rust audits
│   └── ai-analysis.mdx         # AI-powered insights
│
├── api-reference/
│   ├── meta.json
│   ├── index.mdx               # API overview
│   ├── authentication.mdx      # Auth & API keys
│   ├── endpoints.mdx           # Endpoint reference
│   ├── webhooks.mdx            # Webhook documentation
│   └── errors.mdx              # Error codes & handling
│
├── guides/
│   ├── meta.json
│   ├── cli.mdx                 # CLI usage guide
│   ├── docker.mdx              # Docker deployment
│   ├── configuration.mdx       # Environment variables
│   ├── github-integration.mdx  # GitHub app setup
│   └── ci-cd.mdx               # CI/CD integration
│
└── support/
    ├── meta.json
    ├── index.mdx               # Getting help
    ├── faq.mdx                 # Frequently asked questions
    └── troubleshooting.mdx     # Common issues
```

**Internal documentation** (team-only) remains in the repo root:
```
docs/
├── architecture/               # Design docs (including this file)
├── operations/                 # Runbooks, maintenance
├── roadmap/                    # Planning documents
└── user-guides/                # These will be migrated to frontend
```

## Page Content Specifications

### 1. Getting Started Section

#### `index.mdx` - Introduction
```yaml
---
title: SecurityKit Documentation
description: Automated security scanning for GitHub repositories
tags:
  - security
  - sast
  - vulnerabilities
  - api
---
```

**Content:**
- What is SecurityKit?
- Key features overview (4-column grid)
- Supported scanners matrix
- Quick links to popular docs

#### `quickstart.mdx` - 5-Minute Quick Start
**Content:**
1. Connect GitHub account
2. Run first scan
3. View results
4. Enable AI analysis (optional)

Include interactive scan form component.

#### `installation.mdx` - Installation Options
**Content:**
- Docker Compose (recommended)
- Local Python setup
- System requirements
- Verifying installation

### 2. Features Section

#### `index.mdx` - Features Overview
**Content:**
- Scanner capability matrix
- Severity levels explained
- Finding categories
- AI analysis features

#### Individual Scanner Pages
Each scanner page includes:
- What it detects
- Configuration options
- Example findings
- Integration with other scanners

### 3. API Reference Section

#### `endpoints.mdx` - API Endpoints
**Content:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/scan` | POST | Queue a new scan |
| `/scan/{id}/status` | GET | Get scan status |
| `/health` | GET | Health check |

Include request/response examples:

```bash
# Queue a scan
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/repo.git",
    "branch": "main",
    "audit_types": ["sast", "dockerfile", "terraform"]
  }'
```

```json
{
  "scan_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

### 4. Guides Section

#### `cli.mdx` - CLI Usage
**Content migrated from:** `docs/user-guides/CLI.md`

Adapt for end-users:
- Focus on usage, not development
- Remove internal implementation details
- Add more examples and use cases

#### `configuration.mdx` - Configuration
**Content migrated from:** `docs/user-guides/CONFIGURATION.md`

Simplified for users:
- Common configurations (hide obscure options)
- Copy-paste ready examples
- Security best practices
- Remove internal/dev-only settings

#### `docker.mdx` - Docker Setup
**Content migrated from:** `docs/user-guides/DOCKER.md`

User-focused:
- Quick start commands
- Common configurations
- Troubleshooting common issues
- Link to support for complex setups

### 5. Support Section

**Content adapted from:** `docs/operations/troubleshooting.md`

User-focused troubleshooting (not internal operations):
- "Why is my scan taking long?"
- "How do I enable AI analysis?"
- "My repository won't connect"
- "Understanding scan results"

**NOT included** (internal operations):
- PostgreSQL container management
- Docker volume cleanup
- Worker privilege settings
- Database connection pools

Internal ops docs stay in `docs/operations/`.

## Component Library

### Custom MDX Components

```tsx
// Callout for important information
<Callout type="info|warning|error|success" title="Title">
  Content here
</Callout>

// Code tabs for multiple languages
<CodeTabs tabs={["bash", "javascript", "python"]}>
  ```bash
  curl http://localhost:8000/health
  ```
  ```javascript
  fetch('http://localhost:8000/health')
  ```
  ```python
  requests.get('http://localhost:8000/health')
  ```
</CodeTabs>

// Scanner capability table
<ScannerTable />

// Interactive config generator
<ConfigGenerator />

// API endpoint card
<Endpoint 
  method="POST"
  path="/scan"
  description="Queue a new security scan"
/>
```

## Navigation Structure

### Sidebar Navigation (`meta.json`)

```json
{
  "title": "Getting Started",
  "description": "Learn the basics of SecurityKit",
  "icon": "Rocket",
  "pages": ["index", "quickstart", "installation"]
}
```

### Top Navigation Integration

Add "Docs" link to main navigation in `frontend/src/app/page.tsx`:

```tsx
<nav className="hidden items-center gap-8 md:flex">
  <Link href="/docs">Documentation</Link>
  <Link href="#features">Features</Link>
  <Link href="#how-it-works">How it works</Link>
  {/* ... */}
</nav>
```

## Implementation Plan

### Phase 1: Setup & Core Structure
1. Install Fumadocs dependencies
2. Create `frontend/src/app/docs/` route structure
3. Set up MDX content directory
4. Configure Tailwind for docs styling

### Phase 2: Content Migration
1. Migrate existing docs to MDX format
2. Create scanner documentation pages
3. Write API reference documentation
4. Add troubleshooting guides

### Phase 3: Enhancement
1. Add custom MDX components
2. Implement interactive examples
3. Configure OG image generation
4. Set up search indexing

### Phase 4: Polish & Launch
1. Mobile responsiveness testing
2. SEO optimization
3. Cross-linking from main site
4. Analytics integration

## File Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── docs/
│   │   │   ├── layout.tsx          # Docs layout with sidebar
│   │   │   ├── page.tsx            # Docs homepage
│   │   │   ├── [[...slug]]/
│   │   │   │   └── page.tsx        # Dynamic doc page renderer
│   │   │   └── api/
│   │   │       └── og/
│   │   │           └── route.tsx   # OG image generation
│   │   └── page.tsx                # Add Docs link to nav
│   │
│   ├── content/
│   │   └── docs/                   # All MDX content
│   │       ├── meta.json
│   │       ├── getting-started/
│   │       ├── features/
│   │       ├── api-reference/
│   │       ├── guides/
│   │       └── troubleshooting/
│   │
│   └── components/
│       └── docs/                   # Custom doc components
│           ├── Callout.tsx
│           ├── Endpoint.tsx
│           ├── ScannerTable.tsx
│           └── ConfigGenerator.tsx
│
├── next.config.js                  # Add MDX support
├── tailwind.config.ts              # Extend for docs
└── package.json                    # Add Fumadocs deps
```

## Dependencies

Add to `frontend/package.json`:

```json
{
  "dependencies": {
    "fumadocs-core": "latest",
    "fumadocs-ui": "latest",
    "fumadocs-mdx": "latest",
    "@radix-ui/react-scroll-area": "^1.0.0",
    "shiki": "^1.0.0"
  }
}
```

## Environment Variables

No additional environment variables required. The docs site will use existing:
- `NEXT_PUBLIC_APP_URL` - For generating absolute URLs in OG images
- `FASTAPI_BASE_URL` - For API examples (if shown dynamically)

## SEO Configuration

### Meta Tags

```tsx
// Each page generates:
<title>{pageTitle} | SecurityKit Docs</title>
<meta name="description" content={pageDescription} />
<meta property="og:title" content={pageTitle} />
<meta property="og:description" content={pageDescription} />
<meta property="og:image" content="/api/og?title={pageTitle}" />
```

### Structured Data

Add JSON-LD for rich search results:

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "SecurityKit Documentation",
  "description": "Automated security scanning for GitHub repositories",
  "author": {
    "@type": "Organization",
    "name": "SecurityKit"
  }
}
```

## Performance Considerations

1. **Static Generation**: All docs pages statically generated at build time
2. **Incremental Static Regeneration**: Rebuild docs when content changes
3. **Image Optimization**: OG images generated on-demand with caching
4. **Code Splitting**: Docs bundle separate from main application
5. **Search Index**: Pre-built search index for instant results

## Analytics Integration

Track documentation engagement:
- Page views per section
- Search queries
- Time on page
- Navigation patterns
- "Was this helpful?" feedback

## Future Enhancements

1. **Versioned Documentation**: Support multiple API versions
2. **Interactive API Explorer**: Try-it-now API playground
3. **User Contributions**: "Edit this page" GitHub integration
4. **Video Tutorials**: Embedded tutorial videos
5. **Changelog Integration**: Auto-generated from releases

## References

- **IndieKit Docs**: https://docs.indiekit.pro/docs (inspiration)
- **Fumadocs**: https://fumadocs.vercel.app/

### Source Material (to be adapted for users)
| Internal Doc | User Doc | Notes |
|--------------|----------|-------|
| `docs/user-guides/CLI.md` | `guides/cli.mdx` | Remove dev setup, focus on usage |
| `docs/user-guides/API.md` | `api-reference/endpoints.mdx` | Add examples, interactive features |
| `docs/user-guides/CONFIGURATION.md` | `guides/configuration.mdx` | Simplify, common use cases only |
| `docs/user-guides/DOCKER.md` | `guides/docker.mdx` | Quick start, not development |
| `docs/operations/troubleshooting.md` | `support/troubleshooting.mdx` | User issues only, not internal ops |

### Internal Docs (stay in `/docs/`)
- `docs/architecture/*` - Design decisions, ADRs
- `docs/operations/*` - Runbooks, maintenance procedures
- `docs/roadmap/*` - Planning documents
- `docs/market/*` - Market analysis, research
