#!/bin/bash

################################################################################
# Contract to Cozy - Docker Image Build & Push Script
#
# This script builds and pushes all Docker images to GitHub Container Registry
#
# Usage: ./build-and-push.sh [version]
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REGISTRY="ghcr.io"
USERNAME="madhuboyin"
REPO="contract-to-cozy"
VERSION="${1:-latest}"
PLATFORM="linux/arm64"

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running!"
    exit 1
fi

print_header "Contract to Cozy - Docker Build Script"
echo ""
print_info "Registry: $REGISTRY"
print_info "Username: $USERNAME"
print_info "Version: $VERSION"
print_info "Platform: $PLATFORM"
echo ""

# Build Frontend
print_header "Building Frontend (Next.js)"

docker build \
    --no-cache \
    --platform $PLATFORM \
    -t $REGISTRY/$USERNAME/$REPO/frontend:$VERSION \
    -t $REGISTRY/$USERNAME/$REPO/frontend:latest \
    -f infrastructure/docker/frontend/Dockerfile \
    apps/frontend/ || {
    print_error "Frontend build failed!"
    exit 1
}

print_success "Frontend built successfully"

# Build Backend
print_header "Building Backend (Node.js API)"

docker build \
    --no-cache \
    --platform $PLATFORM \
    -t $REGISTRY/$USERNAME/$REPO/backend:$VERSION \
    -t $REGISTRY/$USERNAME/$REPO/backend:latest \
    -f infrastructure/docker/backend/Dockerfile \
    apps/backend/ || {
    print_error "Backend build failed!"
    exit 1
}

print_success "Backend built successfully"

# Build Workers
print_header "Building Workers"

docker build \
    --no-cache \
    --platform $PLATFORM \
    -t $REGISTRY/$USERNAME/$REPO/workers:$VERSION \
    -t $REGISTRY/$USERNAME/$REPO/workers:latest \
    -f infrastructure/docker/workers/Dockerfile \
    apps/workers/ || {
    print_error "Workers build failed!"
    exit 1
}

print_success "Workers built successfully"

# Push Images
print_header "Pushing Images to Registry"

echo "Pushing frontend..."
docker push $REGISTRY/$USERNAME/$REPO/frontend:$VERSION
docker push $REGISTRY/$USERNAME/$REPO/frontend:latest
print_success "Frontend pushed"

echo "Pushing backend..."
docker push $REGISTRY/$USERNAME/$REPO/backend:$VERSION
docker push $REGISTRY/$USERNAME/$REPO/backend:latest
print_success "Backend pushed"

echo "Pushing workers..."
docker push $REGISTRY/$USERNAME/$REPO/workers:$VERSION
docker push $REGISTRY/$USERNAME/$REPO/workers:latest
print_success "Workers pushed"

# Summary
print_header "Build Complete!"
echo ""
print_success "All images built and pushed successfully!"
echo ""
echo "Images:"
echo "  - $REGISTRY/$USERNAME/$REPO/frontend:$VERSION"
echo "  - $REGISTRY/$USERNAME/$REPO/backend:$VERSION"
echo "  - $REGISTRY/$USERNAME/$REPO/workers:$VERSION"
echo ""
echo "Next steps:"
echo "  kubectl apply -k infrastructure/kubernetes/overlays/raspberry-pi/"
echo ""
print_success "Done!"
