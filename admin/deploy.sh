#!/bin/bash

# Script to update kiosk admin with persistent uploads
# Run this script FROM THE admin DIRECTORY: cd ~/hio-checkin-kiosk/admin && ./deploy.sh

set -e

echo "🔄 Updating HiO Kiosk Admin with persistent uploads..."

# Verify we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: docker-compose.prod.yml not found!"
    echo "Please run this script from the admin directory:"
    echo "  cd ~/hio-checkin-kiosk/admin"
    echo "  ./deploy.sh"
    exit 1
fi

# Stop the running container
echo "⏹️  Stopping container..."
docker compose -f docker-compose.prod.yml down

# Create uploads directory on host if it doesn't exist
echo "📁 Creating uploads directory..."
mkdir -p ./uploads/room-images

# Set proper permissions and ownership (1001:1001 = nextjs:nodejs in container)
echo "🔐 Setting permissions..."
sudo chown -R 1001:1001 ./uploads
sudo chmod -R 755 ./uploads

# Pull latest changes
echo "📥 Pulling latest code..."
git pull origin main

# Rebuild and restart
echo "🏗️  Building and starting container..."
docker compose -f docker-compose.prod.yml up -d --build

# Show logs
echo "📋 Container logs:"
docker compose -f docker-compose.prod.yml logs --tail=50

echo ""
echo "✅ Update complete!"
echo ""
echo "📁 Uploads directory: $(pwd)/uploads"
echo "   Owner: 1001:1001 (nextjs user in container)"
echo "   This directory is now persistent across container restarts"
echo ""
echo "🔗 Admin: https://kiosk.hio.ai.kr"
echo "🔗 Kiosk: https://kiosk.hio.ai.kr/kiosk"
echo ""
echo "ℹ️  To view logs: docker compose -f docker-compose.prod.yml logs -f"
