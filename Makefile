# RepoScan – common commands
# Run from repo root.

.PHONY: install-backend test run-api run-worker run-frontend docker-build docker-up docker-down docker-logs audit help

help:
	@echo "Targets:"
	@echo "  install-backend  Install backend in editable mode"
	@echo "  test             Run backend tests (excl. integration)"
	@echo "  run-api          Start FastAPI (requires Redis)"
	@echo "  run-worker       Start Celery worker (requires Redis)"
	@echo "  run-frontend     Start Next.js frontend (port 3000)"
	@echo "  docker-build     Build API and worker images"
	@echo "  docker-up        Start stack (postgres, redis, api, worker)"
	@echo "  docker-down      Stop stack"
	@echo "  docker-logs      Follow all service logs"
	@echo "  audit            Run CLI (usage: make audit CSV=repos.csv OUT=./output)"

install-backend:
	pip install -e backend-worker/

test:
	PYTHONPATH=backend-worker/src pytest backend-worker/tests/ -v -m "not integration"

run-api:
	PYTHONPATH=backend-worker/src uvicorn api.main:app --reload --port 8000

run-worker:
	PYTHONPATH=backend-worker/src celery -A worker.scan_worker worker --loglevel=info

run-frontend:
	cd frontend && pnpm dev

docker-build:
	./infrastructure/deploy/build.sh

docker-up:
	docker compose -f docker/docker-compose.yml up -d

docker-down:
	docker compose -f docker/docker-compose.yml down

docker-logs:
	docker compose -f docker/docker-compose.yml logs -f

audit:
	PYTHONPATH=backend-worker/src python backend-worker/audit.py $(or $(CSV),repositories.csv) $(or $(OUT),./output)
