-- Migration: Add button texts and input labels to kiosk_content table
-- Date: 2026-01-21
-- Description: Adds customizable button texts and input field labels for all kiosk screens

-- Insert button texts for each existing project
-- This script is idempotent - it will skip any keys that already exist

DO $$
DECLARE
    proj_record RECORD;
BEGIN
    -- Loop through all active projects
    FOR proj_record IN SELECT id FROM projects WHERE is_active = true
    LOOP
        -- Button Texts
        INSERT INTO kiosk_content (project_id, content_key, content_value, language, created_at, updated_at)
        VALUES 
            -- Navigation Buttons
            (proj_record.id, 'btn_next', '다음', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_prev', '이전', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_complete', '완료', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_confirm', '확인', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_cancel', '취소', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_close', '닫기', 'ko', NOW(), NOW()),
            
            -- Action Buttons
            (proj_record.id, 'btn_retry', '다시 시도', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_retake', '다시 촬영', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_start_verification', '신분증 인증 시작', 'ko', NOW(), NOW()),
            
            -- Service Buttons (Start Screen)
            (proj_record.id, 'btn_checkin', '예약 확인', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_walkin', '현장예약', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_checkout', '체크아웃', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_staff_call', '고객 서비스 요청', 'ko', NOW(), NOW()),
            
            -- Form Buttons
            (proj_record.id, 'btn_agree_terms', '위 약관에 동의합니다 (필수)', 'ko', NOW(), NOW()),
            
            -- Status Messages
            (proj_record.id, 'btn_validating', '확인 중...', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_processing', '처리 중...', 'ko', NOW(), NOW()),
            
            -- Payment Buttons
            (proj_record.id, 'btn_card_payment', '카드 결제', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_tablet_payment', '태블릿 결제', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_cash_payment', '현금 결제', 'ko', NOW(), NOW()),
            (proj_record.id, 'btn_free_stay', '무료 숙박', 'ko', NOW(), NOW()),
            
            -- Input Field Labels
            (proj_record.id, 'label_reservation_number', '예약번호', 'ko', NOW(), NOW()),
            (proj_record.id, 'placeholder_reservation_number', '예약번호를 입력하세요', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_signature', '서명 (이름을 입력해 주세요)', 'ko', NOW(), NOW()),
            (proj_record.id, 'placeholder_signature', '홍길동', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_guest_count', '인원', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_room_type', '객실 타입', 'ko', NOW(), NOW()),
            (proj_record.id, 'label_room_price', '가격', 'ko', NOW(), NOW())
        ON CONFLICT (project_id, content_key, language) DO NOTHING;
        
        RAISE NOTICE 'Added button texts for project: %', proj_record.id;
    END LOOP;
    
    RAISE NOTICE 'Migration completed successfully!';
END $$;

-- Verify the migration
SELECT 
    p.name as project_name,
    COUNT(*) as button_text_count
FROM kiosk_content kc
JOIN projects p ON kc.project_id = p.id
WHERE kc.content_key LIKE 'btn_%' OR kc.content_key LIKE 'label_%' OR kc.content_key LIKE 'placeholder_%'
GROUP BY p.name
ORDER BY p.name;

-- Show sample of newly added content
SELECT 
    content_key,
    content_value,
    language
FROM kiosk_content
WHERE content_key IN ('btn_next', 'btn_checkin', 'btn_staff_call', 'label_reservation_number')
LIMIT 10;
