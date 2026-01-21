#!/bin/bash

# Quick fix for 403 Forbidden - make existing uploads readable by Nginx
# Run on server: cd ~/hio-checkin-kiosk/admin && ./fix-permissions.sh

echo "🔧 Fixing upload permissions for Nginx access..."

# Set directory permissions (755 = rwxr-xr-x)
echo "📁 Setting directory permissions to 755..."
sudo find ./uploads -type d -exec chmod 755 {} \;

# Set file permissions (644 = rw-r--r--)
echo "📄 Setting file permissions to 644..."
sudo find ./uploads -type f -exec chmod 644 {} \;

# Verify
echo ""
echo "✅ Permissions updated!"
echo ""
echo "📊 Directory structure:"
ls -la ./uploads/
echo ""
echo "📊 Sample file permissions:"
find ./uploads -type f | head -3 | xargs ls -la
echo ""
echo "🔗 Test in browser: https://kiosk.hio.ai.kr/uploads/room-images/..."
