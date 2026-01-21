-- Add image_url column to room_types table
-- This enables room type images in the kiosk

-- Add the column if it doesn't exist
ALTER TABLE room_types 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add comment
COMMENT ON COLUMN room_types.image_url IS 'URL path to room type image, stored in /uploads/room-images/';

-- Show updated table structure
\d room_types
