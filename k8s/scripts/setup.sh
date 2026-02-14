#!/bin/bash
# Setup script for initial Kubernetes deployment
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="secaudit"

echo "🚀 Security Audit Tool - Kubernetes Setup"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl not found. Please install kubectl first."
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to Kubernetes cluster."
        exit 1
    fi
    
    print_status "✅ kubectl is installed and cluster is accessible"
}

# Get user input
get_user_input() {
    echo ""
    echo "Please provide the following information:"
    echo "------------------------------------------"
    
    read -p "GitHub Username: " GITHUB_USERNAME
    read -p "GitHub Personal Access Token: " -s GITHUB_TOKEN
    echo ""
    read -p "PostgreSQL Password: " -s POSTGRES_PASSWORD
    echo ""
    read -p "API Domain (e.g., api.example.com): " API_DOMAIN
    read -p "Frontend Domain (e.g., app.example.com): " FRONTEND_DOMAIN
    
    echo ""
}

# Create namespace
create_namespace() {
    print_status "Creating namespace..."
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
}

# Create secrets
create_secrets() {
    print_status "Creating secrets..."
    
    kubectl create secret docker-registry ghcr-secret \
        --namespace=$NAMESPACE \
        --docker-server=ghcr.io \
        --docker-username="$GITHUB_USERNAME" \
        --docker-password="$GITHUB_TOKEN" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/sec_audit"
    
    kubectl create secret generic app-secrets \
        --namespace=$NAMESPACE \
        --from-literal=DATABASE_URL="$DATABASE_URL" \
        --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
        --from-literal=AI_ANALYSIS_ENABLED="false" \
        --dry-run=client -o yaml | kubectl apply -f -
}

# Deploy
deploy() {
    print_status "Deploying..."
    
    # Update domains
    sed -i.bak "s/api.yourdomain.com/$API_DOMAIN/g" "$SCRIPT_DIR/../base/api-deployment.yaml"
    sed -i.bak "s/app.yourdomain.com/$FRONTEND_DOMAIN/g" "$SCRIPT_DIR/../base/frontend-deployment.yaml"
    rm -f "$SCRIPT_DIR/../base/api-deployment.yaml.bak" "$SCRIPT_DIR/../base/frontend-deployment.yaml.bak"
    
    cd "$SCRIPT_DIR/../overlays/production"
    sed -i.bak "s/YOUR_USERNAME/$GITHUB_USERNAME/g" kustomization.yaml
    rm kustomization.yaml.bak
    
    kubectl apply -k .
}

# Main
main() {
    check_prerequisites
    get_user_input
    create_namespace
    create_secrets
    deploy
    
    print_status "Waiting for rollout..."
    kubectl rollout status deployment/prod-api -n $NAMESPACE --timeout=300s
    kubectl rollout status deployment/prod-worker -n $NAMESPACE --timeout=300s
    kubectl rollout status deployment/prod-frontend -n $NAMESPACE --timeout=300s
    
    echo ""
    echo "✅ Deployment Complete!"
    kubectl get all -n $NAMESPACE
}

main "$@"
