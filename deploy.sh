#!/bin/bash

# Deployment script for watchlist-app
# Usage: ./deploy.sh [version]
#   ./deploy.sh          # Deploy latest version (local build)
#   ./deploy.sh v1.2.3   # Deploy specific version
#   ./deploy.sh latest   # Deploy latest from registry

set -e

VERSION=${1:-latest}

echo "Deploying watchlist-app version: $VERSION"

if [ "$VERSION" = "latest" ]; then
    # Deploy latest version (local build)
    echo "Building and deploying latest version locally..."
    docker-compose down
    docker-compose up -d --build
else
    # Deploy specific version
    echo "Deploying version: $VERSION"
    
    # Check if it's a local tag
    if docker images | grep -q "watchlist-app:$VERSION"; then
        echo "Using local image: watchlist-app:$VERSION"
        WATCHLIST_IMAGE="watchlist-app:$VERSION" docker-compose down
        WATCHLIST_IMAGE="watchlist-app:$VERSION" docker-compose up -d
    else
        # Try to pull from registry
        echo "Attempting to pull from registry..."
        docker pull "ghcr.io/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\).*/\1/')/watchlist-app:$VERSION" || {
            echo "Error: Could not find version $VERSION locally or in registry"
            echo "Available local versions:"
            docker images | grep watchlist-app || echo "No local images found"
            exit 1
        }
        
        WATCHLIST_IMAGE="ghcr.io/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\).*/\1/')/watchlist-app:$VERSION" docker-compose down
        WATCHLIST_IMAGE="ghcr.io/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\).*/\1/')/watchlist-app:$VERSION" docker-compose up -d
    fi
fi

echo "Deployment complete!"
echo "Container status:"
docker-compose ps 