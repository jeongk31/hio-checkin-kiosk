# Call System Stability Fixes (Jan 2026)

## Issues Fixed

### 1. InvalidStateError in Peer Connection ✅
**Problem:** `Failed to execute 'setLocalDescription' on 'RTCPeerConnection': Cannot set local description in state stable`

**Root Cause:** Race condition - trying to create answer when peer connection is in wrong signaling state.

**Solution:**
- Added signaling state validation before WebRTC operations in [KioskApp.tsx](src/app/(kiosk)/kiosk/KioskApp.tsx)
- Lines 1446-1467: Check `pc.signalingState` before setting remote description
- Wrap offer handling in try/catch with proper error logging
- Added state logging for debugging: `console.log('[IncomingCallFromManager] Received SDP offer, current state:', pc.signalingState)`

### 2. False "Admin Busy" Notification ✅
**Problem:** Kiosks see "현재 다른 통화가 진행 중입니다" (Another call is in progress) even when admin is not in a call.

**Root Cause:** Stale sessions in database with `status='connected'` but `ended_at` timestamp set.

**Solution:**
- Updated status API to filter `AND ended_at IS NULL` in [status/route.ts](src/app/api/video-sessions/status/route.ts)
- Created cleanup SQL script: [cleanup-stale-sessions.sql](scripts/cleanup-stale-sessions.sql)
- Query now properly checks:
  ```sql
  WHERE status = 'connected'
    AND ended_at IS NULL
    AND started_at > NOW() - INTERVAL '30 minutes'
  ```

## Database Cleanup

If you see false "admin busy" notifications, run:

```powershell
cd d:\Github\Hotel\hio-checkin-kiosk
$env:PGPASSWORD='00oo00oo'
psql -U orange -d kiosk -f admin/scripts/cleanup-stale-sessions.sql
```

Or manually:
```sql
UPDATE video_sessions 
SET status = 'ended' 
WHERE ended_at IS NOT NULL AND status != 'ended';
```

## Testing the Fixes

### Test 1: Multiple Kiosks Calling Simultaneously
1. Open two kiosk windows (different kiosk IDs)
2. Both click "직원 호출" (Call Staff)
3. **Expected:** Second kiosk sees "현재 다른 통화가 진행 중입니다" notification
4. **Expected:** First kiosk continues to "waiting for answer" state
5. Admin answers first call
6. **Expected:** Second kiosk gets "다른 키오스크에서 진행 중입니다" notification

### Test 2: Admin Declines Call
1. Kiosk calls admin
2. Admin clicks "Decline"
3. **Expected:** Kiosk sees decline notification and resets call button
4. Kiosk should be able to call again immediately

### Test 3: Call State Recovery
1. Make a successful call, then hang up
2. Check database: `SELECT * FROM video_sessions ORDER BY started_at DESC LIMIT 1;`
3. **Expected:** Session should have `status='ended'` AND `ended_at` timestamp
4. Try making another call
5. **Expected:** No "admin busy" error, call proceeds normally

## Call Flow States

```
[Kiosk]                  [Database]              [Admin]
   │                         │                      │
   ├─ Click "Call" ─────────>│                      │
   │                         ├─ Create session      │
   │                         │  status='waiting'    │
   │                         │  ended_at=NULL       │
   │                         │                      │
   │<────── Poll ────────────┤                      │
   │                         │                      │
   │                         │<───── Poll ──────────┤
   │                         │  (Check status)      │
   │                         │                      │
   │                         │<── Answer ───────────┤
   │                         ├─ Update session      │
   │                         │  status='connected'  │
   │<──── WebRTC Offer ──────┤─────────────────────>│
   │                         │                      │
   │──── WebRTC Answer ─────>│─────────────────────>│
   │                         │                      │
   │<═════ ICE/Media ═══════>│<════════════════════>│
   │                         │                      │
   ├─ Hang up ──────────────>│                      │
   │                         ├─ Update session      │
   │                         │  status='ended'      │
   │                         │  ended_at=NOW()      │
```

## Debug Logs

When debugging call issues, look for these logs:

### Kiosk Console
```
[IncomingCallFromManager] Received SDP offer, current state: stable
[IncomingCallFromManager] Remote description set, new state: have-remote-offer
[IncomingCallFromManager] Error handling offer: <error details>
```

### Status API
```
[Status Check] Super admin - checking all active sessions
[Status Check] Found 1 active connected sessions
[Status Check] Active kiosk IDs: <kiosk-id>
```

### Admin Console (VoiceCallContext)
```
[Decline Call] Sending decline signal to session: <session-id>
[Answer Call] Declining other waiting sessions...
```

## Files Modified

1. **src/app/(kiosk)/kiosk/KioskApp.tsx** (Lines 1446-1467)
   - Added peer connection state validation
   - Enhanced error handling with try/catch
   - Added debug logging

2. **src/app/api/video-sessions/status/route.ts** (Lines 30-42)
   - Added `AND ended_at IS NULL` filter
   - Time-based session expiry (30 min connected, 5 min waiting)

3. **scripts/cleanup-stale-sessions.sql** (NEW)
   - Database maintenance script
   - Updates stale sessions to 'ended' status

## Prevention

To prevent these issues in the future:

1. **Always set both status and ended_at** when ending sessions:
   ```typescript
   await pool.query(
     'UPDATE video_sessions SET status = $1, ended_at = NOW() WHERE id = $2',
     ['ended', sessionId]
   );
   ```

2. **Check signaling state before WebRTC operations:**
   ```typescript
   if (pc.signalingState === 'stable') {
     const offer = await pc.createOffer();
     await pc.setLocalDescription(offer);
   }
   ```

3. **Use proper filters in status queries:**
   ```sql
   WHERE status = 'connected' AND ended_at IS NULL
   ```

## Known Limitations

- Call system uses polling (500ms interval) - not real-time
- STUN servers are public Google STUN (may have rate limits)
- No persistent call history (sessions cleaned up after ending)
- No reconnection logic for dropped connections

## Future Improvements

- [ ] Migrate to WebSocket for real-time signaling
- [ ] Add connection quality indicators
- [ ] Implement automatic reconnection on network issues
- [ ] Add call recording capability
- [ ] Scheduled cleanup job for old sessions (cron)
