# Worker Optimization & Improvements Design Document

**Version:** 1.0  
**Date:** 2026-02-19  
**Status:** Draft

---

## Executive Summary

This document outlines a comprehensive plan to improve and optimize the RepoScan Python worker while keeping it in Python. The goal is to achieve significant performance gains, better reliability, and improved observability without the cost and risk of a full language migration.

**Target Improvements:**
- 50-70% reduction in scan times through parallelization
- 40% reduction in memory usage
- 99.9% task success rate (from current ~95%)
- Sub-second auto-scaling response

---

## 1. Current Architecture Analysis

### 1.1 Worker Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Celery Worker Process                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Celery    │  │   Scan      │  │      AI Analysis        │  │
│  │   Worker    │──│   Worker    │──│  (Optional, Async)      │  │
│  │  (50 conc.) │  │  (run_scan) │  │                         │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘  │
│                          │                                       │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                │
│  │  SAST    │     │   SCA    │     │ Secrets  │                │
│  │ (sync)   │     │ (sync)   │     │ (sync)   │                │
│  └──────────┘     └──────────┘     └──────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Current Bottlenecks

| Bottleneck | Impact | Current Value | Target |
|------------|--------|---------------|--------|
| Sequential scanner execution | High | 1 at a time | 3-4 parallel |
| No connection pooling | Medium | New conn/scan | Reuse connections |
| Full repo clones | High | 100% full clone | Shallow + sparse |
| Memory leaks in long-running workers | Medium | Restart every 8h | Stable 24h+ |
| No scan result caching | High | 0% cache hit | 30-50% hit rate |
| Blocking AI analysis | Medium | Sync execution | Async queue |

### 1.3 Performance Metrics (Baseline)

```
Scan Type          │ Current Time │ Memory │ Bottleneck
───────────────────┼──────────────┼────────┼─────────────────
Go repo (small)    │ 45s          │ 200MB  │ Sequential scans
Go repo (medium)   │ 2m 30s       │ 450MB  │ git clone
Node repo (large)  │ 5m+          │ 800MB  │ npm audit
Python repo        │ 3m           │ 600MB  │ bandit + semgrep
Multi-language     │ 8m+          │ 1.2GB  │ All sequential
```

---

## 2. Optimization Strategies

### 2.1 Parallel Scanner Execution

**Current:** Sequential execution of all scanners

```python
# Current (sequential)
run_semgrep(...)      # 30s
run_trivy_fs(...)     # 20s
run_gitleaks(...)     # 15s
run_go_vulncheck(...) # 25s
# Total: 90s
```

**Optimized:** Concurrent execution with resource limits

```python
# Optimized (concurrent with semaphore)
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = [
        executor.submit(run_semgrep, ...),      # 30s
        executor.submit(run_trivy_fs, ...),     # 20s (I/O bound)
        executor.submit(run_gitleaks, ...),     # 15s
        executor.submit(run_go_vulncheck, ...), # 25s (CPU bound)
    ]
    # Total: ~30s (limited by slowest)
```

**Implementation:**

```python
# audit/executor.py
import asyncio
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from typing import List, Callable, Any
import psutil

class ScannerExecutor:
    """Execute scanners with intelligent resource management."""
    
    def __init__(self, max_workers: int = 4, max_memory_percent: float = 80.0):
        self.max_workers = max_workers
        self.max_memory_percent = max_memory_percent
        self.cpu_bound_executor = ProcessPoolExecutor(max_workers=2)
        self.io_bound_executor = ThreadPoolExecutor(max_workers=4)
        
    async def execute_scanners(self, scanners: List[ScannerTask]) -> List[ScanResult]:
        """Execute scanners respecting resource constraints."""
        semaphore = asyncio.Semaphore(self.max_workers)
        
        async def run_with_semaphore(scanner: ScannerTask):
            async with semaphore:
                # Check memory before starting
                if psutil.virtual_memory().percent > self.max_memory_percent:
                    await asyncio.sleep(5)  # Wait for resources
                    
                if scanner.is_cpu_bound:
                    return await self._run_cpu_bound(scanner)
                else:
                    return await self._run_io_bound(scanner)
        
        tasks = [run_with_semaphore(s) for s in scanners]
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _run_cpu_bound(self, scanner: ScannerTask):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self.cpu_bound_executor, scanner.run
        )
    
    async def _run_io_bound(self, scanner: ScannerTask):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self.io_bound_executor, scanner.run
        )
```

