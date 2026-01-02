# Kiosk PostgreSQL Deployment Guide

This guide explains how to migrate the kiosk from Supabase to local PostgreSQL and configure it to use the production PMS API.

## Prerequisites

- PostgreSQL 14+ installed
- Docker and Docker Compose (optional)
- Nginx (for production deployment)
- SSL certificates (for HTTPS)

## Part 1: PostgreSQL Database Setup

### 1.1 Create Database and User

```powershell
# Connect to PostgreSQL as postgres user
psql -U postgres

# In PostgreSQL prompt:
CREATE USER orange WITH PASSWORD '00oo00oo';
CREATE DATABASE kiosk OWNER orange;
GRANT ALL PRIVILEGES ON DATABASE kiosk TO orange;

# Enable required extensions
\c kiosk
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\q
```

### 1.2 Initialize Database Schema

```powershell
# Run the schema file
cd d:\Github\Hotel\hio-checkin-kiosk
psql -U orange -d kiosk -f database/schema.sql
```

This creates all tables:
- `users` - Local user accounts (replaced by PMS authentication)
- `sessions` - Session tokens
- `projects` - Hotel properties
- `kiosks` - Physical kiosk devices
- `rooms` - Room information
- `contents` - Kiosk display content
- `voice_calls` - Call records between kiosk and managers

### 1.3 Verify Database

```powershell
psql -U orange -d kiosk

# Check tables
\dt

# Expected output:
# Schema |     Name      | Type  | Owner
# --------+---------------+-------+--------
#  public | users         | table | orange
#  public | sessions      | table | orange
#  public | projects      | table | orange
#  public | kiosks        | table | orange
#  public | rooms         | table | orange
#  public | contents      | table | orange
#  public | voice_calls   | table | orange

\q
```

## Part 2: Environment Configuration

### 2.1 Update Development Environment (.env)

```powershell
nano d:\Github\Hotel\hio-checkin-kiosk\admin\.env
```

Update to:

```env
# PostgreSQL Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kiosk
POSTGRES_USER=orange
POSTGRES_PASSWORD=00oo00oo

# JWT Secret for session management
JWT_SECRET=your-super-secret-jwt-key-change-in-production-to-a-long-random-string

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# useB API Credentials (ID OCR/Verification)
USEB_EMAIL=test_stayg.dev@gmail.com
USEB_PASSWORD="stayg.dev251215!@#"

# useB Face Server Credentials (Face Authentication)
FACE_CLIENT_ID=6tm6s6pts8lo3tks5lksjpbb5h
FACE_CLIENT_SECRET=1tddlv9krucj399s4njr6kc57th2ithi9bubj2r5hoa3u0olbq2m

# PMS Authentication API URL (Development)
PMS_AUTH_URL=http://localhost:8000
```

### 2.2 Create Production Environment (.env.production)

```powershell
nano d:\Github\Hotel\hio-checkin-kiosk\admin\.env.production
```

Add:

```env
# PostgreSQL Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kiosk
POSTGRES_USER=orange
POSTGRES_PASSWORD=00oo00oo

# JWT Secret for session management (CHANGE THIS!)
JWT_SECRET=generate-with-openssl-rand-hex-32

# Application URL (Production)
NEXT_PUBLIC_APP_URL=https://kiosk.hio.ai.kr

# useB API Credentials
USEB_EMAIL=test_stayg.dev@gmail.com
USEB_PASSWORD="stayg.dev251215!@#"

# useB Face Server Credentials
FACE_CLIENT_ID=6tm6s6pts8lo3tks5lksjpbb5h
FACE_CLIENT_SECRET=1tddlv9krucj399s4njr6kc57th2ithi9bubj2r5hoa3u0olbq2m

# PMS Authentication API URL (Production)
PMS_AUTH_URL=https://pmsapi.hio.ai.kr

# Production Settings
NODE_ENV=production
```

**Generate secure JWT secret:**
```powershell
# Run this command and copy the output to JWT_SECRET
openssl rand -hex 32
```

## Part 3: Update Docker Configuration

### 3.1 Create New docker-compose.yml

```powershell
nano d:\Github\Hotel\hio-checkin-kiosk\admin\docker-compose.yml
```

Replace with:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: hio-checkin-admin
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # PostgreSQL Connection
      - POSTGRES_HOST=host.docker.internal
      - POSTGRES_PORT=5432
      - POSTGRES_DATABASE=kiosk
      - POSTGRES_USER=orange
      - POSTGRES_PASSWORD=00oo00oo
      
      # PMS Authentication
      - PMS_AUTH_URL=https://pmsapi.hio.ai.kr
      
      # Application
      - NODE_ENV=production
      - NEXT_PUBLIC_APP_URL=https://kiosk.hio.ai.kr
      
      # JWT Secret
      - JWT_SECRET=${JWT_SECRET}
      
      # useB API
      - USEB_EMAIL=${USEB_EMAIL}
      - USEB_PASSWORD=${USEB_PASSWORD}
      - FACE_CLIENT_ID=${FACE_CLIENT_ID}
      - FACE_CLIENT_SECRET=${FACE_CLIENT_SECRET}
    env_file:
      - .env.production
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  app-network:
    driver: bridge
