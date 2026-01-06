# Hotel Check-in Kiosk System

A self-service hotel check-in kiosk system built with Next.js and PostgreSQL.

## Features

- **Multi-tenant Support**: Multiple hotels/projects with separate data
- **Role-based Access Control**: Super Admin, Project Admin, and Kiosk users
- **Room Management**: Room types, individual rooms, daily availability
- **Reservation System**: Reservation validation and check-in tracking
- **Identity Verification**: Integration with ID verification services
- **Payment Integration**: Support for payment processing
- **Voice/Video Calls**: WebRTC-based communication between kiosk and staff

## Tech Stack

- **Frontend**: Next.js 14 with App Router
- **Database**: PostgreSQL
- **Authentication**: JWT-based sessions
- **Styling**: Tailwind CSS

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Setup

### 1. Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE kiosk;
CREATE USER orange WITH PASSWORD '00oo00oo';
GRANT ALL PRIVILEGES ON DATABASE kiosk TO orange;
\c kiosk
GRANT ALL ON SCHEMA public TO orange;
```

### 2. Install Dependencies

```bash
cd admin
npm install
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your settings:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kiosk
POSTGRES_USER=orange
POSTGRES_PASSWORD=00oo00oo
JWT_SECRET=your-super-secret-jwt-key-change-in-production
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Initialize Database

From the project root:

```bash
# Install dependencies for setup script
npm install pg bcryptjs

# Run database setup (creates tables and admin user)
node setup-db.js
```

Or manually apply the schema:

```bash
psql -U orange -d kiosk -f database/schema.sql
cd admin
node scripts/seed-db.js
```

### 5. Start Development Server

```bash
cd admin
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Default Admin Account

- **Email**: admin@admin.com
- **Password**: admin123

## Project Structure

```
admin/
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── (auth)/          # Authentication pages
│   │   ├── (dashboard)/     # Admin dashboard
│   │   ├── (kiosk)/         # Kiosk interface
│   │   └── api/             # API routes
│   ├── components/          # React components
│   ├── contexts/            # React contexts
│   ├── hooks/               # Custom hooks
│   ├── lib/                 # Utilities
│   │   ├── db/             # Database utilities
│   │   └── auth.ts         # Authentication helpers
│   └── types/              # TypeScript types
├── public/                  # Static assets
└── database/
    └── schema.sql          # Database schema
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/projects` | GET | List projects |
| `/api/rooms` | GET/POST/PUT/DELETE | Manage rooms |
| `/api/room-types` | GET/POST/PUT/DELETE | Manage room types |
| `/api/reservations` | GET/POST/PUT/DELETE | Manage reservations |
| `/api/profiles` | GET | List user profiles |
| `/api/accounts/create` | POST | Create user account |
| `/api/sync` | POST | Sync projects/users from PMS |
| `/api/cron/daily-reset` | POST/GET | Daily room reset cron |

## Cron Jobs

### Daily Room Reset

The system supports automatic daily room reset for each project. Each project can configure its own reset time.

**Setting up the cron job:**

#### Option 1: Linux/Docker crontab

Add to your crontab (`crontab -e`):

```bash
# Check daily reset every minute (KST timezone)
* * * * * curl -s -X POST http://localhost:3000/api/cron/daily-reset -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### Option 2: Docker Compose with cron service

```yaml
services:
  cron:
    image: alpine:latest
    command: sh -c "while true; do curl -s -X POST http://kiosk:3000/api/cron/daily-reset; sleep 60; done"
    depends_on:
      - kiosk
```

#### Option 3: Vercel Cron (if deployed on Vercel)

Add to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/daily-reset",
    "schedule": "* * * * *"
  }]
}
```

**Configuring reset time per project:**

1. Access project settings in admin dashboard
2. Set `daily_reset_time` in project settings (format: "HH:mm" in KST)
3. Example: "06:00" for 6 AM KST daily reset

**Environment variable (optional security):**

```env
CRON_SECRET=your-secure-cron-secret
```

**Testing the cron:**

```bash
# Check status
curl http://localhost:3000/api/cron/daily-reset

# Trigger reset manually
curl -X POST http://localhost:3000/api/cron/daily-reset
```

## User Roles

1. **Super Admin**: Full access to all projects and settings
2. **Project Admin**: Access to their assigned project only
3. **Kiosk**: Limited access for kiosk device interface

## License

Private - All rights reserved
