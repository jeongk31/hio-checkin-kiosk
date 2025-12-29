# Testing Guide - Hotel Check-in Kiosk System

## Overview
This system manages hotel check-in kiosks with:
- **Admin Dashboard** - Manage projects, rooms, kiosks, users
- **Kiosk Interface** - Guest self-service check-in
- **Video Calls** - Staff can receive calls from kiosks
- **Real-time Monitoring** - View kiosk screens remotely

## Pre-Test Setup

✅ **Already Completed:**
- Database created and schema applied
- Admin user created (admin@admin.com / admin123)
- Server running on http://localhost:3000

## Testing Checklist

### 1. Authentication & Login
**URL:** http://localhost:3000/login

**Test Steps:**
1. Open browser to http://localhost:3000
2. Should redirect to `/login`
3. Enter credentials:
   - Email: `admin@admin.com`
   - Password: `admin123`
4. Click **"로그인"** (Login button)
5. ✅ Should redirect to `/dashboard`

**Expected:** Successfully logged in as Super Admin

---

### 2. Dashboard Overview
**URL:** http://localhost:3000/dashboard

**Test Steps:**
1. After login, you should see the main dashboard
2. Check sidebar menu items (left side):
   - **대시보드** (Dashboard) - Overview
   - **프로젝트** (Projects) - Project management
   - **키오스크** (Kiosks) - Kiosk management
   - **객실 관리** (Rooms) - Room management
   - **예약 관리** (Sessions) - Reservation management
   - **영상통화** (Video Calls) - Video call management
   - **콘텐츠 관리** (Content) - Content management
   - **계정 관리** (Accounts) - User management

**Expected:** All menu items visible and accessible

---

### 3. Project Management
**URL:** http://localhost:3000/dashboard/projects

**Test Steps:**
1. Click **"프로젝트"** in sidebar
2. Click **"새 프로젝트 만들기"** (Create New Project) button
3. Fill in form:
   - **프로젝트 이름** (Name): "Test Hotel"
   - **슬러그** (Slug): "test-hotel"
   - Toggle **활성 상태** (Active Status) to ON
4. Click **"프로젝트 만들기"** (Create Project)
5. ✅ New project should appear in list

**Test Update:**
1. Click **"편집"** (Edit) button on the project
2. Change name to "Test Hotel Updated"
3. Click **"변경사항 저장"** (Save Changes)
4. ✅ Project name should update

**Test Settings:**
1. Click **"설정"** (Settings) button
2. Update room management settings
3. Click **"설정 저장"** (Save Settings)
4. ✅ Settings saved successfully

**Expected:** Can create, edit, and configure projects

---

### 4. Room Type Management
**URL:** http://localhost:3000/dashboard/projects (then click a project)

**Test Steps:**
1. On projects page, click a project card
2. Scroll to **"객실 타입"** (Room Types) section
3. Click **"+ 새 객실 타입"** (Add New Room Type)
4. Fill in form:
   - **이름** (Name): "Standard Room"
   - **설명** (Description): "Standard double room"
   - **기본 가격** (Base Price): "100000"
   - **최대 인원** (Max Guests): "2"
   - **표시 순서** (Display Order): "1"
5. Click **"만들기"** (Create)
6. ✅ Room type should appear in list

**Expected:** Can create and manage room types

---

### 5. Kiosk Management
**URL:** http://localhost:3000/dashboard/kiosks

**Test Steps:**
1. Click **"키오스크"** in sidebar
2. Select your project from dropdown at top
3. Click **"+ 새 키오스크 등록"** (Register New Kiosk)
4. Fill in form:
   - **이름** (Name): "Lobby Kiosk 1"
   - **위치** (Location): "Front Lobby"
   - **프로젝트** (Project): Select your project
5. Click **"등록"** (Register)
6. ✅ Kiosk should appear in list with status

**Test Screen Monitoring:**
1. Click **"화면 보기"** (View Screen) on a kiosk
2. ✅ Should open modal (screen will be black until kiosk is active)

**Expected:** Can register and monitor kiosks

---

### 6. Room Management
**URL:** http://localhost:3000/dashboard/rooms

