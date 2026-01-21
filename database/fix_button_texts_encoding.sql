-- Fix corrupted button text encoding in production
-- Delete all corrupted button/label entries and re-insert with proper UTF-8 encoding

BEGIN;

-- First, delete all corrupted button texts and labels
DELETE FROM kiosk_content 
WHERE content_key LIKE 'btn_%' 
   OR content_key LIKE 'label_%' 
   OR content_key LIKE 'placeholder_%';

-- Re-insert with proper UTF-8 encoding for each project
-- Using E'' strings to ensure proper encoding
DO $$
DECLARE
    proj_record RECORD;
BEGIN
    FOR proj_record IN SELECT id FROM projects WHERE is_active = true
    LOOP
        INSERT INTO kiosk_content (project_id, content_key, content_value, language, created_at, updated_at)
        VALUES 
            -- Navigation Buttons
            (proj_record.id, 'btn_next', E'다음', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_prev', E'이전', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_complete', E'완료', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_confirm', E'확인', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_cancel', E'취소', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_close', E'닫기', 'ko', NOW(), NOW()),
            
            -- Action Buttons
            (proj_record.id, 'btn_retry', E'다시 시도', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_retake', E'다시 촬영', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_start_verification', E'신분증 인증 시작', 'ko', NOW(), NOW()),
            
            -- Service Buttons (Start Screen)
            (proj_record.id, 'btn_checkin', E'예약 확인', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_walkin', E'현장예약', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_checkout', E'체크아웃', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_staff_call', E'고객 서비스 요청', 'ko', NOW(), NOW()),
            
            -- Form Buttons
            (proj_record.id, 'btn_agree_terms', E'위 약관에 동의합니다 (필수)', 'ko', NOW(), NOW()),
            
            -- Status Messages
            (proj_record.id, 'btn_validating', E'확인 중...', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_processing', E'처리 중...', 'ko', NOW(), NOW()),
            
            -- Payment Buttons
            (proj_record.id, 'btn_card_payment', E'카드 결제', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_tablet_payment', E'태블릿 결제', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_cash_payment', E'현금 결제', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_free_stay', E'무료 숙박', 'ko', NOW(), NOW()),
            
            -- Input Field Labels
            (proj_record.id, 'label_reservation_number', E'예약번호', 'ko', NOW(), NOW()),
            (proj_record.id, 'placeholder_reservation_number', E'예약번호를 입력하세요', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_signature', E'서명 (이름을 입력해 주세요)', 'ko', NOW(), NOW()),
            (proj_record.id, 'placeholder_signature', E'홍길동', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_guest_count', E'인원', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_room_type', E'객실 타입', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_room_price', E'가격', 'ko', NOW(), NOW());
        
        RAISE NOTICE 'Fixed button texts for project: %', proj_record.id;
    END LOOP;
END $$;

COMMIT;

-- Verify the fix
SELECT 
    content_key,
    content_value,
    CASE WHEN content_value ~ '[가-힣]' THEN 'OK' ELSE 'STILL BROKEN' END as status
FROM kiosk_content 
WHERE content_key IN ('btn_next', 'btn_checkin', 'btn_staff_call')
LIMIT 5;
