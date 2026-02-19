# API Documentation

The Security Audit API provides an HTTP interface for running security scans asynchronously using FastAPI and Celery.

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
docker compose -f docker/docker-compose.yml up -d
```

Services started:
- Redis (task queue)
- API service (http://localhost:8000)
- Celery worker

View logs:
```bash
docker compose -f docker/docker-compose.yml logs -f
```

Stop services:
```bash
docker compose -f docker/docker-compose.yml down
```

### Option 2: Local Development

1. **Install dependencies:**
   ```bash
   pip install -r backend-worker/requirements.txt
   ```

2. **Start Redis:**
   ```bash
   docker compose -f docker/docker-compose.yml up -d redis
   # OR
   redis-server
   ```

3. **Start FastAPI service:**
   ```bash
   uvicorn api.main:app --reload --port 8000
   ```

4. **Start Celery worker** (separate terminal):
   ```bash
   celery -A tasks.scan_worker worker --loglevel=info
   ```

## API Endpoints

### POST /scan

Queue a new security scan job.

**Request:**
```bash
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/repo.git",
    "branch": "main",
    "audit_types": ["sast", "dockerfile", "terraform", "node", "go", "rust"],
    "skip_lfs": false
  }'
```

**Response:**
```json
{
  "scan_id": "uuid",
  "status": "queued"
}
```

### GET /scan/{scan_id}/status

Get the status of a scan job.

**Response (Running):**
```json
{
  "scan_id": "uuid",
  "status": "running",
  "progress": 50
}
```

**Response (Completed):**
```json
{
  "scan_id": "uuid",
  "status": "completed",
  "progress": 100,
  "results_path": "./results/uuid/",
  "result": {
    "scan_id": "uuid",
    "repo_url": "...",
    "languages": {...},
    "audits": {...}
  }
}
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "status": "ok"
}
```

## Interactive Documentation

Once the API is running:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Results Storage

Scan results are stored in `results/{scan_id}/`:

```
results/
  {scan_id}/
    languages.csv
    semgrep.json
    semgrep.txt
    trivy_dockerfile_scan.txt
    node_audit.txt
    go_vulncheck.txt
    rust_audit.txt
    tfsec.txt
    checkov.txt
    tflint.txt
    results.json (aggregated)
```

## Project Structure

```
├── api/
│   ├── __init__.py
│   ├── main.py          # FastAPI application
│   └── models.py        # Pydantic models
├── tasks/
│   ├── __init__.py
│   └── scan_worker.py   # Celery worker task
├── sec_audit/           # Core scanning logic
│   ├── scanners.py
│   ├── ecosystem.py
│   ├── repos.py
│   └── fs.py
└── results/             # Scan results (gitignored)
```

## Development

### Run with Auto-reload

**API:**
```bash
uvicorn api.main:app --reload --port 8000
```

**Worker:**
```bash
celery -A tasks.scan_worker worker --loglevel=info
```

## Troubleshooting

### Redis Connection Error

```bash
redis-cli ping
# Should return: PONG
```

### Worker Not Processing Tasks

- Check Redis is accessible
- Verify worker is connected (look for "connected" in logs)
- Check task name matches: `tasks.scan_worker.run_scan`

### Scan Fails

- Check required tools are installed (semgrep, trivy, etc.)
- Verify repository URL is accessible
- Check worker logs for detailed error messages