```

**Note:** `host.docker.internal` allows Docker container to access PostgreSQL running on host machine.

### 3.2 Update Dockerfile (if needed)

```powershell
nano d:\Github\Hotel\hio-checkin-kiosk\admin\Dockerfile
```

Remove Supabase build args:

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

## Part 4: AWS Deployment

### 4.1 Install PostgreSQL on EC2

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-contrib-16

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Check status
sudo systemctl status postgresql
```

### 4.2 Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE USER orange WITH PASSWORD '00oo00oo';
CREATE DATABASE kiosk OWNER orange;
GRANT ALL PRIVILEGES ON DATABASE kiosk TO orange;

# Enable extensions
\c kiosk
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\q
```

### 4.3 Allow Local Connections

```bash
# Edit pg_hba.conf
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Add this line (after the existing local entries):
local   kiosk           orange                                  md5

# Reload PostgreSQL
sudo systemctl reload postgresql
```

### 4.4 Initialize Database Schema

```bash
# Navigate to kiosk directory (if you cloned to home directory)
cd ~/hio-checkin-kiosk

# Initialize database - enter password: 00oo00oo when prompted
psql -U orange -d kiosk -f database/schema.sql

# Verify tables were created
psql -U orange -d kiosk -c "\dt"
# Password: 00oo00oo

# You should see: users, sessions, projects, kiosks, rooms, contents, voice_calls, etc.
```

### 4.5 Configure Environment

```bash
cd admin

# Create production environment file
nano .env.production
```

Add production settings (from Part 2.2 above).

```bash
# Generate JWT secret
openssl rand -hex 32

# Update .env.production with the generated secret
```

### 4.6 Deploy with Docker (Recommended)

```bash
# Navigate to admin directory
cd ~/hio-checkin-kiosk/admin

# Build Docker image
sudo docker-compose build

# Start container
sudo docker-compose up -d

# Check container status
sudo docker ps
# Should see: hio-checkin-admin running on port 3000

# View logs
sudo docker logs -f hio-checkin-admin

# Test application
curl http://localhost:3000
# Should return HTML
```

**OR Deploy without Docker:**

```bash
# Install Node.js 18+ (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Navigate to admin directory
cd ~/hio-checkin-kiosk/admin

# Install dependencies
npm install

# Build application
npm run build