**Benefits:**
- 40-60% reduction in total scan time
- Better CPU utilization
- Configurable resource limits

---

### 2.2 Smart Git Operations

**Current:** Full clone every time

```python
# Current
git clone https://github.com/user/repo.git  # Full history
```

**Optimized:** Shallow clones with caching

```python
# audit/repos.py - Optimized
import hashlib
from pathlib import Path
import shutil

class GitManager:
    """Manage git operations with caching and shallow clones."""
    
    def __init__(self, cache_dir: Path, max_cache_size_gb: float = 10.0):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_cache_size = max_cache_size_gb * 1024 * 1024 * 1024
        
    def get_cached_repo(self, repo_url: str, branch: str, commit_hash: str) -> Path:
        """Get repo from cache or clone."""
        cache_key = self._generate_cache_key(repo_url, branch)
        cached_path = self.cache_dir / cache_key
        
        if cached_path.exists():
            # Verify commit hash matches
            current_hash = self._get_commit_hash(cached_path)
            if current_hash == commit_hash:
                return cached_path
            else:
                # Fetch only new commits
                self._fetch_updates(cached_path)
                return cached_path
        
        # Shallow clone for new repos
        return self._shallow_clone(repo_url, branch, cached_path)
    
    def _shallow_clone(self, repo_url: str, branch: str, dest: Path) -> Path:
        """Clone with minimal history."""
        cmd = [
            "git", "clone",
            "--depth", "1",           # Only latest commit
            "--single-branch",         # Only target branch
            "--branch", branch,
            "--filter=blob:none",      # Skip blobs initially (partial clone)
            repo_url,
            str(dest)
        ]
        subprocess.run(cmd, check=True)
        return dest
    
    def _maintain_cache(self):
        """LRU cache eviction when size exceeds limit."""
        total_size = sum(f.stat().st_size for f in self.cache_dir.rglob('*') if f.is_file())
        
        if total_size > self.max_cache_size:
            # Sort by access time, remove oldest
            repos = sorted(
                self.cache_dir.iterdir(),
                key=lambda p: p.stat().st_atime
            )
            for repo in repos[:-10]:  # Keep 10 most recent
                shutil.rmtree(repo)
```

**Benefits:**
- 60-80% faster cloning for subsequent scans
- 90% less disk space per repo
- Supports partial clones for large repos

---

### 2.3 Connection Pooling

**Current:** New database connection per operation

```python
# Current - creates new connection each time
async def run_with_db(database_url: str, fn):
    pool = await create_db_pool(database_url)  # New pool
    try:
        async with pool.acquire() as conn:
            return await fn(conn)
    finally:
        await pool.close()  # Close immediately
```

**Optimized:** Persistent connection pool per worker

```python
# audit/db_pool.py
import asyncpg
from contextlib import asynccontextmanager

class DatabaseManager:
    """Manage database connections with persistent pooling."""
    
    _instance = None
    _pool = None
    
    @classmethod
    async def get_pool(cls, database_url: str):
        if cls._pool is None:
            cls._pool = await asyncpg.create_pool(
                database_url,
                min_size=2,      # Keep connections warm
                max_size=10,     # Limit concurrent connections
                command_timeout=60,
                server_settings={
                    'jit': 'off',
                    'application_name': 'reposcan_worker'
                }
            )
        return cls._pool
    
    @classmethod
    @asynccontextmanager
    async def acquire(cls, database_url: str):
        pool = await cls.get_pool(database_url)
        async with pool.acquire() as conn:
            yield conn
    
    @classmethod
    async def close(cls):
        if cls._pool:
            await cls._pool.close()
            cls._pool = None

# Usage in scan_worker.py
async def store_findings_with_pool(scan_id: str, findings: List[Finding]):
    async with DatabaseManager.acquire(db_url) as conn:
        await store_findings(conn, scan_id, findings)
```

**Benefits:**
- Eliminates connection overhead (~50ms per operation)
- Better PostgreSQL performance
- Automatic connection health checks

---

### 2.4 Scan Result Caching

**Implementation:** Redis-based result caching for identical commits

