#!/bin/bash

# Diagnostic script to check upload configuration
# Run on server: ssh ubuntu@54.180.144.32

echo "🔍 Checking HiO Kiosk Upload Configuration..."
echo ""

# Check host directory
echo "📁 Host uploads directory:"
ls -la ~/hio-checkin-kiosk/admin/uploads/ 2>/dev/null || echo "  ❌ Directory not found"
echo ""

# Check container
echo "🐳 Container uploads directory:"
docker exec hio-checkin-admin ls -la /app/public/uploads/ 2>/dev/null || echo "  ❌ Container not running or path not found"
echo ""

# Check permissions
echo "🔐 Host directory permissions:"
stat ~/hio-checkin-kiosk/admin/uploads/ 2>/dev/null | grep -E "Uid|Gid|Access" || echo "  ❌ Cannot stat directory"
echo ""

# Check container process user
echo "👤 Container process user:"
docker exec hio-checkin-admin id nextjs 2>/dev/null || echo "  ❌ Cannot get user info"
echo ""

# Check volume mount
echo "📦 Docker volume mounts:"
docker inspect hio-checkin-admin | grep -A 10 "Mounts" 2>/dev/null || echo "  ❌ Cannot inspect container"
echo ""

# Check if files exist in container
echo "📄 Files in container uploads (if any):"
docker exec hio-checkin-admin find /app/public/uploads -type f 2>/dev/null | head -5 || echo "  No files or error"
echo ""

# Test write permission
echo "✏️  Testing write permission in container:"
docker exec hio-checkin-admin touch /app/public/uploads/test-write.txt 2>/dev/null && \
  docker exec hio-checkin-admin rm /app/public/uploads/test-write.txt 2>/dev/null && \
  echo "  ✅ Write permission OK" || \
  echo "  ❌ Cannot write to uploads directory"
