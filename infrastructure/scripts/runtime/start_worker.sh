#!/bin/bash
# Simple script to start the Celery worker

echo "Starting Celery Worker..."
echo "Make sure Redis is running first!"
echo ""

# Run from repo root: PYTHONPATH=backend/src celery -A worker.scan_worker worker --loglevel=info
# Run from repo root; script lives in infrastructure/scripts/runtime/
PYTHONPATH="${PYTHONPATH:-}:$(cd "$(dirname "$0")/../../.." && pwd)/backend/src" celery -A worker.scan_worker worker --loglevel=info
