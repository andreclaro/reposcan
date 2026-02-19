#!/bin/bash
#
# Create Kubernetes secrets for SecureFast Worker
#
# Usage:
#   ./create-secrets.sh <environment>
#
# Examples:
#   ./create-secrets.sh local
#   ./create-secrets.sh staging
#   ./create-secrets.sh production
#
# The script will prompt for DATABASE_URL if not set as environment variable.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-local}"
NAMESPACE="securefast-worker"
SECRET_NAME="securefast-worker-secrets"
CHART_NAME="securefast"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Creating secrets for environment: $ENVIRONMENT"
echo "Namespace: $NAMESPACE"
echo "========================================"
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed or not in PATH${NC}"
    exit 1
fi

# Check if namespace exists, create if not
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
    echo -e "${YELLOW}Namespace '$NAMESPACE' does not exist. Creating...${NC}"
    kubectl create namespace "$NAMESPACE"
fi

# Get DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo -n "Enter DATABASE_URL (e.g., postgresql://user:password@host:5432/dbname): "
    read -s DATABASE_URL
    echo ""
else
    echo -e "${GREEN}Using DATABASE_URL from environment variable${NC}"
fi

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL is required${NC}"
    exit 1
fi

# Optional: Get AI API Keys (these are optional)
echo ""
echo "Optional AI API Keys (press Enter to skip):"
echo "-------------------------------------------"

read -p "ANTHROPIC_API_KEY (or set ANTHROPIC_API_KEY env var): " ANTHROPIC_API_KEY_INPUT
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-$ANTHROPIC_API_KEY_INPUT}

read -p "OPENAI_API_KEY (or set OPENAI_API_KEY env var): " OPENAI_API_KEY_INPUT
OPENAI_API_KEY=${OPENAI_API_KEY:-$OPENAI_API_KEY_INPUT}

read -p "KIMI_API_KEY (or set KIMI_API_KEY env var): " KIMI_API_KEY_INPUT
KIMI_API_KEY=${KIMI_API_KEY:-$KIMI_API_KEY_INPUT}

# Optional: AWS credentials for S3 storage
echo ""
echo "Optional AWS credentials for S3 storage (press Enter to skip):"
echo "---------------------------------------------------------------"

read -p "AWS_ACCESS_KEY_ID (or set AWS_ACCESS_KEY_ID env var): " AWS_ACCESS_KEY_ID_INPUT
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-$AWS_ACCESS_KEY_ID_INPUT}

read -p "AWS_SECRET_ACCESS_KEY (or set AWS_SECRET_ACCESS_KEY env var): " AWS_SECRET_ACCESS_KEY_INPUT
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-$AWS_SECRET_ACCESS_KEY_INPUT}

# Build kubectl create secret command
echo ""
echo "Creating/updating secret..."

KUBECTL_ARGS=(
    kubectl create secret generic "$SECRET_NAME"
    --namespace="$NAMESPACE"
    --from-literal=DATABASE_URL="$DATABASE_URL"
)

# Add optional secrets if provided
if [ -n "$ANTHROPIC_API_KEY" ]; then
    KUBECTL_ARGS+=(--from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY")
fi

if [ -n "$OPENAI_API_KEY" ]; then
    KUBECTL_ARGS+=(--from-literal=OPENAI_API_KEY="$OPENAI_API_KEY")
fi

if [ -n "$KIMI_API_KEY" ]; then
    KUBECTL_ARGS+=(--from-literal=KIMI_API_KEY="$KIMI_API_KEY")
fi

if [ -n "$AWS_ACCESS_KEY_ID" ]; then
    KUBECTL_ARGS+=(--from-literal=AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID")
fi

if [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    KUBECTL_ARGS+=(--from-literal=AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY")
fi

# Check if secret already exists
if kubectl get secret "$SECRET_NAME" --namespace="$NAMESPACE" &> /dev/null; then
    echo -e "${YELLOW}Secret '$SECRET_NAME' already exists. Deleting old secret...${NC}"
    kubectl delete secret "$SECRET_NAME" --namespace="$NAMESPACE"
fi

# Create the secret
"${KUBECTL_ARGS[@]}"

# Verify
if kubectl get secret "$SECRET_NAME" --namespace="$NAMESPACE" &> /dev/null; then
    echo ""
    echo -e "${GREEN}✓ Secret '$SECRET_NAME' created successfully in namespace '$NAMESPACE'${NC}"
    echo ""
    echo "The secret will be automatically mounted by the deployments."
    echo ""
    echo "Secret contents (keys only):"
    kubectl get secret "$SECRET_NAME" --namespace="$NAMESPACE" -o jsonpath='{range .data}{"  - "}{.key}{"\n"}{end}' 2>/dev/null || \
    kubectl get secret "$SECRET_NAME" --namespace="$NAMESPACE" -o json | jq -r '.data | keys[] | "  - " + .'
    echo ""
else
    echo -e "${RED}✗ Failed to create secret${NC}"
    exit 1
fi

# Show next steps
echo "========================================"
echo "Next steps:"
echo "========================================"
echo ""
echo "1. Verify the secret:"
echo "   kubectl get secret $SECRET_NAME -n $NAMESPACE -o yaml"
echo ""
echo "2. Deploy with helmfile:"
echo "   helmfile --environment $ENVIRONMENT sync"
echo ""
echo "Or if using Helm directly:"
echo "   helm upgrade --install securefast-worker ./securefast-worker \\"
echo "     --namespace $NAMESPACE \\"
echo "     --set global.databaseUrl=\"\$DATABASE_URL\""
echo ""