```python
# audit/cache.py
import hashlib
import json
from typing import Optional
import redis.asyncio as redis

class ScanCache:
    """Cache scan results by repo + commit hash."""
    
    def __init__(self, redis_client: redis.Redis, ttl_hours: int = 168):  # 7 days
        self.redis = redis_client
        self.ttl = ttl_hours * 3600
        
    def _generate_cache_key(self, repo_url: str, commit_hash: str, 
                           audit_types: List[str]) -> str:
        """Generate deterministic cache key."""
        normalized = f"{repo_url.lower()}:{commit_hash}:{sorted(audit_types)}"
        return f"scan_result:{hashlib.sha256(normalized.encode()).hexdigest()[:16]}"
    
    async def get_cached_result(self, repo_url: str, commit_hash: str,
                                audit_types: List[str]) -> Optional[Dict]:
        """Get cached scan result if available."""
        key = self._generate_cache_key(repo_url, commit_hash, audit_types)
        data = await self.redis.get(key)
        
        if data:
            return json.loads(data)
        return None
    
    async def cache_result(self, repo_url: str, commit_hash: str,
                          audit_types: List[str], result: Dict):
        """Cache scan result."""
        key = self._generate_cache_key(repo_url, commit_hash, audit_types)
        
        # Compress large results
        json_data = json.dumps(result)
        if len(json_data) > 1024 * 1024:  # 1MB
            import zlib
            json_data = zlib.compress(json_data.encode()).hex()
        
        await self.redis.setex(key, self.ttl, json_data)
    
    async def invalidate_cache(self, repo_url: str):
        """Invalidate all cached results for a repo (on scanner updates)."""
        pattern = f"scan_result:*"
        async for key in self.redis.scan_iter(match=pattern):
            # Check if key belongs to this repo
            data = await self.redis.get(key)
            if data and repo_url.lower() in data.lower():
                await self.redis.delete(key)
```

**Benefits:**
- 30-50% cache hit rate for active repos
- Sub-second response for cached results
- Reduces load on scanners

---

### 2.5 Async AI Analysis

**Current:** Blocking AI analysis within scan task

```python
# Current - blocks scan completion
if ai_enabled:
    ai_summary = await summarizer.generate_summary(...)  # 5-30s blocking
    await store_ai_analysis(...)
```

**Optimized:** Queue AI analysis separately

```python
# scan_worker.py - Optimized
async def run_scan(self, scan_id: str, request_data: Dict):
    # ... run all scanners ...
    
    # Queue AI analysis separately (non-blocking)
    if ai_enabled and findings:
        await celery_app.send_task(
            'tasks.scan_worker.generate_ai_analysis',
            args=[scan_id],
            queue='ai_analysis',  # Dedicated queue
            countdown=10  # Small delay to let DB settle
        )
    
    # Mark scan complete immediately
    await update_scan_status(conn, scan_id, "completed")
    
    return results

@celery_app.task(bind=True, queue='ai_analysis')
def generate_ai_analysis(self, scan_id: str):
    """Separate task for AI analysis with different worker pool."""
    # Can use GPU workers or different resource profile
    # Does not block main scan pipeline
    ...
```

**Benefits:**
- Scan completes 5-30s faster
- AI analysis can use separate worker pool (GPU, etc.)
- Better resource allocation

---

### 2.6 Memory Management

**Problem:** Memory leaks in long-running Celery workers

**Solution:** Implement health-based recycling

```python
# worker/health.py
import psutil
import gc
import os

class WorkerHealthMonitor:
    """Monitor worker health and trigger graceful restarts."""
    
    def __init__(self, max_memory_mb: float = 2048, max_tasks: int = 100):
        self.max_memory_mb = max_memory_mb
        self.max_tasks = max_tasks
        self.tasks_completed = 0
        self.process = psutil.Process()
        
    def should_restart(self) -> bool:
        """Check if worker should restart."""
        self.tasks_completed += 1
        
        # Memory check
        memory_mb = self.process.memory_info().rss / 1024 / 1024
        if memory_mb > self.max_memory_mb:
            return True
        
        # Task count check
        if self.tasks_completed >= self.max_tasks:
            return True
        
        # GC pressure check
        if len(gc.get_objects()) > 100000:  # Too many objects
            return True
        
        return False
    
    def after_task(self):
        """Called after each task."""
        if self.should_restart():
            # Signal Celery to restart this worker gracefully
            os._exit(0)  # Celery will respawn

# In scan_worker.py
health_monitor = WorkerHealthMonitor()

@celery_app.task(bind=True)
def run_scan(self, ...):
    try:
        # ... scan logic ...
        return result
    finally:
        health_monitor.after_task()
```

