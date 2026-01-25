# Workflows - Kiosk System

End-to-end workflow documentation with sequence diagrams for the Hotel Check-in Kiosk System.

## Table of Contents

1. [Guest Check-in Flow](#guest-check-in-flow)
2. [Admin Login Flow](#admin-login-flow)
3. [Video Call Flow](#video-call-flow)
4. [Payment Processing Flow](#payment-processing-flow)
5. [ID Verification Flow](#id-verification-flow)
6. [Project Sync Flow](#project-sync-flow)

---

## Guest Check-in Flow

### Complete Check-in Sequence

```mermaid
sequenceDiagram
    participant Guest
    participant Kiosk as Kiosk UI
    participant API as Kiosk API
    participant useB as useB API
    participant VTR as VTR Terminal
    participant DB as Database

    Guest->>Kiosk: Tap "Start Check-in"
    Kiosk->>Kiosk: Navigate to Guest Info screen

    Note over Guest,Kiosk: Screen 2: Guest Information
    Guest->>Kiosk: Enter name, phone, email, # guests
    Kiosk->>Kiosk: Validate form fields
    Guest->>Kiosk: Tap "Next"

    Note over Guest,useB: Screen 3: ID Verification
    Guest->>Kiosk: Insert ID card into scanner
    Kiosk->>Kiosk: Capture ID image
    Kiosk->>API: POST /api/verify-id (image)
    API->>useB: POST /auth/login
    useB-->>API: Session token
    API->>useB: POST /ocr/id-card (image, token)
    useB-->>API: {name, reg_number, address, confidence: 0.95}
    API->>DB: INSERT identity_verifications
    API-->>Kiosk: ID verification success
    Kiosk->>Kiosk: Auto-fill guest name

    alt Face Authentication Enabled
        Kiosk->>Kiosk: Activate webcam
        Guest->>Kiosk: Look at camera
        Kiosk->>API: POST /api/verify-face (image, user_id)
        API->>useB: POST /face/verify
        useB-->>API: {match: true, score: 0.98}
        API-->>Kiosk: Face verified
    end

    Guest->>Kiosk: Tap "Next"

    Note over Guest,VTR: Screen 4: Payment
    Kiosk->>API: GET /api/rooms/available
    API->>DB: SELECT rooms WHERE status='available'
    DB-->>API: Available rooms list
    API-->>Kiosk: Display available rooms
    Kiosk->>Kiosk: Auto-assign room (or guest selects)
    Kiosk->>Kiosk: Display room rate and total

    Guest->>VTR: Insert credit card
    Kiosk->>API: POST /api/payments/process
    API->>VTR: POST /payment (amount, transaction_id)
    VTR->>VTR: Process card
    VTR-->>API: {success: true, approval_number}
    API->>DB: INSERT payments (status='completed')
    API->>DB: INSERT reservations (status='confirmed')
    API->>DB: UPDATE rooms SET status='occupied'
    API-->>Kiosk: Payment success + room details

    Note over Guest,DB: Screen 5: Completion
    Kiosk->>Kiosk: Generate access code (4-6 digits)
    Kiosk->>DB: UPDATE reservations SET access_code
    Kiosk->>Kiosk: Display room number + access code
    Guest->>Guest: Note room number and access code

    alt Email Confirmation
        Kiosk->>API: POST /api/send-confirmation
        API->>API: Generate email (room, access code, details)
        API->>Guest: Send email to guest_email
    end

    Kiosk->>Kiosk: Wait 30 seconds
    Kiosk->>Kiosk: Return to welcome screen
```

**Key Steps**:
1. Welcome → Start check-in
2. Guest Info → Enter personal details
3. ID Verification → Scan ID + optional face auth
4. Payment → Process payment + assign room
5. Completion → Display room number + access code

**Duration**: 3-5 minutes average

---

## Admin Login Flow

### PMS Authentication

```mermaid
sequenceDiagram
    participant Admin as Admin User
    participant Kiosk as Kiosk Admin UI
    participant API as Kiosk API
    participant PMS as HotelPMS API
    participant DB_PMS as PMS Database
    participant DB_Kiosk as Kiosk Database

    Admin->>Kiosk: Navigate to /admin
    Kiosk->>Kiosk: Check session cookie
    alt No Valid Session
        Kiosk->>Admin: Redirect to /admin/login
    end

    Admin->>Kiosk: Enter email & password
    Kiosk->>API: POST /api/auth/login (email, password)

    API->>PMS: POST /api/v1/auth/login (email, password)
    PMS->>DB_PMS: SELECT user WHERE email=?
    DB_PMS-->>PMS: User record
    PMS->>PMS: Verify password (bcrypt)

    alt Invalid Credentials
        PMS-->>API: 401 Unauthorized
        API-->>Kiosk: "Invalid credentials"
        Kiosk->>Admin: Display error
    end

    PMS->>PMS: Check allowed_systems includes "kiosk"

    alt No Kiosk Access
        PMS-->>API: 403 Forbidden "No kiosk access"
        API-->>Kiosk: "User not authorized for kiosk"
        Kiosk->>Admin: Display error + contact admin
    end

    PMS->>PMS: Generate JWT tokens (access + refresh)
    PMS-->>API: {access_token, refresh_token, user_data}

    API->>DB_Kiosk: INSERT/UPDATE users (email, user data)
    API->>DB_Kiosk: INSERT/UPDATE profiles (name, role, project_id)
    API->>API: Create local session cookie
    API-->>Kiosk: {user, session_token}

    Kiosk->>Kiosk: Store session cookie (HTTP-only)
    Kiosk->>Admin: Redirect to /admin/dashboard

    Admin->>Kiosk: Access dashboard
    Kiosk->>API: GET /api/dashboard/stats (with session cookie)
    API->>API: Verify session cookie
    API->>DB_Kiosk: Fetch dashboard data
    DB_Kiosk-->>API: Stats (kiosks, reservations, revenue)
    API-->>Kiosk: Dashboard data
    Kiosk->>Admin: Display dashboard
```

**Important**:
- Primary authentication via HotelPMS (central provider)
- User must have `"kiosk"` in PMS `allowed_systems` array
- Local session cookie for subsequent requests
- JWT token refresh handled automatically

---

## Video Call Flow

### WebRTC Signaling via Database

```mermaid
sequenceDiagram
    participant Guest
    participant Kiosk as Kiosk UI
    participant K_API as Kiosk API
    participant DB as Database
    participant A_Poll as Admin Polling
    participant Admin as Admin UI
    participant Staff

    Note over Guest,Staff: Guest Initiates Call

    Guest->>Kiosk: Tap "Call Staff" button
    Kiosk->>Kiosk: Initialize WebRTC
    Kiosk->>Kiosk: Get local media (camera, mic)
    Kiosk->>K_API: POST /api/video/sessions/create
    K_API->>DB: INSERT video_sessions (kiosk_id, status='pending')
    K_API-->>Kiosk: {session_id}

    Kiosk->>Kiosk: Create WebRTC offer
    Kiosk->>K_API: POST /api/video/signaling (session_id, offer)
    K_API->>DB: INSERT signaling_messages<br/>(sender='kiosk', type='offer', payload=offer)
    K_API-->>Kiosk: Offer saved

    Note over DB,Staff: Admin Receives Call

    loop Poll every 2 seconds
        A_Poll->>K_API: GET /api/video/sessions?status=pending
        K_API->>DB: SELECT * FROM video_sessions WHERE status='pending'
        DB-->>K_API: Pending sessions list
        K_API-->>A_Poll: [session_id, kiosk_name]
    end

    A_Poll->>Admin: New call notification
    Admin->>Staff: Display "Incoming call from Lobby Kiosk 1"

    Staff->>Admin: Click "Answer"
    Admin->>K_API: POST /api/video/sessions/{session_id}/answer
    K_API->>DB: UPDATE video_sessions<br/>SET status='active', staff_user_id=?
    K_API-->>Admin: Session updated

    Note over Admin,Kiosk: WebRTC Connection Establishment

    Admin->>K_API: GET /api/video/signaling/{session_id}
    K_API->>DB: SELECT * FROM signaling_messages<br/>WHERE session_id=? AND sender='kiosk'
    DB-->>K_API: [offer message]
    K_API-->>Admin: {type: 'offer', sdp: '...'}

    Admin->>Admin: Create WebRTC answer
    Admin->>K_API: POST /api/video/signaling (session_id, answer)
    K_API->>DB: INSERT signaling_messages<br/>(sender='staff', type='answer', payload=answer)
    K_API-->>Admin: Answer saved

    loop Poll for answer (kiosk)
        Kiosk->>K_API: GET /api/video/signaling/{session_id}
        K_API->>DB: SELECT * WHERE sender='staff' AND type='answer'
        DB-->>K_API: [answer message]
        K_API-->>Kiosk: {type: 'answer', sdp: '...'}
    end

    Kiosk->>Kiosk: Set remote description (answer)

    Note over Kiosk,Admin: ICE Candidate Exchange

    loop ICE Candidates
        Kiosk->>K_API: POST /api/video/signaling<br/>(type='ice_candidate', candidate)
        K_API->>DB: INSERT signaling_messages
        Admin->>K_API: GET /api/video/signaling/{session_id}
        K_API-->>Admin: [ice_candidate from kiosk]
        Admin->>Admin: Add ICE candidate

        Admin->>K_API: POST /api/video/signaling<br/>(type='ice_candidate', candidate)
        K_API->>DB: INSERT signaling_messages
        Kiosk->>K_API: GET /api/video/signaling/{session_id}
        K_API-->>Kiosk: [ice_candidate from staff]
        Kiosk->>Kiosk: Add ICE candidate
    end

    Kiosk->>Admin: Peer connection established (video/audio)

    Note over Guest,Staff: Active Call

    Guest->>Staff: Talk via video call
    Staff->>Guest: Provide assistance

    Note over Kiosk,Admin: End Call

    alt Guest Ends Call
        Guest->>Kiosk: Tap "End Call"
        Kiosk->>K_API: POST /api/video/sessions/{session_id}/end
    else Staff Ends Call
        Staff->>Admin: Click "End Call"
        Admin->>K_API: POST /api/video/sessions/{session_id}/end
    end

    K_API->>DB: UPDATE video_sessions<br/>SET status='ended', ended_at=NOW()
    K_API->>DB: DELETE FROM signaling_messages<br/>WHERE session_id=?
    K_API-->>Kiosk: Call ended
    K_API-->>Admin: Call ended

    Kiosk->>Kiosk: Close video call UI
    Admin->>Admin: Return to dashboard
```

**Key Points**:
- **Polling-based signaling** (no WebSocket required)
- **Database stores** WebRTC offer/answer/ICE candidates
- **Peer-to-peer** video/audio (after connection established)
- **Automatic cleanup** of signaling messages after call ends

---

## Payment Processing Flow

### VTR Terminal Payment

```mermaid
sequenceDiagram
    participant Guest
    participant Kiosk as Kiosk UI
    participant API as Kiosk API
    participant VTR as VTR Terminal Server
    participant Terminal as Physical Terminal
    participant Processor as Payment Processor
    participant DB as Database

    Guest->>Kiosk: Select payment method "Credit Card"
    Kiosk->>Kiosk: Display "Please insert card"
    Guest->>Terminal: Insert credit card

    Kiosk->>API: POST /api/payments/process
    API->>API: Generate transaction_id (kiosk_tx_TIMESTAMP)
    API->>VTR: POST /payment
    Note right of API: {<br/>  amount: 100000,<br/>  currency: "KRW",<br/>  transaction_id: "kiosk_tx_12345",<br/>  description: "Room 101 - 1 night"<br/>}

    VTR->>Terminal: Send payment request (serial/USB)
    Terminal->>Terminal: Read card data
    Terminal->>Processor: Authorize transaction

    alt Card Approved
        Processor-->>Terminal: Approval (approval_number: "12345678")
        Terminal-->>VTR: Payment success
        VTR-->>API: {success: true, approval_number, card_masked}

        API->>DB: INSERT payments (status='completed')
        API->>DB: UPDATE reservations SET status='confirmed'
        API-->>Kiosk: Payment success

        Kiosk->>Kiosk: Display "Payment successful"
        Kiosk->>Kiosk: Navigate to completion screen

    else Card Declined
        Processor-->>Terminal: Declined (insufficient funds)
        Terminal-->>VTR: Payment failed
        VTR-->>API: {success: false, error: "CARD_DECLINED"}

        API->>DB: INSERT payments (status='failed')
        API-->>Kiosk: Payment failed

        Kiosk->>Guest: "Payment declined. Try another card?"
        Guest->>Kiosk: Retry or cancel

    else Terminal Error
        VTR-->>API: {success: false, error: "TERMINAL_ERROR"}
        API-->>Kiosk: Hardware error
        Kiosk->>Guest: "Call staff for assistance"
        Kiosk->>Kiosk: Initiate video call button
    end
```

**Error Handling**:
- **Card Declined**: Allow retry with different card
- **Terminal Error**: Prompt to call staff
- **Timeout** (60s): Display timeout message, allow retry
- **Network Error**: Retry 3 times with exponential backoff

---

## ID Verification Flow

### useB ID OCR + Face Authentication

```mermaid
sequenceDiagram
    participant Guest
    participant Kiosk as Kiosk UI
    participant API as Kiosk API
    participant useB_OCR as useB OCR API
    participant useB_Face as useB Face API
    participant DB as Database

    Note over Guest,DB: Step 1: ID Card Scanning

    Guest->>Kiosk: Insert ID card into scanner
    Kiosk->>Kiosk: Capture ID card image (JPEG)
    Kiosk->>Kiosk: Convert to base64
    Kiosk->>API: POST /api/verify-id (image_base64)

    API->>API: Check cached useB token

    alt No Token Cached
        API->>useB_OCR: POST /auth/login (email, password)
        useB_OCR-->>API: {token, expires_at}
        API->>API: Cache token (1 hour)
    end

    API->>useB_OCR: POST /ocr/id-card
    Note right of API: Headers: Authorization: Bearer {token}<br/>Body: {image: "data:image/jpeg;base64,...", type: "korean_id"}

    useB_OCR->>useB_OCR: Perform OCR

    alt OCR Success
        useB_OCR-->>API: {success: true, data: {name, reg_number, address}, confidence: 0.95}

        API->>DB: INSERT identity_verifications<br/>(id_number_encrypted, name, address, confidence)
        API-->>Kiosk: {verified: true, data: {...}}

        Kiosk->>Kiosk: Auto-fill guest name field
        Kiosk->>Guest: "ID verified successfully"

    else OCR Failed (poor quality)
        useB_OCR-->>API: {success: false, error: "Low confidence"}
        API-->>Kiosk: {verified: false, error: "Please rescan ID"}
        Kiosk->>Guest: "ID scan failed. Please try again"
        Guest->>Kiosk: Retry or manual entry

    else OCR Error (network/API)
        useB_OCR-->>API: 500 Server Error
        API-->>Kiosk: {verified: false, error: "Service unavailable"}
        Kiosk->>Guest: "Verification service unavailable. Enter manually?"
        Guest->>Kiosk: Manual entry
        API->>DB: INSERT identity_verifications (method='manual')
    end

    Note over Guest,DB: Step 2: Face Authentication (Optional)

    alt Face Auth Enabled
        Kiosk->>Kiosk: Activate webcam
        Kiosk->>Guest: "Please look at the camera"
        Guest->>Kiosk: Face camera
        Kiosk->>Kiosk: Capture face image
        Kiosk->>API: POST /api/verify-face (user_id, face_image)

        API->>useB_Face: POST /oauth/token (client_id, client_secret)
        useB_Face-->>API: {access_token}

        API->>useB_Face: POST /face/register (user_id, id_image)
        useB_Face-->>API: {face_id}

        API->>useB_Face: POST /face/verify (user_id, face_image)
        useB_Face-->>API: {match: true, score: 0.98, threshold: 0.80}

        alt Face Match
            API->>DB: UPDATE identity_verifications SET face_verified=true
            API-->>Kiosk: Face verified
            Kiosk->>Guest: "Face verified successfully"
        else Face Mismatch
            API-->>Kiosk: Face mismatch (score < threshold)
            Kiosk->>Guest: "Face verification failed. Call staff?"
            Kiosk->>Kiosk: Enable "Call Staff" button
        end
    end

    Kiosk->>Kiosk: Proceed to payment screen
```

**Fallback Strategy**:
1. **ID OCR fails** → Allow manual entry (staff verification flag set)
2. **Face auth fails** → Continue without face verification (optional feature)
3. **useB service unavailable** → Manual entry + staff verification required

---

## Project Sync Flow

### PMS → Kiosk Synchronization

```mermaid
sequenceDiagram
    participant Admin as PMS Admin
    participant PMS_UI as PMS Dashboard
    participant PMS_API as PMS Backend
    participant Kiosk_API as Kiosk API
    participant DB_Kiosk as Kiosk Database

    Admin->>PMS_UI: Create/update project
    PMS_UI->>PMS_API: POST /api/v1/projects (project data)
    PMS_API->>PMS_API: Save to PMS database
    PMS_API-->>PMS_UI: Project saved

    Note over PMS_API,Kiosk_API: Webhook Trigger

    PMS_API->>PMS_API: Prepare sync payload
    PMS_API->>Kiosk_API: POST /api/pms/project-sync
    Note right of PMS_API: {<br/>  secret: "pms-kiosk-sync-2026",<br/>  project: {id, name, type, ...},<br/>  room_types: [...],<br/>  rooms: [...]<br/>}

    Kiosk_API->>Kiosk_API: Verify PMS_SYNC_SECRET

    alt Invalid Secret
        Kiosk_API-->>PMS_API: 401 Unauthorized
        PMS_API->>PMS_API: Log sync failure
    end

    Kiosk_API->>DB_Kiosk: BEGIN TRANSACTION

    Kiosk_API->>DB_Kiosk: UPSERT projects
    Note right of Kiosk_API: INSERT ... ON CONFLICT (id)<br/>DO UPDATE SET name=?, settings=?

    loop For each room_type
        Kiosk_API->>DB_Kiosk: UPSERT room_types
    end

    loop For each room
        Kiosk_API->>DB_Kiosk: UPSERT rooms
    end

    Kiosk_API->>DB_Kiosk: COMMIT TRANSACTION
    Kiosk_API-->>PMS_API: {success: true, synced_at: TIMESTAMP}

    PMS_API->>PMS_API: Log sync success
    PMS_API-->>PMS_UI: Project synced to kiosk
    PMS_UI->>Admin: "Project synced successfully"

    Note over Kiosk_API,DB_Kiosk: Kiosks now have updated project data
```

**Sync Triggers**:
- Project created
- Project updated (name, settings, etc.)
- Room types added/updated
- Rooms added/updated

**Security**:
- Shared secret (`PMS_SYNC_SECRET`) for authentication
- Must match in both PMS and Kiosk `.env`

---

## Related Documentation

- [00 - Overview](00-overview.md) - System overview
- [01 - Architecture](01-architecture.md) - Technical architecture
- [04 - Features](04-features.md) - Feature documentation
- [06 - Integrations](06-integrations.md) - External integrations

---

**Previous**: [← 06 - Integrations](06-integrations.md) | **Next**: [08 - Deployment →](08-deployment.md)
