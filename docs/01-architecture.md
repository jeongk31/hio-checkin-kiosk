# Architecture - Kiosk System

Technical architecture and design of the Hotel Check-in Kiosk System.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Application Structure](#application-structure)
4. [Database Architecture](#database-architecture)
5. [Integration Architecture](#integration-architecture)
6. [Video Call Architecture](#video-call-architecture)
7. [Security Architecture](#security-architecture)

---

## System Architecture

### High-Level Overview

```mermaid
graph TB
    subgraph Guest["Guest Interaction"]
        Kiosk_UI[Kiosk Interface<br/>Touch Screen]
    end

    subgraph Staff["Staff Operations"]
        Admin[Admin Dashboard<br/>Web Browser]
    end

    subgraph Application["Next.js Application"]
        Frontend[React Frontend<br/>Kiosk & Admin UI]
        API[API Routes<br/>Next.js Backend]
    end

    subgraph Data["Data Layer"]
        DB[(PostgreSQL<br/>Kiosk Database)]
    end

    subgraph External["External Services"]
        PMS[HotelPMS<br/>Central Auth]
        useB[useB API<br/>ID & Face]
        VTR[VTR Terminal<br/>Payment]
    end

    Kiosk_UI -->|User Actions| Frontend
    Admin -->|Management| Frontend
    Frontend -->|API Calls| API
    API -->|CRUD Operations| DB
    API -->|JWT Auth| PMS
    API -->|ID Scan| useB
    API -->|Payment| VTR

    style Kiosk_UI fill:#e1f5ff
    style Admin fill:#e1f5ff
    style Frontend fill:#fff4e6
    style API fill:#fff4e6
    style DB fill:#e8f5e9
    style PMS fill:#ffe0b2
    style useB fill:#ffe0b2
    style VTR fill:#ffe0b2
```

**Components**:
- **Kiosk Interface**: Guest-facing touchscreen UI
- **Admin Dashboard**: Staff management interface
- **Next.js Application**: Full-stack framework (frontend + API routes)
- **PostgreSQL**: Relational database
- **External Services**: PMS (auth), useB (ID/face), VTR (payment)

---

## Technology Stack

### Frontend

```mermaid
graph LR
    subgraph Frontend["Frontend Stack"]
        React[React 18<br/>UI Library]
        Next[Next.js 14<br/>App Router]
        TS[TypeScript<br/>Type Safety]
        Tailwind[Tailwind CSS<br/>Styling]
    end

    subgraph Libraries["Supporting Libraries"]
        WebRTC[WebRTC<br/>Video Calls]
        Hooks[React Hooks<br/>State Management]
    end

    Next --> React
    TS --> Next
    Tailwind --> Next
    WebRTC --> React
    Hooks --> React

    style React fill:#61dafb
    style Next fill:#000000,color:#fff
    style TS fill:#3178c6,color:#fff
    style Tailwind fill:#38bdf8
```

**Key Technologies**:

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14 (App Router) | Full-stack React framework |
| React | 18 | UI library |
| TypeScript | Latest | Type safety |
| Tailwind CSS | Latest | Utility-first styling |
| WebRTC | Native | Video call support |

**Why Next.js App Router?**
- Server-side rendering (SSR) for faster initial load
- API routes for backend logic (no separate server)
- File-based routing (`app/` directory)
- Built-in optimization (images, fonts, etc.)

---

### Backend

```mermaid
graph TB
    subgraph API["Next.js API Routes"]
        Auth[/api/auth]
        Projects[/api/projects]
        Kiosks[/api/kiosks]
        Rooms[/api/rooms]
        Video[/api/video]
        PMS_Sync[/api/pms/project-sync]
    end

    subgraph Database["PostgreSQL"]
        DB[(kiosk database<br/>13 tables)]
    end

    subgraph External["External APIs"]
        PMS_API[HotelPMS API<br/>JWT Auth]
        useB_API[useB API<br/>ID/Face]
        VTR_API[VTR Server<br/>Payment]
    end

    Auth --> DB
    Projects --> DB
    Kiosks --> DB
    Rooms --> DB
    Video --> DB

    Auth -.->|Verify User| PMS_API
    Projects -.->|Scan ID| useB_API
    Rooms -.->|Process Payment| VTR_API
    PMS_Sync -->|Sync Data| DB

    style API fill:#fff4e6
    style DB fill:#e8f5e9
    style External fill:#ffe0b2
```

**API Routes Structure**:
```
admin/app/api/
├── auth/
│   ├── login/route.ts          # PMS authentication
│   └── logout/route.ts         # Session cleanup
├── projects/
│   ├── route.ts                # List/create projects
│   └── [id]/route.ts           # Get/update/delete project
├── kiosks/
│   ├── route.ts                # List/create kiosks
│   └── [id]/route.ts           # Get/update kiosk
├── rooms/
│   ├── types/route.ts          # Room types
│   └── [id]/route.ts           # Individual room
├── video/
│   ├── sessions/route.ts       # Video call sessions
│   └── signaling/route.ts      # WebRTC signaling
└── pms/
    └── project-sync/route.ts   # PMS webhook
```

---

### Database

**PostgreSQL 14+**

**Connection**:
- Driver: `pg` (node-postgres)
- Connection pooling: Built-in Next.js
- Async queries: Promise-based

**Schema**: 13 tables (see [05-data-models.md](05-data-models.md))

---

## Application Structure

### Next.js App Router Structure

```
admin/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Kiosk interface (/)
│   ├── admin/
│   │   ├── layout.tsx                # Admin dashboard layout
│   │   ├── page.tsx                  # Dashboard home
│   │   ├── projects/
│   │   │   ├── page.tsx              # Projects list
│   │   │   └── [id]/page.tsx         # Project details
│   │   ├── kiosks/
│   │   │   ├── page.tsx              # Kiosks list
│   │   │   └── [id]/page.tsx         # Kiosk details
│   │   ├── rooms/
│   │   │   └── page.tsx              # Room management
│   │   └── video/
│   │       └── page.tsx              # Video call handling
│   └── api/                          # API routes (as above)
├── components/
│   ├── kiosk/                        # Kiosk UI components
│   │   ├── WelcomeScreen.tsx
│   │   ├── GuestInfoForm.tsx
│   │   ├── IDVerification.tsx
│   │   ├── PaymentScreen.tsx
│   │   └── CompletionScreen.tsx
│   ├── admin/                        # Admin UI components
│   │   ├── Dashboard.tsx
│   │   ├── ProjectList.tsx
│   │   ├── KioskMonitor.tsx
│   │   └── VideoCall.tsx
│   └── shared/                       # Shared components
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Modal.tsx
├── lib/
│   ├── db.ts                         # Database connection
│   ├── pms-auth.ts                   # PMS authentication
│   ├── useb-ocr.ts                   # useB ID OCR
│   ├── useb-face.ts                  # useB Face auth
│   └── payment.ts                    # VTR payment
├── types/
│   ├── user.ts                       # Type definitions
│   ├── project.ts
│   ├── kiosk.ts
│   └── room.ts
└── public/                           # Static assets
    ├── images/
    └── fonts/
```

---

### Component Architecture

```mermaid
graph TB
    subgraph Kiosk["Kiosk Interface Components"]
        Welcome[WelcomeScreen]
        GuestInfo[GuestInfoForm]
        IDVerify[IDVerification]
        Payment[PaymentScreen]
        Complete[CompletionScreen]
        CallStaff[CallStaffButton]
    end

    subgraph Admin["Admin Dashboard Components"]
        Dashboard[Dashboard]
        ProjectList[ProjectList]
        KioskMonitor[KioskMonitor]
        RoomGrid[RoomGrid]
        VideoCall[VideoCallHandler]
    end

    subgraph Shared["Shared Components"]
        Button[Button]
        Input[Input]
        Modal[Modal]
        Form[FormField]
    end

    Welcome --> CallStaff
    GuestInfo --> Form
    IDVerify --> Modal
    Payment --> Button

    Dashboard --> ProjectList
    Dashboard --> KioskMonitor
    KioskMonitor --> VideoCall

    Form --> Input
    ProjectList --> Button
    VideoCall --> Modal

    style Kiosk fill:#e1f5ff
    style Admin fill:#fff4e6
    style Shared fill:#e8f5e9
```

---

## Database Architecture

### Schema Overview

**13 Tables**:

| Table | Purpose | Rows (Typical) |
|-------|---------|---------------|
| users | Authentication | 10-100 |
| profiles | User profiles | 10-100 |
| projects | Properties | 1-50 |
| kiosks | Kiosk devices | 1-100 |
| room_types | Room categories | 5-20 per project |
| rooms | Individual rooms | 10-500 per project |
| reservations | Guest bookings | 100-10,000 |
| video_sessions | Video calls | Active only (1-20) |
| signaling_messages | WebRTC signaling | Active only (10-100) |
| kiosk_control_commands | Remote commands | Recent only (10-50) |
| kiosk_screen_frames | Screen captures | Recent only (10-50) |
| identity_verifications | ID scans | 100-10,000 |
| payments | Transactions | 100-10,000 |

### Entity Relationships

```mermaid
erDiagram
    USERS ||--o{ PROFILES : has
    PROJECTS ||--o{ KIOSKS : contains
    PROJECTS ||--o{ ROOM_TYPES : defines
    PROJECTS ||--o{ ROOMS : contains
    ROOM_TYPES ||--o{ ROOMS : categorizes
    ROOMS ||--o{ RESERVATIONS : booked_for
    KIOSKS ||--o{ VIDEO_SESSIONS : initiates
    KIOSKS ||--o{ KIOSK_CONTROL_COMMANDS : receives
    KIOSKS ||--o{ KIOSK_SCREEN_FRAMES : captures
    RESERVATIONS ||--|| IDENTITY_VERIFICATIONS : requires
    RESERVATIONS ||--|| PAYMENTS : requires

    USERS {
        uuid id PK
        string email UK
        string password_hash
        timestamp created_at
    }

    PROFILES {
        uuid id PK
        uuid user_id FK
        string name
        string role
    }

    PROJECTS {
        uuid id PK
        string name
        string type
        int total_rooms
        jsonb settings
    }

    KIOSKS {
        uuid id PK
        uuid project_id FK
        string name
        string status
        timestamp last_heartbeat
    }

    ROOM_TYPES {
        uuid id PK
        uuid project_id FK
        string name
        decimal base_price
        int max_occupancy
    }

    ROOMS {
        uuid id PK
        uuid project_id FK
        uuid room_type_id FK
        string room_number
        string status
    }

    RESERVATIONS {
        uuid id PK
        uuid room_id FK
        string guest_name
        string guest_phone
        timestamp check_in_time
        string status
    }

    VIDEO_SESSIONS {
        uuid id PK
        uuid kiosk_id FK
        uuid staff_user_id FK
        timestamp started_at
        timestamp ended_at
        string status
    }

    PAYMENTS {
        uuid id PK
        uuid reservation_id FK
        decimal amount
        string transaction_id
        string approval_number
        timestamp paid_at
    }
```

**Key Relationships**:
- One project → Many kiosks, rooms, room types
- One room type → Many rooms
- One room → Many reservations (over time)
- One kiosk → Many video sessions
- One reservation → One ID verification
- One reservation → One payment

---

## Integration Architecture

### Authentication Flow

```mermaid
sequenceDiagram
    participant Admin as Admin User
    participant Kiosk as Kiosk System
    participant PMS as HotelPMS API
    participant DB as Kiosk DB

    Admin->>Kiosk: POST /api/auth/login<br/>(email, password)
    Kiosk->>PMS: POST /api/v1/auth/login<br/>(email, password)
    PMS->>PMS: Verify credentials
    PMS->>PMS: Check allowed_systems includes "kiosk"
    PMS-->>Kiosk: JWT token + user data
    Kiosk->>DB: INSERT INTO users/profiles
    Kiosk->>Kiosk: Set session cookie
    Kiosk-->>Admin: Redirect to /admin dashboard
```

### Project Sync Flow

```mermaid
sequenceDiagram
    participant PMS as HotelPMS
    participant Kiosk as Kiosk System
    participant DB as Kiosk DB

    PMS->>Kiosk: POST /api/pms/project-sync<br/>(secret, project data)
    Kiosk->>Kiosk: Verify PMS_SYNC_SECRET
    Kiosk->>DB: UPSERT project
    Kiosk->>DB: UPSERT room_types
    Kiosk->>DB: UPSERT rooms
    Kiosk-->>PMS: {success: true}

    Note over PMS,DB: Keeps kiosk in sync with PMS projects
```

### ID Verification Flow

```mermaid
sequenceDiagram
    participant Guest as Guest
    participant Kiosk as Kiosk UI
    participant API as Kiosk API
    participant useB as useB API
    participant DB as Kiosk DB

    Guest->>Kiosk: Insert ID card
    Kiosk->>Kiosk: Capture image
    Kiosk->>API: POST /api/verify-id<br/>(image base64)
    API->>useB: POST /auth/login<br/>(email, password)
    useB-->>API: Session token
    API->>useB: POST /ocr/id-card<br/>(image, token)
    useB-->>API: Parsed ID data
    API->>DB: INSERT identity_verifications
    API-->>Kiosk: {name, reg_number, address}
    Kiosk->>Kiosk: Auto-fill guest form
    Kiosk-->>Guest: Show verified data
```

---

## Video Call Architecture

### WebRTC Architecture

```mermaid
graph TB
    subgraph Kiosk["Kiosk Device"]
        K_UI[Kiosk UI]
        K_WebRTC[WebRTC Client]
    end

    subgraph Admin["Admin Dashboard"]
        A_UI[Admin UI]
        A_WebRTC[WebRTC Client]
    end

    subgraph Signaling["Signaling Server (Database)"]
        DB[(PostgreSQL)]
        Sessions[video_sessions]
        Messages[signaling_messages]
    end

    K_UI -->|Call Staff| K_WebRTC
    K_WebRTC -->|Create Session| Sessions
    K_WebRTC -->|Send Offer| Messages

    A_UI -->|Poll Sessions| Sessions
    A_UI -->|Poll Messages| Messages
    A_WebRTC -->|Send Answer| Messages

    K_WebRTC -.->|Peer Connection| A_WebRTC

    Messages --> K_WebRTC
    Messages --> A_WebRTC

    style Kiosk fill:#e1f5ff
    style Admin fill:#fff4e6
    style Signaling fill:#e8f5e9
```

**Signaling Process**:

1. **Kiosk initiates call**:
   - Creates `video_session` record
   - Sends WebRTC offer to `signaling_messages`

2. **Admin polls for new sessions**:
   - Polls every 2 seconds
   - Detects new session
   - Shows notification

3. **Admin answers call**:
   - Sends WebRTC answer to `signaling_messages`
   - Sends ICE candidates

4. **Peer connection established**:
   - Direct peer-to-peer video/audio
   - No media server (reduces cost)

5. **End call**:
   - Updates `video_session` status
   - Cleans up `signaling_messages`

**Why Polling Instead of WebSocket?**
- Simpler deployment (no WebSocket server)
- Works with standard HTTP/HTTPS
- Easier to scale (stateless API routes)
- Database-backed (survives server restarts)

---

## Security Architecture

### Authentication

```mermaid
graph LR
    subgraph Auth["Authentication Layer"]
        Login[Login Form]
        PMS_Check[PMS Verification]
        JWT[JWT Token]
        Session[Session Cookie]
    end

    subgraph Protected["Protected Routes"]
        Admin[Admin Dashboard]
        API[API Routes]
    end

    Login --> PMS_Check
    PMS_Check --> JWT
    JWT --> Session
    Session --> Admin
    Session --> API

    style Auth fill:#fff4e6
    style Protected fill:#e8f5e9
```

**Security Layers**:

1. **PMS Authentication**:
   - All users authenticate via HotelPMS
   - PMS verifies credentials
   - PMS checks `allowed_systems` includes "kiosk"

2. **JWT Tokens**:
   - Issued by PMS
   - Stored in HTTP-only cookies
   - Expiry: 30 minutes (access token)

3. **Session Management**:
   - Local JWT_SECRET for admin sessions
   - Separate from PMS tokens
   - Auto-refresh on activity

4. **API Route Protection**:
   - Middleware checks session
   - Extracts user from JWT
   - Verifies permissions

### Data Encryption

**At Rest**:
- ID verification data: AES-256 encryption
- Payment data: Tokenized (no card data stored)
- Database: PostgreSQL native encryption (optional)

**In Transit**:
- HTTPS (TLS 1.2+) required in production
- WebRTC: DTLS (encrypted video/audio)

### Access Control

**Role-Based Access Control (RBAC)**:

| Role | Projects | Kiosks | Video Calls | Users |
|------|----------|--------|-------------|-------|
| super_admin | All | All | All | Manage |
| project_admin | Assigned | Assigned | Assigned | View |
| staff | Assigned | View only | Answer | View |
| kiosk | None | Self only | Initiate | None |

---

## Related Documentation

- [00 - Overview](00-overview.md) - System overview
- [05 - Data Models](05-data-models.md) - Database schema details
- [06 - Integrations](06-integrations.md) - External system integrations
- [07 - Flows](07-flows.md) - Workflow sequence diagrams

---

**Previous**: [← 00 - Overview](00-overview.md) | **Next**: [02 - Setup →](02-setup.md)
