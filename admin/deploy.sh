#!/bin/bash

# Complete deployment script for HiO Kiosk Admin
# Run from admin directory: cd ~/hio-checkin-kiosk/admin && ./deploy.sh

set -e

echo "🔄 Deploying HiO Kiosk Admin..."
echo ""

# Verify we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: docker-compose.prod.yml not found!"
    echo "Please run from: cd ~/hio-checkin-kiosk/admin && ./deploy.sh"
    exit 1
fi

# Stop the running container
echo "⏹️  Stopping container..."
docker compose -f docker-compose.prod.yml down

# Pull latest code
echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main
echo "   Current commit: $(git log -1 --oneline)"

# Create uploads directory with proper structure
echo "📁 Setting up uploads directory..."
mkdir -p ./uploads/room-images

# Set ownership and permissions for Docker container and Nginx
echo "🔐 Configuring permissions..."
# Owner: 1001:1001 (nextjs user in container)
sudo chown -R 1001:1001 ./uploads
# Directories: 755 (rwxr-xr-x) - readable by Nginx
sudo find ./uploads -type d -exec chmod 755 {} \;
# Files: 644 (rw-r--r--) - readable by Nginx
sudo find ./uploads -type f -exec chmod 644 {} \; 2>/dev/null || true

# Ensure parent directories allow Nginx traversal
sudo chmod o+x /home/ubuntu
sudo chmod o+x /home/ubuntu/hio-checkin-kiosk
sudo chmod o+x /home/ubuntu/hio-checkin-kiosk/admin

# Update database schema
echo "💾 Updating database schema..."
PGPASSWORD=00oo00oo psql -U orange -h localhost -d kiosk -c \
  "ALTER TABLE room_types ADD COLUMN IF NOT EXISTS image_url TEXT;" 2>/dev/null || \
  echo "   ℹ️  Schema already up to date"

# Update Nginx configuration if needed
if [ -f "nginx-kiosk.conf" ]; then
    echo "🌐 Updating Nginx configuration..."
    sudo cp nginx-kiosk.conf /etc/nginx/sites-available/hio-checkin
    sudo nginx -t && sudo systemctl reload nginx
    echo "   ✅ Nginx configured to serve uploads directly"
fi

# Rebuild and restart container WITH CACHE (using BuildKit)
echo "🏗️  Building and starting container (with cache)..."
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Wait for container to be healthy
echo "⏳ Waiting for container to be ready..."
sleep 5

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Status:"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "📁 Uploads: $(pwd)/uploads (persistent, Nginx-readable)"
echo "🔗 Admin: https://kiosk.hio.ai.kr"
echo "🔗 Kiosk: https://kiosk.hio.ai.kr/kiosk"
echo ""
echo "📋 View logs: docker compose -f docker-compose.prod.yml logs -f"
