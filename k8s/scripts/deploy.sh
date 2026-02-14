#!/bin/bash
# Manual deployment script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="secaudit"

echo "🚀 Deploying to Kubernetes"
echo "=========================="

cd "$SCRIPT_DIR/../overlays/production"
kubectl apply -k .

echo "⏳ Waiting for rollout..."
kubectl rollout status deployment/prod-api -n $NAMESPACE --timeout=300s
kubectl rollout status deployment/prod-worker -n $NAMESPACE --timeout=300s

echo "✅ Done!"
kubectl get pods -n $NAMESPACE
