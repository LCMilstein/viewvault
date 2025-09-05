#!/bin/bash

# ViewVault Server Docker Build Script
# Builds multi-architecture Docker image for production

set -e

# Configuration
IMAGE_NAME="lcmilstein/viewvault"
VERSION=${1:-latest}
PLATFORMS="linux/amd64,linux/arm64"

echo "🐳 Building ViewVault Server Docker Image"
echo "Image: ${IMAGE_NAME}:${VERSION}"
echo "Platforms: ${PLATFORMS}"
echo ""

# Check if docker buildx is available
if ! docker buildx version > /dev/null 2>&1; then
    echo "❌ Docker buildx is not available. Please install Docker with buildx support."
    exit 1
fi

# Create and use buildx builder if it doesn't exist
if ! docker buildx inspect viewvault-builder > /dev/null 2>&1; then
    echo "🔧 Creating buildx builder..."
    docker buildx create --name viewvault-builder --use
else
    echo "🔧 Using existing buildx builder..."
    docker buildx use viewvault-builder
fi

# Build and push multi-architecture image
echo "🏗️  Building multi-architecture image..."
docker buildx build \
    --platform ${PLATFORMS} \
    --tag ${IMAGE_NAME}:${VERSION} \
    --tag ${IMAGE_NAME}:latest \
    --push \
    .

echo ""
echo "✅ Build complete!"
echo "Image: ${IMAGE_NAME}:${VERSION}"
echo "Image: ${IMAGE_NAME}:latest"
echo ""
echo "To pull and run:"
echo "docker pull ${IMAGE_NAME}:${VERSION}"
echo "docker run -p 8008:8000 ${IMAGE_NAME}:${VERSION}"
