# Voice Call Testing Guide

## Prerequisites

1. Start the local development server:
```bash
cd admin
npm run dev
```

2. Make sure PostgreSQL is running with the signaling_messages table having the `sender` column:
```sql
ALTER TABLE signaling_messages ADD COLUMN IF NOT EXISTS sender TEXT;
```

## Test Scenarios

### Test 1: Kiosk → Admin Call

**Steps:**
1. Open Admin Dashboard: http://localhost:3000/dashboard
2. Open Kiosk in another tab: http://localhost:3000/kiosk
3. On Kiosk, click the "Staff Call" button
4. On Admin Dashboard, you should see incoming call notification
5. Click "Answer" on Admin Dashboard
6. Both should show "Connected" status

**Expected Flow:**
```
Kiosk: Creates session (status=waiting) → Subscribes → Waits
Admin: Polls, sees waiting session → Shows incoming notification
Admin: Clicks Answer → Sends 'call-answered' → Waits for offer
Kiosk: Receives 'call-answered' → Creates offer → Sends offer
Admin: Receives offer → Creates answer → Sends answer
Kiosk: Receives answer → ICE negotiation → Connected
Both: Show "Connected" status
```

### Test 2: Admin → Kiosk Call

**Steps:**
1. Open Admin Dashboard: http://localhost:3000/dashboard
2. Open Kiosk in another tab: http://localhost:3000/kiosk
3. On Admin Dashboard, find a kiosk in the list and click "Call"
4. Kiosk should show incoming call notification
5. Kiosk auto-answers (or click answer)
6. Both should show "Connected" status

**Expected Flow:**
```
Admin: Creates session (caller_type=manager) → Subscribes → Waits for kiosk
Kiosk: Polls, sees waiting session → Auto-answers
Kiosk: Subscribes → Sends 'call-answered'
Admin: Receives 'call-answered' → Creates offer → Sends offer
Kiosk: Receives offer → Creates answer → Sends answer
Admin: Receives answer → ICE negotiation → Connected
Both: Show "Connected" status
```

### Test 3: Call End (by Admin)

**Steps:**
1. Establish a call (either direction)
2. On Admin Dashboard, click "End Call"
3. Both should return to idle state

### Test 4: Call End (by Kiosk)

**Steps:**
1. Establish a call (either direction)
2. On Kiosk, click "End Call" or close the modal
3. Both should return to idle state

### Test 5: Call Decline (by Admin)

**Steps:**
1. On Kiosk, click "Staff Call"
2. On Admin Dashboard, click "Decline" instead of "Answer"
3. Kiosk should show "Call declined" message

### Test 6: No Answer Timeout

**Steps:**
1. On Kiosk, click "Staff Call"
2. Don't answer on Admin Dashboard
3. After 60 seconds, Kiosk should show "No answer" message

### Test 7: Browser Refresh During Call

**Steps:**
1. Establish a call
2. Refresh one of the browsers
3. The other side should detect disconnection

### Test 8: Multiple Kiosks Calling

**Steps:**
1. Open Admin Dashboard
2. Open two Kiosk tabs
3. Both kiosks call admin simultaneously
4. Admin answers one call
5. The other kiosk should show "Admin busy" message

## Console Logs to Watch

### Successful Kiosk → Admin Call:
```
[Kiosk] Signaling channel subscribed, waiting for manager to answer
[Manager] Incoming call from kiosk
[Manager] Answering call, session: xxx
[Manager Dashboard] 📤 Sending call-answered signal to kiosk
[Kiosk] 📥 Received signaling message: call-answered
[Kiosk] Manager answered the call!
[Kiosk] 📤 Sending offer to manager
[Manager] 📥 Received signaling message: offer
[Manager] Processing offer from kiosk...
[Manager] 📤 Answer sent to kiosk
[Kiosk] Setting remote description from answer
[Kiosk] ICE connection state: connected
[Kiosk] ✅ Call connected!
[Manager] ✅ ICE connection established!
```

### Successful Admin → Kiosk Call:
```
[Manager] Subscribed, waiting for kiosk to answer...
[IncomingCallFromManager] Signaling channel subscribed
[IncomingCallFromManager] 📤 Sending call-answered signal
[Manager] 📥 Received signaling message: call-answered
[Manager] Kiosk is ready, creating and sending offer...
[Manager] 📤 Sending offer to kiosk
[IncomingCallFromManager] 📥 Received signaling message: offer
[IncomingCallFromManager] Remote description set
[Manager] 📥 Received signaling message: answer
[Manager] Remote description set
[Manager] ✅ ICE connection established!
[IncomingCallFromManager] ✅ Call connected!
```

## Common Issues

### Issue: Call stuck on "Connecting"
- Check console for errors
- Verify ICE candidates are being exchanged
- Check if `oniceconnectionstatechange` fires

### Issue: "Admin is busy" when admin is free
- Check video_sessions table for stale sessions
- Clean up: `UPDATE video_sessions SET status='ended' WHERE status IN ('waiting', 'connected');`

### Issue: Multiple offers being sent
- Check console for "Already sent offer" or "Already created offer" logs
- If not appearing, the duplicate prevention flags aren't working

### Issue: Echo/feedback during call
- This is expected in local testing (same device)
- Use headphones or mute one tab

## Database Queries for Debugging

```sql
-- View active sessions
SELECT id, kiosk_id, status, caller_type, started_at, ended_at
FROM video_sessions
WHERE status IN ('waiting', 'connected')
ORDER BY started_at DESC;

-- View recent signaling messages
SELECT id, session_id, sender, payload->>'type' as type, created_at
FROM signaling_messages
ORDER BY created_at DESC
LIMIT 20;

-- Clean up all sessions (for testing)
UPDATE video_sessions SET status='ended', ended_at=NOW() WHERE status != 'ended';

-- Clean up signaling messages
DELETE FROM signaling_messages;
```

## Network Tab Checks

Monitor these API calls in browser DevTools Network tab:

1. `POST /api/video-sessions` - Create session
2. `PUT /api/video-sessions` - Update session status
3. `GET /api/video-sessions?status=waiting` - Poll for incoming calls
4. `GET /api/signaling?sessionId=xxx` - Poll for WebRTC signals
5. `POST /api/signaling` - Send WebRTC signals
6. `DELETE /api/signaling` - Clear old messages
