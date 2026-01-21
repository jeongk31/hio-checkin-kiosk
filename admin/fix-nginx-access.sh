#!/bin/bash

# Check and fix directory traversal permissions for Nginx
# Run on server: cd ~/hio-checkin-kiosk/admin && ./fix-nginx-access.sh

echo "🔍 Checking directory permissions for Nginx access..."
echo ""

# Check each directory in the path
echo "📁 Current permissions:"
namei -l /home/ubuntu/hio-checkin-kiosk/admin/uploads/

echo ""
echo "🔧 Fixing permissions..."

# Home directory must allow traversal (o+x)
sudo chmod o+x /home/ubuntu

# Project directories must allow traversal
sudo chmod o+x /home/ubuntu/hio-checkin-kiosk
sudo chmod o+x /home/ubuntu/hio-checkin-kiosk/admin

# Uploads directory
sudo chmod 755 /home/ubuntu/hio-checkin-kiosk/admin/uploads

# Set all subdirectories to 755
sudo find /home/ubuntu/hio-checkin-kiosk/admin/uploads -type d -exec chmod 755 {} \;

# Set all files to 644
sudo find /home/ubuntu/hio-checkin-kiosk/admin/uploads -type f -exec chmod 644 {} \;

echo ""
echo "✅ Permissions fixed!"
echo ""
echo "📊 Updated path permissions:"
namei -l /home/ubuntu/hio-checkin-kiosk/admin/uploads/

echo ""
echo "🧪 Testing Nginx access..."
# Test if www-data can access the directory
sudo -u www-data test -r /home/ubuntu/hio-checkin-kiosk/admin/uploads && \
    echo "✅ www-data CAN read uploads directory" || \
    echo "❌ www-data CANNOT read uploads directory"

# Test if www-data can access a file
SAMPLE_FILE=$(find /home/ubuntu/hio-checkin-kiosk/admin/uploads -type f | head -1)
if [ -n "$SAMPLE_FILE" ]; then
    sudo -u www-data test -r "$SAMPLE_FILE" && \
        echo "✅ www-data CAN read sample file: $SAMPLE_FILE" || \
        echo "❌ www-data CANNOT read sample file: $SAMPLE_FILE"
fi

echo ""
echo "🔗 Test URL: https://kiosk.hio.ai.kr/uploads/room-images/..."
