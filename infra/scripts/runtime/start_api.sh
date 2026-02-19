#!/bin/bash
# Simple script to start the FastAPI service

echo "Starting Security Audit API..."
echo "Make sure Redis is running first!"
echo ""
echo "To start Redis:"
echo "  docker compose -f docker/docker-compose.yml up -d redis"
echo "  OR"
echo "  redis-server"
echo ""

# Run from repo root with backend-worker on path: PYTHONPATH=backend-worker/src
# Or: cd backend && pip install -e . && uvicorn api.main:app --reload --port 8000
# Run from repo root; script lives in infrastructure/scripts/runtime/
echo "API is now in backend-api/ (Go). Run: cd backend-api && go run ./cmd/api/main.go"
