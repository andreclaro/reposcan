# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the Security Audit Tool to a Hetzner Kubernetes cluster.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Hetzner VM / K8s Cluster               │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Frontend    │  │  Frontend    │  │  Frontend    │       │
│  │   Pod        │  │   Pod        │  │   Pod        │       │
│  │ (Next.js)    │  │ (Next.js)    │  │ (Next.js)    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         └──────────────────┼──────────────────┘              │
│                            │                                │
│                    ┌───────▼───────┐                        │
│                    │Frontend Svc   │                        │
│                    └───────┬───────┘                        │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │              Ingress (app.yourdomain.com)              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   API Pod    │  │   API Pod    │  │   API Pod    │       │
│  │  (FastAPI)   │  │  (FastAPI)   │  │  (FastAPI)   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         └──────────────────┼──────────────────┘              │
│                            │                                │
│                    ┌───────▼───────┐                        │
│                    │   API Service │                        │
│                    └───────┬───────┘                        │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │              Ingress (api.yourdomain.com)              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Worker Pod   │  │ Worker Pod   │  │ Worker Pod   │       │
│  │ (Celery)     │  │ (Celery)     │  │ (Celery)     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  PostgreSQL (StatefulSet)                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  └─────────────────────────────────────────────────────────┘│
│                    Redis (Cache/Queue)                     ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
k8s/
├── base/                      # Base manifests (don't edit directly)
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml          # Template - create manually
│   ├── postgres.yaml
│   ├── redis.yaml
│   ├── api-deployment.yaml
│   ├── worker-deployment.yaml
│   └── kustomization.yaml
├── overlays/
│   └── production/           # Production-specific patches
│       ├── kustomization.yaml
│       ├── api-patch.yaml
│       └── worker-patch.yaml
└── README.md
```

## Prerequisites

1. **kubectl** installed locally
2. **kustomize** installed (or use `kubectl apply -k`)
3. Access to your Hetzner Kubernetes cluster
4. GitHub Container Registry access configured

## Initial Setup

### 1. Get kubeconfig from Hetzner

```bash
# Option 1: From Hetzner Cloud Console
# Download kubeconfig from your cluster page

# Option 2: Using hcloud CLI
hcloud context use <project-name>
hcloud kubernetes kubeconfig get <cluster-name>

# Save to ~/.kube/config
mkdir -p ~/.kube
cp ~/Downloads/kubeconfig.yaml ~/.kube/config
chmod 600 ~/.kube/config

# Test connection
kubectl get nodes
```

### 2. Create GitHub Container Registry Secret

```bash
# Create a GitHub Personal Access Token with 'read:packages' scope
# Then create the secret in Kubernetes:

kubectl create secret docker-registry ghcr-secret \
  --namespace=secaudit \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_TOKEN \
  --docker-email=your-email@example.com
```

### 3. Create Secrets

```bash
# Create secrets from environment variables
kubectl create secret generic app-secrets \
  --namespace=secaudit \
  --from-literal=DATABASE_URL="postgresql://postgres:STRONG_PASSWORD@postgres:5432/sec_audit" \
  --from-literal=POSTGRES_PASSWORD="STRONG_PASSWORD" \
  --from-literal=AI_ANALYSIS_ENABLED="true" \
  --from-literal=AI_PROVIDER="anthropic" \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-api03-..." \
  --from-literal=NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=GITHUB_CLIENT_ID="your-github-oauth-app-id" \
  --from-literal=GITHUB_CLIENT_SECRET="your-github-oauth-app-secret"

# Verify
kubectl get secrets -n secaudit
```

**Required secrets for Frontend:**
| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Same as API - for NextAuth |
| `NEXTAUTH_SECRET` | Random string for JWT encryption |
| `GITHUB_CLIENT_ID` | GitHub OAuth App ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Secret |

### 4. Update Domains in Ingress

Edit `k8s/base/api-deployment.yaml` and change:
```yaml
rules:
  - host: api.yourdomain.com  # <-- CHANGE THIS
```

Edit `k8s/base/frontend-deployment.yaml` and change:
```yaml
rules:
  - host: app.yourdomain.com  # <-- CHANGE THIS
env:
  - name: NEXTAUTH_URL
    value: "https://app.yourdomain.com"  # <-- CHANGE THIS
```

### 5. Deploy

```bash
# Using kustomize
kustomize build k8s/overlays/production | kubectl apply -f -

# Or using kubectl (kustomize built-in)
kubectl apply -k k8s/overlays/production
```

### 6. Verify Deployment

```bash
# Check all resources
kubectl get all -n secaudit

# Check pod logs
kubectl logs -f deployment/prod-api -n secaudit
kubectl logs -f deployment/prod-worker -n secaudit

