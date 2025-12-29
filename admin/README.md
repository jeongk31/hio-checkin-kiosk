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

## User Roles

1. **Super Admin**: Full access to all projects and settings
2. **Project Admin**: Access to their assigned project only
3. **Kiosk**: Limited access for kiosk device interface

## License

Private - All rights reserved
