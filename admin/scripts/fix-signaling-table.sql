-- Fix signaling_messages table for voice call system
-- Run this script to add the missing sender column and fix the id column type

-- First, drop the old table and recreate with correct schema
DROP TABLE IF EXISTS signaling_messages;

CREATE TABLE signaling_messages (
    id SERIAL PRIMARY KEY,  -- Use SERIAL for auto-increment integer (needed for message ordering)
    session_id VARCHAR(255) NOT NULL,
    sender VARCHAR(50),     -- 'admin' or 'kiosk' - identifies who sent the message
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster polling queries
CREATE INDEX idx_signaling_session_id ON signaling_messages(session_id);
CREATE INDEX idx_signaling_created_at ON signaling_messages(created_at);

-- Success message
SELECT 'signaling_messages table fixed successfully!' as message;