**Test Steps:**
1. Click **"객실 관리"** in sidebar
2. Select your project from dropdown
3. Click **"+ 객실 추가"** (Add Room)
4. Fill in form:
   - **객실 번호** (Room Number): "101"
   - **객실 타입** (Room Type): Select "Standard Room"
   - **층** (Floor): "1"
   - **접근 방식** (Access Type): 
     - Choose **"비밀번호"** (Password) or **"카드키"** (Card Key)
   - If Password: Enter **객실 비밀번호** (Room Password)
   - If Card: Enter **키 박스 번호** (Key Box Number) and **비밀번호** (Password)
5. Click **"추가"** (Add)
6. ✅ Room should appear in today's list

**Test Room Status:**
1. Room should show **"사용 가능"** (Available) status
2. ✅ Status displayed correctly

**Test Room Reset (End of Day):**
1. Click **"전체 초기화"** (Reset All) button at top
2. Confirm the action
3. ✅ All rooms reset successfully

**Expected:** Can add rooms and manage daily status

---

### 7. Reservation/Session Management
**URL:** http://localhost:3000/dashboard/sessions

**Test Steps:**
1. Click **"예약 관리"** in sidebar
2. Select project and date filters at top
3. View list of reservations
4. ✅ Can see reservations (will be empty initially)

**Test Filters:**
- **프로젝트** (Project): Filter by project
- **날짜** (Date): Filter by check-in date
- **상태** (Status): Filter by reservation status
- ✅ Filters work correctly

**Expected:** Can view and filter reservations

---

### 8. Video Call Management
**URL:** http://localhost:3000/dashboard/video-calls

**Test Steps:**
1. Click **"영상통화"** in sidebar
2. View incoming call list (polling every 3 seconds)
3. ✅ Page loads without errors

**Note:** Video calls require:
- A kiosk device to initiate call
- WebRTC connection (works in development)

**Expected:** Page loads and polls for calls

---

### 9. Content Management
**URL:** http://localhost:3000/dashboard/content

**Test Steps:**
1. Click **"콘텐츠 관리"** in sidebar
2. Select your project from dropdown
3. Click **"+ 새 콘텐츠 추가"** (Add New Content)
4. Fill in form:
   - **키** (Key): "welcome_message"
   - **값** (Value): "Welcome to our hotel!"
   - **언어** (Language): "ko"
5. Click **"추가"** (Add)
6. ✅ Content should appear in list

**Test Edit:**
1. Click **"편집"** (Edit) button
2. Change the value
3. Click **"저장"** (Save)
4. ✅ Content updated

**Expected:** Can manage kiosk display content

---

### 10. Account Management
**URL:** http://localhost:3000/dashboard/accounts

**Test Steps:**
1. Click **"계정 관리"** in sidebar
2. View list of users (should see admin@admin.com)
3. Click **"+ 새 계정 만들기"** (Create New Account)
4. Fill in form:
   - **이메일** (Email): "staff@test.com"
   - **비밀번호** (Password): "password123"
   - **전체 이름** (Full Name): "Test Staff"
   - **역할** (Role): Select "staff" or "project_admin"
   - **프로젝트** (Project): Select project (if not super_admin)
5. Click **"계정 만들기"** (Create Account)
6. ✅ Account should appear in list

**Test Login with New Account:**
1. Logout from current session
2. Login with new credentials
3. ✅ Should see limited permissions (if not super_admin)

**Expected:** Can create and manage user accounts

---

### 11. Kiosk Interface (Guest-Facing)
**URL:** http://localhost:3000/kiosk

**⚠️ Important:** For voice/video features to work:
- Access via `http://localhost:3000/kiosk` on the server machine, OR
- Set up HTTPS for network access (see Common Issues section)

**Test Steps:**
1. Open new browser tab/window
2. Navigate to http://localhost:3000/kiosk
3. You should see the kiosk check-in interface

**Kiosk Flow:**
1. **시작 화면** (Welcome Screen)
   - Click **"체크인 시작"** (Start Check-in)

2. **개인정보 입력** (Guest Information)
   - **이름** (Name): Enter name
   - **휴대폰** (Phone): Enter phone number
   - **이메일** (Email): Enter email
   - **인원** (Number of Guests): Select number
   - Click **"다음"** (Next)

3. **신분증 확인** (ID Verification)
   - Click **"신분증 스캔"** (Scan ID)
   - Click **"확인"** (Confirm) after scan simulation
   - Click **"다음"** (Next)

4. **결제** (Payment)
   - Select room type
   - Select payment method
   - Click **"결제하기"** (Pay)

5. **완료** (Completion)
   - See room number and access code
   - Click **"완료"** (Finish)

