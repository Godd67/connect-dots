#!/bin/bash

# Connect The Dots - Server Deployment Script
# Routine: Pull -> Build -> Start

echo "🚀 Starting deployment..."

# 1. Pull latest code
echo "📥 Pulling latest changes from Git..."
git pull

# 2. Build with automatic timestamped version
# Note: The Dockerfile now handles the timestamp generation automatically
echo "🛠️ Building Docker images..."
docker compose build

# 3. Start services
echo "⚡ Starting services..."
docker compose up -d

echo "✅ Done! Check your site footer to see the new build timestamp."
