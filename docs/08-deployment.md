# Deployment - Kiosk System

Production deployment guide for the Hotel Check-in Kiosk System.

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Production Build](#production-build)
3. [Environment Configuration](#environment-configuration)
4. [PM2 Deployment](#pm2-deployment)
5. [Nginx Reverse Proxy](#nginx-reverse-proxy)
6. [SSL/HTTPS Configuration](#sslhttps-configuration)
7. [Cache Busting](#cache-busting)
8. [Kiosk Device Setup](#kiosk-device-setup)
9. [Monitoring and Maintenance](#monitoring-and-maintenance)

---

## Deployment Overview

### Deployment Architectures

#### Option 1: Centralized Server + Kiosk Clients

```
┌─────────────────────┐
│ Central Server      │
│ (AWS EC2/VPS)       │
│ - Next.js App       │
│ - PostgreSQL        │
│ - Nginx/HTTPS       │
└──────────┬──────────┘
           │
    ┌──────┴──────┬─────────┬─────────┐
    │             │         │         │
┌───▼────┐   ┌───▼────┐ ┌──▼────┐ ┌──▼────┐
│Kiosk 1 │   │Kiosk 2 │ │Kiosk 3│ │Admin  │
│Browser │   │Browser │ │Browser│ │Browser│
└────────┘   └────────┘ └───────┘ └───────┘
```

**Pros**:
- Centralized management
- Easy updates (single server)
- Lower hardware requirements per kiosk

**Cons**:
- Single point of failure
- Requires stable internet
- Network latency

---

#### Option 2: Local Server per Property

```
┌──────────────────────────────────┐
│ Property A - Local Server        │
│ - Next.js App                    │
│ - PostgreSQL                     │
│ - 3 Kiosks (LAN)                 │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ Property B - Local Server        │
│ - Next.js App                    │
│ - PostgreSQL                     │
│ - 5 Kiosks (LAN)                 │
└──────────────────────────────────┘
```

**Pros**:
- Works offline
- Low latency
- No internet dependency

**Cons**:
- More hardware required
- Updates must be deployed to each property
- Harder to monitor centrally

---

## Production Build

### Build Process

```powershell
# Navigate to admin directory
cd d:\GitHub\Hotel\hio-checkin-kiosk\admin

# Install dependencies
npm install --production

# Build Next.js application
npm run build
```

**Expected Output**:
```
Route (app)                               Size     First Load JS
┌ ○ /                                    X kB           XX kB
├ ○ /admin                               X kB           XX kB
├ ○ /admin/kiosks                        X kB           XX kB
├ ○ /admin/projects                      X kB           XX kB
└ ○ /api/*                               X kB           XX kB

○  (Static)  automatically rendered as static HTML
```

**Build Artifacts**:
- `.next/` directory - Compiled application
- `.next/standalone/` - Standalone server (if configured)
- `public/` - Static assets

---

### Production Environment Variables

Create `admin/.env.production`:

```env
# =============================================================================
# Kiosk System - Production Environment
# =============================================================================

# Database (Production)
POSTGRES_HOST=production-db.example.com
POSTGRES_PORT=5432
POSTGRES_DATABASE=kiosk_production
POSTGRES_USER=kiosk_app
POSTGRES_PASSWORD=<STRONG-RANDOM-PASSWORD>

# JWT Secret (MUST use strong random secret!)
JWT_SECRET=<GENERATE-WITH-openssl-rand-hex-32>

# Application URL (production domain with HTTPS)
NEXT_PUBLIC_APP_URL=https://kiosk.hio.ai.kr

# useB API (production credentials)
USEB_EMAIL=production@yourhotel.com
USEB_PASSWORD="<PRODUCTION-PASSWORD>"

# Payment Agent (production VTR server)
NEXT_PUBLIC_PAYMENT_AGENT_URL=http://192.168.1.100:8085

# useB Face Server (production)
FACE_CLIENT_ID=<PRODUCTION-CLIENT-ID>
FACE_CLIENT_SECRET=<PRODUCTION-CLIENT-SECRET>

# PMS Authentication (production PMS API)
PMS_AUTH_URL=https://pmsapi.hio.ai.kr
```

**Generate Secrets**:
```powershell
# JWT Secret
openssl rand -hex 32

# Database Password
openssl rand -base64 24
```

---

## PM2 Deployment

### Install PM2

```powershell
# Install PM2 globally
npm install -g pm2
```

### PM2 Configuration

Create `ecosystem.config.js` in project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'kiosk-system',
      script: 'npm',
      args: 'start',
      cwd: './admin',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
```

### Start Application

```powershell
# Start with PM2
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs kiosk-system

# Monitor
pm2 monit

# Stop
pm2 stop kiosk-system

# Restart
pm2 restart kiosk-system
```

### PM2 Auto-Startup

**Windows**:
```powershell
# Install pm2-windows-service
npm install -g pm2-windows-service

# Configure
pm2-service-install -n PM2-Kiosk

# Save current processes
pm2 save
```

**Linux**:
```bash
# Generate startup script
pm2 startup

# Save current processes
pm2 save
```

---

## Nginx Reverse Proxy

### Install Nginx

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install nginx
```

**Windows**:
Download from https://nginx.org/en/download.html

### Nginx Configuration

Create `/etc/nginx/sites-available/kiosk`:

```nginx
# Upstream Next.js server
upstream kiosk_backend {
    server localhost:3000;
    keepalive 64;
}

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name kiosk.hio.ai.kr;

    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name kiosk.hio.ai.kr;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/kiosk.hio.ai.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kiosk.hio.ai.kr/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logs
    access_log /var/log/nginx/kiosk_access.log;
    error_log /var/log/nginx/kiosk_error.log;

    # Client body size (for file uploads)
    client_max_body_size 10M;

    # Proxy to Next.js
    location / {
        proxy_pass http://kiosk_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location /_next/static/ {
        proxy_pass http://kiosk_backend;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location /images/ {
        proxy_pass http://kiosk_backend;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

**Enable Site**:
```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/kiosk /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## SSL/HTTPS Configuration

### Option 1: Let's Encrypt (Free)

**Install Certbot**:
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d kiosk.hio.ai.kr

# Auto-renewal (cron job)
sudo certbot renew --dry-run
```

**Certificate Locations**:
- Certificate: `/etc/letsencrypt/live/kiosk.hio.ai.kr/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/kiosk.hio.ai.kr/privkey.pem`

---

### Option 2: Self-Signed Certificate (Development/Intranet)

```bash
# Generate self-signed certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/kiosk-selfsigned.key \
  -out /etc/ssl/certs/kiosk-selfsigned.crt

# Update Nginx config
ssl_certificate /etc/ssl/certs/kiosk-selfsigned.crt;
ssl_certificate_key /etc/ssl/private/kiosk-selfsigned.key;
```

**Note**: Self-signed certificates will show browser warnings.

---

## Cache Busting

### Next.js Build IDs

Next.js automatically generates unique build IDs for each build, ensuring cache busting.

**Build ID Location**: `.next/BUILD_ID`

**Automatic Cache Busting**:
- JavaScript bundles: `/_next/static/chunks/[hash].js`
- CSS files: `/_next/static/css/[hash].css`
- Static assets: `/_next/static/media/[hash].png`

### Manual Cache Clearing

**After Deployment**:
```powershell
# Clear Nginx cache (if configured)
sudo rm -rf /var/cache/nginx/*

# Clear browser cache (client-side)
# Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

### Versioned API Routes

For API changes, use versioning:
```javascript
// Before (deprecated)
GET /api/projects

// After (new version)
GET /api/v2/projects
```

---

## Kiosk Device Setup

### Hardware Requirements

**Minimum**:
- Intel i3 or equivalent
- 4 GB RAM
- 128 GB SSD
- Touchscreen display (19"-27")
- Webcam (720p+)
- ID card scanner (USB/Serial)
- VTR payment terminal (USB/Serial)
- Ethernet or WiFi

**Recommended**:
- Intel i5 or better
- 8 GB RAM
- 256 GB SSD
- 24" touchscreen
- 1080p webcam
- Thermal receipt printer

---

### Software Installation

**Windows Kiosk**:

1. **Install Node.js 18+**
2. **Install Chrome** (for browser kiosk mode)
3. **Configure Windows**:
   - Disable Windows Update auto-restart
   - Disable sleep/hibernation
   - Auto-login on boot
   - Hide taskbar

4. **Create Startup Script** (`kiosk-start.bat`):
   ```bat
   @echo off
   REM Start kiosk in fullscreen browser mode
   start chrome.exe --kiosk --app=https://kiosk.hio.ai.kr
   ```

5. **Add to Startup**:
   - Place script in: `C:\Users\[User]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

---

### Kiosk Browser Configuration

**Chrome Kiosk Mode**:
```powershell
# Full kiosk mode (no UI)
chrome.exe --kiosk --app=https://kiosk.hio.ai.kr

# Additional flags for security
chrome.exe --kiosk --app=https://kiosk.hio.ai.kr `
  --disable-infobars `
  --disable-session-crashed-bubble `
  --disable-restore-session-state `
  --no-first-run `
  --disable-pinch
```

**Auto-Restart on Crash**:
```bat
@echo off
:start
chrome.exe --kiosk --app=https://kiosk.hio.ai.kr
timeout /t 5
goto start
```

---

### Peripheral Configuration

**ID Card Scanner**:
- Install manufacturer driver
- Configure COM port (if serial)
- Test with manufacturer software
- Configure scanning mode (ID card, not barcode)

**VTR Payment Terminal**:
- Install VtrRestServer
- Configure COM port
- Start VtrRestServer on boot:
  ```bat
  VtrRestServer.exe --port 8085 --com COM3
  ```

---

## Monitoring and Maintenance

### PM2 Monitoring

**PM2 Dashboard**:
```powershell
# Web dashboard
pm2 web

# Access at: http://localhost:9615
```

**PM2 Logs**:
```powershell
# Tail logs
pm2 logs --lines 100

# Error logs only
pm2 logs --err

# Specific app
pm2 logs kiosk-system
```

---

### Health Checks

**Application Health**:
```powershell
# Check if app is running
curl https://kiosk.hio.ai.kr

# Check API health (if endpoint exists)
curl https://kiosk.hio.ai.kr/api/health
```

**Database Health**:
```bash
# Connect to database
psql -h production-db.example.com -U kiosk_app -d kiosk_production

# Check connection count
SELECT count(*) FROM pg_stat_activity WHERE datname='kiosk_production';

# Check database size
SELECT pg_size_pretty(pg_database_size('kiosk_production'));
```

---

### Backup Strategy

**Database Backups**:
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/kiosk"
mkdir -p $BACKUP_DIR

# Dump database
pg_dump -h localhost -U kiosk_app -d kiosk_production \
  > $BACKUP_DIR/kiosk_backup_$DATE.sql

# Compress
gzip $BACKUP_DIR/kiosk_backup_$DATE.sql

# Delete backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

**Cron Job** (daily at 2 AM):
```bash
# Edit crontab
crontab -e

# Add line
0 2 * * * /scripts/backup-kiosk.sh
```

---

### Updates and Rollback

**Deployment Workflow**:
```powershell
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Backup database
pg_dump ... > backup_pre_update.sql

# 5. Restart PM2
pm2 restart kiosk-system

# 6. Verify
curl https://kiosk.hio.ai.kr
pm2 logs --lines 50
```

**Rollback**:
```powershell
# 1. Checkout previous version
git checkout <previous-commit>

# 2. Rebuild
npm install
npm run build

# 3. Restore database (if schema changed)
psql ... < backup_pre_update.sql

# 4. Restart
pm2 restart kiosk-system
```

---

### Performance Optimization

**Next.js Optimizations**:
```javascript
// next.config.js
module.exports = {
  compress: true, // Gzip compression
  poweredByHeader: false, // Remove X-Powered-By header
  reactStrictMode: true,
  swcMinify: true, // Faster minification
  images: {
    domains: ['your-cdn.com'],
    formats: ['image/avif', 'image/webp']
  }
};
```

**Database Optimization**:
```sql
-- Vacuum and analyze
VACUUM ANALYZE;

-- Reindex
REINDEX DATABASE kiosk_production;

-- Update statistics
ANALYZE;
```

---

## Security Checklist

Before going live:

- ✅ Change all default passwords
- ✅ Use strong JWT secret (32+ bytes)
- ✅ Enable HTTPS (Let's Encrypt)
- ✅ Configure firewall (allow 80, 443, 5432 only from trusted IPs)
- ✅ Disable PostgreSQL remote access (or use SSH tunnel)
- ✅ Enable fail2ban (protect against brute force)
- ✅ Regular security updates (`apt update && apt upgrade`)
- ✅ Encrypted ID verification data (AES-256)
- ✅ No sensitive data in git repository
- ✅ CORS configured (restrict origins)
- ✅ Rate limiting (protect APIs)

---

## Related Documentation

- [02 - Setup](02-setup.md) - Local development setup
- [03 - Environment Variables](03-env.md) - Configuration reference
- [09 - Troubleshooting](09-troubleshooting.md) - Common issues

---

**Previous**: [← 07 - Flows](07-flows.md) | **Next**: [09 - Troubleshooting →](09-troubleshooting.md)
