# AGENTS.md - Security Audit Tool for AI Coding Agents

This document provides essential information for AI coding agents working on the `sec-audit-repos` project.

## Project Overview

`sec-audit-repos` is a comprehensive security audit tool for software repositories. It provides:

- **CLI Tool**: Batch scan multiple repositories from CSV files
- **API Backend**: HTTP API with async processing via Celery workers
- **Web Application**: Next.js-based SaaS frontend with user authentication, billing, and scan management
- **AI-Powered Analysis**: Optional AI-generated security summaries and recommendations

### Core Capabilities

| Audit Type | Tool(s) Used | Description |
|------------|--------------|-------------|
| SAST | Semgrep | Static application security testing |
| Dockerfile | Trivy | Container image vulnerability scanning |
| Terraform | tfsec, checkov, tflint | Infrastructure as Code security |
| Node.js | npm/pnpm audit | Dependency vulnerability scanning |
| Go | govulncheck | Go vulnerability database check |
| Rust | cargo-audit | Rust crate vulnerability audit |
| Filesystem | Trivy fs | General filesystem vulnerability scan |

## Project Structure

```
sec-audit-repos/
├── backend/                # Python backend
│   ├── src/
│   │   ├── audit/         # Core scanning logic (CLI, scanners, ecosystem, ai)
│   │   ├── api/           # FastAPI service
│   │   └── worker/        # Celery worker (scan_worker.py)
│   └── tests/             # Python test suite
├── frontend/               # Next.js frontend application
│   ├── src/app/           # Next.js App Router pages
│   ├── src/components/    # React components
│   ├── src/db/            # Drizzle ORM schema
│   └── src/lib/           # Utility functions
├── infrastructure/         # Deploy, maintenance, monitoring scripts
├── docs/                   # Documentation (architecture, user-guides, development, operations)
├── backend/
│   └── requirements.txt   # Python dependencies
└── docker/
    └── docker-compose.yml  # Local development stack
```

## Technology Stack

### Backend (Python)
- **Python**: 3.11+
- **FastAPI**: 0.104.1 - HTTP API framework
- **Celery**: 5.3.4 - Distributed task queue
- **Redis**: 7.x - Message broker and cache
- **PostgreSQL**: 16+ - Primary database (via asyncpg)
- **Pydantic**: 2.9.2 - Data validation
- **AI Providers**: Anthropic (claude-3-*) or OpenAI (GPT-4)

### Frontend (TypeScript/React)
- **Next.js**: 16.0.7 - Full-stack React framework
- **React**: 19.2.0
- **TypeScript**: 5.8.3
- **TailwindCSS**: 4.1.12 - Styling
- **Drizzle ORM**: 0.38.4 - Database ORM
- **NextAuth.js**: 5.0.0-beta.25 - Authentication
- **Stripe**: Payment processing

### Security Scanners (Required System Tools)
- **Semgrep**: Static analysis (installed via pip)
- **Trivy**: Container/filesystem scanner
- **tfsec**: Terraform security scanner
- **checkov**: Infrastructure as Code scanner
- **tflint**: Terraform linter
- **npm/pnpm**: Node.js package managers
- **govulncheck**: Go vulnerability checker
- **cargo-audit**: Rust crate audit

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 20+ (with pnpm)
- Docker and Docker Compose
- Git (with optional git-lfs)

### Local Development (Docker Compose - Recommended)

```bash
# Start all services (PostgreSQL, Redis, API, Worker)
docker compose -f docker/docker-compose.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop services
docker compose -f docker/docker-compose.yml down
```

Services will be available at:
- FastAPI: http://localhost:8000
- Next.js: http://localhost:3003 (run separately with `pnpm dev` in frontend/)
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Manual Development

**Python Backend:**
```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Start FastAPI
uvicorn api.main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A tasks.scan_worker worker --loglevel=info
```

**Next.js Frontend:**
```bash
cd frontend
pnpm install
pnpm dev
```

### Environment Variables

Create `.env` in project root:
```bash
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
REDIS_URL=redis://localhost:6379/0
RESULTS_DIR=./results

# For AI analysis (optional). Provider: anthropic | openai | kimi
AI_ANALYSIS_ENABLED=true
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
# Or: KIMI_API_KEY=... for Kimi K2.5 (AI_PROVIDER=kimi, AI_MODEL=kimi-k2.5)
AI_MODEL=claude-3-sonnet-20240229

# For frontend (in frontend/.env.local)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
FASTAPI_BASE_URL=http://localhost:8000
```

See `ENV_VARIABLES.md` for complete documentation.

## Build and Test Commands

### Python Tests
```bash
# Run all tests
pytest

# Run specific test file
pytest backend/tests/test_utils.py

# Run integration tests (requires network, clones real repos)
pytest -m integration

# Run with verbose output
pytest -v
```

### Next.js Commands
```bash
cd frontend

# Development server
pnpm dev

# Build for production
pnpm build

# Linting
pnpm lint

# Database migrations
pnpm db:generate    # Generate migration files
pnpm db:push        # Push schema to database
pnpm db:migrate     # Apply migrations
```

