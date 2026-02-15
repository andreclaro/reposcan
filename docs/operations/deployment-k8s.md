# Kubernetes Deployment Guide

Complete guide for deploying on Kubernetes — from simple in-cluster databases to production GitOps with managed services.

---

## Deployment Tiers

| Tier | Complexity | Best For | Postgres/Redis |
|------|------------|----------|----------------|
| **1 - Simple** | Low | Dev/test, learning | In-cluster |
| **2 - Managed** | Medium | Production | RDS + ElastiCache |
| **3 - GitOps** | High | Production, team | Managed + ArgoCD |

---

## Tier 1: Simple (In-Cluster Everything)

**Best for:** Development, testing, or when you want to see everything working on K8s.

**Architecture:**
```
┌─────────────────────────────────────────┐
│         Kubernetes Cluster              │
│                                         │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend │ │ API  │ │   Worker   │  │
│  └──────────┘ └──────┘ └────────────┘  │
│                                         │
│  ┌──────────┐ ┌──────────────────────┐ │
│  │  Redis   │ │  PostgreSQL          │ │
│  │ (in-cluster)│ │  (in-cluster)     │ │
│  └──────────┘ └──────────────────────┘ │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Ingress (nginx/cert-manager)   │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**⚠️ Warning:** Do NOT run PostgreSQL in-cluster for production data you care about. Use managed services or persistent volumes with backups.

### Quick Deploy

```bash
# 1. Create cluster (e.g., k3d, kind, or cloud managed)
k3d cluster create secaudit --servers 1 --agents 2

# 2. Deploy everything
kubectl apply -k k8s/base

# 3. Check status
kubectl get pods -n secaudit
kubectl get svc -n secaudit
```

### What's Included in `k8s/base/`

```yaml
# k8s/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: secaudit

resources:
  - namespace.yaml
  - configmap.yaml
  - postgres.yaml      # In-cluster PostgreSQL
  - redis.yaml         # In-cluster Redis
  - api-deployment.yaml
  - worker-deployment.yaml
  - frontend-deployment.yaml
  # secrets.yaml - create manually!
```

### Create Required Secrets

```bash
# Create namespace first
kubectl create namespace secaudit

# Database credentials
kubectl create secret generic app-secrets \
  --from-literal=DATABASE_URL="postgresql://postgres:yourpassword@postgres:5432/sec_audit" \
  --from-literal=REDIS_URL="redis://redis:6379/0" \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=AUTH_GITHUB_ID="your_github_client_id" \
  --from-literal=AUTH_GITHUB_SECRET="your_github_client_secret" \
  -n secaudit

# Optional: AI analysis
kubectl create secret generic ai-secrets \
  --from-literal=AI_ANALYSIS_ENABLED="true" \
  --from-literal=AI_PROVIDER="anthropic" \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-..." \
  -n secaudit

# For private container registry
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_GITHUB_TOKEN \
  -n secaudit
```

### Expose the Application

```bash
# Port-forward for local testing
kubectl port-forward -n secaudit svc/frontend 3000:80
kubectl port-forward -n secaudit svc/api 8000:80

# Or use NodePort/LoadBalancer
kubectl patch svc frontend -n secaudit -p '{"spec":{"type":"LoadBalancer"}}'
```

---

## Tier 2: Production with Managed Services

**Best for:** Production workloads where data durability matters.

**Architecture:**
```
┌─────────────────────────────────────────┐
│         Kubernetes Cluster              │
│                                         │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend │ │ API  │ │   Worker   │  │
│  └──────────┘ └──────┘ └────────────┘  │
│                                         │
└─────────────────────────────────────────┘
       │              │            │
       ▼              ▼            ▼
┌──────────────┐ ┌──────────────────────────┐
│   RDS        │ │    ElastiCache          │
│ PostgreSQL   │ │    Redis                │
│ (managed)    │ │    (managed)            │
└──────────────┘ └──────────────────────────┘
```

### AWS Setup (EKS + RDS + ElastiCache)

**Step 1: Create EKS Cluster**

```bash
# Using eksctl (recommended)
eksctl create cluster \
  --name secaudit \
  --region us-east-1 \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 4
