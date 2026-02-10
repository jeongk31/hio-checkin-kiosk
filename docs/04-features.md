# Features - Kiosk System

Comprehensive documentation of all features in the Hotel Check-in Kiosk System.

## Table of Contents

1. [Kiosk Interface Features](#kiosk-interface-features)
2. [Admin Dashboard Features](#admin-dashboard-features)
3. [Video Call System](#video-call-system)
4. [Security Features](#security-features)
5. [Accessibility Features](#accessibility-features)

---

## Kiosk Interface Features

### 1. Guest Check-in Flow

#### Screen 1: Welcome Screen

**Purpose**: Start the check-in process

**Features**:
- Large "Start Check-in" button
- Language selection (Korean/English)
- Hotel branding/logo display
- Call staff button (video call)
- Idle animation/screensaver

**User Actions**:
- Tap "Start Check-in" to begin
- Select language preference
- Call staff if assistance needed

**Keyboard Shortcut** (Development): Press `1`

---

#### Screen 2: Guest Information

**Purpose**: Collect guest personal information

**Form Fields**:
- **Name** (Korean/English)
  - Auto-filled from ID scan (if available)
  - Validation: Required, 2-50 characters
- **Phone Number**
  - Format: 010-XXXX-XXXX
  - Validation: Required, Korean mobile format
- **Email**
  - Format: user@example.com
  - Validation: Optional, valid email format
- **Number of Guests**
  - Range: 1-10
  - Default: 1
  - Affects room pricing (if occupancy-based)

**Features**:
- On-screen keyboard (Korean/English)
- Auto-fill from ID scan
- Field validation in real-time
- Progress indicator (Step 2 of 5)
- Back button (return to welcome)
- Call staff button

**Keyboard Shortcut** (Development): Press `2`

---

#### Screen 3: ID Verification

**Purpose**: Verify guest identity via Korean ID card

**Features**:

**ID Card Scanning** (useB OCR):
- Insert ID card into scanner
- Automatic image capture
- OCR processing (useB API)
- Auto-population of guest data:
  - Name
  - Registration number (masked: XXXXXX-X*****)
  - Address
- Confidence score display (0-100%)

**Face Authentication** (useB Face API):
- Webcam capture
- Face detection
- Comparison with ID card photo
- Match score display (0-100%)
- Retry if match fails

**Manual Entry**:
- Fallback if scanner fails
- Manual input of ID number
- Staff verification flag set

**Features**:
- Real-time feedback (scanning, processing, verified)
- Error handling (rescan, manual entry)
- Privacy: ID data encrypted in database
- Compliance: Korean hospitality law requirement

**Keyboard Shortcut** (Development): Press `3`

---

#### Screen 4: Payment

**Purpose**: Process room payment

**Display**:
- **Reservation Summary**:
  - Room type (Standard, Deluxe, Suite)
  - Room number (assigned automatically)
  - Check-in date
  - Check-out date (if multi-night)
  - Number of nights
- **Pricing Breakdown**:
  - Room rate per night
  - Total amount
  - Tax (if applicable)
  - Discounts (if applicable)

**Payment Methods**:
1. **Credit/Debit Card** (VTR Terminal):
   - Insert card into terminal
   - Enter PIN
   - Approval/decline display
   - Receipt printing (optional)
2. **Cash** (Pay at checkout):
   - Option to pay at front desk
   - Requires staff approval flag
3. **Prepaid** (Already paid online):
   - Skip payment screen

**Features**:
- Real-time payment status
- Timeout handling (60 seconds)
- Retry on payment failure
- Payment receipt (email or print)
- PCI compliance (no card data stored)

**Error Handling**:
- Card declined → Retry or alternative payment
- Terminal error → Call staff
- Timeout → Retry or manual processing

**Keyboard Shortcut** (Development): Press `4`

---

#### Screen 5: Completion

**Purpose**: Display room access information

**Display**:
- ✅ **Check-in Complete** message
- **Room Number**: Large, bold display (e.g., "Room 301")
- **Access Code/PIN**: 4-6 digit code for door lock
- **Check-in Time**: Timestamp
- **Check-out Time**: Displayed if multi-night stay
- **Directions to Room**: Floor number, elevator direction

**Additional Information**:
- WiFi credentials
- Breakfast hours (if included)
- Hotel amenities (pool, gym, etc.)
- Contact info (front desk, emergency)

**Actions**:
- Print confirmation (optional)
- Email confirmation to guest email
- Return to welcome screen (after 30 seconds auto-timeout)

**Features**:
- Large, readable fonts
- QR code for mobile app (if available)
- Auto-advance to welcome screen

**Keyboard Shortcut** (Development): Press `5`

---

### 2. Call Staff Feature

**Availability**: From any screen (persistent button)

**Features**:
- **Video Call Initiation**:
  - Tap "Call Staff" button
  - WebRTC connection starts
  - Real-time video and audio
- **Screen Sharing**:
  - Staff can see kiosk screen
  - Useful for troubleshooting
- **Signaling**:
  - Polling-based (no WebSocket required)
  - Fallback to audio-only if video fails
- **Notification**:
  - Admin dashboard receives call notification
  - Multiple kiosks supported
- **Call Duration**:
  - Tracked and logged
  - Auto-disconnect after 10 minutes (configurable)

**Use Cases**:
- Scanner not working
- Payment issue
- Language barrier
- Guest has questions

---

### 3. Development Features

**Keyboard Shortcuts** (Development mode only):
- `1` - Navigate to Welcome screen
- `2` - Navigate to Guest Information screen
- `3` - Navigate to ID Verification screen
- `4` - Navigate to Payment screen
- `5` - Navigate to Completion screen
- `ESC` - Close modal/dialog

**Purpose**: Faster testing and navigation during development

**Enable**: Automatically enabled in development mode (`NODE_ENV=development`)

---

## Admin Dashboard Features

### 1. Dashboard Overview

**URL**: http://localhost:3000/admin

**Login**: Authenticate via HotelPMS

**Widgets**:
- **Total Kiosks**: Count of registered kiosks
- **Online Kiosks**: Currently active kiosks
- **Pending Check-ins**: Guests in progress
- **Today's Check-ins**: Completed check-ins today
- **Occupancy Rate**: Current occupancy percentage
- **Revenue Today**: Total payments received

**Charts**:
- Check-in trends (hourly, daily, weekly)
- Room type distribution
- Average check-in duration
- Payment method breakdown

---

### 2. Project Management

**Features**:

**Create Project**:
- Project name (e.g., "Seoul Hotel")
- Project type (Hotel, Pension, Camping, F&B)
- Address
- Total rooms
- Settings (check-in/out times, policies)

**Edit Project**:
- Update project details
- Sync to PMS (if integration enabled)
- Archive/deactivate project

**Project Dashboard**:
- Project-specific statistics
- Kiosk list for this project
- Room status grid
- Reservation calendar

**Multi-Project Support**:
- Switch between projects
- Super admin: View all projects
- Project admin: View assigned projects only

---

### 3. Kiosk Management

**Features**:

**Register Kiosk**:
- Kiosk name (e.g., "Lobby Kiosk 1")
- Kiosk ID (unique identifier)
- Project assignment
- Location (lobby, floor 2, etc.)
- Hardware details (model, serial number)

**Monitor Kiosks**:
- **Status Indicators**:
  - 🟢 Online: Connected and ready
  - 🔴 Offline: Disconnected
  - 🟡 In Use: Guest checking in
  - ⚠️ Error: Hardware/software issue
- **Last Heartbeat**: Timestamp of last ping
- **Current Screen**: Which screen kiosk is displaying
- **Check-in Progress**: Guest name (if in progress)

**Remote Control**:
- **Screen Streaming**: View kiosk screen in real-time
- **Send Commands**:
  - Restart kiosk
  - Clear session
  - Display message
  - Force to welcome screen
- **Configuration Update**:
  - Update kiosk settings remotely
  - Apply UI theme changes

**Maintenance**:
- Log issue (e.g., "Scanner not working")
- Schedule maintenance
- View kiosk history

---

### 4. Room Management

**Features**:

**Room Types**:
- Create room types (Standard, Deluxe, Suite, etc.)
- Set pricing (base price, seasonal pricing)
- Max occupancy
- Amenities list
- Room images (with upload progress indicator)

**Rooms**:
- Add rooms (Room 101, 102, etc.)
- Assign room type
- Set access type: password or card
- Room password / key box number / key box password
- Set status:
  - 🟢 Available
  - 🔴 Occupied
  - 🟡 Reserved (pre-booked)
  - ⚠️ Maintenance
  - 🔒 Blocked
- Room-specific notes
- Floor assignment

**Room Status Grid**:
- Visual grid of all rooms
- Color-coded by status
- Click to view/edit details
- Filter by floor, type, status
- Shows reservation info on occupied rooms

**Room Change** (Task 23):
- Move a checked-in guest to a different room
- Only available rooms can be selected as target
- Automatically updates: reservation room_number, old room → available, new room → occupied
- API: `POST /api/rooms/change` (currentRoomId, newRoomId)

**Dual Name Display** (Task 22):
- When the reserving person and the check-in person differ, both names are shown
- Check-in name (from ID verification) displayed prominently
- Reservation name shown below as "예약자: [name]"
- Uses `verified_guests` array from reservation data

**Check-in Cancellation**:
- Cancel check-in for both walk-in and regular reservations
- Sets reservation status to `cancelled` (preserved in history)
- Room automatically set back to `available`
- Records which admin performed the action in `notes` field
- History re-fetches after cancellation to show updated data

**Payment Cancellation**:
- Cancel/refund kiosk payments via VTR terminal
- Calls VAN API directly from browser (localhost:8085)
- Only works when accessed from the kiosk machine
- Records which admin performed the cancellation in reservation notes

**Bulk Operations**:
- Assign multiple rooms to type
- Batch status update (e.g., mark floor 3 as cleaning)
- Daily room reset (configurable per project, cron-based)

---

### 5. Content Management

**Features**:

**Kiosk UI Customization**:
- **Welcome Screen**:
  - Upload logo image
  - Set background color/image
  - Welcome message text
  - Language options
- **Terms and Conditions**:
  - Edit T&C text
  - Display on screen 2 or 4
  - Require checkbox acceptance
- **Promotional Content**:
  - Display ads/promotions
  - Rotate images
  - Link to hotel services

**Multi-Language Support**:
- Korean (default)
- English
- Additional languages (extendable)

**Preview**:
- Live preview of kiosk screens
- Test changes before publishing

**Publishing**:
- Save as draft
- Publish to specific kiosks
- Schedule content updates

---

### 6. Reservation Management

**Features**:

**Today Tab** - Current day's reservations:
- Shows all reservations for today (filtered by KST date)
- Reservation info embedded in room cards
- Real-time status: pending, confirmed, reserved, checked_in
- Quick actions: cancel check-in, cancel payment, change room

**History Tab** (Tasks 24-26):
- Shows all actionable reservations: checked_in, checked_out, cancelled, no_show
- **Date & Time Display** (Task 24): Shows `updated_at` formatted as date + time (KST)
- **Status Column** (Task 25): Color-coded status badges
  - 체크인 (green) / 체크아웃 (gray) / 취소 (red) / 노쇼 (purple)
- **Actor Tracking** (Task 26): Shows who performed actions in the source column
  - e.g., "체크인 취소 (admin@hotel.com)" in notes below source
  - Tracked for: check-in cancellation, payment cancellation
- ID verification info: Shows verified guest count and names
- Payment info: Amount with paid/unpaid indicator, amenity breakdown

**Reservation Details**:
- Guest information (name, phone, email)
- Room assignment and room type
- Check-in/out dates
- Payment status (paid amount, total price, amenity total)
- ID verification status (verified_guests array)
- Reservation vs check-in name comparison

**Actions**:
- Cancel check-in (records actor, sets status to cancelled)
- Cancel/refund payment (VTR terminal, records actor)
- Change room (move guest to different available room)
- Edit reservation details

**Search**:
- Search by guest name, phone, email
- Search by room number
- Filter by project (super admin)

---

### 7. Video Call Management

**Features**:

**Incoming Call Notification**:
- Browser notification
- Audio alert
- Kiosk name and location display
- Guest in-progress check-in info

**Answer Call**:
- Click to accept
- Video and audio connection
- View kiosk screen (screen sharing)
- Bidirectional communication

**Call Controls**:
- Mute/unmute microphone
- Enable/disable video
- End call
- Transfer call (to another staff member)

**Call History**:
- Call timestamp
- Kiosk name
- Duration
- Staff member who answered
- Resolution notes (optional)

**Multi-Call Support**:
- Queue incoming calls
- Call waiting notification
- Multiple staff can answer simultaneously

---

### 8. User Management

**Features**:

**User Roles**:
- **super_admin**: Full system access
- **project_admin**: Single project management
- **staff**: Front desk operations
- **kiosk**: Kiosk device accounts (system use only)

**Create User**:
- Email
- Name
- Role selection
- Project assignment (for project_admin)
- Password (auto-generated or manual)

**Edit User**:
- Update role
- Change project assignment
- Reset password
- Deactivate account

**User List**:
- Filter by role
- Search by name/email
- Last login timestamp
- Active/inactive status

**Access Control**:
- Users must have `"kiosk"` in PMS `allowed_systems`
- Authentication via HotelPMS

---

### 9. Reports and Analytics

**Features**:

**Check-in Reports**:
- Daily check-in count
- Average check-in duration
- Peak hours
- ID verification success rate
- Payment success rate

**Revenue Reports**:
- Daily/weekly/monthly revenue
- Revenue by room type
- Payment method breakdown
- Cancellation/refund summary

**Kiosk Performance**:
- Uptime percentage
- Average check-in duration per kiosk
- Error rates
- Most used kiosk

**Export**:
- CSV export
- PDF export
- Email scheduled reports

---

## Video Call System

### Features

**WebRTC-Based**:
- Real-time video and audio
- Peer-to-peer connection (no media server required)
- Fallback to audio-only if video fails

**Bidirectional Calls**:
- **Kiosk → Admin** (Guest calls staff): Guest taps "Call Staff" on kiosk
- **Admin → Kiosk** (Staff calls kiosk): Staff initiates call from admin dashboard
  - Kiosk auto-answers after 500ms delay (no guest interaction needed)
  - Uses `hasAnsweredRef` guard inside setTimeout for React Strict Mode safety

**Polling-Based Signaling**:
- No WebSocket dependency
- Polling interval: 2 seconds (configurable)
- Database-backed signaling messages

**Stale Session Cleanup**:
- Sessions older than 2 minutes are filtered out during polling
- `cleanupStaleSessions()` runs on kiosk startup, marks old "waiting" sessions as "ended"
- Prevents kiosk from detecting old sessions on page load/refresh

**Call End Signal**:
- Kiosk sends `call-ended` signal via `endCall('ended')` when call ends
- Admin receives signal immediately (no 20s WebRTC timeout wait)

**Missed Call Notifications** (Admin):
- Admin dashboard shows missed calls when staff doesn't answer
- "확인" (Confirm) button marks missed calls as read
- Persisted in database via `notes: 'acknowledged'` on video_sessions
- Missed calls with `notes !== 'acknowledged'` shown on next load

**Hook Stability** (`useVoiceCall`):
- Returns `useMemo`-wrapped object to prevent reference instability
- Without this, useEffect dependencies on `voiceCall` re-trigger every render
- Stable getter functions via `useCallback`: `getLocalStream`, `getRemoteStream`, `getSessionId`

**Security**:
- HTTPS required in production (WebRTC requirement)
- Encrypted signaling data
- Auto-disconnect after timeout

**Database Tables**:
- `video_sessions`: Active video call sessions (with `notes` field for acknowledge)
- `signaling_messages`: WebRTC signaling data (offer, answer, ICE candidates)

**Kiosk → Admin Workflow**:
1. Guest taps "Call Staff"
2. Kiosk creates video session in database (status: 'waiting')
3. Admin dashboard polls for new sessions
4. Staff receives notification with ringtone
5. Staff answers call
6. WebRTC connection established via signaling messages
7. Real-time video/audio communication
8. Either party ends call → `call-ended` signal sent
9. Session closed in database

**Admin → Kiosk Workflow**:
1. Staff clicks call button on kiosk card in admin dashboard
2. Admin creates video session (status: 'waiting', initiator: 'admin')
3. Kiosk polls for incoming calls (filters sessions < 2 min old)
4. Kiosk auto-answers after 500ms (no guest interaction)
5. WebRTC connection established
6. Real-time video/audio communication
7. Either party ends call → signal sent immediately

---

## Security Features

### Data Protection

**ID Verification Data**:
- Encrypted in database (AES-256)
- Masked registration numbers (XXXXXX-X*****)
- Access logged (who viewed, when)
- Auto-delete after retention period (configurable)

**Face Images**:
- Deleted immediately after verification
- Not stored in database (unless required by law)
- Temporary storage only during check-in

**Payment Data**:
- PCI compliance: No card data stored
- Transaction ID and approval number only
- Masked card numbers (1234-****-****-5678)

### Authentication

**Admin Dashboard**:
- JWT tokens from HotelPMS
- Token expiry: 30 minutes (configurable)
- Refresh token: 7 days
- Session timeout: 1 hour of inactivity

**Kiosk Devices**:
- Device-specific tokens
- Kiosk ID verification
- IP whitelisting (optional)

### Access Control

**Role-Based**:
- super_admin: All projects, all actions
- project_admin: Assigned projects only
- staff: Read-only access, video calls
- kiosk: Device access only

**Audit Logging**:
- All admin actions logged
- User who performed action
- Timestamp
- IP address
- Action details

---

## Accessibility Features

### Kiosk Interface

**Font Sizes**:
- Large, readable fonts (24px+ for body text)
- High contrast (dark text on light background)
- Scalable UI (touch-friendly buttons)

**Touch Targets**:
- Minimum button size: 60x60px
- Adequate spacing between buttons
- Visual feedback on tap

**Language Support**:
- Korean (default)
- English
- Extendable to other languages

**Timeout Warnings**:
- 30-second warning before auto-timeout
- "Need more time?" button to extend

**Call Staff**:
- Persistent "Call Staff" button
- Large, easy to find
- Video call for assistance

---

## Related Documentation

- [00 - Overview](00-overview.md) - System overview
- [06 - Integrations](06-integrations.md) - PMS, useB, VTR integration
- [07 - Flows](07-flows.md) - End-to-end workflows

---

**Previous**: [← 03 - Environment Variables](03-env.md) | **Next**: [05 - Data Models →](05-data-models.md)
