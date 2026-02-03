# Infrastructure Scripts

This directory contains scripts for building, deploying, running, testing, and maintaining the security audit system.

## Directory Structure

```
infrastructure/scripts/
├── deployment/          # Build and deployment scripts
├── runtime/             # Service startup scripts
├── testing/            # Test scripts for API and CLI
├── fixtures/           # Test data files (CSV, text files)
├── maintenance/        # Maintenance and cleanup scripts
└── monitoring/         # Monitoring and health check scripts
```

## Deployment Scripts

Scripts for building Docker images and deploying the application.

- **`deployment/build.sh`** - Build Docker images for API and worker services
  ```bash
  ./infrastructure/scripts/deployment/build.sh [--api|--worker] [--no-cache] [--push]
  ```

## Runtime Scripts

Scripts to start services locally for development.

- **`runtime/start_api.sh`** - Start the FastAPI service locally
  ```bash
  ./infrastructure/scripts/runtime/start_api.sh
  ```

- **`runtime/start_worker.sh`** - Start the Celery worker locally
  ```bash
  ./infrastructure/scripts/runtime/start_worker.sh
  ```

## Testing Scripts

Scripts for testing the API and CLI functionality.

- **`testing/test_scan_api.sh`** - Test the scan API with multiple repositories
  ```bash
  API_BASE_URL=http://localhost:8000 ./infrastructure/scripts/testing/test_scan_api.sh
  ```

- **`testing/test_scan_simple.sh`** - Simple API test that submits scans and exits
  ```bash
  API_BASE_URL=http://localhost:8000 ./infrastructure/scripts/testing/test_scan_simple.sh
  ```

- **`testing/run_smoke_audit.py`** - Run smoke tests for the CLI audit tool
  ```bash
  python infrastructure/scripts/testing/run_smoke_audit.py [--csv PATH] [--repos DIR]
  ```

- **`testing/scan_top_github_repos.sh`** - Scan top GitHub repositories via API
  ```bash
  API_BASE_URL=http://localhost:8000 MAX_REPOS=50 ./infrastructure/scripts/testing/scan_top_github_repos.sh
  ```

## Fixtures

Test data files used by testing scripts.

- **`fixtures/repositories_smoke_test.csv`** - CSV file with smoke test repositories
- **`fixtures/top_github_repos.txt`** - List of top GitHub repositories

## Maintenance Scripts

Scripts for system maintenance and cleanup.

- **`maintenance/fix_disk_space.sh`** - Clean up disk space by removing old data
- **`maintenance/purge_dbs.py`** - Purge old database records

## Monitoring Scripts

Scripts for monitoring system health and status.

- **`monitoring/redis_check.py`** - Check Redis connection and health

## Usage Examples

### Build Docker Images

```bash
# Build all images
./infrastructure/scripts/deployment/build.sh

# Build only API image
./infrastructure/scripts/deployment/build.sh --api

# Build without cache
./infrastructure/scripts/deployment/build.sh --no-cache
```

### Start Services Locally

```bash
# Start API (requires Redis)
./infrastructure/scripts/runtime/start_api.sh

# Start worker (requires Redis)
./infrastructure/scripts/runtime/start_worker.sh
```

### Run Tests

```bash
# Test API with multiple repos
API_BASE_URL=http://localhost:8000 ./infrastructure/scripts/testing/test_scan_api.sh

# Run CLI smoke tests
python infrastructure/scripts/testing/run_smoke_audit.py

# Scan top GitHub repos
API_BASE_URL=http://localhost:8000 MAX_REPOS=10 ./infrastructure/scripts/testing/scan_top_github_repos.sh
```

## Environment Variables

Many scripts support environment variables for configuration:

- `API_BASE_URL` - Base URL for the API (default: `http://localhost:8000`)
- `AUDIT_TYPES` - Comma-separated audit types (default: `all`)
- `MAX_REPOS` - Maximum number of repositories to process
- `GITHUB_TOKEN` - GitHub API token for higher rate limits
- `DOCKER_REGISTRY` - Docker registry for pushing images
- `IMAGE_TAG` - Docker image tag (default: `latest`)
