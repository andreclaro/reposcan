# sec-audit-repos

Security audit tool for repositories with CLI, API, and web interfaces. Runs SAST (Semgrep), Dockerfile scans (Trivy), and language/infrastructure audits (Node, Go, Rust, Terraform).

## Features

- **SAST Scanning**: Semgrep for static analysis
- **Dockerfile Scanning**: Trivy for container vulnerabilities
- **Infrastructure Scanning**: tfsec, checkov, and tflint for Terraform
- **Language Audits**: npm/pnpm, govulncheck, and cargo-audit for dependencies
- **CLI Tool**: Batch scan multiple repositories from CSV
- **API Backend**: HTTP API with async processing via Celery workers
- **Web Application**: Next.js frontend with scan management and AI analysis

## Quick Start

All commands below are meant to be run from the **repository root**. You can use the [Makefile](Makefile) for common tasks: run `make help` to list targets.

### CLI Usage

```bash
# Using Make (default CSV: repositories.csv, output: ./output)
make audit
make audit CSV=path/to/repos.csv OUT=./output

# Or run directly
PYTHONPATH=backend/src python backend/audit.py repositories.csv ./output
# Or install and use the audit command: pip install -e backend/ && audit repositories.csv ./output
```

See [docs/user-guides/CLI.md](docs/user-guides/CLI.md) for detailed CLI documentation.

### API Usage

```bash
# Start backend stack (postgres, redis, api, worker)
make docker-up
# Or: docker compose -f docker/docker-compose.yml up -d

# Queue a scan
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/user/repo.git", "audit_types": ["sast"]}'

# Stop stack
make docker-down
```

See [docs/user-guides/API.md](docs/user-guides/API.md) for API documentation and [docs/user-guides/DOCKER.md](docs/user-guides/DOCKER.md) for Docker setup.

### Web Application

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend expects the API at `http://localhost:8000`. Start the backend with `make docker-up` or `make run-api` (and Redis) first.

## Documentation

See [docs/README.md](docs/README.md) for the full index. Quick links:

| Document | Description |
|----------|-------------|
| [docs/user-guides/CLI.md](docs/user-guides/CLI.md) | CLI usage and CSV format |
| [docs/user-guides/API.md](docs/user-guides/API.md) | API endpoints and examples |
| [docs/user-guides/DOCKER.md](docs/user-guides/DOCKER.md) | Docker Compose setup |
| [docs/user-guides/CONFIGURATION.md](docs/user-guides/CONFIGURATION.md) | Environment variables |
| [docs/operations/troubleshooting.md](docs/operations/troubleshooting.md) | Common issues and solutions |

## Project Structure

```
sec-audit-repos/
├── backend/            # Python backend (audit CLI, API, Celery worker)
│   ├── src/            # audit, api, worker packages
│   ├── requirements.txt
│   └── audit.py        # CLI entry point
├── docker/             # Docker Compose and Dockerfiles (single location)
│   ├── docker-compose.yml
│   ├── Dockerfile      # Worker image
│   └── Dockerfile.api  # API image
├── frontend/           # Next.js frontend
├── infrastructure/     # Deploy, maintenance, monitoring scripts
├── docs/               # Documentation
├── Makefile            # Common commands (make help)
└── results/            # Scan results (gitignored)
```

## System Requirements

### Required Tools

- **Git** (with optional git-lfs)
- **Semgrep** - `pip install semgrep`
- **Trivy** - Container scanner
- **tfsec**, **checkov**, **tflint** - Terraform scanners
- **Node.js**, **Go**, **Rust** - For language audits
- **Docker CLI** - For Dockerfile scanning

### Python Requirements

- Python 3.11+
- See `backend/requirements.txt` for dependencies

## Configuration

Minimal configuration:

```bash
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results
```

See [docs/user-guides/CONFIGURATION.md](docs/user-guides/CONFIGURATION.md) for complete configuration options.

## Development

From the repo root:

| Command | Description |
|---------|--------------|
| `make help` | List all Make targets |
| `make install-backend` | `pip install -e backend/` |
| `make test` | Run backend tests (no integration) |
| `make run-api` | Start FastAPI on :8000 (needs Redis) |
| `make run-worker` | Start Celery worker (needs Redis) |
| `make docker-build` | Build API and worker images |
| `make docker-up` | Start full stack (postgres, redis, api, worker) |
| `make docker-down` | Stop stack |
| `make docker-logs` | Follow service logs |
| `make audit` | Run CLI (optional: `CSV=file.csv OUT=./out`) |

## Design Documents

- [docs/architecture/DESIGN_v0.md](docs/architecture/DESIGN_v0.md) - SaaS architecture design
- [docs/architecture/DESIGN_v0-AI.md](docs/architecture/DESIGN_v0-AI.md) - AI integration design
- [docs/architecture/DESIGN_SEC_APP_SIMPLE_v0.md](docs/architecture/DESIGN_SEC_APP_SIMPLE_v0.md) - API backend design

## License

[Add your license here]
