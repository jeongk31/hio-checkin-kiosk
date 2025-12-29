import { queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface Project {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only super admins can create projects
    if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { name, projectType, province } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Auto-generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);

    const settings = {
      type: projectType || '호텔',
      province: province || '',
      location: province || '',
    };

    // Create project with type and location in settings
    const project = await queryOne<Project>(
      `INSERT INTO projects (name, slug, is_active, settings)
       VALUES ($1, $2, true, $3)
       RETURNING *`,
      [name, slug, JSON.stringify(settings)]
    );

    if (!project) {
      return NextResponse.json({ error: 'Failed to create project' }, { status: 400 });
    }

    // Create default content for the project
    const defaultContent = [
      // Start Screen
      { key: 'start_welcome_title', value: '환영합니다' },
      { key: 'start_welcome_subtitle', value: '원하시는 서비스를 선택해 주세요' },
      { key: 'start_footer_info', value: '문의사항이 있으시면 우측 상단 직원 호출 버튼을 눌러주세요' },
      // Checkout
      { key: 'checkout_title', value: '체크아웃' },
      { key: 'checkout_thank_you', value: '호텔 그라체를 찾아주셔서 감사합니다.' },
      { key: 'checkout_instructions', value: '편안한 휴식이 되셨길 바라며\n사용하신 키는 키 박스의 반납함에\n반납해 주시기 바랍니다.' },
      { key: 'checkout_final_thanks', value: '감사합니다.' },
      // Check-in Reservation
      { key: 'checkin_title', value: '체크인' },
      { key: 'checkin_reservation_description', value: '예약하신 사이트에서 받으신 예약번호를 입력해 주세요' },
      // Consent
      { key: 'consent_title', value: '성인인증 및 숙박동의' },
      { key: 'consent_description', value: '스크롤을 내려 동의해 주시고 다음을 눌러주세요' },
      { key: 'consent_terms_title', value: '숙박 이용 약관' },
      { key: 'consent_terms_content', value: `제1조 (목적)
본 약관은 호텔 이용에 관한 기본적인 사항을 규정함을 목적으로 합니다.

제2조 (이용 계약의 성립)
숙박 이용 계약은 고객이 본 약관에 동의하고 예약을 신청한 후, 호텔이 이를 승낙함으로써 성립됩니다.

제3조 (체크인/체크아웃)
- 체크인: 오후 3시 이후
- 체크아웃: 오전 11시 이전

제4조 (객실 이용)
객실 내 흡연은 금지되어 있으며, 위반 시 청소비가 부과될 수 있습니다.

제5조 (개인정보 수집 및 이용)
호텔은 숙박 서비스 제공을 위해 필요한 최소한의 개인정보를 수집하며, 수집된 정보는 관련 법령에 따라 안전하게 관리됩니다.` },
      // Verification
      { key: 'verification_description', value: '신분증 인증과 얼굴 실물 인증을 진행합니다.\n인원을 입력해주세요.' },
      // Hotel Info
      { key: 'info_welcome_message', value: '호텔 그라체와 함께 즐거운 시간 되세요' },
      { key: 'info_section_title', value: '호텔 안내' },
      { key: 'info_checkin_label', value: '체크인 시간:' },
      { key: 'info_checkin_time', value: '오후 3시 이후' },
      { key: 'info_checkout_label', value: '체크아웃 시간:' },
      { key: 'info_checkout_time', value: '오전 11시 이전' },
      { key: 'info_room_notice_label', value: '객실에서의 주의사항:' },
      { key: 'info_room_notice', value: '객실 내 흡연 금지' },
      { key: 'info_emergency_label', value: '긴급 전화번호:' },
      { key: 'info_emergency_number', value: '프론트 내선 0번' },
      // Walk-in
      { key: 'walkin_title', value: '현장예약' },
      { key: 'walkin_room_description', value: '원하시는 객실을 선택해 주신 후 다음을 눌러주세요' },
    ];

    // Build bulk insert for kiosk_content
    const values: string[] = [];
    const params: (string | null)[] = [];
    let paramIndex = 1;

    for (const item of defaultContent) {
      values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 'ko')`);
      params.push(project.id, item.key, item.value);
    }

    await execute(
      `INSERT INTO kiosk_content (project_id, content_key, content_value, language)
       VALUES ${values.join(', ')}`,
      params
    );

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
