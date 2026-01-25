# Environment Variables - Kiosk System

Complete reference for all environment variables used in the Hotel Check-in Kiosk System.

## Table of Contents

1. [Environment File Location](#environment-file-location)
2. [Complete .env Template](#complete-env-template)
3. [Variable Details](#variable-details)
4. [Production Configuration](#production-configuration)
5. [Security Best Practices](#security-best-practices)
6. [Troubleshooting](#troubleshooting)

---

## Environment File Location

**File**: `admin/.env`

**Important**:
- Never commit `.env` files to version control
- Add `.env` to `.gitignore`
- Use `.env.example` as a template (without secrets)

---

## Complete .env Template

```env
# =============================================================================
# Kiosk System - Environment Configuration
# =============================================================================
# Instructions:
# - For LOCAL development: Use localhost URLs (uncommented by default)
# - For PRODUCTION: Comment local URLs, uncomment production URLs
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

---

## Variable Details

### Database Configuration

#### POSTGRES_HOST

- **Value**: PostgreSQL server hostname or IP address
- **Purpose**: Database server location
- **Used by**: PostgreSQL connection pool
- **Required**: ✅ Yes
- **Default**: `localhost`
- **Example**:
  - Local: `localhost`
  - Production: `production-db.example.com` or IP address
- **Note**: Can be same server as HotelPMS but different database

#### POSTGRES_PORT

- **Value**: PostgreSQL server port
- **Purpose**: Database connection port
- **Used by**: PostgreSQL client
- **Required**: ✅ Yes
- **Default**: `5432` (PostgreSQL default)
- **Production**: Keep as `5432` unless custom port configured

#### POSTGRES_DATABASE

- **Value**: Database name
- **Purpose**: Kiosk system database
- **Used by**: All database operations
- **Required**: ✅ Yes
- **Default**: `kiosk`
- **Production**: Keep as `kiosk` or use `kiosk_production`
- **Important**: Separate from HotelPMS database (which uses `pms`)

#### POSTGRES_USER

- **Value**: PostgreSQL username
- **Purpose**: Database authentication
- **Used by**: PostgreSQL connection
- **Required**: ✅ Yes
- **Default**: `orange`
- **Production**: Use dedicated user with minimal privileges
- **Security**: ⚠️ Contains credentials - never commit to git

#### POSTGRES_PASSWORD

- **Value**: PostgreSQL user password
- **Purpose**: Database authentication
- **Used by**: PostgreSQL connection
- **Required**: ✅ Yes
- **Default**: `00oo00oo` (development only)
- **Production**: Use strong password (16+ characters, mixed case, numbers, symbols)
- **Security**: ⚠️ **CRITICAL** - Change default password immediately
- **Generate Strong Password**:
  ```powershell
  openssl rand -base64 24
  ```

---

### Application Configuration

#### JWT_SECRET

- **Value**: Secret key for signing JWT tokens (local sessions)
- **Purpose**: Session token generation and verification for admin dashboard
- **Used by**: Admin authentication, session management
- **Required**: ✅ Yes
- **Default**: Demo key (MUST change for production)
- **Security**: ⚠️ **CRITICAL** - Rotating this invalidates all active sessions
- **Production**: Generate with `openssl rand -hex 32`
- **Length**: 32+ bytes recommended

**Example Generation**:
```powershell
# Windows/Linux/macOS
openssl rand -hex 32

# Output example:
# 7f8e9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f
```

**Important Notes**:
- This is for **local admin sessions only**
- Primary authentication is via HotelPMS (PMS_AUTH_URL)
- HotelPMS uses its own JWT_SECRET_KEY
- Don't confuse kiosk JWT_SECRET with PMS JWT_SECRET_KEY

#### NEXT_PUBLIC_APP_URL

- **Value**: Kiosk application base URL
- **Purpose**: Client-side API calls, redirects, OAuth callbacks
- **Used by**: Next.js frontend, API routes
- **Required**: ✅ Yes
- **Default**: `http://localhost:3000`
- **Example**:
  - Local: `http://localhost:3000`
  - Production: `https://kiosk.hio.ai.kr`
- **Important**: Must match actual deployment URL
- **HTTPS Required**: Yes (production)

**Note**: `NEXT_PUBLIC_` prefix exposes variable to client-side code.

---

### External Integrations

#### useB API Configuration

**useB** provides ID card OCR and face authentication services.

##### USEB_EMAIL

- **Value**: useB account email
- **Purpose**: useB API authentication (ID verification)
- **Used by**: ID card OCR service, payment processing
- **Required**: ✅ Yes (for ID verification feature)
- **Default**: `test_stayg.dev@gmail.com` (demo account)
- **Production**: Register at https://useb.co.kr
- **Security**: ⚠️ Keep secret, rotate quarterly

##### USEB_PASSWORD

- **Value**: useB account password
- **Purpose**: useB API authentication
- **Used by**: ID card OCR service
- **Required**: ✅ Yes (for ID verification feature)
- **Default**: Demo password (development only)
- **Production**: Use production useB account credentials
- **Security**: ⚠️ **CRITICAL** - Store securely, never log
- **Note**: Must be quoted if contains special characters

**Important**: useB credentials are required for:
- Korean ID card scanning (OCR)
- Identity verification
- Guest registration compliance

**Free Tier**: useB may offer free tier for testing. Check their pricing page.

---

#### Face Authentication Configuration

##### FACE_CLIENT_ID

- **Value**: useB Face API client ID
- **Purpose**: Face authentication service
- **Used by**: Face verification during check-in
- **Required**: ❌ No (optional feature)
- **Default**: Demo client ID (development)
- **Production**: Generate from useB Face Server dashboard
- **Example**: `6tm6s6pts8lo3tks5lksjpbb5h`

##### FACE_CLIENT_SECRET

- **Value**: useB Face API client secret
- **Purpose**: Face authentication API secret
- **Used by**: Face verification service
- **Required**: ❌ No (optional feature)
- **Default**: Demo secret (development)
- **Production**: Generate from useB Face Server dashboard
- **Security**: ⚠️ Keep secret, rotate quarterly
- **Example**: `1tddlv9krucj399s4njr6kc57th2ithi9bubj2r5hoa3u0olbq2m`

**Important Notes**:
- Face authentication is an optional feature
- Requires separate useB Face Server subscription
- Used for enhanced security (ID + Face verification)
- Can be disabled if not needed

---

#### Payment Configuration

##### NEXT_PUBLIC_PAYMENT_AGENT_URL

- **Value**: VTR payment terminal server URL
- **Purpose**: Payment terminal integration (credit card processing)
- **Used by**: Payment screen, VTR terminal communication
- **Required**: ✅ Yes (for payment feature)
- **Default**: `http://localhost:8085`
- **Example**:
  - Local: `http://localhost:8085` (local VTR server)
  - Production: `http://<kiosk-ip>:8085` or `https://payment.example.com`
- **Important**: VtrRestServer must be running at this URL
- **HTTPS**: Not required (local network), but recommended for internet-facing deployments

**VTR Payment Terminal**:
- Separate payment terminal server (VtrRestServer)
- Handles credit card transactions
- Communicates via serial/USB with payment terminal hardware
- See [06-integrations.md](06-integrations.md#vtr-payment-terminal) for setup

**Note**: `NEXT_PUBLIC_` prefix makes URL available to client-side code.

---

#### PMS Integration Configuration

##### PMS_AUTH_URL

- **Value**: HotelPMS authentication API base URL
- **Purpose**: Central authentication provider
- **Used by**: Login flow, user verification, project sync
- **Required**: ✅ Yes
- **Default**: `http://localhost:8000`
- **Example**:
  - Local: `http://localhost:8000`
  - Production: `https://pmsapi.hio.ai.kr`
- **Important**: HotelPMS must be running at this URL

**Authentication Flow**:
1. User logs in to kiosk admin dashboard
2. Credentials sent to `PMS_AUTH_URL/api/v1/auth/login`
3. PMS verifies credentials and returns JWT token
4. Kiosk stores token for subsequent API calls

**Related Documentation**:
- [HotelPMS Integration](06-integrations.md#hotelpms-integration)
- [Authentication Flow](07-flows.md#admin-login-flow)

**Production Configuration**:
```env
# Local
PMS_AUTH_URL=http://localhost:8000

# Production
PMS_AUTH_URL=https://pmsapi.hio.ai.kr
```

---

## Production Configuration

### Production .env Template

```env
# =============================================================================
# Kiosk System - Production Configuration
# =============================================================================

# Database (use production database with strong password)
POSTGRES_HOST=production-db.example.com
POSTGRES_PORT=5432
POSTGRES_DATABASE=kiosk_production
POSTGRES_USER=kiosk_user
POSTGRES_PASSWORD=<STRONG-RANDOM-PASSWORD>

# JWT Secret (MUST use strong random secret!)
JWT_SECRET=<GENERATE-WITH-openssl-rand-hex-32>

# Application URL (production domain with HTTPS)
NEXT_PUBLIC_APP_URL=https://kiosk.hio.ai.kr

# useB API (production credentials)
USEB_EMAIL=production@yourhotel.com
USEB_PASSWORD="<PRODUCTION-PASSWORD>"

# Payment Agent (kiosk local server or centralized payment gateway)
NEXT_PUBLIC_PAYMENT_AGENT_URL=http://192.168.1.100:8085

# useB Face Server (production credentials)
FACE_CLIENT_ID=<PRODUCTION-CLIENT-ID>
FACE_CLIENT_SECRET=<PRODUCTION-CLIENT-SECRET>

# PMS Authentication (production PMS API)
PMS_AUTH_URL=https://pmsapi.hio.ai.kr
```

### Production Checklist

Before deploying to production:

- ✅ Change `POSTGRES_PASSWORD` to strong random password
- ✅ Generate new `JWT_SECRET` with `openssl rand -hex 32`
- ✅ Update `NEXT_PUBLIC_APP_URL` to production domain (HTTPS)
- ✅ Use production useB credentials (register at https://useb.co.kr)
- ✅ Configure production `PMS_AUTH_URL`
- ✅ Test all integrations (PMS, useB, VTR)
- ✅ Enable HTTPS (required for WebRTC video calls)
- ✅ Never commit production `.env` to git
- ✅ Use secret management tools (AWS Secrets Manager, Azure Key Vault, etc.)

---

## Security Best Practices

### 1. Never Commit Secrets

**Bad** ❌:
```bash
git add .env
git commit -m "Add config"
```

**Good** ✅:
```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore
git add .gitignore
```

### 2. Use Strong Random Secrets

**Generate JWT Secret**:
```powershell
openssl rand -hex 32
```

**Generate Database Password**:
```powershell
openssl rand -base64 24
```

### 3. Rotate Secrets Regularly

| Secret | Rotation Frequency |
|--------|-------------------|
| JWT_SECRET | Quarterly (every 3 months) |
| POSTGRES_PASSWORD | Annually |
| USEB_PASSWORD | Quarterly |
| FACE_CLIENT_SECRET | Quarterly |

**Note**: Rotating JWT_SECRET invalidates all active admin sessions.

### 4. Use Environment-Specific Files

```
.env.development    # Local development
.env.staging        # Staging environment
.env.production     # Production (never commit!)
```

### 5. Validate Environment Variables

Next.js automatically validates `NEXT_PUBLIC_` variables. For server-side validation:

```typescript
// lib/config.ts
export function validateEnv() {
  const required = [
    'POSTGRES_HOST',
    'POSTGRES_DATABASE',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'JWT_SECRET',
    'PMS_AUTH_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

### 6. Use Secret Management Tools

**Recommended for Production**:
- **AWS Secrets Manager**
- **Azure Key Vault**
- **HashiCorp Vault**
- **Docker Secrets** (for containerized deployments)
- **Kubernetes Secrets** (for K8s deployments)

### 7. Principle of Least Privilege

**Database User**:
- ✅ Grant only necessary permissions (SELECT, INSERT, UPDATE, DELETE on kiosk tables)
- ❌ Don't use superuser for application
- ✅ Use separate users for different environments (dev, staging, prod)

**Example**:
```sql
-- Create limited user
CREATE USER kiosk_app WITH PASSWORD 'strong_password';

-- Grant specific privileges
GRANT CONNECT ON DATABASE kiosk TO kiosk_app;
GRANT USAGE ON SCHEMA public TO kiosk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kiosk_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO kiosk_app;
```

---

## Troubleshooting

### Missing Environment Variable

**Error**: `Cannot read property 'X' of undefined` or `X is not defined`

**Solution**: Ensure `.env` file exists in `admin/` directory and contains all required variables.

```powershell
# Check if file exists
ls admin/.env

# Verify variables loaded
npm run dev
# Check console output for environment variable warnings
```

### Invalid Database Connection String

**Error**: `Connection refused` or `Authentication failed`

**Solution**: Verify database credentials:
```env
POSTGRES_HOST=localhost  # Check hostname
POSTGRES_PORT=5432       # Check port
POSTGRES_DATABASE=kiosk  # Check database name exists
POSTGRES_USER=orange     # Check user exists
POSTGRES_PASSWORD=00oo00oo  # Check password is correct
```

Test connection manually:
```powershell
psql -h localhost -p 5432 -U orange -d kiosk
```

### useB API Authentication Fails

**Error**: `useB login failed` or `Invalid credentials`

**Solution**:
1. Verify useB credentials are correct
2. Check useB account status (active subscription)
3. Test credentials on useB website
4. Ensure password is quoted if it contains special characters:
   ```env
   USEB_PASSWORD="password!@#$%"
   ```

### PMS Authentication Not Working

**Error**: `Cannot connect to PMS` or `PMS authentication failed`

**Solution**:
1. Verify HotelPMS is running:
   ```powershell
   curl http://localhost:8000/api/v1/health
   ```
2. Check `PMS_AUTH_URL` matches PMS server:
   ```env
   PMS_AUTH_URL=http://localhost:8000
   ```
3. Verify user has `kiosk` access in PMS `allowed_systems`

### NEXT_PUBLIC Variables Not Available

**Error**: `undefined` in client-side code

**Solution**:
1. Ensure variable is prefixed with `NEXT_PUBLIC_`:
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3000  ✅
   APP_URL=http://localhost:3000              ❌
   ```
2. Restart Next.js dev server after changing `.env`
3. Clear Next.js cache:
   ```powershell
   rm -rf .next
   npm run dev
   ```

---

## Related Documentation

- [02 - Setup](02-setup.md) - Local development setup
- [06 - Integrations](06-integrations.md) - Integration configuration
- [08 - Deployment](08-deployment.md) - Production deployment
- [09 - Troubleshooting](09-troubleshooting.md) - Common issues

---

**Previous**: [← 02 - Setup](02-setup.md) | **Next**: [04 - Features →](04-features.md)
