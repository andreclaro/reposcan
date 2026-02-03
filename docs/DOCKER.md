# Docker Setup Guide

Run the entire Security Audit stack using Docker Compose.

## Quick Start

### Build Images

```bash
./scripts/build.sh
```

Build specific services:
```bash
./scripts/build.sh --api      # Build only API service
./scripts/build.sh --worker   # Build only worker service
./scripts/build.sh --no-cache # Build without cache
```

### Start All Services

```bash
docker-compose up -d
```

Or build and start in one command:
```bash
docker-compose up -d --build
```

Services started:
- **Redis** - Task queue broker (port 6379)
- **API** - FastAPI service (port 8000)
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

Remove volumes (WARNING: deletes data):
```bash
docker-compose down -v
```

## Service Details

### Redis
- **Port**: 6379
- **Volume**: `redis_data` (persistent)
- **Health Check**: Enabled

### API
- **Port**: 8000
- **URL**: http://localhost:8000
- **Docs**: http://localhost:8000/docs
- **Volume**: Code mounted for hot-reload

### Worker
- **Concurrency**: 2 workers
- **Volume**: Code mounted, Docker socket for Trivy scans

## Environment Configuration

API and worker load variables from `webapp/.env.local` via `env_file`.

**Required:** Create `webapp/.env.local` before starting:
```bash
cp webapp/.env.local.example webapp/.env.local
# Edit with your values
```

Values in `docker-compose.yml` `environment:` block override the file for container networking.

### Minimal Configuration

```bash
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sec_audit
RESULTS_DIR=/work/results
```

### With AI Analysis

```bash
AI_ANALYSIS_ENABLED=true
AI_PROVIDER=kimi
AI_MODEL=kimi-k2.5
KIMI_API_KEY=your_key
```

## Usage Examples

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

Results are stored in the `results/` directory:

```bash
# List results
ls -la results/

# View specific scan
cat results/{scan_id}/results.json
```

## Development

### Hot Reload

Both API and worker have code mounted as volumes:
- **API**: Uses `--reload` flag
- **Worker**: Restart manually: `docker-compose restart worker`

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

Change port in `docker-compose.yml`:
```yaml
api:
  ports:
    - "8001:8000"  # Change 8001 to any available port
```

### Docker Socket Permission Issues

```bash
# Add your user to docker group (Linux)
sudo usermod -aG docker $USER
# Then log out and back in
```

## Production Considerations

For production deployments:

1. Remove volume mounts (copy code into images)
2. Use environment-specific configs
3. Add resource limits
4. Use secrets management
5. Enable health checks and monitoring
6. Set up log aggregation
