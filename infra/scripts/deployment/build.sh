#!/bin/bash
# Build script for Security Audit API Docker images

set -e  # Exit on error

echo "🔨 Building Security Audit API Docker images..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Get script directory and project root (script lives in infrastructure/scripts/deployment/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Parse command line arguments
BUILD_ALL=true
BUILD_API=false
BUILD_WORKER=false
NO_CACHE=false
PUSH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --api)
            BUILD_ALL=false
            BUILD_API=true
            shift
            ;;
        --worker)
            BUILD_ALL=false
            BUILD_WORKER=true
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --help)
            echo "Usage: ./infrastructure/scripts/deployment/build.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --api       Build only the API service image"
            echo "  --worker    Build only the worker service image"
            echo "  --no-cache  Build without using cache"
            echo "  --push      Push images to registry (requires DOCKER_REGISTRY env var)"
            echo "  --help      Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./infrastructure/scripts/deployment/build.sh                 # Build all images"
            echo "  ./infrastructure/scripts/deployment/build.sh --api          # Build only API image"
            echo "  ./infrastructure/scripts/deployment/build.sh --no-cache     # Build all images without cache"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Build arguments
BUILD_ARGS=""
if [ "$NO_CACHE" = true ]; then
    BUILD_ARGS="--no-cache"
    print_warning "Building without cache (slower but cleaner)"
fi

# Docker registry (optional)
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

if [ -n "$DOCKER_REGISTRY" ]; then
    print_status "Using Docker registry: $DOCKER_REGISTRY"
fi

# Build API image
if [ "$BUILD_ALL" = true ] || [ "$BUILD_API" = true ]; then
    print_status "Building API service image..."
    
    IMAGE_NAME="reposcan-api"
    if [ -n "$DOCKER_REGISTRY" ]; then
        IMAGE_NAME="$DOCKER_REGISTRY/$IMAGE_NAME"
    fi
    
    docker build $BUILD_ARGS -f docker/Dockerfile.api -t "$IMAGE_NAME:$IMAGE_TAG" .
    
    if [ $? -eq 0 ]; then
        print_success "API image built successfully: $IMAGE_NAME:$IMAGE_TAG"
        
        if [ "$PUSH" = true ] && [ -n "$DOCKER_REGISTRY" ]; then
            print_status "Pushing API image to registry..."
            docker push "$IMAGE_NAME:$IMAGE_TAG"
            print_success "API image pushed successfully"
        fi
    else
        echo "❌ Failed to build API image"
        exit 1
    fi
    echo ""
fi

# Build Worker image
if [ "$BUILD_ALL" = true ] || [ "$BUILD_WORKER" = true ]; then
    print_status "Building Worker service image..."
    print_warning "This may take several minutes (installs security tools)..."
    
    IMAGE_NAME="sec-audit-worker"
    if [ -n "$DOCKER_REGISTRY" ]; then
        IMAGE_NAME="$DOCKER_REGISTRY/$IMAGE_NAME"
    fi
    
    docker build $BUILD_ARGS -f docker/Dockerfile -t "$IMAGE_NAME:$IMAGE_TAG" .
    
    if [ $? -eq 0 ]; then
        print_success "Worker image built successfully: $IMAGE_NAME:$IMAGE_TAG"
        
        if [ "$PUSH" = true ] && [ -n "$DOCKER_REGISTRY" ]; then
            print_status "Pushing worker image to registry..."
            docker push "$IMAGE_NAME:$IMAGE_TAG"
            print_success "Worker image pushed successfully"
        fi
    else
        echo "❌ Failed to build worker image"
        exit 1
    fi
    echo ""
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "Build completed successfully!"
echo ""
echo "Built images:"
if [ "$BUILD_ALL" = true ] || [ "$BUILD_API" = true ]; then
    if [ -n "$DOCKER_REGISTRY" ]; then
        echo "  - $DOCKER_REGISTRY/reposcan-api:$IMAGE_TAG"
    else
        echo "  - reposcan-api:$IMAGE_TAG"
    fi
fi
if [ "$BUILD_ALL" = true ] || [ "$BUILD_WORKER" = true ]; then
    if [ -n "$DOCKER_REGISTRY" ]; then
        echo "  - $DOCKER_REGISTRY/sec-audit-worker:$IMAGE_TAG"
    else
        echo "  - sec-audit-worker:$IMAGE_TAG"
    fi
fi
echo ""
echo "Next steps:"
echo "  docker compose -f docker/docker-compose.yml up -d    # Start all services"
echo "  docker compose -f docker/docker-compose.yml logs -f  # View logs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
