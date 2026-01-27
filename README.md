# sec-audit-repos

Security audit tool for repositories with both CLI and API interfaces. Runs SAST (Semgrep), Dockerfile scans (Trivy), and language/infrastructure audits (Node, Go, Rust, Terraform).

## Features

- **SAST Scanning**: Semgrep for static analysis
- **Dockerfile Scanning**: Trivy for container image vulnerabilities
- **Infrastructure Scanning**: tfsec, checkov, and tflint for Terraform
- **Language Audits**: npm/pnpm, govulncheck, and cargo-audit for dependencies
- **CLI Tool**: Batch scan multiple repositories from CSV
- **API Backend**: HTTP API with async processing via Celery workers

## Project Structure

```
sec-audit-repos/
├── sec_audit/          # Core scanning logic
├── api/                # FastAPI service (HTTP API)
├── tasks/              # Celery workers
├── scripts/            # Utility scripts
└── results/            # Scan results (gitignored)
```

## CLI Usage

### Basic Usage

Clone repositories from a CSV file and run security scans:

```sh
python sec_audit.py path/to/repositories.csv /path/to/clone/dir
```

### CSV Format

Create a `repositories.csv` file:

```csv
repository_url,branch
https://github.com/user/repo1.git,main
https://github.com/user/repo2.git,develop
https://github.com/user/repo3.git,
```

### Run Specific Audits

```sh
python sec_audit.py repositories.csv ./repos \
  --audit sast,terraform,dockerfile
```

Available audit types: `sast`, `dockerfile`, `terraform`, `node`, `go`, `rust`, or `all` (default).

### Docker Usage

```sh
docker run --rm \
  -v /absolute/path/to/repositories.csv:/work/repositories.csv \
  -v /absolute/path/to/clone/dir:/work/output \
  sec-audit-repos \
  /work/repositories.csv /work/output
```

Or if your CSV is in the current directory:

```sh
docker run --rm \
  -v "$(pwd)/repositories.csv:/work/repositories.csv" \
  -v "$(pwd)/output:/work/output" \
  sec-audit-repos \
  /work/repositories.csv /work/output
```

### CLI Output

Reports are written as `.txt` (and Semgrep `.json`) under `audit/<RepoName>/`:
- `semgrep.json` / `semgrep.txt` - SAST findings
- `trivy_dockerfile_scan.txt` - Dockerfile vulnerabilities
- `tfsec.txt`, `checkov.txt`, `tflint.txt` - Terraform issues
- `node_audit.txt` - Node.js dependency vulnerabilities
- `go_vulncheck.txt` - Go vulnerabilities
- `rust_audit.txt` - Rust crate vulnerabilities
- `languages.csv` - Detected languages summary

## API Backend Usage

The API backend provides an HTTP interface for running scans asynchronously.

### Quick Start (Docker Compose - Recommended)

Start all services with one command:

```sh
docker-compose up -d
```

This starts Redis, API service, and Celery worker. The API will be available at http://localhost:8000

View logs:
```sh
docker-compose logs -f
```

Stop services:
```sh
docker-compose down
```

See [README_DOCKER.md](README_DOCKER.md) for detailed Docker setup.

### Alternative: Local Development

1. **Install dependencies:**
   ```sh
   pip install -r requirements.txt
   ```

2. **Start Redis:**
   ```sh
   docker-compose up -d redis
   # OR
   redis-server
   ```

3. **Start FastAPI service:**
   ```sh
   uvicorn api.main:app --reload --port 8000
   ```

4. **Start Celery worker** (in a separate terminal):
   ```sh
   celery -A tasks.scan_worker worker --loglevel=info
   ```

### API Endpoints

#### POST /scan
Queue a new security scan job.

```bash
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/repo.git",
    "branch": "main",
    "audit_types": ["sast", "dockerfile", "terraform", "node", "go", "rust"]
  }'
```

Response:
```json
{
  "scan_id": "abc-123-def",
  "status": "queued"
}
```

#### GET /scan/{scan_id}/status
Get the status of a scan job.

```bash
curl http://localhost:8000/scan/{scan_id}/status
```

Response (completed):
```json
{
  "scan_id": "abc-123-def",
  "status": "completed",
  "progress": 100,
  "results_path": "./results/abc-123-def/",
  "result": {
    "scan_id": "abc-123-def",
    "repo_url": "...",
    "languages": {...},
    "audits": {...}
  }
}
```

#### GET /health
Health check endpoint.

```bash
curl http://localhost:8000/health
```

### API Documentation

Once the API is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### API Results

Scan results are stored in `results/{scan_id}/`:
- Individual scan reports (same format as CLI)
- `results.json` - Aggregated results with metadata

See [README_API.md](README_API.md) for detailed API documentation.

## Requirements

### System Tools

The following tools must be installed and available in PATH:
- **Git** (with optional git-lfs)
- **Semgrep** - `pip install semgrep`
- **Trivy** - Container scanner
- **tfsec** - Terraform security scanner
- **checkov** - Infrastructure as Code scanner
- **tflint** - Terraform linter
- **Node.js** (npm/pnpm) - For Node.js audits
- **Go** (govulncheck) - For Go audits
- **Rust** (cargo-audit) - For Rust audits
- **Docker CLI** - For Dockerfile scanning

### Python Dependencies

**CLI only:**
- Python 3.11+

**API Backend:**
- See `requirements.txt`:
  - fastapi
  - uvicorn
  - celery
  - redis
  - pydantic

## Environment Variables

See [ENV_VARIABLES.md](ENV_VARIABLES.md) for complete environment variable documentation.

**Quick Start (minimal configuration):**
```bash
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results
```

**With AI Analysis:**
```bash
AI_ANALYSIS_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-api03-...
AI_MODEL=claude-3-sonnet-20240229
```

## Notes

- If `git-lfs` is not available, clones run with LFS filters disabled.
- CLI reports are written under `audit/<RepoName>/`.
- API results are written under `results/<scan_id>/`.
- Both output directories are gitignored.

## Development

### Running Tests

```sh
# Test CLI
python sec_audit.py test_repos.csv ./test_output

# Test API
curl -X POST http://localhost:8000/scan -H "Content-Type: application/json" -d '{"repo_url": "...", "audit_types": ["sast"]}'
```

### Project Documentation

- [DESIGN_v0.md](design/DESIGN_v0.md) - Full architecture design (SaaS version)
- [DESIGN_v0-AI.md](design/DESIGN_v0-AI.md) - AI integration design
- [DESIGN_SEC_APP_SIMPLE_v0.md](design/DESIGN_SEC_APP_SIMPLE_v0.md) - Simple API backend design
- [README_API.md](README_API.md) - Detailed API documentation
- [ENV_VARIABLES.md](ENV_VARIABLES.md) - Complete environment variables reference

## License

[Add your license here]
