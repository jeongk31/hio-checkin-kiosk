-- Remove calltest_welcome_title from kiosk_content table
-- This content key is no longer used in the app

DELETE FROM kiosk_content 
WHERE content_key = 'calltest_welcome_title';
