#!/bin/bash
# Simple script to start the FastAPI service

echo "Starting Security Audit API..."
echo "Make sure Redis is running first!"
echo ""
echo "To start Redis:"
echo "  docker-compose up -d redis"
echo "  OR"
echo "  redis-server"
echo ""

uvicorn api.main:app --reload --port 8000
