# Production Deployment Options

## System Architecture Summary

The platform consists of five services with distinct resource profiles:

| Service | Image | CPU/Memory | Characteristics |
|---------|-------|------------|-----------------|
| **Frontend** | Next.js 16 (Node) | Low (0.5 CPU / 512MB) | Stateless, SSR, OAuth, Stripe webhooks |
| **API** | Python 3.11-slim (FastAPI) | Low (1 CPU / 1GB) | Stateless, queues jobs to Redis |
| **Worker** | Ubuntu 22.04 + all scanner tools | High (2+ CPU / 4GB+) | Clones repos, runs scanners, needs DinD |
| **PostgreSQL** | postgres:16 | Medium (1 CPU / 1GB) | Persistent storage, scan results, users |
| **Redis** | redis:7 | Low (0.5 CPU / 512MB) | Celery broker, ephemeral |

The **worker** is the dominant cost and complexity driver. Its image bundles Node.js (3 versions via nvm), Go (3 versions via gvm), Rust (4 toolchains via rustup), plus semgrep, trivy, tfsec, checkov, tflint, cargo-audit, and a Docker CLI. It requires Docker-in-Docker (privileged) for Trivy image scans. Each scan clones a full repository to disk and runs multiple analysis tools.

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
                                  │   DinD   │
                                  │ Sidecar  │
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
- **DinD**: Run as a sidecar container in each worker pod (avoids mounting the host Docker socket). Requires `privileged: true` on the sidecar.
- **PostgreSQL**: Use managed service (RDS, Cloud SQL, Azure Database). Do not run in-cluster for production.
- **Redis**: Use managed service (ElastiCache, Memorystore, Azure Cache). Acceptable in-cluster for non-critical workloads.

### Worker node pool sizing

Each worker pod needs ~2 CPU + 4 GB RAM + fast ephemeral storage for cloned repos. On `m6i.xlarge` (4 vCPU / 16 GB), you fit ~2 worker pods per node. Size the node pool with cluster autoscaler min/max based on expected queue depth.

Workers are bursty (idle between scans, high CPU during semgrep/trivy runs). Consider Spot/Preemptible instances for the worker node pool to reduce cost by 60-70%. Scans are idempotent and can be retried on eviction.

### DinD security concern

Running privileged containers in Kubernetes is a security risk. Alternatives:
- **Sysbox runtime**: Runs DinD without `--privileged` using a user-namespace remap.
- **Kaniko / img**: If you only need `docker build`, not `docker run`.
- **Trivy filesystem mode**: `trivy fs` scans Dockerfiles without building images, removing the DinD requirement entirely. This is the simplest mitigation.

### Pros
- Horizontal auto-scaling of each component independently
- KEDA-based queue-driven worker scaling (scale to zero when idle)
- Spot instances for workers reduce compute cost significantly
- Mature ecosystem for observability (Prometheus, Grafana, Datadog)
- Multi-region / HA with managed database replication

### Cons
- Highest operational complexity; requires Kubernetes expertise
- DinD in K8s requires privileged pods or alternative runtimes
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
│  └──────────┘ └──────┘ └─────┬──────┘  │
│  ┌──────────┐ ┌──────┐ ┌────┴──────┐  │
│  │ Postgres  │ │Redis │ │   DinD    │  │
│  └──────────┘ └──────┘ └───────────┘  │
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
- **Horizontal workers**: Add a second VM running only the worker + DinD containers, pointing at the same Redis and PostgreSQL on the primary VM (or migrated to managed services).

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
                       ┌────┴─────┐
                       │  DinD    │
                       │ Sidecar  │
                       └──────────┘
         ┌──────────────────────────┐
         │  RDS + ElastiCache       │
         └──────────────────────────┘
```

### Key considerations

- **Frontend + API**: Run on **Fargate** (serverless containers). No EC2 management, scales automatically.
- **Worker**: Run on **EC2-backed ECS** (not Fargate). Fargate does not support privileged containers needed for DinD. Use capacity providers with auto-scaling groups.
- **Alternative**: If you can eliminate the DinD requirement (use `trivy fs` instead of `trivy image`), all services can run on Fargate.
- **Auto-scaling**: Use ECS Service Auto Scaling. For workers, scale on the custom CloudWatch metric for Redis queue length.

### Pros
- Simpler than Kubernetes; AWS manages the control plane and scheduling
- Fargate for stateless services means zero EC2 management for API/frontend
- Tight AWS integration (IAM roles, CloudWatch, Secrets Manager)
- ECS Exec for debugging containers in place

### Cons
- Vendor lock-in to AWS
- EC2-backed tasks needed for privileged containers (worker)
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
│  ┌───────┐ ┌────────┐        │
│  │ Redis │ │  DinD  │        │
│  └───────┘ └────────┘        │
│  ┌──────────────────┐        │
│  │    PostgreSQL     │        │
│  └──────────────────┘        │
└───────────────────────────────┘
```

### How it works

- **Frontend on Vercel**: Deploys automatically from Git. Handles SSR, static assets, OAuth callbacks, Stripe webhooks. Next.js API routes proxy scan requests to the FastAPI backend.
- **Backend on any cloud**: The API, worker, Redis, DinD, and PostgreSQL run on any of the other options (VM, ECS, K8s). Vercel's frontend connects over HTTPS to the backend's public or VPN-tunneled endpoint.

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

The worker image is ~3-5 GB with dozens of system-level tools. Lambda has a 10 GB container image limit and 15-minute execution timeout. Some scans (large repos with semgrep + all tools) can exceed both limits. The DinD requirement is incompatible with Lambda's execution model.

You could theoretically split each scanner into a separate Lambda function orchestrated by Step Functions, but:
- Cold starts for large images are 30-60 seconds
- No Docker socket available (breaks Trivy image scanning)
- Max 10 GB ephemeral storage (large repos with node_modules can exceed this)
- Significantly more engineering effort to decompose the monolithic worker

**Verdict**: Avoid unless you refactor the scanner architecture to be truly serverless-native (e.g., each scanner as a lightweight, standalone Lambda with pre-built vulnerability databases).

---

## Recommendation Matrix

| Factor | Single VM | ECS | Kubernetes | Vercel + VM |
|--------|-----------|-----|------------|-------------|
| **Simplicity** | Best | Good | Complex | Good |
| **Cost (low traffic)** | Lowest | Medium | Highest | Low |
| **Auto-scaling** | None | Good | Best | Partial |
| **HA / Reliability** | None | Good | Best | Good (frontend) |
| **Operational overhead** | Low | Medium | High | Low-Medium |
| **Time to production** | Hours | Days | Days-Weeks | Hours-Days |
| **Scale ceiling** | Low | High | Highest | Medium |

### Suggested progression

1. **Start with**: **Single VM with Docker Compose** (Option 2). Use Hetzner or DigitalOcean for cost efficiency. The existing `docker-compose.yml` is ready. Add Caddy for TLS, set up daily database backups, and you're production-ready for early users.

2. **When you outgrow the VM**: Move to **Vercel + beefier VM** (Option 4). Deploy the frontend to Vercel for zero-ops CDN/SSR, keep the backend on a larger VM or split into API VM + Worker VM.

3. **When you need auto-scaling**: Move to **ECS** (Option 3) or **Kubernetes** (Option 1). Use managed database/redis. Scale workers independently based on queue depth.

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
       └── K8s: kubectl rollout restart / Argo CD / Flux
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
