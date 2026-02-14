# Deployment Options

## Quick Answer

| If you want... | Use this |
|----------------|----------|
| **Simplest setup** | [Railway](#option-1-railway-recommended) - Everything on one platform |
| **Maximum control** | [Single VM](#option-2-single-vm) - Docker Compose |
| **Enterprise scale** | [Kubernetes](#option-3-kubernetes) - EKS/GKE/AKS |

---

## FAQ: What Can Run Where?

| Component | Vercel | Railway/Render/Fly | VM | K8s |
|-----------|--------|-------------------|----|-----|
| **Frontend** (Next.js) | ✅ Perfect | ✅ Good | ✅ | ✅ |
| **API** (FastAPI) | ⚠️ Possible | ✅ Good | ✅ | ✅ |
| **Worker** (3-5GB image, 2-30min scans) | ❌ No | ✅ Yes | ✅ | ✅ |
| **PostgreSQL** | ❌ No | ✅ Managed | ✅ Self-hosted | ✅ Both |
| **Redis** | ❌ No | ✅ Managed | ✅ Self-hosted | ✅ Both |

> **Worker cannot run on Vercel** - needs 3-5GB image, 30min execution, persistent disk.

---

## Option 1: Railway (Recommended)

**Best for:** Most teams. Everything on one platform, zero ops.

**Deploy in 10 minutes:**
1. Connect GitHub repo to Railway
2. Add PostgreSQL + Redis (one-click)
3. Add services: Frontend, API, Worker
4. Set env vars
5. Done - auto-deploys on push

**Cost:** ~$25-35/mo

```
┌─────────────────────────────────────────┐
│           Railway Platform              │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend │ │ API  │ │   Worker   │  │
│  │   ~$5    │ │ ~$5  │ │   ~$15     │  │
│  └──────────┘ └──────┘ └────────────┘  │
│  ┌──────────┐ ┌──────────────────────┐ │
│  │  Redis   │ │  PostgreSQL          │ │
│  │  (free)  │ │   ~$5                │ │
│  └──────────┘ └──────────────────────┘ │
└─────────────────────────────────────────┘
```

**railway.toml examples:**
```toml
# frontend/railway.toml
[build]
dockerfilePath = "./Dockerfile"
[deploy]
startCommand = "pnpm start"
healthcheckPath = "/api/health"
```

```toml
# backend/railway.toml (API)
[build]
dockerfilePath = "./Dockerfile.api"
[deploy]
startCommand = "uvicorn api.main:app --host 0.0.0.0 --port 8000"
numReplicas = 2
```

```toml
# backend/railway.worker.toml (Worker)
[build]
dockerfilePath = "./Dockerfile"
[deploy]
startCommand = "celery -A worker.scan_worker worker"
[deploy.resources]
memory = "4Gi"
cpu = 2
```

**Pros:** Zero ops, git deploys, managed DBs, auto HTTPS  
**Cons:** Less control, can't SSH in

---

## Option 2: Single VM

**Best for:** Maximum control, lowest cost.

**Setup:**
```bash
# 1. Provision VM (Hetzner CPX41: $28/mo, 8 vCPU / 16GB)
# 2. Install Docker
# 3. Clone repo
# 4. docker compose up -d
```

**docker-compose.yml:**
```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}

  redis:
    image: redis:7-alpine

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile.api
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres
      REDIS_URL: redis://redis:6379/0

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres
      REDIS_URL: redis://redis:6379/0
      RESULTS_DIR: /work/results
    volumes:
      - results_data:/work/results

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./frontend/dist:/usr/share/nginx/html:ro

volumes:
  postgres_data:
  results_data:
```

**Pros:** Full control, cheapest, simple to understand  
**Cons:** You manage everything, single point of failure

**Cost:** $28-125/mo depending on provider (Hetzner cheapest)

---

## Option 3: Kubernetes

**Best for:** Production scale, teams with K8s expertise.

**Architecture:**
```
┌─────────────┐
│   Ingress   │
└──────┬──────┘
       │
┌──────┼──────┬────────┐
▼      ▼      ▼        │
Front  API   Worker───┘
              │
       ┌──────┴──────┐
       │ Managed DB  │
       │ (RDS/Cloud) │
       └─────────────┘
```

**Quick start:**
```bash
# Kustomize setup provided in k8s/
kubectl apply -k k8s/overlays/production
```

**Key files:**
- `k8s/base/` - Base manifests
- `k8s/overlays/production/` - Production patches

**Pros:** Auto-scaling, HA, industry standard  
**Cons:** Complex, requires expertise, expensive (~$315/mo)

---

## Option 4: Vercel + Backend

**Best for:** Best frontend experience + flexible backend.

**Setup:**
- **Frontend:** Vercel (automatic deploys, global CDN)
- **Backend:** Railway / Fly.io / VM (API + Worker + DB)

**Cost:** $38-88/mo (Vercel $20 + Hetzner VM $18)

**Pros:** Best frontend DX, decoupled releases  
**Cons:** Two platforms to manage, network latency

---

## Option 5: Simplified Architectures

### Remove Redis → Use Postgres as Broker
```python
# Replace Redis with PostgreSQL for Celery
celery_app = Celery(
    'audit',
    broker='sqlalchemy+postgresql://user:pass@postgres/db'
)
```
**Trade-off:** One less service, but 10-20% slower task dispatch.

### Remove Celery → Simple DB Queue
```python
# Worker polls database directly
def run_worker():
    while True:
        pending = db.fetchone("SELECT * FROM scan WHERE status='queued'")
        if pending:
            run_scan(pending['scan_id'])
        else:
            time.sleep(5)
```
**Trade-off:** Zero message broker, but lose distributed workers and retries.

---

## Recommendation Matrix

| Factor | Single VM | 🏆 **Railway** | Render | Fly.io | Kubernetes |
|--------|-----------|----------------|--------|--------|------------|
| **Best for** | Control | **Everything** | Predictable | Multi-region | Scale/Enterprise |
| **Simplicity** | Good | **Best** | Best | Good | Complex |
| **Cost** | $28-125 | **$25-35** | $54 | $26 | ~$315 |
| **Zero-ops** | No | **Yes** | Yes | Yes | No |
| **Time to prod** | Hours | **10 min** | 15 min | 20 min | Days-Weeks |
| **Scale ceiling** | Low | **Medium** | Medium | Medium | Highest |

**🏆 Winner: Railway** - Best balance of simplicity, features, and cost.

---

## Quick Start Commands

### Railway (Recommended)
```bash
# Just connect repo in dashboard
# Add Postgres + Redis (click UI)
# Deploys automatically on push
```

### Single VM
```bash
# Hetzner CPX41 ($28/mo)
ssh root@your-server
git clone <repo>
cd sec-audit-repos/docker
docker compose up -d
```

### Kubernetes
```bash
kubectl apply -k k8s/overlays/production
```

---

## Database Alternatives

| Service | Type | Free Tier | Paid |
|---------|------|-----------|------|
| **Railway Postgres** | Managed | - | ~$5/mo |
| **Supabase** | PostgreSQL | 500MB | $25/mo |
| **Neon** | Serverless | 3GB | $19/mo |
| **Upstash** | Redis | 10k/day | $10/mo |

---

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
RESULTS_DIR=./results

# For AI analysis
AI_ANALYSIS_ENABLED=true
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...

# For frontend
NEXTAUTH_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```