**Staff Call Feature:**
- Click **"직원 호출"** (Call Staff) button at top right
- ✅ Video call modal should appear

**Expected:** Full check-in flow works without errors

---

## Known Working Features ✅

After PostgreSQL migration, these features are confirmed working:

1. ✅ JWT Authentication (login/logout)
2. ✅ Project CRUD operations
3. ✅ Kiosk registration and monitoring
4. ✅ Room type management
5. ✅ Room creation and status tracking
6. ✅ Reservation listing and filtering
7. ✅ User account management
8. ✅ Content management (kiosk customization)
9. ✅ Video session polling (replaces Supabase Realtime)
10. ✅ Screen frame polling for kiosk monitoring
11. ✅ Signaling messages for WebRTC

---

## Common Issues & Solutions

### Issue: "Unauthorized" errors
**Solution:** Ensure you're logged in. JWT token expires after 7 days.

### Issue: "Specific Project ID required" error
**Solution:** Select a specific project instead of "모든 프로젝트" (All Projects) for operations that require it.

### Issue: Video calls not connecting
**Solution:** 
- Ensure both kiosk and dashboard are on same network
- Check browser permissions for camera/microphone
- WebRTC requires HTTPS in production

### Issue: "이 브라우저는 음성 통화를 지원하지 않습니다" (Browser doesn't support voice calls)
**Cause:** Accessing via HTTP on a network IP address (e.g., http://192.168.1.50:3000)

**Solution:** Browsers block camera/microphone on HTTP for non-localhost addresses. Options:
1. **Use localhost** - Access via `http://localhost:3000` on the same machine ✅
2. **Set up HTTPS** - Use mkcert or Let's Encrypt for local SSL certificate
3. **Use ngrok** - Create HTTPS tunnel: `ngrok http 3000`
4. **Chrome flag** (testing only): `chrome.exe --unsafely-treat-insecure-origin-as-secure="http://YOUR-IP:3000"`

**Why:** WebRTC's `getUserMedia` requires secure context (HTTPS or localhost) for security

### Issue: Polling delays
**Solution:** 
- Video sessions poll every 3 seconds
- Screen frames poll every 2 seconds
- This is normal for polling-based updates

---

## Database Health Check

Run these commands to verify database state:

```powershell
# Check all tables exist
$env:PGPASSWORD='00oo00oo'; psql -U orange -d kiosk -c "\dt"

# Check users
$env:PGPASSWORD='00oo00oo'; psql -U orange -d kiosk -c "SELECT email, created_at FROM users;"

# Check profiles
$env:PGPASSWORD='00oo00oo'; psql -U orange -d kiosk -c "SELECT email, role FROM profiles;"

# Check projects
$env:PGPASSWORD='00oo00oo'; psql -U orange -d kiosk -c "SELECT name, slug, is_active FROM projects;"
```

---

## Performance Notes

- **Polling intervals** are configurable in the code
- **Database queries** use indexes for performance
- **Connection pooling** should be configured for production
- **JWT tokens** are validated on every API request

---

## Production Checklist

Before deploying to production:

1. ☐ Change all default passwords
2. ☐ Use strong JWT_SECRET
3. ☐ Configure SSL for PostgreSQL
4. ☐ Set up database backups
5. ☐ Enable connection pooling (pg-pool)
6. ☐ Configure CORS properly
7. ☐ Set up HTTPS (required for WebRTC)
8. ☐ Configure useB API credentials
9. ☐ Set appropriate polling intervals
10. ☐ Enable rate limiting

---

## Success Criteria

Your PostgreSQL migration is successful if:

✅ You can login with admin credentials
✅ You can create a project
✅ You can add room types and rooms
✅ You can register a kiosk
✅ You can create user accounts
✅ Kiosk interface loads without errors
✅ No console errors about missing columns
✅ Video call page loads (even if no calls)
✅ All API endpoints return 200 or appropriate status codes
✅ No references to Supabase in console errors

---

## Quick Test Script

Run through this in 5 minutes:

1. Login → Dashboard (should work)
2. Create Project → "Test Hotel" (should work)
3. Add Room Type → "Standard Room" (should work)
4. Register Kiosk → "Test Kiosk" (should work)
5. Add Room → Room 101 (should work)
6. Open /kiosk in new tab (should load)
7. Create Staff Account (should work)
8. Logout and login with staff account (should work)

If all 8 steps work, migration is successful! 🎉
