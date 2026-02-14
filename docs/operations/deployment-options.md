# Production Deployment Options

## Quick Answer: Where Should I Deploy?

**For simplest setup → Put everything on Railway** (recommended for most teams)

**For maximum control → Single VM with Docker Compose**

**For enterprise scale → Kubernetes**

---

## FAQ: Can I Put Everything on Railway?

**YES!** Railway is the recommended platform for this application. You can run **all 5 services** on Railway:

| Component | Runs on Railway? | Notes |
|-----------|------------------|-------|
| **Frontend** | ✅ Yes | Next.js with `railway.toml` |
| **API** | ✅ Yes | FastAPI with Dockerfile |
| **Worker** | ✅ Yes | Large 3-5GB image supported |
| **PostgreSQL** | ✅ Yes | One-click managed database |
| **Redis** | ✅ Yes | One-click managed Redis |

**Cost: ~$25-35/mo** for everything (Frontend ~$5 + API ~$5 + Worker ~$15 + Postgres ~$5 + Redis free)

**Time to production: 10 minutes**

---

## FAQ: Can Everything Run on Vercel?

**No.** The security scanning **worker** cannot run on Vercel (or any serverless platform) due to fundamental architectural constraints:

| Requirement | Vercel Limit | Worker Needs |
|-------------|--------------|--------------|
| **Execution time** | ❌ 10-15s max (Hobby) / 5min (Pro) | ✅ Scans take 2-30 minutes |
| **Container image size** | ❌ 250MB function limit | ✅ 3-5 GB worker image |
| **Ephemeral storage** | ❌ 1024 MB (Hobby) / 4GB (Pro) | ✅ Large repos + node_modules |
| **Background jobs** | ❌ No persistent workers | ✅ Long-running Celery tasks |
| **Docker-in-Docker** | ❌ Not supported | ❌ **Not required** (see below) |

> **Note:** Docker-in-Docker is **NOT required** for this platform. The Dockerfile scanner uses `trivy config` to analyze Dockerfiles without building images, enabling deployment on Railway, Render, and other managed platforms without privileged containers.

**What CAN run on Vercel:**
- ✅ **Frontend** (Next.js) - perfect fit, automatic deploys, global CDN
- ⚠️ **API** (FastAPI) - possible via Next.js API routes, but adds latency; better on dedicated backend

**Solution:** Use **Vercel for frontend only** + a cheap VM or managed container platform for the backend (API + Worker + DB).

---

## System Architecture Summary

The platform consists of five services with distinct resource profiles:

| Service | Image | CPU/Memory | Characteristics |
|---------|-------|------------|-----------------|
| **Frontend** | Next.js 16 (Node) | Low (0.5 CPU / 512MB) | Stateless, SSR, OAuth, Stripe webhooks |
| **API** | Python 3.11-slim (FastAPI) | Low (1 CPU / 1GB) | Stateless, queues jobs to Redis |
| **Worker** | Ubuntu 22.04 + all scanner tools | High (2+ CPU / 4GB+) | Clones repos, runs scanners (no DinD needed) |
| **PostgreSQL** | postgres:16 | Medium (1 CPU / 1GB) | Persistent storage, scan results, users |
| **Redis** | redis:7 | Low (0.5 CPU / 512MB) | Celery broker, ephemeral |

The **worker** is the dominant cost and complexity driver. Its image bundles Node.js (3 versions via nvm), Go (3 versions via gvm), Rust (4 toolchains via rustup), plus semgrep, trivy, tfsec, checkov, tflint, cargo-audit. Each scan clones a full repository to disk and runs multiple analysis tools. Note: Docker-in-Docker is **not required** - the Dockerfile scanner uses `trivy config` instead of building images.

---

## Option 1: Kubernetes (EKS / GKE / AKS)

**Best for: Production at scale, teams already running Kubernetes.**

### Architecture

```
                    ┌─────────────┐
                    │  Ingress /  │
                    │  ALB / NLB  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴────┐ ┌────┴─────┐
        │ Frontend   │ │  API   │ │ Worker   │
        │ Deployment │ │ Deploy │ │ Deploy   │
        │ (HPA)      │ │ (HPA)  │ │ (KEDA)  │
        └────────────┘ └────────┘ └────┬─────┘
                                       │
                                  ┌────┴─────┐
                                  │  Worker  │
                                  │  (cont.) │
                                  └──────────┘
              ┌────────────────────────────────┐
              │  Managed PostgreSQL (RDS/Cloud  │
              │  SQL) + Managed Redis           │
              │  (ElastiCache / Memorystore)    │
              └────────────────────────────────┘
```

### How it maps

