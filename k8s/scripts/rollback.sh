#!/bin/bash
# Rollback script
NAMESPACE="secaudit"

echo "🔄 Rollback"
echo "==========="

kubectl rollout history deployment/prod-api -n $NAMESPACE
kubectl rollout history deployment/prod-worker -n $NAMESPACE

read -p "Rollback API? (y/n): " CONFIRM
if [[ $CONFIRM =~ ^[Yy]$ ]]; then
    kubectl rollout undo deployment/prod-api -n $NAMESPACE
    kubectl rollout status deployment/prod-api -n $NAMESPACE
fi

read -p "Rollback Worker? (y/n): " CONFIRM
if [[ $CONFIRM =~ ^[Yy]$ ]]; then
    kubectl rollout undo deployment/prod-worker -n $NAMESPACE
    kubectl rollout status deployment/prod-worker -n $NAMESPACE
fi

echo "✅ Done"
