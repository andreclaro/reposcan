# RepoScan Helm Deployment

This directory contains Helm chart and Helmfile configuration for deploying RepoScan to Kubernetes.

## Structure

```
infra/helm/
├── create-secrets.sh                # Script to create Kubernetes secrets manually
├── helmfile.yaml                    # Main helmfile spec
├── values.yaml                      # Base values (all environments)
├── values.local.yaml                # Local development overrides
├── values.development.yaml          # Development environment overrides
├── values.staging.yaml              # Staging environment overrides
├── values.production.yaml           # Production environment overrides
├── .gitignore                       # Git ignore file
└── reposcan/                      # Helm chart directory
    ├── Chart.yaml
    ├── values.yaml
    ├── README.md
    └── templates/
```

## Prerequisites

- Kubernetes cluster (1.20+)
- Helm 3.x
- Helmfile (`brew install helmfile` or https://helmfile.readthedocs.io/)
- External PostgreSQL database
- kubectl configured to access your cluster

## Deployment Workflow

### 1. Create Secrets (One-time setup)

**Important:** Secrets are created manually using the script, NOT via Helm values.
This prevents sensitive data from being stored in Git.

```bash
# Run the secrets creation script
./create-secrets.sh local

# Or for staging/production
./create-secrets.sh staging
./create-secrets.sh production
```

The script will:
- Create the namespace if it doesn't exist
- Prompt for DATABASE_URL (or use the environment variable)
- Optionally prompt for AI API keys and AWS credentials
- Create the `reposcan-worker-secrets` Secret in the cluster

You can also set the values via environment variables:

```bash
export DATABASE_URL="postgresql://user:password@postgres-host:5432/sec_audit"
export ANTHROPIC_API_KEY="sk-ant-api03-..."
./create-secrets.sh production
```

### 2. Deploy with Helmfile

```bash
# Deploy to local environment
helmfile --environment local sync

# Deploy to staging
helmfile --environment staging sync

# Deploy to production
helmfile --environment production sync
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n reposcan-worker

# Check logs
kubectl logs -n reposcan-worker -l app.kubernetes.io/component=api -f
kubectl logs -n reposcan-worker -l app.kubernetes.io/component=worker -f
```

## Commands

```bash
# Sync (install/upgrade)
helmfile --environment local sync

# Diff (preview changes)
helmfile --environment local diff

# Destroy (delete everything)
helmfile --environment local destroy

# Template (render manifests)
helmfile --environment local template

# List releases
helmfile --environment local list

# Status
helmfile --environment local status
```

## Secret Management

### Manual Secret Creation (Recommended)

Use the provided script:

```bash
./create-secrets.sh <environment>
```

### Manual kubectl Commands

If you prefer to create secrets manually with kubectl:

```bash
# Create the namespace
kubectl create namespace reposcan-worker

# Create the secret
kubectl create secret generic reposcan-worker-secrets \
  --namespace=reposcan \
  --from-literal=DATABASE_URL="postgresql://user:password@host:5432/db" \
  --from-literal=ANTHROPIC_API_KEY="..." \
  --from-literal=OPENAI_API_KEY="..." \
  --from-literal=AWS_ACCESS_KEY_ID="..." \
  --from-literal=AWS_SECRET_ACCESS_KEY="..."

# Verify
kubectl get secret reposcan-worker-secrets -n reposcan-worker
```

### Updating Secrets

To update secrets, simply run the script again:

```bash
./create-secrets.sh local
```

Or use kubectl:

```bash
kubectl delete secret reposcan-worker-secrets -n reposcan-worker
kubectl create secret generic reposcan-worker-secrets ...
```

Then restart the deployments to pick up new secrets:

```bash
kubectl rollout restart deployment/reposcan-api -n reposcan-worker
kubectl rollout restart deployment/reposcan-worker -n reposcan-worker
```

## Configuration

### Values Files

| File | Purpose |
|------|---------|
| `values.yaml` | Base configuration (all environments) |
| `values.local.yaml` | Local development overrides |
| `values.development.yaml` | Development environment |
| `values.staging.yaml` | Staging environment |
| `values.production.yaml` | Production environment |

### Environment Differences

| Feature | Local | Dev | Staging | Production |
|---------|-------|-----|---------|------------|
| API Replicas | 1 | 1 | 2 | 3+ |
| Worker Replicas | 1 | 2 | 3 | 5+ |
| Worker Concurrency | 5 | 20 | 50 | 100 |
| Autoscaling | No | No | Yes | Yes |
| Redis Persistence | No | Yes | Yes | Yes |
| Ingress | No | Yes | Yes | Yes |
| TLS | No | Yes (staging) | Yes (staging) | Yes (prod) |
| Resource Limits | Low | Medium | Medium | High |

## Accessing the API

### Port-forward (for local development)

```bash
kubectl port-forward -n reposcan-worker svc/reposcan-api 8000:8000
```

Then access: http://localhost:8000/health

### Via Ingress

Configure your DNS to point to the ingress controller, then access via the configured domain.

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n reposcan-worker
kubectl describe pod -n reposcan-worker <pod-name>
```

### View logs

```bash
# API logs
kubectl logs -n reposcan-worker -l app.kubernetes.io/component=api -f

# Worker logs
kubectl logs -n reposcan-worker -l app.kubernetes.io/component=worker -f

# Redis logs
kubectl logs -n reposcan-worker -l app.kubernetes.io/component=redis -f
```

### Check events

```bash
kubectl get events -n reposcan-worker --sort-by='.lastTimestamp'
```

### Check secrets

```bash
kubectl get secret reposcan-worker-secrets -n reposcan-worker
kubectl describe secret reposcan-worker-secrets -n reposcan-worker
```

### Exec into pod

```bash
kubectl exec -it -n reposcan-worker deployment/reposcan-api -- /bin/bash
```

## Building Images

Before deploying, build and push the container images:

```bash
# Build API image
docker build -f ../../docker/Dockerfile.api -t your-registry/reposcan-api:latest ../..
docker push your-registry/reposcan-api:latest

# Build Worker image
docker build -f ../../docker/Dockerfile.worker -t your-registry/sec-audit-worker:latest ../..
docker push your-registry/sec-audit-worker:latest
```

Update image repository in values files:

```yaml
api:
  image:
    repository: your-registry/reposcan-api
    
worker:
  image:
    repository: your-registry/sec-audit-worker
```

## Upgrading

```bash
# Update images and sync
helmfile --environment production sync
```

## Rolling Back

```bash
# List releases
helm list -n reposcan-worker

# Rollback to previous revision
helm rollback -n reposcan-worker reposcan 1
```

## Uninstallation

```bash
helmfile --environment production destroy
```

Or with Helm directly:

```bash
helm uninstall reposcan --namespace reposcan-worker
kubectl delete namespace reposcan-worker
```

## Advanced: Helm-managed Secrets (Not Recommended)

If you really want Helm to manage secrets (e.g., for CI/CD automation):

```yaml
# In your values file
secrets:
  create: true

global:
  databaseUrl: "postgresql://..."  # This will be stored in Helm release secret
```

**Warning:** This stores credentials in Helm release secrets which may not be desirable for production.