- **Frontend**: `Deployment` + `HPA` scaling on CPU. Standard node pool.
- **API**: `Deployment` + `HPA`. Standard node pool. Low resource requests.
- **Worker**: `Deployment` on a **dedicated node pool** with larger instances (e.g., `m6i.xlarge` / `e2-standard-4`). Scale with [KEDA](https://keda.sh/) based on Redis queue depth rather than CPU.
- **Worker**: Runs as a standard container (no DinD needed). The Dockerfile scanner uses `trivy config` instead of building images.
- **PostgreSQL**: Use managed service (RDS, Cloud SQL, Azure Database). Do not run in-cluster for production.
- **Redis**: Use managed service (ElastiCache, Memorystore, Azure Cache). Acceptable in-cluster for non-critical workloads.

### Worker node pool sizing

Each worker pod needs ~2 CPU + 4 GB RAM + fast ephemeral storage for cloned repos. On `m6i.xlarge` (4 vCPU / 16 GB), you fit ~2 worker pods per node. Size the node pool with cluster autoscaler min/max based on expected queue depth.

Workers are bursty (idle between scans, high CPU during semgrep/trivy runs). Consider Spot/Preemptible instances for the worker node pool to reduce cost by 60-70%. Scans are idempotent and can be retried on eviction.

### Worker container security

The worker container runs without privileged mode. It uses `trivy config` to scan Dockerfiles without building images, eliminating the Docker-in-Docker (DinD) security concern entirely.

### Pros
- Horizontal auto-scaling of each component independently
- KEDA-based queue-driven worker scaling (scale to zero when idle)
- Spot instances for workers reduce compute cost significantly
- Mature ecosystem for observability (Prometheus, Grafana, Datadog)
- Multi-region / HA with managed database replication

### Cons
- Highest operational complexity; requires Kubernetes expertise
- Worker image is large (~3-5 GB); slow cold starts without image caching (consider [kube-fledged](https://github.com/senthilrch/kube-fledged) or pre-pulling via DaemonSet)
- Cluster overhead cost even at low utilization

### Estimated monthly cost (AWS us-east-1, low-medium traffic)

| Component | Spec | Cost |
|-----------|------|------|
| EKS control plane | 1 cluster | ~$73 |
| Frontend/API nodes | 2x t3.medium (on-demand) | ~$60 |
| Worker nodes | 2x m6i.xlarge (spot, avg) | ~$80 |
| RDS PostgreSQL | db.t4g.medium, 100 GB | ~$65 |
| ElastiCache Redis | cache.t4g.micro | ~$12 |
| ALB | 1 load balancer | ~$25 |
| **Total** | | **~$315/mo** |

---

## Option 2: Docker Compose on a Single VM / VPS

**Best for: Early stage, low traffic, minimal ops overhead.**

### Architecture

This is essentially what the existing `docker-compose.yml` already defines. Deploy it to a single VM.

```
┌─────────────────────────────────────────┐
│              VM (4-8 vCPU, 16-32 GB)    │
│                                         │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend  │ │ API  │ │   Worker   │  │
│  │ :3000     │ │:8000 │ │ (Celery)   │  │
│  └──────────┘ └──────┘ └────────────┘  │
│  ┌──────────┐ ┌──────┐                 │
│  │ Postgres  │ │Redis │                 │
│  └──────────┘ └──────┘                 │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  Caddy / Nginx (reverse proxy)  │   │
│  │  TLS termination, routing       │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Setup

1. Provision a VM: `c6i.xlarge` (AWS), `e2-standard-4` (GCP), `Standard_D4s_v5` (Azure), or a Hetzner/DigitalOcean equivalent.
2. Install Docker and Docker Compose.
3. Add a reverse proxy (Caddy recommended for automatic TLS) routing `yourdomain.com` to the frontend and `/api` to the API service.
4. Add the frontend as a new service in docker-compose or run it as a separate process.
5. Use `docker compose up -d` with restart policies.
6. Back up the PostgreSQL volume daily (cron + `pg_dump` to S3/GCS).

### Scaling path

- **Vertical**: Move to a larger VM (8 vCPU / 32 GB) when worker contention becomes an issue.
- **Horizontal workers**: Add a second VM running only the worker container, pointing at the same Redis and PostgreSQL on the primary VM (or migrated to managed services).

### Pros
- Simplest deployment; the existing docker-compose.yml works almost as-is
- Lowest cost at low scale
- No Kubernetes complexity
- Fast iteration; SSH in, `docker compose pull && docker compose up -d`

### Cons
- Single point of failure (no HA without manual multi-VM setup)
- Manual scaling; no auto-scale
- Resource contention between worker scans and API/DB on the same host
- Backup and monitoring are your responsibility

### Estimated monthly cost

| Component | Spec | Cost |
|-----------|------|------|
| VM (AWS) | c6i.xlarge (4 vCPU / 8 GB) | ~$125 |
| VM (Hetzner) | CPX41 (8 vCPU / 16 GB) | ~$28 |
| VM (DigitalOcean) | c-4 (4 vCPU / 8 GB) | ~$84 |
| Managed Postgres (optional) | Smallest tier | ~$15-50 |
| **Total (Hetzner)** | | **~$28-78/mo** |
| **Total (AWS)** | | **~$125-175/mo** |

---

## Option 3: AWS ECS (Fargate or EC2-backed)

**Best for: Teams on AWS who want container orchestration without managing Kubernetes.**

### Architecture

```
         ┌──────────────┐
         │     ALB      │
         └──────┬───────┘
                │
     ┌──────────┼──────────┐
     │          │          │
┌────┴────┐ ┌──┴───┐ ┌────┴────────┐
│Frontend │ │ API  │ │   Worker    │
│ Fargate │ │Fargate│ │ EC2-backed │
│ Service │ │Service│ │  Service   │
└─────────┘ └──────┘ └─────┬──────┘
                            │
                       │          │
                       └──────────┘
         ┌──────────────────────────┐
         │  RDS + ElastiCache       │
         └──────────────────────────┘
```

### Key considerations

- **Frontend + API**: Run on **Fargate** (serverless containers). No EC2 management, scales automatically.
- **Worker**: Can run on **Fargate** or **EC2-backed ECS**. No DinD required.
- **Auto-scaling**: Use ECS Service Auto Scaling. For workers, scale on the custom CloudWatch metric for Redis queue length.

### Pros
- Simpler than Kubernetes; AWS manages the control plane and scheduling
- Fargate for stateless services means zero EC2 management for API/frontend
- Tight AWS integration (IAM roles, CloudWatch, Secrets Manager)
- ECS Exec for debugging containers in place

### Cons
- Vendor lock-in to AWS
- ECS task definition updates are more verbose than Kubernetes manifests
- Less ecosystem tooling than Kubernetes

### Estimated monthly cost (low-medium traffic)

| Component | Spec | Cost |
|-----------|------|------|
| Fargate (frontend + API) | 2 tasks, 0.5 vCPU / 1 GB each | ~$30 |
| EC2 (workers) | 2x m6i.large spot | ~$55 |
| RDS PostgreSQL | db.t4g.medium | ~$65 |
| ElastiCache Redis | cache.t4g.micro | ~$12 |
| ALB | 1 load balancer | ~$25 |
| **Total** | | **~$187/mo** |

---

## Option 4: Hybrid -- Vercel (Frontend) + Cloud Backend

**Best for: Teams that want zero-ops frontend with managed backend services.**

### FAQ: Can I use Vercel + Supabase Postgres + Upstash Redis?

**Partially yes, but with a critical caveat:**

| Component | Can Run On | Notes |
|-----------|------------|-------|
| **Frontend** | ✅ Vercel | Perfect fit - Next.js SSR, automatic deploys, global CDN |
| **PostgreSQL** | ✅ Supabase | Excellent choice - managed Postgres, free tier, good performance |
| **Redis** | ✅ Upstash | Excellent choice - serverless Redis, free tier, low latency |
| **API** | ❌ Not Vercel | Needs persistent connection to DB/Redis; better on a VM/container |
| **Worker** | ❌ Not Vercel | **Absolutely cannot run on Vercel** - needs 2-30 min execution, 3-5GB image |

**Required architecture:**
```
┌──────────────────────────────────────────────────────────────┐
│  Vercel (Edge/Serverless)                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Next.js Frontend                                    │    │
│  │  - Automatic deploys from Git                        │    │
│  │  - Global CDN                                        │    │
│  │  - OAuth callbacks, Stripe webhooks                  │    │
│  └──────────────────┬───────────────────────────────────┘    │
└──────────────────────┼───────────────────────────────────────┘
                       │ HTTPS API calls
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend VM / Railway / Render / Fly.io (Required!)          │
│  ┌─────────────┐  ┌──────────────────────────────────────┐   │
│  │  FastAPI    │  │  Worker (Celery)                     │   │
│  │  API Server │  │  - 3-5GB image                       │   │
│  │  - Stateless│  │  - Long-running scans                │   │
│  │  - Queues   │  │  - Clones repos to disk              │   │
│  │    jobs     │  │  - Runs semgrep/trivy/etc.           │   │
│  └──────┬──────┘  └──────────────────────────────────────┘   │
└───────┼──────────────────────────────────────────────────────┘
        │
        ├──▶ PostgreSQL connection ──▶ ┌──────────────────────┐
        │                                │  Supabase Postgres   │
        │                                │  - Free tier: 500MB  │
        │                                │  - Good performance  │
        │                                │  - Connection pooling│
        │                                └──────────────────────┘
        │
        └──▶ Redis connection ───────▶ ┌──────────────────────┐
                                       │  Upstash Redis       │
                                       │  - Free tier: 10K cmd│
                                       │  - REST/Redis API    │
                                       │  - Global regions    │
                                       └──────────────────────┘
```

**Why the Worker can't be on Vercel:**
- Execution time: Vercel max = 5 min (Pro) / 300s; Worker needs 2-30 min
- Image size: Vercel max = 250MB; Worker image = 3-5 GB
- Storage: Vercel = 4GB ephemeral max; Worker needs to clone full repos with node_modules
- Background jobs: Vercel functions are request/response; Worker needs persistent Celery process

**Connection strings for Supabase + Upstash:**

```bash
# Supabase Postgres (get from Supabase Dashboard → Settings → Database)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Upstash Redis (get from Upstash Console → Database → Connect)
# Use the "redis://" URL, not the REST API
REDIS_URL=rediss://default:[PASSWORD]@[HOST]:6379
CELERY_BROKER_URL=rediss://default:[PASSWORD]@[HOST]:6379
CELERY_RESULT_BACKEND=rediss://default:[PASSWORD]@[HOST]:6379
```

**Recommended cheap stack with Supabase + Upstash:**

| Component | Service | Cost |
|-----------|---------|------|
| Frontend | Vercel Hobby/Pro | $0-20/mo |
| API + Worker | Railway / Fly.io | $15-30/mo |
| PostgreSQL | Supabase (free tier) | $0/mo (500MB) |
| Redis | Upstash (free tier) | $0/mo (10K cmds/day) |
| **Total** | | **$15-50/mo** |

**When to upgrade:**
- Supabase free: 500MB limit → Paid plan ($25/mo) for more storage
- Upstash free: 10K commands/day → Paid plan ($10/mo) for higher throughput
- Or move to self-hosted Postgres/Redis on the same VM as API+Worker

---

### Architecture

```
┌───────────────────────────────┐
│           Vercel              │
│  ┌─────────────────────────┐  │
│  │  Next.js 16 Frontend    │  │
│  │  (SSR + Edge + API      │  │
│  │   routes as proxies)    │  │
│  └─────────────────────────┘  │
└───────────────┬───────────────┘
                │ HTTPS
                ▼
┌───────────────────────────────┐
│    Cloud VM / ECS / K8s       │
│  ┌───────┐ ┌────────┐        │
│  │  API  │ │ Worker │        │
│  └───────┘ └────────┘        │
│  ┌───────┐                   │
│  │ Redis │                   │
│  └───────┘                   │
│  ┌──────────────────┐        │
│  │    PostgreSQL     │        │
│  └──────────────────┘        │
└───────────────────────────────┘
```

### How it works

- **Frontend on Vercel**: Deploys automatically from Git. Handles SSR, static assets, OAuth callbacks, Stripe webhooks. Next.js API routes proxy scan requests to the FastAPI backend.
- **Backend on any cloud**: The API, worker, Redis, and PostgreSQL run on any of the other options (VM, ECS, K8s). Vercel's frontend connects over HTTPS to the backend's public or VPN-tunneled endpoint.

### Pros
- Frontend is zero-ops: automatic deployments, CDN, preview environments, analytics
- Vercel is purpose-built for Next.js; best DX and performance
- Decouples frontend releases from backend releases
- Backend can be on the cheapest infra (single VM) while frontend gets global CDN

### Cons
- Two separate deployment targets to manage
- Network latency between Vercel edge and backend (mitigated by placing backend in `us-east-1` near Vercel's primary region)
- Vercel costs increase with traffic (serverless function invocations, bandwidth)
- Need to expose the FastAPI backend over a public endpoint (or use Vercel's rewrites + private networking)

### Estimated monthly cost

| Component | Spec | Cost |
|-----------|------|------|
| Vercel | Pro plan | ~$20 |
| Backend VM (Hetzner) | CPX31 (4 vCPU / 8 GB) | ~$18 |
| Backend VM (AWS) | c6i.large | ~$63 |
| Managed Postgres (optional) | Smallest tier | ~$15-50 |
| **Total (Hetzner backend)** | | **~$38-88/mo** |
| **Total (AWS backend)** | | **~$98-133/mo** |

---

## Option 5: Serverless (AWS Lambda + Step Functions)

**Not recommended for this workload.** Included for completeness.

The worker image is ~3-5 GB with dozens of system-level tools. Lambda has a 10 GB container image limit and 15-minute execution timeout. Some scans (large repos with semgrep + all tools) can exceed both limits.

You could theoretically split each scanner into a separate Lambda function orchestrated by Step Functions, but:
- Cold starts for large images are 30-60 seconds
- Max 10 GB ephemeral storage (large repos with node_modules can exceed this)
- Significantly more engineering effort to decompose the monolithic worker
- 15-minute max execution timeout may not be enough for large repository scans

**Verdict**: Avoid unless you refactor the scanner architecture to be truly serverless-native (e.g., each scanner as a lightweight, standalone Lambda with pre-built vulnerability databases).

---

## Option 6: Managed Container Platforms (Railway / Render / Fly.io)

**Best for: Teams wanting zero server management with Docker-native deployments.**

These platforms run your Docker containers without managing VMs or Kubernetes. They offer Git-based deploys, automatic HTTPS, and managed databases.

### 🚀 Railway Quick Start (Everything on One Platform)

**Deploy everything in 10 minutes:**

1. **Fork/clone this repo** to your GitHub account

2. **Create Railway project:**
   ```bash
   # Install Railway CLI (optional)
   npm install -g @railway/cli
   
   # Or just use the Railway Dashboard (easier)
   ```

3. **In Railway Dashboard:**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `sec-audit-repos` repo

4. **Add databases** (one-click):
   - Click "New" → "Database" → "Add PostgreSQL"
   - Click "New" → "Database" → "Add Redis"

5. **Create services:**
   - **Frontend service:**
     - Source: GitHub repo, root `/frontend`
     - Dockerfile: `frontend/Dockerfile`
     - Start command: `pnpm start`
     - Add env vars: `NEXTAUTH_SECRET`, `GITHUB_CLIENT_ID`, etc.
   
   - **API service:**
     - Source: GitHub repo, root `/backend`
     - Dockerfile: `backend/Dockerfile.api`
     - Start command: `uvicorn api.main:app --host 0.0.0.0 --port 8000`
     - Add env vars from PostgreSQL/Redis connection strings
   
   - **Worker service:**
     - Source: GitHub repo, root `/backend`
     - Dockerfile: `backend/Dockerfile` (full worker image)
     - Start command: `celery -A worker.scan_worker worker --loglevel=info --concurrency=50`
     - Resources: Set to 4GB RAM, 2 CPU

6. **Set environment variables** (Railway generates DB/Redis URLs automatically)

7. **Done!** Every push to `main` auto-deploys.

**Architecture on Railway:**
```
┌─────────────────────────────────────────┐
│           Railway Platform              │
│                                         │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend  │ │ API  │ │   Worker   │  │
│  │  (Next.js)│ │(FastAPI)│ │  (Celery) │  │
│  │   ~$5/mo  │ │ ~$5/mo│ │  ~$15/mo  │  │
│  └──────────┘ └──────┘ └────────────┘  │
│                                         │
│  ┌──────────┐ ┌──────────────────────┐ │
│  │  Redis    │ │  PostgreSQL          │ │
│  │  (free)   │ │  (~$5/mo)           │ │
│  └──────────┘ └──────────────────────┘ │
│                                         │
│  Total: ~$25-35/month                   │
└─────────────────────────────────────────┘
```

### Comparison

| Platform | Best For | Pricing Model | Free Tier |
|----------|----------|---------------|-----------|
| **Railway** | Simplicity, fast iteration | Per-resource usage ($5-50/mo typical) | $5 credit/month |
| **Render** | Docker-native, predictable costs | Fixed per-service ($7-85/mo) | Yes (limited) |
| **Fly.io** | Multi-region, close to users | Per-VM + bandwidth ($5-40/mo typical) | $5 credit/month |

### Architecture (Railway Example)

```
┌─────────────────────────────────────────┐
│           Railway Platform              │
│                                         │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend  │ │ API  │ │   Worker   │  │
│  │ (Node)    │ │(FastAPI)│ │ (Celery)  │  │
│  └──────────┘ └──────┘ └────────────┘  │
│                                         │
│  ┌──────────┐ ┌──────────────────────┐ │
│  │  Redis    │ │  PostgreSQL          │ │
│  │ (managed) │ │  (managed)           │ │
│  └──────────┘ └──────────────────────┘ │
└─────────────────────────────────────────┘
```

### Setup Example (Railway)

Railway supports **configuration as code**, but with important limitations:

| Capability | `railway.toml` | Terraform Provider | Dashboard |
|------------|----------------|-------------------|-----------|
| **Create services** | ❌ No | ✅ Yes | ✅ Yes |
| **Create databases** | ❌ No | ❌ No | ✅ Yes |
| **Build & deploy settings** | ✅ Yes | ⚠️ Via config_path | ✅ Yes |
| **Environment variables** | ⚠️ Per-service only | ⚠️ Via variable resource | ✅ Yes |
| **Custom domains** | ❌ No | ✅ Yes | ✅ Yes |

**Key limitation:** The Railway Terraform provider is limited - it can create projects and services, but NOT databases. Databases must always be created via Railway dashboard.

---

#### Option A: Hybrid Approach (Recommended)

**Step 1:** Create project and services via **Terraform** (or Dashboard)

**Step 2:** Create PostgreSQL and Redis databases via **Railway Dashboard**

**Step 3:** Add `railway.toml` to each service's directory for build/deploy configuration:

```toml
# frontend/railway.toml
[build]
dockerfilePath = "./Dockerfile"

[deploy]
startCommand = "pnpm start"
healthcheckPath = "/api/health"
restartPolicyType = "on_failure"
```

```toml
# backend/railway.toml (for API service)
[build]
dockerfilePath = "./Dockerfile.api"

[deploy]
startCommand = "uvicorn api.main:app --host 0.0.0.0 --port 8000"
healthcheckPath = "/health"
numReplicas = 2
```

```toml
# backend/railway.worker.toml (for Worker service)
[build]
dockerfilePath = "./Dockerfile"

[deploy]
startCommand = "celery -A tasks.scan_worker worker"
[deploy.resources]
memory = "4Gi"
cpu = 2
```

**JSON format** is also supported (`railway.json`) with an official schema at `railway.com/railway.schema.json` for IDE autocomplete.

---

#### Option B: Infrastructure as Code (Terraform) - Limited

The Railway Terraform provider is **community-maintained and limited**. It can create projects and services, but NOT databases. Databases must be created via Railway dashboard.

```hcl
terraform {
  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.4"
    }
  }
}

# Create project
resource "railway_project" "sec_audit" {
  name = "security-audit-platform"
}

# Create services (databases must be created manually in dashboard!)
resource "railway_service" "api" {
  project_id = railway_project.sec_audit.id
  name       = "api"
  
  source_repo        = "github.com/yourorg/sec-audit-repos"
  source_repo_branch = "main"
  config_path        = "/railway.toml"
}

resource "railway_service" "worker" {
  project_id = railway_project.sec_audit.id
  name       = "worker"
  
  source_repo        = "github.com/yourorg/sec-audit-repos"
  source_repo_branch = "main"
  config_path        = "/railway.worker.toml"
}
```

**After `terraform apply`, you must:**
1. Create PostgreSQL and Redis databases in Railway dashboard
2. Copy connection strings to environment variables
3. Add other required secrets (NEXTAUTH_SECRET, GITHUB_CLIENT_ID, etc.)

Provider: [terraform-community-providers/terraform-provider-railway](https://github.com/terraform-community-providers/terraform-provider-railway)

**Best practice:** Even with Terraform, add `railway.toml` files to your repo. Terraform handles infrastructure provisioning; `railway.toml` handles build/deploy configuration.

---

#### Option C: Manual Dashboard Setup

1. **Connect GitHub repo** to Railway
2. **Add services** via dashboard and point to Dockerfiles
3. **Add managed databases**: Click "New Database" → PostgreSQL, Redis
4. **Set environment variables** in Railway dashboard
5. **Done** - Automatic deploys on every push

### Pros
- **Zero server management** - No SSH, no OS updates, no security patches
- **Git-based deploys** - Push to deploy, automatic rollbacks
- **Managed databases** - Automated backups, scaling, monitoring
- **Automatic HTTPS** - Custom domains with SSL
- **Good free tiers** - Start free, pay as you grow
- **Faster than VMs** to set up (minutes vs hours)

### Cons
- **Less control** than VMs (can't SSH in, limited OS customization)
- **Cold starts** for infrequently used services
- **Egress costs** can surprise on high bandwidth (Fly.io especially)

### Cost Comparison (Low-Medium Traffic)

| Platform | Frontend | API | Worker | Postgres | Redis | **Total** |
|----------|----------|-----|--------|----------|-------|-----------|
| **Railway** | ~$5 | ~$5 | ~$15 (4GB) | ~$5 | Free | **~$30/mo** |
| **Render** | $7 | $7 | $25 (4GB) | $15 | Free | **~$54/mo** |
| **Fly.io** | ~$3 | ~$3 | ~$12 (4GB) | ~$5 | ~$3 | **~$26/mo** |
| + Supabase Postgres | - | - | - | Free tier | - | **Free** |
| + Upstash Redis | - | - | - | - | Free tier | **Free** |

**With free tiers (Supabase + Upstash):**
- **Fly.io**: ~$18/mo (just compute)
- **Railway**: ~$25/mo (just compute + $5 credit)

### Managed Database Alternatives

If using a VM or want to reduce costs:

| Service | Type | Free Tier | Paid |
|---------|------|-----------|------|
| **Supabase** | PostgreSQL | 500MB, 2GB egress | $25/mo |
| **Neon** | PostgreSQL (serverless) | 3GB, 3 branches | $19/mo |
| **Upstash** | Redis | 10k req/day | $10/mo |
| **Redis Cloud** | Redis | 30MB | Free-forever |

**Recommended cheap stack:**
- Compute: Fly.io or Railway
- Database: Supabase (free tier) or Neon
- Cache: Upstash (free tier)
- **Total: $20-40/mo** for full production

---

## Recommendation Matrix

| Factor | Single VM | 🏆 **Railway** | Render | Fly.io | ECS | Kubernetes | Vercel + VM |
|--------|-----------|----------------|--------|--------|-----|------------|-------------|
| **Best for** | Control | **Everything in one place** | Predictable pricing | Multi-region | AWS native | Scale/complexity | Vercel frontend |
| **Simplicity** | Good | **Best** | Best | Good | Medium | Complex | Good |
| **Cost (low traffic)** | $28-125 | **$25-35** | $54 | $26 | ~$187 | ~$315 | $38-133 |
| **Cost (free tiers)** | $28 | **$5-25** | $0* | $5-20 | - | - | $18-38 |
| **Auto-scaling** | None | **Basic** | Basic | Good | Good | Best | Partial |
| **Zero-ops** | No | **Yes** | Yes | Yes | Partial | No | Partial |
| **Time to production** | Hours | **10 min** | 15 min | 20 min | Days | Days-Weeks | Hours |
| **Everything in one place** | ✅ | **✅** | ✅ | ✅ | ✅ | ✅ | ❌ (split) |
| **Operational overhead** | Low | **Lowest** | Lowest | Low | Medium | High | Low-Medium |
| **Scale ceiling** | Low | **Medium** | Medium | Medium | High | Highest | Medium |

*Render has free tier but limited; Railway gives $5 credit/month

**🏆 Winner for most teams: Railway** - Simplest, everything in one place, fastest to deploy, reasonable cost.

### Suggested progression

#### 🏆 **Recommended: Start with Railway (Option 6)**

**Put everything on Railway** - Frontend, API, Worker, PostgreSQL, Redis. One platform, zero ops.

| Why Railway? | |
|--------------|---|
| **All services in one place** | No splitting across platforms |
| **Fastest time to production** | 10 minutes from repo to live |
| **Git-based deploys** | Push to deploy, automatic rollbacks |
| **Managed databases** | One-click Postgres + Redis |
| **Cost** | ~$25-35/mo for everything |
| **Free to start** | $5 credit/month, databases have free tiers |

**Setup:**
1. Connect GitHub repo to Railway
2. Add PostgreSQL + Redis (one-click)
3. Add Frontend, API, Worker services
4. Set environment variables
5. Done - automatic deploys on every push

---

#### Alternative paths:

2. **Maximum control**: **Single VM with Docker Compose** (Option 2).
   - Best for: Lowest cost, full SSH access, learning/debugging
   - Cost: $28/mo (Hetzner) to $125/mo (AWS)
   - Setup: Provision VM, install Docker, run docker-compose

3. **Best of both worlds**: **Vercel + Railway/VM** (Option 4).
   - Frontend on Vercel (global CDN, edge functions)
   - API + Worker on Railway or VM
   - Cost: $38-88/mo

4. **Enterprise scale**: Move to **ECS** (Option 3) or **Kubernetes** (Option 1).
   - When you need complex auto-scaling, multi-region, or have DevOps expertise
   - Cost: $187-315/mo
   - Setup: Days to weeks

---

## Cross-Cutting Concerns (All Options)

### Container registry
Push images to ECR, GCR, Docker Hub, or GitHub Container Registry. The build script (`infrastructure/scripts/deployment/build.sh`) already supports `DOCKER_REGISTRY` and `IMAGE_TAG` environment variables.

### Secrets management
- Never bake secrets into images. Use environment variables injected at runtime.
- **VM**: `.env` file with restricted permissions, or HashiCorp Vault.
- **ECS**: AWS Secrets Manager, referenced in task definitions.
- **K8s**: Kubernetes Secrets (sealed-secrets or external-secrets-operator for GitOps).
- **Vercel**: Project environment variables in the dashboard.
- **Railway/Render/Fly**: Platform-managed secrets in their respective dashboards (encrypted at rest).

### Database migrations
Run `pnpm db:migrate` (frontend Drizzle schema) as a one-off task before deploying new versions. In K8s, use an init container or a Job. In ECS, use a one-off task. On a VM, run it as part of the deploy script.

### Observability
- **Logs**: Ship container stdout/stderr to a centralized system (CloudWatch, Datadog, Grafana Loki).
- **Metrics**: Expose Celery/FastAPI metrics via Prometheus. Monitor queue depth, scan duration, error rates.
- **Alerts**: Alert on queue depth > threshold (workers can't keep up), scan failure rate, disk usage on worker nodes.

### CI/CD pipeline
```
Push to main
  ├── Build & push Docker images (API + Worker)
  ├── Run tests
  ├── Deploy frontend (Vercel auto-deploys, or `next build` + container)
  └── Deploy backend
       ├── VM: SSH + docker compose pull + docker compose up -d
       ├── ECS: ecs-deploy or aws ecs update-service --force-new-deployment
       ├── K8s: kubectl rollout restart / Argo CD / Flux
       └── Railway/Render/Fly: Automatic deploy on git push (zero config)
```

---

## ArgoCD + Image Updater: Continuous Deployment for Kubernetes

**Best for: Teams using Kubernetes who want fully automated GitOps-style continuous deployment.**

This section explains how to set up **ArgoCD** with **ArgoCD Image Updater** to automatically deploy new Docker images to your cluster whenever they're pushed to your container registry.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GitHub Actions                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Push to main branch                                                │    │
│  │    ├── Run tests                                                    │    │
│  │    ├── Build images: api:v1.2.3, worker:v1.2.3, frontend:v1.2.3    │    │
│  │    └── Push to GHCR (GitHub Container Registry)                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ New image tags pushed
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ArgoCD Image Updater                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Watches GHCR for new tags matching semver pattern (e.g., 1.2.3)    │    │
│  │  └── Updates Git repo: k8s/overlays/production/kustomization.yaml   │    │
│  │      with specific image tags (replaces 'latest')                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ Commits & pushes to Git
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ArgoCD                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Detects Git change → Syncs cluster state to match desired state    │    │
│  │  └── Performs rolling update of deployments                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ Applies changes
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Kubernetes Cluster                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Frontend │  │   API    │  │  Worker  │  │ Postgres│  │  Redis  │        │
│  │  v1.2.3  │  │  v1.2.3  │  │  v1.2.3  │  │         │  │         │        │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why ArgoCD + Image Updater?

| Feature | Benefit |
|---------|---------|
| **GitOps** | Cluster state = Git state. Full audit trail of what was deployed when. |
| **Automatic Updates** | New images are automatically detected and deployed without manual intervention. |
| **Image Tag Immutability** | Uses specific semver tags (v1.2.3) instead of `latest` → no cache issues, reproducible deployments. |
| **Rollback** | Revert to any previous Git commit to instantly rollback. |
| **Drift Detection** | ArgoCD alerts if cluster state diverges from Git. |
| **Multi-Environment** | Easily manage dev/staging/prod with Kustomize overlays. |

---

### Step 1: Install ArgoCD

```bash
# Create namespace
kubectl create namespace argocd

# Install ArgoCD (stable version)
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=120s

# Access ArgoCD UI (port-forward)
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get initial admin password
argocd admin initial-password -n argocd
# OR
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

Access UI at https://localhost:8080 (accept self-signed cert), login as `admin` with the password.

---

### Step 2: Install ArgoCD Image Updater

```bash
# Install Image Updater
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml

# Create secret for GHCR access (so Image Updater can query new tags)
kubectl create secret docker-registry ghcr-credentials \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  -n argocd
```

**Generate GitHub PAT:**
- Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Create token with `read:packages` scope (for reading container registry)
- For Image Updater to commit back to Git, also need `repo` scope

---

### Step 3: Update Kustomize for Image Updater

Image Updater works by writing image tag changes back to your Git repo. Update your production overlay to use a comment annotation:

**`k8s/overlays/production/kustomization.yaml`** (updated):

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: secaudit

resources:
  - ../../base

namePrefix: prod-

commonLabels:
  environment: production

# Images - ArgoCD Image Updater will update these tags automatically
# The comments below tell Image Updater which update strategy to use
images:
  - name: ghcr.io/YOUR_USERNAME/sec-audit-api
    newName: ghcr.io/YOUR_USERNAME/sec-audit-api
    newTag: 1.0.0  # argocd-image-updater: allow-tags=regexp:^\d+\.\d+\.\d+$,update-strategy=semver
  - name: ghcr.io/YOUR_USERNAME/sec-audit-worker
    newName: ghcr.io/YOUR_USERNAME/sec-audit-worker
    newTag: 1.0.0  # argocd-image-updater: allow-tags=regexp:^\d+\.\d+\.\d+$,update-strategy=semver
  - name: ghcr.io/YOUR_USERNAME/sec-audit-frontend
    newName: ghcr.io/YOUR_USERNAME/sec-audit-frontend
    newTag: 1.0.0  # argocd-image-updater: allow-tags=regexp:^\d+\.\d+\.\d+$,update-strategy=semver

patchesStrategicMerge:
  - api-patch.yaml
  - worker-patch.yaml
  - frontend-patch.yaml

configMapGenerator:
  - name: secaudit-config
    behavior: merge
    literals:
      - LOG_LEVEL=INFO
      - ENVIRONMENT=production
```

**Important:** Change `YOUR_USERNAME` to your actual GitHub username/org.

---

### Step 4: Create the ArgoCD Application

**`k8s/argocd/application.yaml`** (create this file):

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: secaudit-production
  namespace: argocd
  # Enable Image Updater annotations
  annotations:
    # Allow Image Updater to write back to Git
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
    argocd-image-updater.argoproj.io/write-back-target: kustomization
    
    # Configure images to watch
    argocd-image-updater.argoproj.io/image-list: |
      api=ghcr.io/YOUR_USERNAME/sec-audit-api:~1.x
      worker=ghcr.io/YOUR_USERNAME/sec-audit-worker:~1.x
      frontend=ghcr.io/YOUR_USERNAME/sec-audit-frontend:~1.x
    
    # Update strategy: semver (respects major.minor.patch)
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/api.allow-tags: regexp:^\d+\.\d+\.\d+$
    argocd-image-updater.argoproj.io/worker.update-strategy: semver
    argocd-image-updater.argoproj.io/worker.allow-tags: regexp:^\d+\.\d+\.\d+$
    argocd-image-updater.argoproj.io/frontend.update-strategy: semver
    argocd-image-updater.argoproj.io/frontend.allow-tags: regexp:^\d+\.\d+\.\d+$
    
    # Pull secret for private registry
    argocd-image-updater.argoproj.io/api.pull-secret: pullsecret:argocd/ghcr-credentials
    argocd-image-updater.argoproj.io/worker.pull-secret: pullsecret:argocd/ghcr-credentials
    argocd-image-updater.argoproj.io/frontend.pull-secret: pullsecret:argocd/ghcr-credentials
spec:
  project: default
  
  source:
    repoURL: https://github.com/YOUR_ORG/sec-audit-repos.git
    targetRevision: main
    path: k8s/overlays/production
    
  destination:
    server: https://kubernetes.default.svc
    namespace: secaudit
    
  syncPolicy:
    automated:
      prune: true        # Remove resources not in Git
      selfHeal: true     # Revert manual changes to cluster
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  
  revisionHistoryLimit: 10
```

Apply it:
```bash
kubectl apply -f k8s/argocd/application.yaml
```

---

### Step 5: Configure Git Write-Back (Required for Image Updater)

Image Updater needs to commit changes back to Git. Create a Kubernetes secret with Git credentials:

**Option A: HTTPS with Personal Access Token (Recommended)**

```bash
# Create secret with Git credentials
kubectl create secret generic git-creds \
  --from-literal=username=YOUR_GITHUB_USERNAME \
  --from-literal=password=YOUR_GITHUB_PAT \
  -n argocd

# Label it for Image Updater
kubectl label secret git-creds -n argocd argocd-image-updater.argoproj.io/secret-type=git-creds
```

**Option B: SSH Key**

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "argocd-image-updater" -f /tmp/argocd-image-updater

# Add public key to GitHub repo: Settings → Deploy keys → Add deploy key

# Create secret
kubectl create secret generic git-ssh-creds \
  --from-file=sshPrivateKey=/tmp/argocd-image-updater \
  -n argocd

# Label it
kubectl label secret git-ssh-creds -n argocd argocd-image-updater.argoproj.io/secret-type=git-creds
```

---

### Step 6: Update GitHub Actions for Semantic Versioning

Your CI pipeline needs to tag images with semantic versions (e.g., `1.2.3`), not just `latest`.

**`.github/workflows/deploy.yaml`** (update or create):

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}

jobs:
  version:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Determine version
        id: version
        run: |
          if [[ $GITHUB_REF == refs/tags/v* ]]; then
            # Use tag version (strip 'v' prefix)
            VERSION=${GITHUB_REF#refs/tags/v}
          else
            # Use commit SHA for main branch builds
            VERSION=$(git rev-parse --short HEAD)
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "Building version: $VERSION"

  build-api:
    needs: version
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push API
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile.api
          push: true
          tags: |
            ${{ env.IMAGE_PREFIX }}/sec-audit-api:${{ needs.version.outputs.version }}
            ${{ env.IMAGE_PREFIX }}/sec-audit-api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-worker:
    needs: version
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push Worker
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: |
            ${{ env.IMAGE_PREFIX }}/sec-audit-worker:${{ needs.version.outputs.version }}
            ${{ env.IMAGE_PREFIX }}/sec-audit-worker:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-frontend:
    needs: version
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push Frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: |
            ${{ env.IMAGE_PREFIX }}/sec-audit-frontend:${{ needs.version.outputs.version }}
            ${{ env.IMAGE_PREFIX }}/sec-audit-frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**For proper semver tagging, use Git tags:**

```bash
# When ready to release
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

This triggers the workflow with `VERSION=1.2.3`, and Image Updater will detect and deploy it.

---

### Step 7: Alternative - Use Commit SHA for Continuous Deployment

If you want **every commit to main** to deploy immediately (instead of only tagged releases):

**Update Image Updater annotations in Application:**

```yaml
metadata:
  annotations:
    # Change from semver to latest (newest) strategy
    argocd-image-updater.argoproj.io/api.update-strategy: latest
    argocd-image-updater.argoproj.io/api.allow-tags: regexp:^[a-f0-9]{7,8}$
    argocd-image-updater.argoproj.io/worker.update-strategy: latest
    argocd-image-updater.argoproj.io/worker.allow-tags: regexp:^[a-f0-9]{7,8}$
    # ... same for frontend
```

This watches for 7-8 character hex strings (short SHA format).

---

### Step 8: Verify the Setup

```bash
# Check ArgoCD Application status
argocd app get secaudit-production

# View Image Updater logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-image-updater -f

# Trigger a manual check (for testing)
kubectl exec -n argocd deployment/argocd-image-updater -- /usr/local/bin/argocd-image-updater run --once

# Watch your kustomization.yaml - it should update automatically
git pull  # After a new image is pushed
```

---

### How It All Works Together

```
1. Developer pushes code to main
   └── GitHub Actions builds images: api:abc1234, worker:abc1234

2. Image Updater polls GHCR every 2 minutes (configurable)
   └── Detects new tag: abc1234

3. Image Updater updates Git repo
   └── Changes k8s/overlays/production/kustomization.yaml
       from: newTag: 1.0.0
       to:   newTag: abc1234

4. ArgoCD detects Git change within 3 minutes (or webhook instant)
   └── Syncs cluster: updates Deployments with new image tags

5. Kubernetes performs rolling update
   └── Zero-downtime deployment of new version

Total time from push to deploy: ~3-5 minutes
```

---

### Image Update Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `semver` | Follows semantic versioning (1.2.3). Can pin to `~1.2.x` or `^1.x` | Production - controlled updates |
| `latest` | Always uses the newest image tag | Development - latest and greatest |
| `name` | Alphanumeric sort (newest by name) | Special naming schemes |
| `digest` | Uses SHA256 digest (immutable) | Maximum reproducibility |

**Pinning to major versions:**
```yaml
# Only update within v1.x.x (won't auto-deploy v2.0.0)
argocd-image-updater.argoproj.io/image-list: api=ghcr.io/user/sec-audit-api:~1

# Only update within v1.2.x (won't auto-deploy v1.3.0)
argocd-image-updater.argoproj.io/image-list: api=ghcr.io/user/sec-audit-api:~1.2
```

---

### Multi-Environment Setup

Create separate ArgoCD Applications for each environment:

```
k8s/
├── argocd/
│   ├── application-dev.yaml      # Development: latest images, auto-sync
│   ├── application-staging.yaml  # Staging: tagged images, auto-sync
│   └── application-prod.yaml     # Production: semver images, manual sync
├── base/
└── overlays/
    ├── development/
    ├── staging/
    └── production/
```

**Production with manual sync** (requires human approval):
```yaml
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    # BUT add this for production to require manual sync:
  # syncPolicy: {}  # No automated sync - manual approval required
```

---

### Monitoring and Alerts

**PrometheusRule for ArgoCD:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: argocd-alerts
  namespace: argocd
spec:
  groups:
    - name: argocd
      rules:
        - alert: ArgoCDAppOutOfSync
          expr: argocd_app_info{sync_status!="Synced"} == 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "ArgoCD app {{ $labels.name }} is out of sync"
            
        - alert: ArgoCDAppUnhealthy
          expr: argocd_app_info{health_status!="Healthy"} == 1
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "ArgoCD app {{ $labels.name }} is unhealthy"
```

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Images not updating | Check `kubectl logs -n argocd deployment/argocd-image-updater`. Verify GHCR credentials. |
| Git write-back fails | Ensure PAT has `repo` scope. Check `git-creds` secret exists and is labeled. |
| ArgoCD won't sync | Check Application status: `argocd app get secaudit-production`. Look for sync errors. |
| Image pull errors | Verify `imagePullSecrets` in deployments. Check GHCR is accessible from cluster. |
| Rollback needed | In ArgoCD UI: Click app → History & Rollback → Select previous version → Rollback. |

---

### Summary: ArgoCD vs Other Options

| Feature | ArgoCD + Image Updater | Manual Kubectl | Helm + Flux |
|---------|------------------------|----------------|-------------|
| **GitOps** | ✅ Full | ❌ No | ✅ Full |
| **Auto image updates** | ✅ Yes | ❌ Manual | ✅ Yes |
| **UI visibility** | ✅ Excellent | ❌ CLI only | ⚠️ Limited |
| **Rollback** | ✅ One-click | ⚠️ Manual | ✅ Yes |
| **Drift detection** | ✅ Yes | ❌ No | ✅ Yes |
| **Learning curve** | Medium | Low | Medium |
| **Best for** | Teams wanting full CD | Simple setups | Helm-centric orgs |

**Recommendation:** Use **ArgoCD + Image Updater** for production Kubernetes deployments. It provides the best developer experience with automatic deployments, full visibility, and easy rollbacks.

### Worker image optimization
The worker image is the biggest bottleneck for deployments and cold starts. Consider:
- **Multi-stage builds**: Separate build stage from runtime stage.
- **Layer caching**: Order Dockerfile instructions from least to most frequently changing.
- **Image pre-pulling**: On K8s, use a DaemonSet to pre-pull the worker image on all nodes in the worker node pool.
- **Scanner-specific images**: Split into multiple smaller worker images (e.g., `worker-node`, `worker-go`, `worker-rust`) and dispatch scans to the appropriate worker based on detected languages. This reduces per-container size and allows language-specific scaling.

### Security hardening
- Run containers as non-root (already done in both Dockerfiles).
- Use read-only root filesystems where possible (mount `/tmp` and `/work/results` as writable).
- Network policies (K8s) or security groups (ECS/VM) to restrict worker egress to only GitHub/registry URLs.
- Scan your own Docker images with Trivy as part of CI.
- Consider gVisor or Firecracker for stronger worker isolation if scanning untrusted repositories is a concern.