### Docker Commands
```bash
# Build scanner image (full tool suite)
docker build -f Dockerfile -t sec-audit-scanner .

# Build API image (lightweight)
docker build -f Dockerfile.api -t sec-audit-api .

# Run CLI via Docker
docker run --rm \
  -v "$(pwd)/repositories.csv:/work/repositories.csv" \
  -v "$(pwd)/output:/work/output" \
  sec-audit-scanner \
  /work/repositories.csv /work/output
```

## Code Organization

### Core Modules (`backend/src/audit/`)

| Module | Purpose |
|--------|---------|
| `cli.py` | Command-line interface, argument parsing, main execution loop |
| `scanners.py` | Wrappers for external security tools (Semgrep, Trivy, tfsec, etc.) |
| `ecosystem.py` | Language-specific audit logic (Node.js, Go, Rust) |
| `repos.py` | Git operations: clone, submodule updates, commit hash detection |
| `fs.py` | Filesystem utilities: language detection, Dockerfile discovery |
| `utils.py` | Input validation, CSV parsing, audit selection logic |
| `version_manager.py` | Runtime version detection for Node.js, Go, Rust |

### AI Module (`backend/src/audit/ai/`)

| Module | Purpose |
|--------|---------|
| `normalizer.py` | Parse scanner outputs into normalized `Finding` objects |
| `summarizer.py` | Generate AI-powered security summaries |
| `code_analyzer.py` | Context-aware code analysis |
| `llm_client.py` | Unified interface for Anthropic/OpenAI APIs |
| `storage.py` | PostgreSQL database operations for findings |
| `storage_backend.py` | Abstraction for local/S3 file storage |
| `parsers/` | Scanner-specific output parsers (Semgrep, Trivy, npm, etc.) |

### API Layer (`backend/src/api/`)

- `main.py`: FastAPI endpoints (`POST /scan`, `GET /scan/{id}/status`, `GET /health`)
- `models.py`: Pydantic models for request/response validation

### Worker (`backend/src/worker/`)

- `scan_worker.py`: Celery task that orchestrates the complete scan pipeline
  1. Clone repository
  2. Detect languages
  3. Run security scans
  4. Normalize and store findings
  5. Generate AI analysis (optional)
  6. Upload results to storage

## Testing Strategy

### Test Organization (`backend/tests/`)

| File | Coverage |
|------|----------|
| `test_utils.py` | URL validation, branch validation, CSV parsing, audit selection |
| `test_repos.py` | Git operations, repository cloning |
| `test_scanners.py` | Scanner execution, output handling |
| `test_ecosystem_detection.py` | Language detection, project structure analysis |
| `test_integration_github.py` | End-to-end tests with real GitHub repos |

### Test Markers

- `integration`: Tests that require network access and clone real repositories
- Use `pytest -m "not integration"` to skip integration tests

### Adding Tests

```python
# Example test structure
def test_feature_description():
    """Test description."""
    # Arrange
    input_data = ...
    
    # Act
    result = function_under_test(input_data)
    
    # Assert
    assert result == expected_output
```

## Code Style Guidelines

### Python
- **Style**: PEP 8 compliant
- **Type hints**: Use `typing` module (e.g., `Path`, `Optional[str]`, `Dict[str, Any]`)
- **Docstrings**: Google-style docstrings for functions
- **Imports**: Group as stdlib → third-party → local
- **Error handling**: Use specific exceptions, log errors appropriately

```python
from pathlib import Path
from typing import Optional

import subprocess

from .utils import validate_repo_url


def clone_repo(repo_url: str, dest: Path, branch: Optional[str] = None) -> str:
    """Clone a Git repository.
    
    Args:
        repo_url: Repository URL (https, git@, or ssh)
        dest: Destination directory path
        branch: Branch to clone (None for default branch)
    
    Returns:
        The branch name that was cloned
    
    Raises:
        RuntimeError: If cloning fails
    """
    # Implementation
```

### TypeScript/React
- **Style**: ESLint + Prettier (Next.js defaults)
- **Components**: Functional components with hooks
- **Types**: Strict TypeScript, define interfaces for props
- **File naming**: kebab-case for files, PascalCase for components

## Security Considerations

### Input Validation
All user inputs are validated before use:
- **Repository URLs**: Only http, https, git, ssh schemes allowed (`validate_repo_url`)
- **Branch names**: Alphanumeric, dots, underscores, slashes, hyphens only (`validate_branch`)
- **CSV files**: Size limit (10MB), row limit (10,000 rows)
- **Audit types**: Whitelist validation against `ALLOWED_AUDITS`

### Path Traversal Prevention
- `sanitize_repo_slug()`: Removes path traversal sequences
- `ensure_audit_dirs()`: Validates paths within allowed base directory
- All filesystem operations use resolved absolute paths

