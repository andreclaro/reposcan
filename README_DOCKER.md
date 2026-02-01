# Docker Compose Setup

Simple setup to run the entire Security Audit API stack with Docker Compose.

## Quick Start

### Build Images

Build all Docker images:

```bash
./scripts/build.sh
```

Or build specific services:

```bash
./scripts/build.sh --api      # Build only API service
./scripts/build.sh --worker   # Build only worker service
./scripts/build.sh --no-cache # Build without cache
```

See `./scripts/build.sh --help` for all options.

### Start All Services

```bash
docker-compose up -d
```

Or build and start in one command:

```bash
docker-compose up -d --build
```

This starts:
- **Redis** - Task queue broker
- **API** - FastAPI service on port 8000
- **Worker** - Celery worker for processing scans

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f redis
```

### Stop Services

```bash
docker-compose down
```

### Stop and Remove Volumes

```bash
docker-compose down -v
```

## Services

### Redis
- **Port**: 6379
- **Volume**: `redis_data` (persistent)
- **Health Check**: Enabled

### API
- **Port**: 8000
- **URL**: http://localhost:8000
- **Docs**: http://localhost:8000/docs
- **Volume**: Code mounted for hot-reload
- **Environment**: 
  - `REDIS_URL=redis://redis:6379/0`
  - `RESULTS_DIR=/work/results`

### Worker
- **Concurrency**: 2 workers
- **Volume**: Code mounted, Docker socket for Trivy scans
- **Environment**: 
  - `REDIS_URL=redis://redis:6379/0`
  - `RESULTS_DIR=/work/results`

### Environment file (api & worker)

API and worker load variables from **`webapp/.env.local`** via `env_file`. Values set in `environment:` in `docker-compose.yml` (e.g. `REDIS_URL`, `DATABASE_URL`) override the file.

- **Required**: Create `webapp/.env.local` (e.g. copy from `webapp/.env.local.example`) before `docker-compose up`, or Compose will fail.
- Put AI (and any other) vars there: `AI_ANALYSIS_ENABLED`, `AI_PROVIDER`, `KIMI_API_KEY` (or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`). Values in the compose `environment:` block (e.g. `REDIS_URL`, `DATABASE_URL`) override the file so container networking stays correct.

## Usage

### Test the API

```bash
# Health check
curl http://localhost:8000/health

# Create a scan
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/repo.git",
    "audit_types": ["sast", "dockerfile"]
  }'

# Check status
curl http://localhost:8000/scan/{scan_id}/status
```

### View Results

Results are stored in the `results/` directory (mounted as volume `results_data`):

```bash
# List results
ls -la results/

# View specific scan
cat results/{scan_id}/results.json
```

## Development

### Hot Reload

Both API and worker services have code mounted as volumes, so changes are reflected immediately:

- **API**: Uses `--reload` flag for auto-restart
- **Worker**: Restart manually: `docker-compose restart worker`

### Rebuild Images

**Using build script (recommended):**
```bash
# Rebuild all
./scripts/build.sh

# Rebuild specific service
./scripts/build.sh --api
./scripts/build.sh --worker

# Rebuild without cache (clean build)
./scripts/build.sh --no-cache
```

**Using docker-compose:**
```bash
# Rebuild all
docker-compose build

# Rebuild specific service
docker-compose build api
docker-compose build worker
```

### Run Commands in Containers

```bash
# API container
docker-compose exec api bash

# Worker container
docker-compose exec worker bash

# Run Python commands
docker-compose exec api python -c "from api.main import app; print(app)"
```

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping
```

### Worker Not Processing Tasks

```bash
# Check worker logs
docker-compose logs worker

# Restart worker
docker-compose restart worker
```

### Port Already in Use

If port 8000 is already in use, change it in `docker-compose.yml`:

```yaml
api:
  ports:
    - "8001:8000"  # Change 8001 to any available port
```

### Docker Socket Permission Issues

If you get permission errors with Docker-in-Docker:

```bash
# Add your user to docker group (Linux)
sudo usermod -aG docker $USER
# Then log out and back in
```

## Production Considerations

For production, you may want to:

1. Remove volume mounts (copy code into images)
2. Use environment-specific configs
3. Add resource limits
4. Use secrets management
5. Enable health checks and monitoring
6. Set up log aggregation

## Environment Variables

Create a `.env` file to override defaults:

```bash
REDIS_URL=redis://redis:6379/0
RESULTS_DIR=/work/results
```