```

**Step 2: Create RDS PostgreSQL**

```bash
# Create subnet group (if not exists)
aws rds create-db-subnet-group \
  --db-subnet-group-name secaudit-subnet-group \
  --db-subnet-group-description "Subnets for secaudit RDS" \
  --subnet-ids '["subnet-xxx", "subnet-yyy"]'

# Create database
aws rds create-db-instance \
  --db-instance-identifier secaudit-postgres \
  --db-instance-class db.t4g.small \
  --engine postgres \
  --engine-version 16 \
  --allocated-storage 20 \
  --master-username postgres \
  --master-user-password YOUR_STRONG_PASSWORD \
  --vpc-security-group-ids sg-xxx \
  --db-subnet-group-name secaudit-subnet-group \
  --backup-retention-period 7 \
  --storage-encrypted

# Get endpoint
aws rds describe-db-instances \
  --db-instance-identifier secaudit-postgres \
  --query 'DBInstances[0].Endpoint.Address'
```

**Step 3: Create ElastiCache Redis**

```bash
# Create subnet group
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name secaudit-redis \
  --cache-subnet-group-description "Subnets for secaudit Redis" \
  --subnet-ids '["subnet-xxx", "subnet-yyy"]'

# Create Redis cluster (cluster mode disabled for simplicity)
aws elasticache create-cache-cluster \
  --cache-cluster-id secaudit-redis \
  --engine redis \
  --cache-node-type cache.t4g.micro \
  --num-cache-nodes 1 \
  --cache-subnet-group-name secaudit-redis \
  --security-group-ids sg-xxx

# Get endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id secaudit-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address'
```

**Step 4: Update Kustomization for Production**

```yaml
# k8s/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: secaudit

resources:
  - ../../base
  # Note: Don't include postgres.yaml and redis.yaml - using managed!

images:
  - name: ghcr.io/YOUR_USERNAME/sec-audit-api
    newTag: v1.0.0
  - name: ghcr.io/YOUR_USERNAME/sec-audit-worker
    newTag: v1.0.0
  - name: ghcr.io/YOUR_USERNAME/sec-audit-frontend
    newTag: v1.0.0

patchesStrategicMerge:
  - api-patch.yaml
  - worker-patch.yaml

configMapGenerator:
  - name: secaudit-config
    behavior: merge
    literals:
      - LOG_LEVEL=INFO
      - ENVIRONMENT=production
```

**Step 5: Create Production Secrets**

```bash
# Update connection strings to point to managed services
kubectl create secret generic app-secrets \
  --from-literal=DATABASE_URL="postgresql://postgres:PASSWORD@secaudit-postgres.xxx.us-east-1.rds.amazonaws.com:5432/sec_audit" \
  --from-literal=REDIS_URL="redis://secaudit-redis.xxx.cache.amazonaws.com:6379/0" \
  --from-literal=CELERY_BROKER_URL="redis://secaudit-redis.xxx.cache.amazonaws.com:6379/0" \
  --from-literal=CELERY_RESULT_BACKEND="redis://secaudit-redis.xxx.cache.amazonaws.com:6379/0" \
  -n secaudit
```

**Step 6: Deploy**

```bash
kubectl apply -k k8s/overlays/production
```

---

## Tier 3: GitOps with ArgoCD

**Best for:** Production, teams, when you want automatic deployments from Git.

**Architecture:**
```
┌─────────────────────────────────────────┐
│           GitHub Repository             │
│  ┌─────────────────────────────────┐    │
│  │  k8s/overlays/production/       │    │
│  │  - kustomization.yaml           │    │
│  │  - deployment patches           │    │
│  └─────────────────────────────────┘    │
└──────────────────┬──────────────────────┘
                   │ Git push
                   ▼
┌─────────────────────────────────────────┐
│           ArgoCD (in cluster)           │
│  ┌─────────────────────────────────┐    │
│  │  Watches Git repo               │    │
│  │  Auto-syncs on changes          │    │
│  └─────────────────────────────────┘    │
└──────────────────┬──────────────────────┘
                   │ Applies
                   ▼
