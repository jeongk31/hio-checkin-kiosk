# Cancel Checkout Button - Testing Guide

## What It Does
The "Cancel Checkout" button allows kiosk administrators to remotely reset a kiosk back to the start screen from any current state (especially useful during checkout process).

## Components Modified

### 1. **KioskApp.tsx** (Kiosk Client)
- Added handler for `cancel_checkout` command in control command polling
- When received, kiosk navigates to `start` screen

### 2. **KioskManagement.tsx** (Admin Dashboard)
- Added orange "체크아웃 취소" button in kiosk monitoring panel
- Sends `cancel_checkout` command via `/api/kiosk-control`

### 3. **API** (Already Exists)
- Uses existing `/api/kiosk-control` endpoint
- No new backend code needed

---

## How to Test

### Prerequisites
1. Two browser windows/devices:
   - **Window A**: Admin dashboard (http://localhost:3000/dashboard/kiosks)
   - **Window B**: Kiosk interface (http://localhost:3000/kiosk)

2. Login credentials:
   - **Admin**: Any super_admin or project_admin user
   - **Kiosk**: User with `kiosk` or `call_only` role

---

## Test Scenarios

### Test 1: Cancel Checkout from Checkout Screen

#### Steps:
1. **Window B (Kiosk)**:
   - Navigate through the flow: Start → Check-in or Walk-in → ... → Checkout screen
   - Stay on checkout screen (showing "Thank you" message)

2. **Window A (Admin)**:
   - Go to Kiosks monitoring page
   - Find the active kiosk card (green "실시간" badge)
   - Click orange "체크아웃 취소" button
   - Confirm the dialog

3. **Expected Result**:
   - Admin sees "체크아웃 취소 명령을 전송했습니다" alert
   - Within 5 seconds, Window B (Kiosk) automatically goes back to start screen

#### Why 5 seconds?
Kiosk polls for commands every 5 seconds (line 567 in KioskApp.tsx)

---

### Test 2: Cancel from Any Screen

#### Steps:
1. **Window B (Kiosk)**:
   - Navigate to any screen (payment-confirm, room-selection, walkin-info, etc.)

2. **Window A (Admin)**:
   - Click "체크아웃 취소" button on that kiosk

3. **Expected Result**:
   - Kiosk returns to start screen regardless of current screen

---

### Test 3: Multiple Kiosks (If Available)

#### Steps:
1. Open multiple kiosk windows (different browser profiles or devices)
2. Each logged in with different kiosk accounts
3. Admin can cancel checkout on specific kiosks without affecting others

---

### Test 4: Offline Kiosk

#### Steps:
1. Close kiosk window (Window B)
2. Try clicking "체크아웃 취소" in admin dashboard

#### Expected Result:
- Command is sent successfully (stored in database)
- When kiosk comes back online, it will process the command on next poll

---

## Troubleshooting

### Issue: Kiosk doesn't return to start after clicking button

**Check:**
1. Console logs in kiosk window (F12):
   - Should see: `Remote cancel checkout signal received`
   - Should see navigation logs

2. Admin console logs:
   - Should see successful API response (200 OK)

3. Database check:
   ```sql
   -- Check if command was inserted
   SELECT * FROM kiosk_control_commands 
   WHERE command = 'cancel_checkout' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

4. Polling active?
   - Kiosk polls every 5 seconds
   - Wait at least 5-10 seconds for command to be picked up

---

### Issue: Button is disabled

**Possible Causes:**
1. Kiosk is offline (gray badge)
2. Network error during previous request
3. Refresh the admin page

---

## Manual Database Testing

If you want to test without the UI:

```sql
-- Manually insert cancel command
INSERT INTO kiosk_control_commands (kiosk_id, command, payload, processed)
VALUES (
  'YOUR_KIOSK_ID_HERE',  -- Get from kiosks table
  'cancel_checkout',
  '{}',
  false
);

-- Check if processed
SELECT * FROM kiosk_control_commands 
WHERE kiosk_id = 'YOUR_KIOSK_ID' 
AND processed = true;
```

---

## Command Flow Diagram

```
[Admin Dashboard]
      ↓
  Click "체크아웃 취소"
      ↓
  POST /api/kiosk-control
  { kioskId, command: 'cancel_checkout' }
      ↓
[Database: kiosk_control_commands]
  INSERT new command (processed=false)
      ↓
[Kiosk Poll Loop (every 5s)]
  GET /api/kiosk-control
      ↓
[API] Returns unprocessed commands
      ↓
[KioskApp] Receives commands
      ↓
  if (cmd.command === 'cancel_checkout')
      ↓
  goToScreen('start')
      ↓
[Kiosk] Back to start screen
      ↓
[Database] Mark command as processed
```

---

## Button Location in UI

The "체크아웃 취소" button appears:
- **Location**: Kiosk monitoring page, top-right of each kiosk card
- **Color**: Orange background (bg-orange-50)
- **Position**: Between "전화" (Call) and "로그아웃" (Logout) buttons
- **Visibility**: Only when kiosk is online (실시간 or 대기 중)

---

## Related Files

1. **Frontend (Kiosk)**:
   - `hio-checkin-kiosk/admin/src/app/(kiosk)/kiosk/KioskApp.tsx`
   - Lines 557-566: Command polling handler

2. **Frontend (Admin)**:
   - `hio-checkin-kiosk/admin/src/app/(dashboard)/dashboard/kiosks/KioskManagement.tsx`
   - Lines 286-309: Cancel checkout handler
   - Lines 400+: Button UI

3. **Backend API**:
   - `hio-checkin-kiosk/admin/src/app/api/kiosk-control/route.ts`
   - Existing endpoint, no changes needed

4. **Database Table**:
   - `kiosk_control_commands` (created during initial setup)

---

## Quick Test Command (PowerShell)

```powershell
# Terminal 1: Start dev server
cd d:\Github\Hotel\hio-checkin-kiosk\admin
npm run dev

# Terminal 2: Watch kiosk logs (if needed)
# Open browser console on kiosk page

# Open two browser windows:
# 1. http://localhost:3000/kiosk (login as kiosk user)
# 2. http://localhost:3000/dashboard/kiosks (login as admin)

# Test: Navigate kiosk to checkout screen, then click orange button in admin dashboard
```

---

## Success Criteria

✅ Button appears in admin dashboard for online kiosks
✅ Clicking button shows confirmation dialog
✅ Kiosk returns to start screen within 5-10 seconds
✅ Multiple kiosks can be controlled independently
✅ Command is stored in database if kiosk is offline
✅ No errors in console

---

## Notes

- **Polling Interval**: 5 seconds (can be adjusted in KioskApp.tsx line 567)
- **Permissions**: Only super_admin and project_admin can send commands
- **Database Cleanup**: Processed commands remain in database (consider adding cleanup job if needed)
- **Multi-language**: Button text is in Korean, can be localized if needed
