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

### CLI Usage

```bash
python sec_audit.py repositories.csv ./output
```

See [docs/CLI.md](docs/CLI.md) for detailed CLI documentation.

### API Usage

```bash
# Start services
docker-compose up -d

# Queue a scan
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/user/repo.git", "audit_types": ["sast"]}'
```

See [docs/API.md](docs/API.md) for API documentation and [docs/DOCKER.md](docs/DOCKER.md) for Docker setup.

### Web Application

```bash
cd webapp
pnpm install
pnpm dev
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/CLI.md](docs/CLI.md) | CLI usage and CSV format |
| [docs/API.md](docs/API.md) | API endpoints and examples |
| [docs/DOCKER.md](docs/DOCKER.md) | Docker Compose setup |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Environment variables |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |

## Project Structure

```
sec-audit-repos/
├── sec_audit/          # Core scanning logic (Python)
├── api/                # FastAPI service
├── tasks/              # Celery workers
├── webapp/             # Next.js frontend
├── docs/               # Documentation
├── scripts/            # Utility scripts
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
- See `requirements.txt` for dependencies

## Configuration

Minimal configuration:

```bash
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results
```

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for complete configuration options.

## Design Documents

- [design/DESIGN_v0.md](design/DESIGN_v0.md) - SaaS architecture design
- [design/DESIGN_v0-AI.md](design/DESIGN_v0-AI.md) - AI integration design
- [design/DESIGN_SEC_APP_SIMPLE_v0.md](design/DESIGN_SEC_APP_SIMPLE_v0.md) - API backend design

## License

[Add your license here]