┌─────────────────────────────────────────┐
│           Kubernetes Cluster            │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend │ │ API  │ │   Worker   │  │
│  └──────────┘ └──────┘ └────────────┘  │
└─────────────────────────────────────────┘
       │              │            │
       ▼              ▼            ▼
   Managed PostgreSQL + Redis (RDS/ElastiCache)
```

### Step 1: Install ArgoCD

```bash
# Create namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for readiness
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=120s

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Port-forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Access: https://localhost:8080 (admin / password from above)
```

### Step 2: Install ArgoCD Image Updater

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml

# Create secret for container registry access
kubectl create secret docker-registry ghcr-credentials \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_TOKEN \
  -n argocd
```

### Step 3: Create Git Repository Secret

ArgoCD needs write access to update image tags:

```bash
# Option A: HTTPS with Personal Access Token (recommended)
kubectl create secret generic git-creds \
  --from-literal=username=YOUR_GITHUB_USERNAME \
  --from-literal=password=YOUR_GITHUB_PAT \
  -n argocd

kubectl label secret git-creds -n argocd \
  argocd-image-updater.argoproj.io/secret-type=git-creds
```

### Step 4: Create ArgoCD Application

```yaml
# k8s/argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: secaudit-production
  namespace: argocd
  annotations:
    # Enable Image Updater
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
    argocd-image-updater.argoproj.io/write-back-target: kustomization
    
    # Configure images to watch
    argocd-image-updater.argoproj.io/image-list: |
      api=ghcr.io/YOUR_USERNAME/sec-audit-api:~1.x
      worker=ghcr.io/YOUR_USERNAME/sec-audit-worker:~1.x
      frontend=ghcr.io/YOUR_USERNAME/sec-audit-frontend:~1.x
    
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/worker.update-strategy: semver
    argocd-image-updater.argoproj.io/frontend.update-strategy: semver
    
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
      selfHeal: true     # Revert manual changes
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

Apply:
```bash
kubectl apply -f k8s/argocd/application.yaml
```

### Step 5: Configure Image Tags for Auto-Update

```yaml
# k8s/overlays/production/kustomization.yaml
images:
  - name: ghcr.io/YOUR_USERNAME/sec-audit-api
    newName: ghcr.io/YOUR_USERNAME/sec-audit-api
    newTag: 1.0.0  # Image Updater will change this
  - name: ghcr.io/YOUR_USERNAME/sec-audit-worker
    newName: ghcr.io/YOUR_USERNAME/sec-audit-worker
    newTag: 1.0.0
  - name: ghcr.io/YOUR_USERNAME/sec-audit-frontend
    newName: ghcr.io/YOUR_USERNAME/sec-audit-frontend
    newTag: 1.0.0
