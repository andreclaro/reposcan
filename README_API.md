# Security Audit API - Simple Local Setup

Simple Python backend for running security scans locally using FastAPI and Celery.

## Quick Start

### Option 1: Docker Compose (Recommended)

Start all services with one command:

```bash
docker-compose up -d
```

This starts:
- Redis (task queue)
- API service (http://localhost:8000)
- Celery worker

View logs:
```bash
docker-compose logs -f
```

Stop services:
```bash
docker-compose down
```

See [README_DOCKER.md](README_DOCKER.md) for detailed Docker setup.

### Option 2: Local Development

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Start Redis

**Using Docker Compose:**
```bash
docker-compose up -d redis
```

**Local Redis:**
```bash
redis-server
```

**Docker (standalone):**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### 3. Start FastAPI Service

```bash
uvicorn api.main:app --reload --port 8000
# OR
./scripts/start_api.sh
```

The API will be available at: http://localhost:8000

### 4. Start Celery Worker

In a separate terminal:

```bash
celery -A tasks.scan_worker worker --loglevel=info
# OR
./scripts/start_worker.sh
```

### 5. Test the API

**Create a scan:**
```bash
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/repo.git",
    "branch": "main",
    "audit_types": ["sast", "dockerfile"]
  }'
```

Response:
```json
{
  "scan_id": "abc-123-def",
  "status": "queued"
}
```

**Check scan status:**
```bash
curl http://localhost:8000/scan/{scan_id}/status
```

**Health check:**
```bash
curl http://localhost:8000/health
```

## API Endpoints

### POST /scan
Queue a new security scan job.

**Request:**
```json
{
  "repo_url": "https://github.com/user/repo.git",
  "branch": "main",
  "audit_types": ["sast", "dockerfile", "terraform", "node", "go", "rust"],
  "skip_lfs": false
}
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

**Response:**
```json
{
  "status": "ok"
}
```

## Results Storage

Scan results are stored in the `results/` directory (gitignored):

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

## Environment Variables

See [ENV_VARIABLES.md](../ENV_VARIABLES.md) for complete environment variable documentation.

**Minimal configuration:**
```bash
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sec_audit
RESULTS_DIR=./results
```

**With AI Analysis enabled:**
```bash
AI_ANALYSIS_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-api03-...
AI_MODEL=claude-3-sonnet-20240229
```

## Project Structure

```
.
├── api/
│   ├── __init__.py
│   ├── main.py          # FastAPI application
│   └── models.py        # Pydantic models
├── tasks/
│   ├── __init__.py
│   └── scan_worker.py   # Celery worker task
├── sec_audit/           # Existing scan logic
│   ├── scanners.py
│   ├── ecosystem.py
│   ├── repos.py
│   └── fs.py
├── results/             # Scan results (gitignored)
├── requirements.txt
├── docker-compose.yml
└── README_API.md
```

## Troubleshooting

### Redis Connection Error
Make sure Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

### Worker Not Processing Tasks
- Check Redis is accessible
- Verify worker is connected: Look for "connected" message in worker logs
- Check task name matches: `tasks.scan_worker.run_scan`

### Scan Fails
- Check that required tools are installed (semgrep, trivy, etc.)
- Verify repository URL is accessible
- Check worker logs for detailed error messages

## Development

### Run with Auto-reload

**API:**
```bash
uvicorn api.main:app --reload --port 8000
```

**Worker:**
```bash
celery -A tasks.scan_worker worker --loglevel=info --reload
```

### View API Documentation

Once the API is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Next Steps

- Add authentication (API keys)
- Add S3 storage
- Add database for metadata
- Add multiple workers
- Add monitoring