# Port forward for local testing
kubectl port-forward svc/prod-api 8080:80 -n secaudit
curl http://localhost:8080/health
```

## GitHub Actions Setup

### Required Secrets

Add these secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `KUBECONFIG` | Base64-encoded kubeconfig | `cat ~/.kube/config \| base64 \| pbcopy` |
| `SLACK_WEBHOOK_URL` | Optional: Slack notifications | Create in Slack Apps |

### GitHub Actions Workflow

The workflow (`.github/workflows/deploy-k8s.yml`) will:

1. **Build** Docker images on every push to main
2. **Scan** images for vulnerabilities with Trivy
3. **Deploy** to Kubernetes with zero-downtime rolling updates
4. **Test** health endpoints after deployment
5. **Rollback** automatically if deployment fails

## Zero-Downtime Deployment

### How It Works

```
Current State:              During Update:              After Update:
┌─────────┐                ┌─────────┬─────────┐       ┌─────────┐
│ API v1  │                │ API v1  │ API v2  │       │ API v2  │
│ (ready) │     ────→      │ (ready) │ (starting│  ───→ │ (ready) │
│ API v1  │                │ API v1  │         │       │ API v2  │
│ (ready) │                │ (ready) │         │       │ (ready) │
└─────────┘                └─────────┴─────────┘       └─────────┘
     ↑                                                    ↑
  2 replicas                                           2 replicas
  (all serving)                                    (all serving new version)
```

### Configuration

- `maxSurge: 1` - Can temporarily have 1 extra pod during update
- `maxUnavailable: 0` - Never have less than desired replicas
- `readinessProbe` - Traffic only routes to ready pods
- `preStop` hook - 15s graceful shutdown for in-flight requests

### Manual Rollback

If you need to rollback manually:

```bash
# View rollout history
kubectl rollout history deployment/prod-api -n secaudit

# Rollback to previous version
kubectl rollout undo deployment/prod-api -n secaudit

# Rollback to specific revision
kubectl rollout undo deployment/prod-api -n secaudit --to-revision=3

# Watch rollback progress
kubectl rollout status deployment/prod-api -n secaudit
```

## Scaling

### Manual Scaling

```bash
# Scale API
kubectl scale deployment prod-api --replicas=5 -n secaudit

# Scale Workers
kubectl scale deployment prod-worker --replicas=10 -n secaudit
```

### Auto-scaling (HPA)

The worker deployment includes a HorizontalPodAutoscaler:

```bash
# View HPA status
kubectl get hpa -n secaudit

# Workers will auto-scale:
# - Min: 2 replicas
# - Max: 10 replicas
# - Scale up at 70% CPU or 80% memory
```

## Monitoring

### View Logs

```bash
# All API pods
kubectl logs -l app=api -n secaudit --tail=100 -f

# All Worker pods
kubectl logs -l app=worker -n secaudit --tail=100 -f

# Specific pod
kubectl logs prod-api-7d9f4b8c5-x2v9n -n secaudit -f
```

### Resource Usage

```bash
# Pod resource usage
kubectl top pods -n secaudit

# Node resource usage
kubectl top nodes
```

### Events

```bash
# Check for warnings/errors
kubectl get events -n secaudit --sort-by='.lastTimestamp'
```

## Troubleshooting

### Pod Stuck in Pending

```bash
# Check why
kubectl describe pod <pod-name> -n secaudit

# Common causes:
# - Insufficient CPU/memory
# - PVC not bound
# - Image pull errors
```

### Image Pull Errors

```bash
# Check if ghcr-secret is created correctly
kubectl get secret ghcr-secret -n secaudit

# Re-create if needed
kubectl delete secret ghcr-secret -n secaudit
kubectl create secret docker-registry ghcr-secret ...
```

### Database Connection Issues

```bash
# Check if postgres is running
kubectl get pods -l app=postgres -n secaudit

# Check postgres logs
kubectl logs -l app=postgres -n secaudit

# Test connection from API pod
kubectl exec -it deployment/prod-api -n secaudit -- sh
# Then: nc -zv postgres 5432
```

## Cleanup

```bash
# Delete everything
kubectl delete namespace secaudit

# Or delete specific resources
kubectl delete -k k8s/overlays/production
```

## Security Considerations

1. **Secrets**: Never commit secrets to git. Use `kubectl create secret`
2. **Network Policies**: Consider adding NetworkPolicies to restrict traffic
3. **RBAC**: Use service accounts with minimal permissions
4. **Pod Security**: Containers run as non-root (UID 1000)
5. **Image Scanning**: Trivy scans run on every build

## Next Steps

1. ✅ Set up GitHub Actions secrets (`KUBECONFIG`)
2. ✅ Configure DNS:
   - `api.yourdomain.com` → Hetzner VM IP
   - `app.yourdomain.com` → Hetzner VM IP
3. ✅ Create GitHub OAuth App for authentication
4. ✅ Consider adding:
   - SSL/TLS with cert-manager
   - Prometheus/Grafana monitoring
   - Loki for log aggregation
   - Velero for backups
