# Troubleshooting Guide

## Issue: PostgreSQL Container Fails with "No space left on device"

### Symptoms
- PostgreSQL container exits with code 1
- Error: `could not write lock file "postmaster.pid": No space left on device`
- Worker tasks fail to connect to database: `[Errno -2] Name or service not known`

### Root Cause
Docker volumes or the host filesystem have run out of disk space.

### Solution

#### 1. Check Disk Space
```bash
# Check overall disk usage
df -h

# Check Docker disk usage
docker system df

# Run diagnostic script
./scripts/fix_disk_space.sh
```

#### 2. Clean Up Docker Resources
```bash
# Remove unused containers, networks, images, and volumes
docker system prune -a --volumes

# Or remove specific volumes (WARNING: deletes data)
docker compose down -v
```

#### 3. Clean Up Old Scan Results
```bash
# Remove scan results older than 30 days
find results -type f -mtime +30 -delete

# Or manually clean specific scan directories
rm -rf results/<scan-id>
```

#### 4. Restart Services
```bash
# Stop all services
docker compose down

# Remove volumes if needed (WARNING: deletes data)
docker volume rm sec-audit-repos_postgres_data

# Restart services
docker compose up -d

# Wait for PostgreSQL to be healthy
docker compose ps
```

## Issue: Database Connection Failures

### Symptoms
- Worker logs show: `[Errno -2] Name or service not known`
- Scans complete but findings aren't stored in database
- Status updates fail

### Root Cause
- PostgreSQL container not running (often due to disk space)
- Worker starts before PostgreSQL is ready
- Network/DNS resolution issues

### Solution

#### 1. Ensure PostgreSQL Dependency
The `docker-compose.yml` has been updated to ensure the worker waits for PostgreSQL:
```yaml
worker:
  depends_on:
    redis:
      condition: service_healthy
    postgres:
      condition: service_healthy  # Added
```

#### 2. Retry Logic
Database connection now includes automatic retry logic (up to 5 attempts with 2-second delays).

#### 3. Verify Services Are Running
```bash
# Check service status
docker compose ps

# Check PostgreSQL logs
docker compose logs postgres

# Check worker logs
docker compose logs worker | grep -i "database\|postgres"
```

#### 4. Test Database Connection
```bash
# Connect to PostgreSQL from worker container
docker compose exec worker python -c "
import asyncio
import asyncpg
import os

async def test():
    db_url = os.getenv('DATABASE_URL')
    try:
        conn = await asyncpg.connect(db_url)
        print('✓ Database connection successful')
        await conn.close()
    except Exception as e:
        print(f'✗ Database connection failed: {e}')

asyncio.run(test())
"
```

## Issue: Worker Running as Root

### Symptoms
- Warning: `You're running the worker with superuser privileges: this is absolutely not recommended!`

### Solution
This is a security warning. The worker should run as a non-root user. Update the Dockerfile to create and use a non-root user:

```dockerfile
# Add to Dockerfile before CMD
RUN useradd -m -u 1000 worker && \
    chown -R worker:worker /work

USER worker
```

## Issue: AI analysis not available for scan (404 on /api/scans/.../ai-analysis)

### Symptoms
- Scan results page shows findings but the "AI Analysis" tab returns 404 or "AI analysis not available for this scan".
- Scan completed but no AI summary was generated.

### Root Cause
AI analysis runs only when **all** of the following are true during the scan:

1. **Worker environment**: `AI_ANALYSIS_ENABLED=true` (default is `false`).
2. **Worker environment**: At least one API key is set (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `KIMI_API_KEY`, or `MOONSHOT_API_KEY`).
3. The scan produced findings and the database was available.

If the worker did not have AI enabled or had no API key when the scan ran, no AI analysis is stored.

### Solution

#### Option A: Enable AI for future scans
Set these in the **worker** environment (e.g. in `docker-compose.yml` under `worker.environment` or in `.env` if the worker reads it):

```bash
AI_ANALYSIS_ENABLED=true
AI_PROVIDER=kimi          # or anthropic, openai
AI_MODEL=kimi-k2.5        # or your preferred model
KIMI_API_KEY=your_key     # or ANTHROPIC_API_KEY / OPENAI_API_KEY
```

Restart the worker after changing env, then run new scans (or use Admin → Rescan to re-run the same repo).

#### Option B: Generate AI analysis for an existing scan
For a scan that already completed **without** AI:

1. Ensure the worker has `AI_ANALYSIS_ENABLED=true` and an API key (as above).
2. Restart the worker so it picks up the env.
3. In the **Admin** dashboard, open the scan and click **Generate AI analysis** (shown when the scan is completed, has findings, and has no AI analysis yet).
4. Wait about a minute, then refresh the scan or the results page; the AI Analysis tab should appear.

## Issue: AI analysis 401 Invalid Authentication

### Symptoms
- AI Analysis tab shows: "AI analysis failed: Error code: 401 - {'error': {'message': 'Invalid Authentication', ...}}"
- Or: "Kimi API key was rejected (401)."

### Root Cause
The Kimi/Moonshot (or OpenAI/Anthropic) API key is missing, wrong, expired, or not reaching the worker.

### Solution

1. **Get a valid key**  
   - Kimi: https://platform.moonshot.ai/console/api-keys  
   - Ensure the key is active and the account has API/billing access.

2. **Set the key where the worker reads it**  
   - With docker-compose, api and worker load `webapp/.env.local`. Add:
     ```bash
     KIMI_API_KEY=sk-...   # or MOONSHOT_API_KEY=...
     AI_PROVIDER=kimi
     AI_ANALYSIS_ENABLED=true
     ```
   - No quotes around the value; no leading/trailing spaces.

3. **Restart the worker** so it picks up the new env:
   ```bash
   docker compose restart worker
   ```

4. **Regenerate AI analysis** (Scan Results → AI Analysis tab → "Regenerate AI analysis") so a new run uses the fixed key.

## General Maintenance

### Regular Cleanup
```bash
# Weekly: Clean up old scan results
find results -type f -mtime +7 -delete

# Monthly: Prune Docker system
docker system prune -a --volumes

# Check disk usage
df -h
docker system df
```

### Monitoring
```bash
# Watch service logs
docker compose logs -f

# Check service health
docker compose ps

# Monitor disk usage
watch -n 5 'df -h | grep -E "Filesystem|/$"'
```

## Quick Fixes

### Restart Everything
```bash
docker compose down
docker compose up -d
```

### Reset Database (WARNING: Deletes all data)
```bash
docker compose down -v
docker volume rm sec-audit-repos_postgres_data
docker compose up -d
```

### View Logs
```bash
# All services
docker compose logs

# Specific service
docker compose logs postgres
docker compose logs worker
docker compose logs api
```