### Environment Security
- Secrets in environment variables only (never in code)
- `.env.local` is gitignored for local development
- API keys validated on every request

### Beta Mode / Whitelist Access
The frontend supports a beta launch mode where new accounts require admin approval:

- **Environment Variable**: `BETA_MODE_ENABLED=true` (default: `false`)
- When enabled, new user accounts are created with `is_enabled=false` by default
- Users see a "Pending Approval" message and cannot access the service until enabled
- Admins (defined by `ADMIN_EMAIL`) can enable/disable users via the admin dashboard
- Admins are always allowed to log in regardless of their `is_enabled` status

**Configuration:**
```bash
# .env.local
BETA_MODE_ENABLED=true
ADMIN_EMAIL=admin@example.com,another-admin@example.com
```

**Database Migration:**
```bash
cd frontend
DATABASE_URL=postgresql://... npx drizzle-kit migrate
# Or apply manually: drizzle/0007_add_user_is_enabled.sql
```

### Worker Isolation
- Each scan runs in isolated temporary directory
- Automatic cleanup after scan completion
- Docker-in-Docker for Trivy scans (limited container access)

## Database Schema (Key Tables)

### `scan`
- `scan_id`: UUID primary key
- `repo_url`, `branch`, `commit_hash`: Repository info
- `status`: queued | running | completed | failed
- `progress`: 0-100 percentage
- `findings_count`, `*_count`: Severity breakdown
- `user_id`: Foreign key to users table

### `finding`
- `id`: Serial primary key
- `scan_id`: Reference to scan
- `scanner`: Tool that found the issue (semgrep, trivy, etc.)
- `severity`: critical | high | medium | low | info
- `category`: injection | xss | auth | crypto | etc.
- `title`, `description`, `file_path`, `line_start`, `line_end`
- `cwe`, `cve`: Standard identifiers
- `metadata`: JSONB for tool-specific data

### `ai_analysis`
- `scan_id`: Reference to scan
- `summary`: Markdown executive summary
- `recommendations`: JSON array of prioritized actions
- `risk_score`: 0-100 overall risk rating
- `top_findings`: Array of finding IDs
- `tokens_used`: For cost tracking

See `frontend/src/db/schema.ts` for complete schema definition.

## Common Tasks

### Adding a New Scanner

1. Add scanner binary to `Dockerfile`
2. Create wrapper function in `backend/src/audit/scanners.py`
3. Add parser in `backend/src/audit/ai/parsers/` if normalization needed
4. Integrate into `backend/src/worker/scan_worker.py` pipeline
5. Add tests in `backend/tests/test_scanners.py`

### Adding a New Audit Type

1. Add to `ALLOWED_AUDITS` in `backend/src/audit/utils.py`
2. Add detection logic in `backend/src/audit/fs.py` or `backend/src/audit/ecosystem.py`
3. Add execution in `backend/src/audit/cli.py` and `backend/src/worker/scan_worker.py`
4. Update API models in `backend/src/api/models.py`
5. Update documentation

### Modifying Database Schema

1. Edit `frontend/src/db/schema.ts`
2. Run `pnpm db:generate` to create migration
3. Apply with `pnpm db:migrate`
4. Update Python storage functions in `backend/src/audit/ai/storage.py`

### Adding AI Analysis Features

1. Modify `backend/src/audit/ai/summarizer.py` for new analysis types
2. Update database schema if storing new data
3. Update normalizer in `backend/src/audit/ai/normalizer.py` if needed

## Debugging Tips

### CLI Debugging
```bash
# Enable verbose logging
python -m audit repos.csv ./output --verbose

# Run specific audit only
python -m audit repos.csv ./output --audit sast
```

### API Debugging
```bash
# Check health
curl http://localhost:8000/health

# Submit scan and track
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/user/repo.git", "audit_types": ["sast"]}'

# Check status
curl http://localhost:8000/scan/{scan_id}/status
```

### Worker Debugging
```bash
# Run worker with verbose logging
celery -A tasks.scan_worker worker --loglevel=debug

# Check Celery task results
redis-cli -n 0 keys "celery-task-meta-*"
```

### Common Issues

1. **DNS Resolution in Docker**: Check `docker/docker-compose.yml` DNS settings
2. **Missing Scanners**: Ensure all tools installed in Docker image
3. **Database Connection**: Verify `DATABASE_URL` format and network access
4. **AI Analysis Not Working**: Check `AI_ANALYSIS_ENABLED` and API keys

## Documentation References

- `README.md`: User-facing quick start and usage
- `README_API.md`: Detailed API documentation
- `README_DOCKER.md`: Docker deployment guide
- `ENV_VARIABLES.md`: Complete environment variable reference
- `TROUBLESHOOTING.md`: Common issues and solutions
- `docs/architecture/DESIGN_v0.md`: Full SaaS architecture design
- `docs/architecture/DESIGN_v0-AI.md`: AI integration design
- `docs/architecture/DESIGN_SEC_APP_SIMPLE_v0.md`: Simple API backend design

## License

[Add your license here]
