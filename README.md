# Hotel Check-in Kiosk System

Self-service check-in kiosk for hotel guests with multi-property admin dashboard.

## Quick Start

- [Full Documentation](docs/00-overview.md)
- [Setup Guide](docs/02-setup.md)
- [Integration Guide](docs/06-integrations.md)

## Key Features

### Kiosk Interface
- **5-Screen Check-in Flow**: Welcome → Guest Info → ID Verification → Payment → Completion
- **ID Verification**: Korean ID card scanning via useB API
- **Face Authentication**: useB face recognition integration
- **Payment Processing**: VTR payment terminal integration
- **Video Call Support**: WebRTC-based staff assistance from any screen

### Admin Dashboard
- **Multi-Project Management**: Support for multiple properties
- **Kiosk Monitoring**: Real-time kiosk status and control
- **Room Management**: Room types, availability, and assignments
- **Content Management**: Customize kiosk UI per project
- **Video Call Handling**: Respond to guest video calls
- **User Management**: Admin, project admin, and staff accounts

## Technology

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (shared server with PMS)
- **Styling**: Tailwind CSS
- **Video**: WebRTC (polling-based signaling)
- **APIs**: useB (ID/Face), VTR (Payment)

## Integration

This system integrates with:
- [HotelPMS](../HotelPMS) - Central authentication provider and project management
- **useB API** - ID verification and face recognition
- **VTR Payment Terminal** - Payment processing

See [docs/06-integrations.md](docs/06-integrations.md) for integration details.

## User Roles

- **super_admin** - Full system access
- **project_admin** - Single property management
- **staff** - Front desk operations
- **kiosk** - Kiosk device accounts

## Quick Links

- **Kiosk**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin
- **API Routes**: http://localhost:3000/api/*

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Documentation

For complete documentation, see:

- [Overview](docs/00-overview.md) - System overview and features
- [Architecture](docs/01-architecture.md) - Technical architecture and design
- [Setup](docs/02-setup.md) - Local development setup
- [Environment Variables](docs/03-env.md) - Configuration reference
- [Features](docs/04-features.md) - Feature documentation
- [Data Models](docs/05-data-models.md) - Database schema
- [Integrations](docs/06-integrations.md) - PMS, useB, VTR integration
- [Flows](docs/07-flows.md) - Check-in and video call workflows
- [Deployment](docs/08-deployment.md) - Production deployment
- [Troubleshooting](docs/09-troubleshooting.md) - Common issues and solutions

## License

Proprietary - All rights reserved