**Benefits:**
- Prevents memory leaks
- Maintains consistent performance
- Zero-downtime worker recycling

---

### 2.7 Incremental Scanning

**For monorepos:** Only scan changed files

```python
# audit/incremental.py
import json
from pathlib import Path
from typing import List, Set

class IncrementalScanner:
    """Support for incremental/monorepo scanning."""
    
    def __init__(self, state_dir: Path):
        self.state_dir = state_dir
        self.state_dir.mkdir(parents=True, exist_ok=True)
    
    def get_changed_files(self, repo_path: Path, 
                          last_scan_commit: str) -> Set[str]:
        """Get files changed since last scan."""
        result = subprocess.run(
            ['git', 'diff', '--name-only', f'{last_scan_commit}..HEAD'],
            cwd=repo_path,
            capture_output=True,
            text=True
        )
        return set(result.stdout.strip().split('\n'))
    
    def should_run_scanner(self, scanner: str, changed_files: Set[str],
                          scanner_patterns: List[str]) -> bool:
        """Determine if scanner needs to run based on changed files."""
        import fnmatch
        
        for file in changed_files:
            for pattern in scanner_patterns:
                if fnmatch.fnmatch(file, pattern):
                    return True
        return False
    
    # Scanner patterns
    SCANNER_PATTERNS = {
        'semgrep': ['*.py', '*.js', '*.ts', '*.go', '*.java', '*.rb'],
        'trivy_fs': ['Dockerfile*', '*.lock', 'go.mod', 'package.json'],
        'node_audit': ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
        'go_vulncheck': ['go.mod', 'go.sum'],
        'terraform': ['*.tf', '*.tfvars'],
    }
```

---

## 3. Observability & Monitoring

### 3.1 Structured Logging

```python
# audit/logging_config.py
import structlog
import logging

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

# Usage in scan_worker
logger = structlog.get_logger()

logger.info(
    "scan_started",
    scan_id=scan_id,
    repo_url=repo_url,
    branch=branch,
    audit_types=audit_types,
    worker_id=worker_id,
)
```

### 3.2 Metrics Collection

```python
# audit/metrics.py
from prometheus_client import Counter, Histogram, Gauge
import time

# Metrics
SCAN_DURATION = Histogram(
    'scan_duration_seconds',
    'Time spent on scans',
    ['scanner_type', 'status']
)

SCAN_FINDINGS = Counter(
    'scan_findings_total',
    'Total findings by severity',
    ['severity', 'scanner']
)

WORKER_MEMORY = Gauge(
    'worker_memory_bytes',
    'Current worker memory usage'
)

ACTIVE_SCANS = Gauge(
    'active_scans',
    'Number of scans currently running'
)

class MetricsCollector:
    def record_scan(self, scanner: str, duration: float, 
                    findings_count: Dict[str, int]):
        SCAN_DURATION.labels(scanner=scanner, status='success').observe(duration)
        
        for severity, count in findings_count.items():
            SCAN_FINDINGS.labels(severity=severity, scanner=scanner).inc(count)
```

### 3.3 Distributed Tracing

```python
# Instrument scan pipeline with OpenTelemetry
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

@celery_app.task(bind=True)
def run_scan(self, scan_id: str, request_data: Dict):
    with tracer.start_as_current_span("scan_execution") as span:
        span.set_attribute("scan.id", scan_id)
        span.set_attribute("repo.url", request_data['repo_url'])
        
        with tracer.start_span("git_clone"):
            clone_repo(...)
        
        with tracer.start_span("language_detection"):
            detect_languages(...)
        
        with tracer.start_span("scanner_execution"):
            run_scanners(...)
        
        # Spans automatically nested for tracing
```

---

## 4. Implementation Phases

### Phase 1: Quick Wins (Week 1-2)

| Task | Effort | Impact |
|------|--------|--------|
| Connection pooling | 2 days | Medium |
| Shallow git clones | 1 day | High |
| Worker memory monitoring | 1 day | Medium |
| Structured logging | 2 days | Low |

