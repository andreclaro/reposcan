#!/bin/bash
# Simple script to start the Celery worker

echo "Starting Celery Worker..."
echo "Make sure Redis is running first!"
echo ""

celery -A tasks.scan_worker worker --loglevel=info
