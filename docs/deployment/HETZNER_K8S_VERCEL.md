# Deployment Guide: Hetzner K8s + Vercel

This guide explains how to deploy the RepoScan application with:
- **Next.js Frontend**: Deployed on Vercel
- **Go API + Redis + Celery Worker**: Deployed on Hetzner Kubernetes

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Next.js App (Frontend)                      │   │
│  │  ┌─────────────┐      ┌─────────────────────────────┐  │   │
│  │  │   Pages     │─────▶│  Next.js API Routes         │  │   │
│  │  │  (React)    │      │  (Proxies to Go API)        │  │   │
│  │  └─────────────┘      └─────────────┬─────────────────┘  │   │
│  └─────────────────────────────────────┼────────────────────┘   │
└────────────────────────────────────────┼────────────────────────┘
                                         │
                                         │ HTTPS
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Hetzner Kubernetes                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Ingress   │───▶│   Go API    │───▶│      Redis          │ │
│  │   (NGINX)   │    │   (Gin)     │    │   (Message Queue)   │ │
│  │  + cert-mgr │    │             │    │                     │ │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘ │
│                            │                                    │
│                            │ Enqueue scan jobs                  │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Celery Worker (Python)                      │   │
│  │         (Runs security scanners)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools
- `kubectl` - Kubernetes CLI
- `helm` - Package manager for Kubernetes
- `helmfile` - Declarative Helm chart deployment (optional but recommended)
- `docker` - For building images

### Infrastructure Requirements
- Hetzner Kubernetes Cluster (hcloud)
- Domain name (for API endpoint)
- Vercel account
- Container registry (Docker Hub, GitHub Container Registry, or Hetzner Registry)

## Step 1: Build and Push Docker Images

### Build Go API Image

```bash
# Build the API image
docker build -f infra/docker/Dockerfile.api -t your-registry/reposcan-api:latest .

# Push to registry
docker push your-registry/reposcan-api:latest
```

### Build Worker Image

```bash
# Build the worker image (includes all security scanners)
docker build -f infra/docker/Dockerfile.worker -t your-registry/sec-audit-worker:latest .

# Push to registry
docker push your-registry/sec-audit-worker:latest
```

## Step 2: Configure Kubernetes Secrets

Create the secrets for your environment:

```bash
# Navigate to helm directory
cd infra/helm

# Create secrets using the helper script
./create-secrets.sh production
```

Or create manually:

```bash
kubectl create namespace reposcan-worker

kubectl create secret generic reposcan-secrets \
  --namespace=reposcan-worker \
  --from-literal=DATABASE_URL="postgresql://user:pass@host:5432/db" \
  --from-literal=REDIS_URL="redis://reposcan-redis:6379/0" \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-api03-..." \
  --from-literal=AI_PROVIDER="anthropic" \
  --from-literal=AI_MODEL="claude-3-sonnet-20240229"
```

## Step 3: Update Configuration

### Update `values.production.yaml`

Edit `infra/helm/values.production.yaml` with your specific values:

```yaml
global:
  # IMPORTANT: Update with your actual Vercel domains
  corsAllowedOrigins: "https://your-app.vercel.app,https://your-app-git-main-yourusername.vercel.app"

api:
  image:
    repository: your-registry/reposcan-api  # Your registry
    tag: latest
  
  ingress:
    hosts:
      - host: api.yourdomain.com  # Your API domain
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: reposcan-api-tls
        hosts:
          - api.yourdomain.com

worker:
  image:
    repository: your-registry/sec-audit-worker  # Your registry
    tag: latest
```

## Step 4: Deploy to Hetzner K8s

### Option A: Using Helmfile (Recommended)

```bash
cd infra/helm

# Deploy to production
helmfile -e production sync
```

### Option B: Using Helm Directly

```bash
cd infra/helm

# Install/upgrade the release
helm upgrade --install reposcan ./reposcan \
  --namespace reposcan-worker \
  --create-namespace \
  -f values.yaml \
  -f values.production.yaml
```

### Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n reposcan-worker

# Check API service
kubectl get svc -n reposcan-worker

# Check ingress
kubectl get ingress -n reposcan-worker

# View API logs
kubectl logs -n reposcan-worker -l app.kubernetes.io/component=api --tail=100 -f

# View worker logs
kubectl logs -n reposcan-worker -l app.kubernetes.io/component=worker --tail=100 -f
```

## Step 5: Configure DNS

Point your API domain to the Hetzner load balancer:

```bash
# Get the external IP
kubectl get ingress -n reposcan-worker

# Or if using LoadBalancer service
kubectl get svc -n ingress-nginx
```

Add an A record in your DNS provider:
- `api.yourdomain.com` → `<EXTERNAL-IP>`

## Step 6: Deploy Frontend to Vercel

### Environment Variables

Set these in your Vercel project settings:

```bash
# API Connection (Server-side only)
FASTAPI_BASE_URL=https://api.yourdomain.com

# Public API URL (for browser-side if needed)
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Database (Neon, Supabase, or Hetzner-hosted PostgreSQL)
DATABASE_URL=postgresql://...

