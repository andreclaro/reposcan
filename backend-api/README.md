# RepoScan API (Go)

This is the Go implementation of the RepoScan API backend, migrated from Python/FastAPI.

## Overview

The Go API provides the same endpoints and functionality as the original Python implementation:

- **POST /scan** - Queue a new security scan
- **POST /scan/{scan_id}/retry** - Retry an existing scan
- **GET /scan/{scan_id}/status** - Get scan status
- **POST /scan/{scan_id}/generate-ai** - Queue AI analysis generation
- **GET /scanners** - List available scanners
- **GET /health** - Basic health check
- **GET /health/detailed** - Detailed health check (PostgreSQL, Redis)

## Architecture

```
backend-api/
├── cmd/api/main.go           # Application entry point
├── internal/
│   ├── api/
│   │   ├── handlers.go       # HTTP request handlers
│   │   └── routes.go         # Route configuration
│   ├── celery/
│   │   └── client.go         # Celery/Redis integration
│   ├── config/
│   │   └── scanner.go        # Scanner registry configuration
│   ├── models/
│   │   └── models.go         # Request/response models
│   └── utils/
│       └── (validation utilities in models)
├── go.mod
└── go.sum
```

## Technology Stack

- **Go 1.22+** - Programming language
- **Gin** - HTTP web framework
- **go-redis** - Redis client for Celery integration
- **pgx** - PostgreSQL driver
- **google/uuid** - UUID generation

## Development

### Prerequisites

- Go 1.22 or later
- Redis (for Celery task queue)
- PostgreSQL (optional, for detailed health checks)

### Running Locally

```bash
cd backend-api

# Install dependencies
go mod download

# Run the server
go run ./cmd/api/main.go
```

Environment variables:
- `PORT` - API port (default: 8000)
- `REDIS_URL` - Redis connection URL (default: redis://localhost:6379/0)
- `DATABASE_URL` - PostgreSQL connection URL (optional)
- `RESULTS_DIR` - Directory for scan results (default: ./results)
- `GIN_MODE` - Gin mode: debug/release (default: release)

### Building

```bash
# Build binary
go build -o api ./cmd/api/main.go

# Build Docker image
docker build -f ../docker/Dockerfile.api -t reposcan-api ..
```

### Testing

```bash
# Run all tests
go test ./...

# Run with verbose output
go test -v ./...

# Run with coverage
go test -cover ./...
```

## Migration Notes

### From Python/FastAPI

| Python | Go |
|--------|-----|
| FastAPI | Gin |
| Pydantic models | Structs with validation methods |
| Celery Python | Custom Celery Redis client |
| asyncpg | pgx |
| slowapi | Custom rate limiting (to be added) |

### Endpoints Mapping

All endpoints are preserved with identical request/response formats:

- `POST /scan` → `CreateScan`
- `POST /scan/{id}/retry` → `RetryScan`
- `GET /scan/{id}/status` → `GetScanStatus`
- `POST /scan/{id}/generate-ai` → `GenerateAIAnalysis`
- `GET /scanners` → `ListScanners`
- `GET /health` → `Health`
- `GET /health/detailed` → `DetailedHealth`

### Scanner Configuration

Scanner registry is defined in `internal/config/scanner.go` and mirrors the Python `SCANNER_REGISTRY`:

- SAST (Semgrep)
- SCA (OSV-Scanner)
- Secrets (Gitleaks)
- Secrets Deep (TruffleHog)
- Node.js (npm/pnpm audit)
- Go (govulncheck)
- Rust (cargo-audit)
- Python (Bandit)
- Dockerfile (Trivy)
- Dockerfile Lint (Hadolint)
- Misconfiguration (Trivy Config)
- Terraform (tfsec/checkov/tflint)
- DAST (OWASP ZAP)

## Celery Integration

The Go API communicates with the Python Celery workers via Redis:

- Tasks are queued using the Celery message protocol
- Task results are retrieved from Redis using the standard Celery result backend key pattern

## Future Enhancements

- [ ] Add rate limiting (migrate from slowapi)
- [ ] Add structured logging (zap/logrus)
- [ ] Add request tracing/metrics
- [ ] Add OpenAPI/Swagger documentation
- [ ] Implement authentication middleware
