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

# Run from repo root with backend on path: PYTHONPATH=backend/src
# Or: cd backend && pip install -e . && uvicorn api.main:app --reload --port 8000
# Run from repo root; script lives in infrastructure/deploy/
PYTHONPATH="${PYTHONPATH:-}:$(cd "$(dirname "$0")/../.." && pwd)/backend/src" uvicorn api.main:app --reload --port 8000
