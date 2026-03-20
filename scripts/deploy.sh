#!/bin/bash
set -euo pipefail

# Connect The Dots - Server Deployment Script
# Routine: Update repo -> Build fresh images -> Recreate services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d-%H%M)}"

cd "$PROJECT_ROOT"

echo "Starting deployment from $PROJECT_ROOT"
echo "Build number: $BUILD_NUMBER"

echo "Pulling latest changes from Git..."
git pull --ff-only

echo "Building Docker images..."
docker compose build --pull --build-arg BUILD_NUMBER="$BUILD_NUMBER"

echo "Recreating services..."
docker compose up -d --force-recreate

echo "Deployment complete."
echo "Expected footer version: v1.1.13-$BUILD_NUMBER"
