# System Overview - Hotel Check-in Kiosk

Comprehensive overview of the Hotel Check-in Kiosk System.

## Table of Contents

1. [What is the Kiosk System?](#what-is-the-kiosk-system)
2. [Who Uses This System?](#who-uses-this-system)
3. [Key Components](#key-components)
4. [Business Value](#business-value)
5. [Use Cases](#use-cases)
6. [System Requirements](#system-requirements)

---

## What is the Kiosk System?

The **Hotel Check-in Kiosk System** is a self-service guest check-in solution designed for Korean motel and hotel environments. It provides:

- **Guest-facing kiosk interface** for self-service check-in
- **Admin dashboard** for multi-property management
- **Video call system** for remote staff assistance
- **Integration with hotel PMS** for centralized management

The system enables hotels to:
- Reduce front desk workload
- Provide 24/7 self-service check-in
- Streamline guest onboarding
- Comply with Korean hospitality regulations (ID verification, registration)

---

## Who Uses This System?

### Primary Users

#### 1. Hotel Guests
- **Use**: Self-service check-in kiosks
- **Goal**: Fast, contactless check-in experience
- **Actions**:
  - Enter personal information
  - Scan Korean ID card
  - Verify face authentication
  - Complete payment
  - Receive room number and access code

#### 2. Hotel Staff
- **Use**: Admin dashboard, video call system
- **Role**: Front desk operations and guest support
- **Actions**:
  - Monitor kiosk status
  - Respond to guest video calls
  - Manage room availability
  - Review check-in records

#### 3. Property Managers
- **Use**: Admin dashboard
- **Role**: Single property management
- **Actions**:
  - Configure kiosk settings
  - Manage room types and pricing
  - Customize kiosk UI content
  - View check-in analytics

#### 4. System Administrators
- **Use**: Admin dashboard
- **Role**: Multi-property oversight
- **Actions**:
  - Create and manage projects (properties)
  - Register and configure kiosks
  - Manage user accounts
  - Monitor system health

---

## Key Components

### 1. Kiosk Interface

**5-Screen Guest Check-in Flow**:

1. **Welcome Screen**
   - Start check-in button
   - Language selection (Korean/English)
   - Call staff button

2. **Guest Information**
   - Name (Korean/English)
   - Phone number
   - Email address
   - Number of guests

3. **ID Verification**
   - Korean ID card scanning (useB OCR API)
   - Face authentication (useB Face API)
   - Real-time verification

4. **Payment**
   - Reservation summary
   - Room rate display
   - Payment method selection
   - VTR payment terminal integration

5. **Completion**
   - Room number display
   - Access code/PIN
   - Check-in confirmation
   - Directions to room

**Video Call System**:
- Available from any screen
- WebRTC-based real-time communication
- Polling-based signaling (no WebSocket required)
- Screen sharing to staff

### 2. Admin Dashboard

**Multi-Property Management**:
- Project (property) creation and configuration
- Centralized room inventory management
- Real-time kiosk monitoring
- Check-in history and analytics

**Kiosk Management**:
- Remote kiosk registration
- Real-time status monitoring (online/offline/in-use)
- Screen streaming and control
- Configuration updates

**Room Management**:
- Room type definitions (Standard, Deluxe, Suite, etc.)
- Pricing and availability
- Room assignment and status
- Bulk operations

**Content Management**:
- Kiosk UI customization per project
- Welcome messages
- Terms and conditions
- Promotional content

**Video Call Management**:
- Incoming call notifications
- Multi-kiosk call handling
- Call history and duration tracking

**User Management**:
- User account creation (Admin, Project Admin, Staff, Kiosk)
- Role-based access control
- Project assignment for Team Leaders

---

## Business Value

### For Hotel Owners

**Cost Reduction**:
- Reduce front desk staffing requirements
- 24/7 operations without additional labor
- Lower training costs (simplified operations)

**Revenue Optimization**:
- Faster check-in = higher turnover
- Reduced no-shows (payment at check-in)
- Upselling opportunities (room upgrades)

**Compliance**:
- Automatic ID verification (Korean law requirement)
- Guest registration records
- Payment receipts and audit trails

### For Hotel Guests

**Convenience**:
- Fast check-in (average 3-5 minutes)
- No waiting in line
- 24/7 availability
- Contactless experience

**Privacy**:
- Self-service reduces human interaction
- Secure ID and face verification
- Private payment processing

### For Hotel Staff

**Efficiency**:
- Focus on guest service, not paperwork
- Remote assistance via video call
- Centralized multi-property management

**Flexibility**:
- Monitor and manage from anywhere
- Handle multiple properties simultaneously
- Respond to issues in real-time

---

## Use Cases

### Use Case 1: Late-Night Self Check-In

**Scenario**: Guest arrives at 2 AM after front desk closes.

**Flow**:
1. Guest approaches kiosk
2. Selects language and starts check-in
3. Enters personal information
4. Scans Korean ID card (auto-populated fields)
5. Completes face verification
6. Pays via credit card (VTR terminal)
7. Receives room number and access code
8. Enters room

**Outcome**: Seamless check-in without staff intervention.

---

### Use Case 2: Multi-Property Management

**Scenario**: Hotel chain operates 10 properties across Seoul.

**Setup**:
1. Admin creates 10 projects in dashboard
2. Each property has dedicated kiosks
3. Property managers assigned per location
4. Centralized monitoring dashboard

**Operations**:
- View all kiosks across properties in one dashboard
- Monitor check-in rates per property
- Update room rates centrally
- Handle video calls from any property

**Outcome**: Centralized operations with local control.

---

### Use Case 3: Guest Assistance via Video Call

**Scenario**: Guest encounters issue during check-in (ID not scanning).

**Flow**:
1. Guest taps "Call Staff" button
2. Video call initiated (WebRTC)
3. Staff receives notification in admin dashboard
4. Staff answers call, sees guest and kiosk screen
5. Staff provides instructions (retry scan, manual entry)
6. Issue resolved, guest completes check-in

**Outcome**: Remote assistance without physical presence.

---

### Use Case 4: Kiosk Hardware Failure

**Scenario**: Kiosk goes offline during guest check-in.

**Detection**:
- Admin dashboard shows kiosk status: OFFLINE
- Automatic alert to staff

**Recovery**:
1. Staff checks kiosk remotely via dashboard
2. Views last screen state
3. Assists guest via backup kiosk or manual check-in
4. Logs maintenance request

**Outcome**: Minimal guest impact, proactive issue resolution.

---

## System Requirements

### Kiosk Hardware

**Minimum Specifications**:
- **OS**: Windows 10/11 or Linux
- **CPU**: Intel i3 or equivalent (2+ cores)
- **RAM**: 4 GB minimum, 8 GB recommended
- **Storage**: 128 GB SSD
- **Display**: Touchscreen (19" - 27")
- **Network**: Ethernet or WiFi (stable connection required)
- **Camera**: HD webcam for video calls
- **Peripherals**:
  - ID card scanner (Korean ID compatible)
  - VTR payment terminal (serial or USB)
  - Receipt printer (optional)

**Recommended Setup**:
- 24" touchscreen kiosk enclosure
- Barcode/ID scanner integrated
- Payment terminal with NFC support
- Thermal receipt printer
- UPS backup power

### Server Requirements

**Development**:
- Node.js 18+
- PostgreSQL 14+
- 2 GB RAM minimum

**Production**:
- Node.js 18+ (LTS)
- PostgreSQL 14+ with SSL
- 4 GB RAM minimum
- 50 GB storage
- Load balancer for multiple kiosks
- Redis for session caching (optional)

### Network Requirements

**Bandwidth**:
- 5 Mbps minimum per kiosk (10+ Mbps recommended)
- 100 Mbps for admin dashboard
- Low latency (<50ms) for video calls

**Ports**:
- 3000 (Next.js app)
- 5432 (PostgreSQL)
- 8085 (VTR payment server, if local)

**Security**:
- HTTPS required for production
- TLS 1.2+ for database connections
- VPN for remote kiosk access (recommended)

---

## Integration Overview

The Kiosk System integrates with:

1. **HotelPMS** - Central authentication and project management
2. **useB API** - ID verification and face recognition
3. **VTR Payment Server** - Payment terminal integration

For detailed integration documentation, see:
- [06 - Integrations](06-integrations.md)
- [07 - Flows](07-flows.md)

---

## Related Documentation

- [01 - Architecture](01-architecture.md) - Technical architecture
- [02 - Setup](02-setup.md) - Local development setup
- [04 - Features](04-features.md) - Detailed feature documentation
- [05 - Data Models](05-data-models.md) - Database schema

---

**Next**: [01 - Architecture →](01-architecture.md)
