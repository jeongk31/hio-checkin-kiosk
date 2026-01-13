-- Cleanup script for stale video sessions
-- Run this if you see false "admin busy" notifications

-- 1. Update sessions that have ended_at but wrong status
UPDATE video_sessions 
SET status = 'ended' 
WHERE ended_at IS NOT NULL AND status != 'ended';

-- 2. End sessions that have been "waiting" for more than 5 minutes
UPDATE video_sessions 
SET status = 'ended', 
    ended_at = NOW()
WHERE status = 'waiting' 
  AND started_at < NOW() - INTERVAL '5 minutes'
  AND ended_at IS NULL;

-- 3. End sessions that have been "connected" for more than 30 minutes
UPDATE video_sessions 
SET status = 'ended', 
    ended_at = NOW()
WHERE status = 'connected' 
  AND started_at < NOW() - INTERVAL '30 minutes'
  AND ended_at IS NULL;

-- 4. Show cleanup results
SELECT 
    status, 
    COUNT(*) as count,
    MIN(started_at) as oldest,
    MAX(started_at) as newest
FROM video_sessions
GROUP BY status
ORDER BY status;