# Test locally
npm start
# Should run on http://localhost:3000
```

### 4.7 Setup Nginx

```bash
sudo nano /etc/nginx/sites-available/kiosk.hio.ai.kr
```

Add:

```nginx
server {
    listen 80;
    server_name kiosk.hio.ai.kr;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name kiosk.hio.ai.kr;

    # SSL Certificate (will be configured by certbot)
    ssl_certificate /etc/letsencrypt/live/kiosk.hio.ai.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kiosk.hio.ai.kr/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support for voice calls
    location /api/voice/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Upload size limit (for room images)
    client_max_body_size 100M;

    # Access logs
    access_log /var/log/nginx/kiosk.access.log;
    error_log /var/log/nginx/kiosk.error.log;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/kiosk.hio.ai.kr /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Don't reload yet (need SSL first)
```

### 4.8 Setup SSL Certificate

```bash
# Install certbot (if not already installed)
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d kiosk.hio.ai.kr

# Follow prompts, certbot will automatically update nginx config
```

### 4.9 Auto-Start on Boot

**If using Docker:** Docker Compose already handles restart with `restart: unless-stopped`

**If using Node.js directly:** Create systemd service

```bash
sudo nano /etc/systemd/system/kiosk-admin.service
```

Add:

```ini
[Unit]
Description=HIO Check-in Kiosk Admin Dashboard
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/var/www/Hotel/hio-checkin-kiosk/admin
Environment="NODE_ENV=production"
EnvironmentFile=/var/www/Hotel/hio-checkin-kiosk/admin/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable kiosk-admin
sudo systemctl start kiosk-admin

# Check status
sudo systemctl status kiosk-admin

# View logs
sudo journalctl -u kiosk-admin -f
```

## Part 5: Testing

### 5.1 Test Database Connection

```bash
# From kiosk directory
cd /var/www/Hotel/hio-checkin-kiosk/admin

# Test PostgreSQL connection
psql -U orange -d kiosk -c "SELECT COUNT(*) FROM projects;"
```

### 5.2 Test PMS Authentication

```bash
# Test PMS API is accessible
curl https://pmsapi.hio.ai.kr/api/v1/health

# Expected: {"status":"ok"}
```

### 5.3 Test Kiosk Application

1. **Open browser:** https://kiosk.hio.ai.kr
2. **Login page should appear**
3. **Try login with PMS credentials:**
   - Email: admin@pms.com (or any user created in PMS)
   - Password: (PMS password)
4. **Should redirect to dashboard**

### 5.4 Check Logs

```bash
# Application logs
sudo journalctl -u kiosk-admin -f

# Nginx logs
sudo tail -f /var/log/nginx/kiosk.access.log
sudo tail -f /var/log/nginx/kiosk.error.log

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log
```

## Part 6: Database Migration from Supabase (If Applicable)

If you have existing data in Supabase, you can export and import:

### 6.1 Export from Supabase

```bash
# Use Supabase CLI or pg_dump
supabase db dump > supabase_backup.sql
```

### 6.2 Import to PostgreSQL

```bash
# Review and clean the dump file (remove Supabase-specific tables/functions)
nano supabase_backup.sql

# Import
psql -U orange -d kiosk -f supabase_backup.sql
```

## Part 7: Update Script for Kiosk

Create update script for easy deployments:

```bash
nano ~/update-kiosk.sh
```

Add:

```bash
#!/bin/bash
set -e

PROJECT_DIR="/var/www/Hotel/hio-checkin-kiosk/admin"

echo "🔄 Updating Kiosk Admin..."

# Pull latest code
cd $PROJECT_DIR
git pull

# Install dependencies
npm install

# Build application
sudo rm -rf .next/
npm run build

# Restart service
sudo systemctl restart kiosk-admin

# Wait for service to start
sleep 3

# Check status
sudo systemctl status kiosk-admin --no-pager

echo "✅ Update complete!"
echo "📊 Service status above"
echo "📝 View logs: sudo journalctl -u kiosk-admin -f"
```

```bash
# Make executable
chmod +x ~/update-kiosk.sh

# Run updates
~/update-kiosk.sh
```

## Configuration Summary

### Database Credentials
- **Database:** kiosk
- **User:** orange
- **Password:** 00oo00oo
- **Host:** localhost
- **Port:** 5432

### URLs
- **Development:** http://localhost:3000
- **Production:** https://kiosk.hio.ai.kr
- **PMS API:** https://pmsapi.hio.ai.kr

### Authentication
- Users are managed in PMS (not local database)
- Kiosk validates JWT tokens with PMS on each request
- Local `users` and `sessions` tables can be ignored (kept for backward compatibility)

## Troubleshooting

### Issue: Database connection refused

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check if orange user exists
sudo -u postgres psql -c "\du"

# Test connection
psql -U orange -d kiosk -c "SELECT 1"
```

### Issue: PMS authentication fails

```bash
# Check PMS API is accessible
curl https://pmsapi.hio.ai.kr/api/v1/health

# Check PMS_AUTH_URL in .env.production
cat .env.production | grep PMS_AUTH_URL

# Should be: PMS_AUTH_URL=https://pmsapi.hio.ai.kr
```

### Issue: Port 3000 already in use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Or change port in .env.production
# Add: PORT=3001
```

### Issue: Next.js build fails

```bash
# Clear cache and rebuild
rm -rf .next/
rm -rf node_modules/
npm install
npm run build
```

### Issue: Permission denied on uploads

```bash
# Fix permissions on uploads directory
sudo chown -R ubuntu:ubuntu /var/www/Hotel/hio-checkin-kiosk/admin/public/uploads
sudo chmod -R 755 /var/www/Hotel/hio-checkin-kiosk/admin/public/uploads
```

## Next Steps

1. ✅ Setup DNS for kiosk.hio.ai.kr pointing to your EC2 Elastic IP
2. ✅ Complete steps above to deploy kiosk
3. ✅ Create projects in kiosk admin dashboard
4. ✅ Configure kiosks and rooms
5. ✅ Test voice call functionality between kiosk and admin
6. ✅ Upload room content and information

## Security Checklist

- [ ] Changed default JWT_SECRET
- [ ] PostgreSQL only listens on localhost
- [ ] Nginx configured with SSL
- [ ] Firewall allows only ports 80, 443, 22
- [ ] Regular backups configured
- [ ] Strong passwords for orange PostgreSQL user
- [ ] PMS API using HTTPS
- [ ] Environment variables not committed to git

---

**Note:** This deployment removes Supabase dependency entirely and uses local PostgreSQL with PMS authentication.
