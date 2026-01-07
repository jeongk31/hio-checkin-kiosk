# Hotel Check-in Kiosk System

A modern hotel check-in kiosk system with admin dashboard, built for Korean motel/hotel environments.

## Features

### Kiosk Interface
1. **Welcome Screen** - Start check-in process
2. **Guest Information** - Name, phone number, email, number of guests
3. **ID Verification** - ID card scanning and verification
4. **Payment** - Reservation confirmation and payment method selection
5. **Completion** - Room number and access code display

### Staff Call System
- Video call support from any kiosk screen via "Call Staff" button
- Real-time WebRTC communication for guest assistance

### Admin Dashboard
- **Project Management** - Multi-property support
- **Kiosk Management** - Monitor and control kiosks remotely
- **Room Management** - Room types, availability, and assignments
- **Content Management** - Customize kiosk content per project
- **Video Call Management** - Handle incoming calls from kiosks
- **User Management** - Admin, project admin, and staff accounts

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- WebRTC for video calls

### Backend
- PostgreSQL database
- Next.js API Routes
- JWT authentication with bcrypt
- Server-side rendering

### APIs
- useB API integration (identity verification, payment processing)

## Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Database Setup

1. Create PostgreSQL database and user:
```sql
CREATE DATABASE kiosk;
CREATE USER orange WITH PASSWORD '00oo00oo';
GRANT ALL PRIVILEGES ON DATABASE kiosk TO orange;
```

2. Apply database schema:
```bash
psql -U orange -d kiosk -f database/schema.sql
```

3. Seed initial admin user:
```bash
cd admin
node scripts/seed-db.js
```

Default admin credentials:
- Email: admin@admin.com
- Password: admin123

### Environment Configuration

Create `admin/.env` from the example file:
```bash
cp admin/.env.example admin/.env
```

Edit `admin/.env`:
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kiosk
POSTGRES_USER=orange
POSTGRES_PASSWORD=00oo00oo

# Authentication
JWT_SECRET=your-secure-random-string-here

# PMS Authentication (for centralized auth)
# Local
PMS_AUTH_URL=http://localhost:8000
# Production (uncomment for production)
# PMS_AUTH_URL=https://pmsapi.hio.ai.kr

# useB API (Optional)
USEB_API_KEY=your-useb-api-key
USEB_SECRET_KEY=your-useb-secret-key
USEB_MERCHANT_ID=your-merchant-id
```

### Start Development Server

```bash
cd admin
npm install
npm run dev
```

Access at: http://localhost:3000

## Database Schema

- **users** - Authentication
- **profiles** - User profiles and roles
- **projects** - Multi-property management
- **kiosks** - Kiosk registration and status
- **room_types** - Room categories and pricing
- **rooms** - Individual room inventory
- **reservations** - Guest bookings
- **video_sessions** - Video call sessions
- **signaling_messages** - WebRTC signaling
- **kiosk_control_commands** - Remote kiosk control
- **kiosk_screen_frames** - Screen streaming
- **identity_verifications** - ID verification records
- **payments** - Payment transactions

## User Roles

- **super_admin** - Full system access
- **project_admin** - Single property management
- **staff** - Front desk operations
- **kiosk** - Kiosk device accounts

## Development Keyboard Shortcuts

In kiosk mode:
- `1` - Welcome screen
- `2` - Guest information
- `3` - ID verification
- `4` - Payment
- `5` - Completion
- `ESC` - Close modals

## Production Deployment

### Build
```bash
cd admin
npm run build
```

### Environment Variables
Set all environment variables in your hosting platform (Vercel, AWS, etc.)

### Database
- Use managed PostgreSQL (AWS RDS, DigitalOcean, etc.)
- Enable SSL connections
- Set up automated backups
- Configure connection pooling

## Architecture

- **Polling-based real-time updates** - No WebSocket dependencies
- **JWT session management** - Secure cookie-based auth
- **WebRTC for video calls** - Direct peer-to-peer communication
- **PostgreSQL RLS policies** - Row-level security (commented out, application-level auth used)

## Notes

- This system uses PostgreSQL with application-level authentication
- Real-time features use polling (configurable intervals)
- WebRTC requires HTTPS in production
- useB API integration requires valid credentials for ID verification and payments

## License

Proprietary - All rights reserved
