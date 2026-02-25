# RepoScan Worker Helm Chart

This Helm chart deploys the RepoScan security audit platform to Kubernetes.

## Components

- **Redis**: Message broker for Celery tasks
- **API (FastAPI)**: HTTP API for scan management
- **Worker (Celery)**: Background workers for running security scans

## Prerequisites

- Kubernetes 1.20+
- Helm 3.0+
- PostgreSQL database (external or deployed separately)
- Container images built and pushed to a registry:
  - `reposcan-api:latest` (from `docker/Dockerfile.api`)
  - `reposcan-worker:latest` (from `docker/Dockerfile.worker`)

## Installation

### 1. Build and push images

```bash
# Build API image
docker build -f docker/Dockerfile.api -t your-registry/reposcan-api:latest .
docker push your-registry/reposcan-api:latest

# Build Worker image
docker build -f docker/Dockerfile.worker -t your-registry/reposcan-worker:latest .
docker push your-registry/reposcan-worker:latest
```

### 2. Install Helm chart

```bash
# Create namespace
kubectl create namespace reposcan

# Install with required values
helm install reposcan ./infrastructure/helm/reposcan \
  --namespace reposcan \
  --set global.databaseUrl="postgresql://user:password@postgres-host:5432/sec_audit" \
  --set api.image.repository=your-registry/reposcan-api \
  --set worker.image.repository=your-registry/reposcan-worker
```

### 3. Upgrade

```bash
helm upgrade reposcan ./infrastructure/helm/reposcan \
  --namespace reposcan \
  --set global.databaseUrl="postgresql://user:password@postgres-host:5432/sec_audit"
```

## Configuration

### Required Values

| Parameter | Description |
|-----------|-------------|
| `global.databaseUrl` | PostgreSQL connection string |

### Optional Values

| Parameter | Default | Description |
|-----------|---------|-------------|
| `global.redisUrl` | auto-generated | Redis connection URL |
| `global.aiAnalysisEnabled` | `"false"` | Enable AI analysis |
| `global.aiProvider` | `"anthropic"` | AI provider (anthropic/openai/kimi) |
| `global.anthropicApiKey` | `""` | Anthropic API key |
| `global.openaiApiKey` | `""` | OpenAI API key |
| `api.replicaCount` | `1` | Number of API replicas |
| `worker.replicaCount` | `1` | Number of worker replicas |
| `worker.concurrency` | `50` | Celery worker concurrency |

### Example: Custom values file

Create `values-production.yaml`:

```yaml
global:
  databaseUrl: "postgresql://user:password@postgres.example.com:5432/sec_audit"
  aiAnalysisEnabled: "true"
  aiProvider: "anthropic"
  anthropicApiKey: "sk-ant-api03-..."

api:
  replicaCount: 2
  image:
    repository: my-registry/reposcan-api
    tag: "v1.0.0"
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
  ingress:
    enabled: true
    hosts:
      - host: api.reposcan.example.com
        paths:
          - path: /
            pathType: Prefix

worker:
  replicaCount: 3
  image:
    repository: my-registry/sec-audit-worker
    tag: "v1.0.0"
  concurrency: 100
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
```

Install with custom values:

```bash
helm install reposcan ./infrastructure/helm/reposcan \
  --namespace reposcan \
  -f values-production.yaml
```

## Accessing the API

### Port-forward (for local development)

```bash
kubectl port-forward -n reposcan svc/reposcan-api 8000:8000
```

Then access: http://localhost:8000

### Via Ingress

Enable ingress in values:

```yaml
api:
  ingress:
    enabled: true
    className: nginx
    hosts:
      - host: api.reposcan.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: api-tls
        hosts:
          - api.reposcan.example.com
```

## Monitoring

Check pod status:

```bash
kubectl get pods -n reposcan
```

View logs:

```bash
# API logs
kubectl logs -n reposcan -l app.kubernetes.io/component=api

# Worker logs
kubectl logs -n reposcan -l app.kubernetes.io/component=worker
```

## Uninstallation

```bash
helm uninstall reposcan --namespace reposcan
kubectl delete namespace reposcan
```
