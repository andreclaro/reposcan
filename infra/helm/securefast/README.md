# SecureFast Worker Helm Chart

This Helm chart deploys the SecureFast security audit platform to Kubernetes.

## Components

- **Redis**: Message broker for Celery tasks
- **API (FastAPI)**: HTTP API for scan management
- **Worker (Celery)**: Background workers for running security scans

## Prerequisites

- Kubernetes 1.20+
- Helm 3.0+
- PostgreSQL database (external or deployed separately)
- Container images built and pushed to a registry:
  - `securefast-api:latest` (from `docker/Dockerfile.api`)
  - `sec-audit-worker:latest` (from `docker/Dockerfile.worker`)

## Installation

### 1. Build and push images

```bash
# Build API image
docker build -f docker/Dockerfile.api -t your-registry/securefast-api:latest .
docker push your-registry/securefast-api:latest

# Build Worker image
docker build -f docker/Dockerfile.worker -t your-registry/sec-audit-worker:latest .
docker push your-registry/sec-audit-worker:latest
```

### 2. Install Helm chart

```bash
# Create namespace
kubectl create namespace securefast

# Install with required values
helm install securefast ./infrastructure/helm/securefast \
  --namespace securefast \
  --set global.databaseUrl="postgresql://user:password@postgres-host:5432/sec_audit" \
  --set api.image.repository=your-registry/securefast-api \
  --set worker.image.repository=your-registry/sec-audit-worker
```

### 3. Upgrade

```bash
helm upgrade securefast ./infrastructure/helm/securefast \
  --namespace securefast \
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
    repository: my-registry/securefast-api
    tag: "v1.0.0"
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
  ingress:
    enabled: true
    hosts:
      - host: api.securefast.example.com
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
helm install securefast ./infrastructure/helm/securefast \
  --namespace securefast \
  -f values-production.yaml
```

## Accessing the API

### Port-forward (for local development)

```bash
kubectl port-forward -n securefast svc/securefast-api 8000:8000
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
      - host: api.securefast.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: api-tls
        hosts:
          - api.securefast.example.com
```

## Monitoring

Check pod status:

```bash
kubectl get pods -n securefast
```

View logs:

```bash
# API logs
kubectl logs -n securefast -l app.kubernetes.io/component=api

# Worker logs
kubectl logs -n securefast -l app.kubernetes.io/component=worker
```

## Uninstallation

```bash
helm uninstall securefast --namespace securefast
kubectl delete namespace securefast
```
