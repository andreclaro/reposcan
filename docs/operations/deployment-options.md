# Production Deployment Options

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

| Factor | Single VM | Railway/Render | ECS | Kubernetes | Vercel + VM |
|--------|-----------|----------------|-----|------------|-------------|
| **Simplicity** | Good | Best | Medium | Complex | Good |
| **Cost (low traffic)** | $28-125 | $20-54 | ~$187 | ~$315 | $38-133 |
| **Cost (with free tiers)** | $28 | $18-25 | - | - | $38 |
| **Auto-scaling** | None | Basic | Good | Best | Partial |
| **Zero-ops** | No | Yes | Partial | No | Partial |
| **Time to production** | Hours | Minutes | Days | Days-Weeks | Hours |
| **HA / Reliability** | None | Good | Good | Best | Good (frontend) |
| **Operational overhead** | Low | Lowest | Medium | High | Low-Medium |
| **Scale ceiling** | Low | Medium | High | Highest | Medium |

### Suggested progression

1. **Start with**: **Managed Container Platform** (Option 6 - Railway/Render/Fly.io). 
   - Best for: Rapid prototyping, zero-ops, lowest time-to-production
   - Cost: $20-40/mo with free database tiers
   - Setup: Connect GitHub repo, add environment variables, deploy

2. **Alternative start**: **Single VM with Docker Compose** (Option 2).
   - Best for: Maximum control, lowest cost at small scale
   - Cost: $28/mo (Hetzner) to $125/mo (AWS)
   - Setup: Provision VM, install Docker, run docker-compose

3. **When you outgrow the VM**: Move to **Vercel + beefier VM** (Option 4).
   - Deploy the frontend to Vercel for zero-ops CDN/SSR
   - Keep the backend on a larger VM or split into API VM + Worker VM

4. **When you need auto-scaling**: Move to **ECS** (Option 3) or **Kubernetes** (Option 1).
   - Use managed database/redis
   - Scale workers independently based on queue depth

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
