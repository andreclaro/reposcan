#!/bin/bash
# Script to diagnose and fix disk space issues for Docker Compose setup

set -e

echo "=== Disk Space Diagnostic ==="
echo ""

# Check disk space
echo "1. Checking disk space:"
df -h | grep -E "Filesystem|/$|/var/lib/docker"
echo ""

# Check Docker disk usage
echo "2. Checking Docker disk usage:"
docker system df
echo ""

# Check Docker volumes
echo "3. Checking Docker volumes:"
docker volume ls | grep -E "sec-audit|postgres|redis|results" || echo "No matching volumes found"
echo ""

# Check for large files in results directory
if [ -d "results" ]; then
    echo "4. Checking results directory size:"
    du -sh results/* 2>/dev/null | sort -h | tail -10 || echo "No results found"
    echo ""
fi

# Interactive cleanup options
echo "=== Cleanup Options ==="
echo ""
echo "To free up space, you can:"
echo ""
echo "1. Clean up Docker system (removes unused containers, networks, images):"
echo "   docker system prune -a --volumes"
echo ""
echo "2. Remove specific volumes (WARNING: This will delete data):"
echo "   docker volume rm sec-audit-repos_postgres_data"
echo "   docker volume rm sec-audit-repos_redis_data"
echo "   docker volume rm sec-audit-repos_results_data"
echo ""
echo "3. Clean up old scan results:"
echo "   find results -type f -mtime +30 -delete  # Remove files older than 30 days"
echo ""
echo "4. Stop and remove all containers:"
echo "   docker compose down -v  # -v removes volumes"
echo ""
echo "Would you like to run cleanup? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo ""
    echo "Running docker system prune (this will remove unused Docker resources)..."
    docker system prune -a --volumes -f
    echo ""
    echo "Cleanup complete!"
    echo ""
    echo "You may need to recreate the database:"
    echo "  docker compose up -d postgres"
    echo "  # Wait for postgres to be healthy, then run migrations if needed"
fi
