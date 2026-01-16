-- Add Call Test content for all existing projects
-- Must be run with UTF-8 encoding

INSERT INTO kiosk_content (project_id, content_key, content_value, language)
SELECT 
    p.id,
    'calltest_welcome_subtitle',
    '상단의 ''고객 서비스 요청'' 버튼을 사용하여 통화 기능을 테스트하세요',
    'ko'
FROM projects p
ON CONFLICT (project_id, content_key, language) DO UPDATE
SET content_value = EXCLUDED.content_value;