# Authentication
AUTH_SECRET=<generate with: openssl rand -base64 32>
AUTH_GITHUB_ID=your_github_oauth_app_id
AUTH_GITHUB_SECRET=your_github_oauth_app_secret

# Optional: GitHub App for private repos
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

# Admin & Beta
ADMIN_EMAIL=admin@yourdomain.com
BETA_MODE_ENABLED=false

# Optional: AI Analysis in UI
AI_ANALYSIS_ENABLED=true

# Optional: Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Deploy

```bash
# Using Vercel CLI
cd frontend
vercel --prod

# Or push to GitHub with Vercel Git integration
```

## Configuration Reference

### CORS Configuration

**CORS is typically NOT needed** for the Vercel + Hetzner K8s architecture because:
- Browser → Vercel: Handled by Next.js (same origin)
- Vercel → Go API: Server-to-server (no CORS)

However, if you need **direct browser access** to the Go API (e.g., for file uploads, mobile apps), configure it via `CORS_ALLOWED_ORIGINS`:

```yaml
# In values.production.yaml
global:
  corsAllowedOrigins: "https://your-app.vercel.app,https://app.yourdomain.com"
```

**Important**: 
- Credentials (cookies/auth) only work with specific origins, not wildcards
- If not using direct browser access, leave as `"*"` or empty

### CSP Configuration

The frontend's Content-Security-Policy is automatically updated based on `NEXT_PUBLIC_API_URL`:

```typescript
// next.config.ts
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// CSP includes: connect-src 'self' https://api.github.com ${apiUrl}
```

## Troubleshooting

### API Connection Issues

1. **Check CORS headers:**
   ```bash
   curl -I -H "Origin: https://your-app.vercel.app" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        https://api.yourdomain.com/scan
   ```

2. **Verify ingress is working:**
   ```bash
   kubectl describe ingress -n reposcan-worker
   ```

3. **Check API logs:**
   ```bash
   kubectl logs -n reposcan-worker deployment/reposcan-api --tail=200
   ```

### Worker Issues

1. **Check worker status:**
   ```bash
   kubectl get pods -n reposcan-worker -l app.kubernetes.io/component=worker
   ```

2. **View worker logs:**
   ```bash
   kubectl logs -n reposcan-worker deployment/reposcan-worker --tail=200
   ```

3. **Check Redis connection:**
   ```bash
   kubectl exec -it -n reposcan-worker deployment/reposcan-redis -- redis-cli ping
   ```

### Database Connection

Verify the worker can connect to the database:

```bash
kubectl exec -it -n reposcan-worker deployment/reposcan-worker -- \
  python3 -c "import asyncio; from audit.ai.storage import init_db; asyncio.run(init_db())"
```

## Scaling

### Horizontal Pod Autoscaler

The Helm chart includes HPA configuration:

```yaml
api:
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70

worker:
  autoscaling:
    enabled: true
    minReplicas: 5
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
```

### Manual Scaling

```bash
# Scale API
kubectl scale deployment reposcan-api --replicas=5 -n reposcan-worker

# Scale workers
kubectl scale deployment reposcan-worker --replicas=10 -n reposcan-worker
```

## Security Considerations

1. **Network Policies**: Consider adding Kubernetes NetworkPolicies to restrict pod-to-pod communication
2. **Pod Security**: The Helm chart includes security contexts (runAsNonRoot, readOnlyRootFilesystem where possible)
3. **Secrets**: All sensitive data is stored in Kubernetes Secrets
4. **TLS**: Ingress is configured with cert-manager for automatic Let's Encrypt certificates
5. **CORS**: Strict origin checking is enabled for production

## Monitoring

Recommended monitoring stack for Hetzner K8s:

```bash
# Install Prometheus + Grafana
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

Access dashboards:
```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
# Default credentials: admin/prom-operator
```

## Backup and Disaster Recovery

### Redis Persistence

Redis is configured with persistence enabled:

```yaml
redis:
  persistence:
    enabled: true
    size: 20Gi
```

### Database Backups

For PostgreSQL, use `pg_dump` or a managed backup solution:

```bash
# Manual backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

## Updating the Deployment

### Rolling Update

```bash
# Build new images with new tag
docker build -f infra/docker/Dockerfile.api -t your-registry/reposcan-api:v1.1.0 .
docker push your-registry/reposcan-api:v1.1.0

# Update values.production.yaml with new tag
# Then apply:
helmfile -e production sync
```

### Rollback

```bash
# Rollback to previous revision
helm rollback reposcan -n reposcan-worker

# Or to specific revision
helm rollback reposcan 2 -n reposcan-worker
```

## Cost Optimization

For Hetzner K8s, consider:

1. **Node sizing**: Use appropriate instance types (CPX instances for compute, CX for general)
2. **Spot instances**: Use Hetzner's spot/preemptible instances for workers
3. **Autoscaling**: Enable cluster autoscaler for node-level scaling
4. **Resource limits**: Set appropriate resource requests/limits

```yaml
# Example spot/preemptible worker configuration
worker:
  nodeSelector:
    node-type: spot
  tolerations:
    - key: "spot"
      operator: "Equal"
      value: "true"
      effect: "NoSchedule"
```
