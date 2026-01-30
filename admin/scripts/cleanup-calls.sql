-- Voice Call Cleanup Script
-- Run this to reset call state for testing

-- 1. End all active video sessions
UPDATE video_sessions
SET status = 'ended', ended_at = NOW()
WHERE status IN ('waiting', 'connected');

-- 2. Clear all signaling messages
DELETE FROM signaling_messages;

-- 3. Add sender column if missing
ALTER TABLE signaling_messages ADD COLUMN IF NOT EXISTS sender TEXT;

-- 4. Verify cleanup
SELECT 'Active sessions:' as info, COUNT(*) as count
FROM video_sessions
WHERE status IN ('waiting', 'connected');

SELECT 'Signaling messages:' as info, COUNT(*) as count
FROM signaling_messages;

-- 5. Show recent sessions for debugging
SELECT id, status, caller_type, started_at, ended_at
FROM video_sessions
ORDER BY started_at DESC
LIMIT 10;
