#!/bin/bash

# Update Nginx configuration to serve uploads directly
# Run on server: ssh ubuntu@54.180.144.32

echo "🔧 Updating Nginx configuration for static file serving..."

# Backup existing config
sudo cp /etc/nginx/sites-available/hio-checkin /etc/nginx/sites-available/hio-checkin.backup.$(date +%Y%m%d-%H%M%S)
echo "✅ Backed up existing config"

# Copy new config
sudo cp nginx-kiosk.conf /etc/nginx/sites-available/hio-checkin
echo "✅ Updated Nginx config"

# Test configuration
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx config is valid"
    
    # Reload Nginx
    echo "🔄 Reloading Nginx..."
    sudo systemctl reload nginx
    
    echo ""
    echo "✅ Nginx updated successfully!"
    echo ""
    echo "📁 Static files now served from: /home/ubuntu/hio-checkin-kiosk/admin/uploads/"
    echo "🔗 Test URL: https://kiosk.hio.ai.kr/uploads/room-images/..."
    echo ""
    echo "🎯 Next steps:"
    echo "   1. Upload a new image in the admin panel"
    echo "   2. It should now load correctly in the kiosk"
    
else
    echo "❌ Nginx config test failed!"
    echo "Restoring backup..."
    sudo cp /etc/nginx/sites-available/hio-checkin.backup.$(date +%Y%m%d)* /etc/nginx/sites-available/hio-checkin
    exit 1
fi