```

### Step 6: CI/CD Pipeline

GitHub Actions workflow to build and push images:

```yaml
# .github/workflows/deploy-k8s.yaml
name: Build and Deploy to K8s

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build:
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
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Determine version
        id: version
        run: |
          if [[ $GITHUB_REF == refs/tags/v* ]]; then
            VERSION=${GITHUB_REF#refs/tags/v}
          else
            VERSION=$(git rev-parse --short HEAD)
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
      
      - name: Build and push API
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile.api
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/sec-audit-api:${{ steps.version.outputs.version }}
            ghcr.io/${{ github.repository_owner }}/sec-audit-api:latest
      
      - name: Build and push Worker
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/sec-audit-worker:${{ steps.version.outputs.version }}
            ghcr.io/${{ github.repository_owner }}/sec-audit-worker:latest
      
      - name: Build and push Frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/sec-audit-frontend:${{ steps.version.outputs.version }}
            ghcr.io/${{ github.repository_owner }}/sec-audit-frontend:latest
```

### How GitOps Works

```
1. Developer pushes code → GitHub
2. GitHub Actions builds images → GHCR
3. Image Updater detects new image → Updates Git (kustomization.yaml)
4. ArgoCD detects Git change → Syncs to cluster
5. Kubernetes rolls out new version
```

**Timeline:**
- Push to main: Immediate
- Build images: ~2-5 minutes
- Image Updater detects: ~2 minutes
- ArgoCD syncs: ~30 seconds
- **Total: ~5-8 minutes from push to deploy**

---

## Worker Scaling with KEDA

For queue-based scaling (scale workers based on pending jobs):

```yaml
# k8s/overlays/production/keda-worker.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: worker-scaledobject
  namespace: secaudit
spec:
  scaleTargetRef:
    name: prod-worker
  pollingInterval: 10
  cooldownPeriod: 300
  minReplicaCount: 1
  maxReplicaCount: 10
  triggers:
    - type: redis
      metadata:
        address: secaudit-redis.xxx.cache.amazonaws.com:6379
        listName: celery
        listLength: "5"  # Scale up when 5+ pending jobs
```

Install KEDA:
```bash
kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.12.0/keda-2.12.0.yaml
```

---

## Ingress and TLS

### Using cert-manager + nginx-ingress

```yaml
# k8s/overlays/production/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: secaudit-ingress
  namespace: secaudit
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - secaudit.yourdomain.com
        - api.secaudit.yourdomain.com
      secretName: secaudit-tls
  rules:
    - host: secaudit.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: prod-frontend
                port:
                  number: 80
    - host: api.secaudit.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: prod-api
                port:
                  number: 80
```

---

## Monitoring

### Prometheus + Grafana

```yaml
# ServiceMonitor for metrics
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: secaudit-metrics
  namespace: secaudit
spec:
  selector:
    matchLabels:
      app.kubernetes.io/part-of: secaudit
  endpoints:
    - port: metrics
      interval: 30s
```

### Key Metrics to Alert On

| Metric | Threshold | Alert |
|--------|-----------|-------|
| `celery_worker_up` | == 0 | Critical - No workers |
| `celery_queue_length` | > 100 | Warning - Queue backing up |
| `scan_duration_seconds` | > 1800 | Warning - Scan taking too long |
| `api_error_rate` | > 5% | Critical - API errors |

---

## Troubleshooting

### Check Pod Logs
```bash
kubectl logs -n secaudit -l app=worker --tail=100 -f
kubectl logs -n secaudit -l app=api --tail=100 -f
```

### Check Events
```bash
kubectl get events -n secaudit --sort-by='.lastTimestamp'
```

### Debug Worker
```bash
# Exec into worker
kubectl exec -it -n secaudit deployment/prod-worker -- bash

# Check Celery status
celery -A worker.scan_worker inspect active
celery -A worker.scan_worker inspect stats
```

### ArgoCD Sync Issues
```bash
# Check application status
argocd app get secaudit-production

# Sync manually
argocd app sync secaudit-production

# View diff
argocd app diff secaudit-production
```

### Common Issues

| Issue | Solution |
|-------|----------|
| ImagePullBackOff | Check image tag exists, registry credentials |
| CrashLoopBackOff | Check logs, environment variables |
| Pending pods | Check resource limits, node capacity |
| DB connection failed | Check security groups, connection string |
| Redis connection failed | Check ElastiCache security group |

---

## Cost Comparison

### Tier 1 (In-Cluster)
| Component | Cost |
|-----------|------|
| EKS control plane | ~$73/mo |
| 2x t3.medium nodes | ~$60/mo |
| No managed DB costs | $0 |
| **Total** | **~$133/mo** |

### Tier 2/3 (Managed Services)
| Component | Cost |
|-----------|------|
| EKS control plane | ~$73/mo |
| 2x t3.medium nodes | ~$60/mo |
| RDS PostgreSQL (db.t4g.small) | ~$15/mo |
| ElastiCache Redis (cache.t4g.micro) | ~$12/mo |
| **Total** | **~$160/mo** |

**Note:** Use Spot instances for workers to reduce costs by 60-70%.

---

## Summary

| Tier | Setup Time | Complexity | Best For |
|------|------------|------------|----------|
| **1 - Simple** | 30 min | Low | Dev/test |
| **2 - Managed** | 2 hours | Medium | Production |
| **3 - GitOps** | 4 hours | High | Team/Enterprise |

**Recommendation:**
- Start with **Tier 1** to learn K8s
- Move to **Tier 2** for production
- Add **Tier 3 GitOps** when you have a team