**Expected:** 20-30% performance improvement

### Phase 2: Parallelization (Week 3-4)

| Task | Effort | Impact |
|------|--------|--------|
| Scanner executor framework | 3 days | High |
| CPU vs I/O bound classification | 2 days | Medium |
| Resource limits & throttling | 2 days | Medium |

**Expected:** 40-50% scan time reduction

### Phase 3: Caching (Week 5-6)

| Task | Effort | Impact |
|------|--------|--------|
| Git cache implementation | 3 days | High |
| Result caching (Redis) | 2 days | Medium |
| Cache invalidation strategy | 2 days | Low |

**Expected:** 30-50% cache hit rate

### Phase 4: Reliability (Week 7-8)

| Task | Effort | Impact |
|------|--------|--------|
| Async AI analysis | 2 days | Medium |
| Incremental scanning | 3 days | Medium |
| Circuit breakers for scanners | 2 days | Medium |
| Retry logic improvements | 2 days | Low |

**Expected:** 99.9% success rate

### Phase 5: Observability (Week 9-10)

| Task | Effort | Impact |
|------|--------|--------|
| Prometheus metrics | 2 days | Low |
| OpenTelemetry tracing | 3 days | Low |
| Grafana dashboards | 2 days | Low |
| Alerting rules | 2 days | Low |

---

## 5. Configuration

```yaml
# worker-config.yaml
worker:
  concurrency: 50
  
  # Memory management
  max_memory_mb: 2048
  max_tasks_per_worker: 100
  graceful_restart: true
  
  # Parallel execution
  scanner_executor:
    max_workers: 4
    cpu_bound_workers: 2
    io_bound_workers: 4
    max_memory_percent: 80
  
  # Git optimization
  git:
    shallow_clone: true
    single_branch: true
    partial_clone: true
    cache_dir: /tmp/git-cache
    cache_size_gb: 10
  
  # Database
  database:
    pool_min_size: 2
    pool_max_size: 10
    connection_timeout: 60
    
  # Caching
  cache:
    enabled: true
    ttl_hours: 168
    max_result_size_mb: 50
    compression_threshold_mb: 1
  
  # AI analysis
  ai_analysis:
    async: true
    separate_queue: true
    
  # Observability
  metrics:
    enabled: true
    port: 9090
  tracing:
    enabled: true
    sampling_rate: 0.1
```

---

## 6. Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Avg scan time (small repo) | 45s | 20s | Prometheus |
| Avg scan time (medium repo) | 2m 30s | 1m | Prometheus |
| Memory per worker | 800MB | 400MB | Worker metrics |
| Task success rate | 95% | 99.9% | Celery metrics |
| Cache hit rate | 0% | 40% | Cache metrics |
| Worker uptime | 8h | 24h+ | Health checks |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Resource contention (parallel scanners) | Medium | High | Semaphores + memory limits |
| Cache inconsistency | Low | Medium | TTL + explicit invalidation |
| Git cache corruption | Low | High | Checksum verification + auto-reclone |
| Connection pool exhaustion | Medium | Medium | Pool sizing + circuit breakers |
| Breaking changes | Low | High | Feature flags + gradual rollout |

---

## 8. Conclusion

This optimization plan provides a **80/20 solution** - achieving significant performance gains without the complexity of a full language migration. The phased approach allows for incremental delivery and risk mitigation.

**Total Estimated Effort:** 10 weeks (1 engineer)  
**Expected Performance Gain:** 50-70% faster scans, 40% less memory  
**Risk Level:** Low-Medium (stays in Python ecosystem)

---

## Appendix: Alternative Considerations

### A. Hybrid Approach (Go + Python)
Keep AI analysis in Python, migrate scanner orchestration to Go:
- Pros: Best of both worlds
- Cons: Two codebases to maintain, inter-service communication overhead

### B. Rust Worker
Maximum performance but highest learning curve:
- Pros: Fastest execution, lowest memory
- Cons: Smallest ecosystem, hardest to hire for

### C. Status Quo with Optimization
This document's approach - optimize Python:
- Pros: Fastest to implement, lowest risk
- Cons: Ceiling on performance gains

**Recommendation:** Implement this plan first. If performance ceiling is hit, then consider Go for specific hot paths (scanner orchestration only).
