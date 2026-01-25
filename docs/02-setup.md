# Local Development Setup - Kiosk System

Complete guide to setting up the Hotel Check-in Kiosk System for local development.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Application Setup](#application-setup)
4. [Environment Configuration](#environment-configuration)
5. [Running the Application](#running-the-application)
6. [Verification](#verification)
7. [Kiosk Device Configuration](#kiosk-device-configuration)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

1. **Node.js 18+**
   ```powershell
   # Download from https://nodejs.org/
   # Verify installation
   node --version  # Should show v18.x or higher
   npm --version   # Should show 9.x or higher
   ```

2. **PostgreSQL 14+**
   ```powershell
   # Download from https://www.postgresql.org/download/
   # Verify installation
   psql --version  # Should show PostgreSQL 14.x or higher
   ```

3. **Git** (for cloning repository)
   ```powershell
   git --version
   ```

### Optional Software

- **pgAdmin 4** - GUI for PostgreSQL management
- **Postman** - API testing
- **VS Code** - Recommended code editor with extensions:
  - ESLint
  - Prettier
  - TypeScript and JavaScript Language Features

---

## Database Setup

### Step 1: Create Database and User

Connect to PostgreSQL as superuser:

```powershell
# Windows (PowerShell as Administrator)
psql -U postgres

# Linux/macOS
sudo -u postgres psql
```

Create database and user:

```sql
-- Create database
CREATE DATABASE kiosk;

-- Create user
CREATE USER orange WITH PASSWORD '00oo00oo';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE kiosk TO orange;

-- Connect to kiosk database
\c kiosk

-- Grant schema privileges (PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO orange;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO orange;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO orange;

-- Exit psql
\q
```

### Step 2: Apply Database Schema

Navigate to the kiosk project directory and apply the schema:

```powershell
# Navigate to project root
cd d:\GitHub\Hotel\hio-checkin-kiosk

# Apply database schema
psql -U orange -d kiosk -f database/schema.sql
```

**Expected Output**:
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
...
(13 tables created)
```

**Database Tables Created**:
- users
- profiles
- projects
- kiosks
- room_types
- rooms
- reservations
- video_sessions
- signaling_messages
- kiosk_control_commands
- kiosk_screen_frames
- identity_verifications
- payments

### Step 3: Verify Database Schema

```powershell
# Connect to database
psql -U orange -d kiosk

# List all tables
\dt

# View table structure (example)
\d users

# Exit
\q
```

### Step 4: Seed Initial Admin User

```powershell
# Navigate to admin directory
cd admin

# Run seed script
node scripts/seed-db.js
```

**Default Admin Credentials**:
- **Email**: `admin@admin.com`
- **Password**: `admin123`

**Important**: Change these credentials immediately after first login in production.

---

## Application Setup

### Step 1: Clone Repository

```powershell
# If not already cloned
cd d:\GitHub\Hotel
git clone <repository-url> hio-checkin-kiosk
cd hio-checkin-kiosk
```

### Step 2: Install Dependencies

```powershell
# Install all dependencies
npm install

# Or use admin subdirectory if applicable
cd admin
npm install
```

**Expected Output**:
```
added XXX packages in XXs
```

### Step 3: Verify Installation

```powershell
# Check installed packages
npm list --depth=0

# Key dependencies should include:
# - next
# - react
# - typescript
# - pg (PostgreSQL client)
```

---

## Environment Configuration

### Step 1: Create Environment File

```powershell
# Copy example file (if exists)
cp admin/.env.example admin/.env

# Or create new file
New-Item -Path "admin/.env" -ItemType File
```

### Step 2: Configure Environment Variables

Edit `admin/.env` with the following configuration:

```env
# =============================================================================
# Kiosk System - Environment Configuration
# =============================================================================

# PostgreSQL Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kiosk
POSTGRES_USER=orange
POSTGRES_PASSWORD=00oo00oo

# JWT Secret for session management
# IMPORTANT: Change in production to a strong random string
JWT_SECRET=your-super-secret-jwt-key-change-in-production-to-a-long-random-string

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# useB API Credentials (ID OCR/Verification)
# Get credentials from https://useb.co.kr
USEB_EMAIL=test_stayg.dev@gmail.com
USEB_PASSWORD="stayg.dev251215!@#"

# Payment Agent URL (VTR Terminal Server)
NEXT_PUBLIC_PAYMENT_AGENT_URL=http://localhost:8085

# useB Face Server Credentials
# For face authentication feature
FACE_CLIENT_ID=6tm6s6pts8lo3tks5lksjpbb5h
FACE_CLIENT_SECRET=1tddlv9krucj399s4njr6kc57th2ithi9bubj2r5hoa3u0olbq2m

# PMS Authentication API URL
# Central authentication server (HotelPMS)
# Local development
PMS_AUTH_URL=http://localhost:8000
# Production (uncomment for production)
# PMS_AUTH_URL=https://pmsapi.hio.ai.kr
```

**Important Notes**:
- Never commit `.env` files to git
- Use strong random secrets in production
- useB credentials are for demo/development only

For complete environment variable reference, see [03-env.md](03-env.md).

---

## Running the Application

### Step 1: Start HotelPMS (Required)

The kiosk system requires HotelPMS for authentication. Start PMS first:

```powershell
# In separate terminal
cd d:\GitHub\Hotel\HotelPMS\backend
python -m app.main

# Verify PMS is running
# Open http://localhost:8000/docs
```

See [HotelPMS setup guide](../../HotelPMS/docs/02-setup.md) for details.

### Step 2: Start Kiosk Development Server

```powershell
# Navigate to admin directory
cd admin

# Start development server
npm run dev
```

**Expected Output**:
```
> admin@0.1.0 dev
> next dev

ready - started server on 0.0.0.0:3000, url: http://localhost:3000
event - compiled client and server successfully
```

### Step 3: Access Application

Open your browser and navigate to:

- **Admin Dashboard**: http://localhost:3000/admin
- **Kiosk Interface**: http://localhost:3000

**Login with seeded admin credentials**:
- Email: `admin@admin.com`
- Password: `admin123`

---

## Verification

### 1. Database Connection Test

```powershell
# Test PostgreSQL connection
psql -U orange -d kiosk -c "SELECT NOW();"
```

**Expected Output**: Current timestamp

### 2. API Routes Test

Open http://localhost:3000/api/test (if test route exists) or check browser console for errors.

### 3. Admin Dashboard Access

1. Navigate to http://localhost:3000/admin
2. Login with admin credentials
3. Verify dashboard loads successfully
4. Check for any console errors (F12 → Console)

### 4. Kiosk Interface Test

1. Navigate to http://localhost:3000
2. Verify kiosk welcome screen appears
3. Test screen navigation (keyboard shortcuts)
4. Check video call button appears

### 5. Development Keyboard Shortcuts

In kiosk mode (http://localhost:3000), use keyboard shortcuts for testing:

- `1` - Welcome screen
- `2` - Guest information screen
- `3` - ID verification screen
- `4` - Payment screen
- `5` - Completion screen
- `ESC` - Close modals/dialogs

---

## Kiosk Device Configuration

### Touchscreen Kiosk Setup

For production kiosk hardware:

1. **Install Node.js 18+ on kiosk device** (Windows/Linux)

2. **Configure browser for kiosk mode**:
   ```powershell
   # Chrome kiosk mode (Windows)
   chrome.exe --kiosk --app=http://localhost:3000

   # Or use Edge
   msedge.exe --kiosk --app=http://localhost:3000
   ```

3. **Disable OS UI elements**:
   - Hide taskbar
   - Disable screensaver
   - Auto-login on boot
   - Launch browser on startup

4. **Configure peripherals**:
   - Connect ID card scanner (USB/Serial)
   - Connect VTR payment terminal (USB/Serial)
   - Configure webcam for video calls
   - Test touchscreen calibration

5. **Network configuration**:
   - Static IP address (recommended)
   - Firewall: Allow ports 3000, 5432
   - VPN for remote management (optional)

### Auto-Start Configuration (Windows)

Create startup script:

```powershell
# Create kiosk-start.bat
@echo off
cd C:\kiosk\hio-checkin-kiosk\admin
start npm run start
timeout /t 10
start chrome.exe --kiosk --app=http://localhost:3000
```

Add to Windows Startup folder:
```
C:\Users\<Username>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

---

## Troubleshooting

### Database Connection Errors

**Error**: `Connection refused` or `password authentication failed`

**Solutions**:
1. Verify PostgreSQL is running:
   ```powershell
   # Windows
   Get-Service -Name postgresql*

   # Start if stopped
   net start postgresql-x64-16
   ```

2. Check credentials in `.env`:
   ```env
   POSTGRES_USER=orange
   POSTGRES_PASSWORD=00oo00oo
   POSTGRES_DATABASE=kiosk
   ```

3. Test connection manually:
   ```powershell
   psql -U orange -d kiosk
   ```

---

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solutions**:
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill process (Windows)
taskkill /PID <PID> /F

# Or use different port
npm run dev -- -p 3001
```

---

### npm install Fails

**Error**: `ERESOLVE unable to resolve dependency tree`

**Solutions**:
```powershell
# Clear cache
npm cache clean --force

# Delete node_modules and package-lock
rm -rf node_modules package-lock.json

# Reinstall with legacy peer deps
npm install --legacy-peer-deps

# Or force install
npm install --force
```

---

### Missing .env File

**Error**: `Cannot find module` or undefined environment variables

**Solution**: Ensure `admin/.env` exists with all required variables.

```powershell
# Check if file exists
ls admin/.env

# Create if missing
New-Item -Path "admin/.env" -ItemType File
```

---

### PMS Authentication Fails

**Error**: `Authentication failed` or `Cannot connect to PMS`

**Solutions**:
1. Verify HotelPMS is running at http://localhost:8000
2. Check `PMS_AUTH_URL` in `.env`:
   ```env
   PMS_AUTH_URL=http://localhost:8000
   ```
3. Verify user has `kiosk` access in PMS allowed_systems

---

### useB API Errors

**Error**: `useB authentication failed` or `Invalid API credentials`

**Solutions**:
1. Verify useB credentials in `.env`
2. Check useB API status (external service)
3. Test with useB sandbox credentials (if available)
4. Contact useB support for API key verification

---

### Video Call Not Working

**Issue**: Video call button doesn't start call

**Solutions**:
1. Grant browser camera/microphone permissions
2. Use HTTPS in production (WebRTC requirement)
3. Check firewall allows WebRTC ports
4. Verify webcam is connected and working

---

## Next Steps

After successful setup:

1. **Explore the admin dashboard**:
   - Create a test project
   - Add room types
   - Register a kiosk device

2. **Test the kiosk flow**:
   - Navigate through all 5 screens
   - Test ID verification (with test images if no scanner)
   - Test video call feature

3. **Review documentation**:
   - [03 - Environment Variables](03-env.md)
   - [04 - Features](04-features.md)
   - [06 - Integrations](06-integrations.md)

4. **Configure integrations**:
   - Set up PMS authentication
   - Configure useB API (ID verification)
   - Connect VTR payment terminal

---

## Related Documentation

- [00 - Overview](00-overview.md) - System overview
- [03 - Environment Variables](03-env.md) - Complete env var reference
- [06 - Integrations](06-integrations.md) - PMS, useB, VTR integration
- [09 - Troubleshooting](09-troubleshooting.md) - Common issues

---

**Previous**: [← 00 - Overview](00-overview.md) | **Next**: [03 - Environment Variables →](03-env.md)
