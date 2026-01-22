'use client';

import { useState, useEffect } from 'react';
import { KioskContent } from '@/types/database';

interface SimpleProject {
  id: string;
  name: string;
}

interface ProjectSettings {
  daily_reset_time?: string; // Format: "HH:mm"
  payment_agent_url?: string; // Payment Agent URL for kiosk
  type?: string;
  province?: string;
  location?: string;
}

interface ContentEditorProps {
  initialContent: KioskContent[];
  projects: SimpleProject[] | null;
  defaultProjectId: string | null;
  isSuperAdmin: boolean;
}

// Define the content schema - only these fields are editable
interface ContentField {
  key: string;
  label: string;
  defaultValue: string;
  multiline?: boolean;
}

interface ContentSection {
  title: string;
  description: string;
  fields: ContentField[];
}

const contentSchema: ContentSection[] = [
  {
    title: '시작 화면',
    description: '키오스크 메인 화면에 표시되는 텍스트',
    fields: [
      { key: 'start_welcome_title', label: '환영 메시지 제목', defaultValue: '환영합니다' },
      { key: 'start_welcome_subtitle', label: '환영 메시지 부제목', defaultValue: '원하시는 서비스를 선택해 주세요' },
      { key: 'start_footer_info', label: '하단 안내 메시지', defaultValue: '문의사항이 있으시면 우측 상단 직원 호출 버튼을 눌러주세요' },
    ],
  },
  {
    title: '체크아웃',
    description: '체크아웃 화면에 표시되는 텍스트',
    fields: [
      { key: 'checkout_title', label: '화면 제목', defaultValue: '체크아웃' },
      { key: 'checkout_thank_you', label: '감사 메시지', defaultValue: '호텔 그라체를 찾아주셔서 감사합니다.' },
      { key: 'checkout_instructions', label: '안내 메시지', defaultValue: '편안한 휴식이 되셨길 바라며\n사용하신 키는 키 박스의 반납함에\n반납해 주시기 바랍니다.', multiline: true },
      { key: 'checkout_final_thanks', label: '마지막 인사', defaultValue: '감사합니다.' },
    ],
  },
  {
    title: '통화 테스트 모드 (Call Test)',
    description: '통화 기능 테스트용 키오스크 화면 텍스트',
    fields: [
      { key: 'calltest_welcome_subtitle', label: '환영 메시지 설명', defaultValue: '상단의 \'고객 서비스 요청\' 버튼을 사용하여 통화 기능을 테스트하세요' },
    ],
  },
  {
    title: '체크인 - 예약번호 입력',
    description: '예약번호를 입력하는 첫 번째 체크인 화면',
    fields: [
      { key: 'checkin_title', label: '화면 제목', defaultValue: '체크인' },
      { key: 'checkin_reservation_description', label: '안내 메시지', defaultValue: '예약하신 사이트에서 받으신 예약번호를 입력해 주세요' },
    ],
  },
  {
    title: '체크인 - 동의 화면',
    description: '성인인증 및 숙박동의 화면 (체크인/현장예약 공통)',
    fields: [
      { key: 'consent_title', label: '화면 제목', defaultValue: '성인인증 및 숙박동의' },
      { key: 'consent_description', label: '안내 메시지', defaultValue: '스크롤을 내려 동의해 주시고 다음을 눌러주세요' },
      { key: 'consent_terms_title', label: '약관 제목', defaultValue: '숙박 이용 약관' },
      {
        key: 'consent_terms_content',
        label: '약관 내용',
        defaultValue: `제1조 (목적)
본 약관은 호텔 이용에 관한 기본적인 사항을 규정함을 목적으로 합니다.

제2조 (이용 계약의 성립)
숙박 이용 계약은 고객이 본 약관에 동의하고 예약을 신청한 후, 호텔이 이를 승낙함으로써 성립됩니다.

제3조 (체크인/체크아웃)
- 체크인: 오후 3시 이후
- 체크아웃: 오전 11시 이전

제4조 (객실 이용)
객실 내 흡연은 금지되어 있으며, 위반 시 청소비가 부과될 수 있습니다.

제5조 (개인정보 수집 및 이용)
호텔은 숙박 서비스 제공을 위해 필요한 최소한의 개인정보를 수집하며, 수집된 정보는 관련 법령에 따라 안전하게 관리됩니다.`,
        multiline: true,
      },
    ],
  },
  {
    title: '체크인 - 신분증 인증',
    description: '신분증 및 얼굴 인증 화면 (체크인/현장예약 공통)',
    fields: [
      { key: 'verification_description', label: '안내 메시지', defaultValue: '신분증 인증과 얼굴 실물 인증을 진행합니다.\n인원을 입력해주세요.', multiline: true },
    ],
  },
  {
    title: '체크인 완료 - 호텔 안내',
    description: '체크인/현장예약 완료 후 호텔 안내 화면',
    fields: [
      { key: 'info_keybox_instruction', label: '키박스 안내 메시지', defaultValue: '키 박스 내의 키와 어메니티를 챙겨주세요' },
      { key: 'info_welcome_message', label: '환영 메시지', defaultValue: '호텔 그라체와 함께 즐거운 시간 되세요' },
      { key: 'info_section_title', label: '호텔 안내 제목', defaultValue: '호텔 안내' },
      { key: 'info_checkin_label', label: '체크인 시간 라벨', defaultValue: '체크인 시간:' },
      { key: 'info_checkin_time', label: '체크인 시간', defaultValue: '오후 3시 이후' },
      { key: 'info_checkout_label', label: '체크아웃 시간 라벨', defaultValue: '체크아웃 시간:' },
      { key: 'info_checkout_time', label: '체크아웃 시간', defaultValue: '오전 11시 이전' },
      { key: 'info_room_notice_label', label: '객실 주의사항 라벨', defaultValue: '객실에서의 주의사항:' },
      { key: 'info_room_notice', label: '객실 주의사항', defaultValue: '객실 내 흡연 금지' },
      { key: 'info_emergency_label', label: '긴급 전화번호 라벨', defaultValue: '긴급 전화번호:' },
      { key: 'info_emergency_number', label: '긴급 전화번호', defaultValue: '프론트 내선 0번' },
      { key: 'info_room_section_title', label: '객실 안내 제목', defaultValue: '객실 안내' },
    ],
  },
  {
    title: '현장예약 - 객실 선택',
    description: '예약 없이 방문 시 객실 선택 화면',
    fields: [
      { key: 'walkin_title', label: '화면 제목', defaultValue: '현장예약' },
      { key: 'walkin_room_description', label: '안내 메시지', defaultValue: '원하시는 객실을 선택해 주신 후 다음을 눌러주세요' },
    ],
  },
  {
    title: '버튼 텍스트',
    description: '키오스크 전체 화면에서 사용되는 버튼 텍스트',
    fields: [
      { key: 'btn_next', label: '다음 버튼', defaultValue: '다음' },
      { key: 'btn_prev', label: '이전 버튼', defaultValue: '이전' },
      { key: 'btn_complete', label: '완료 버튼', defaultValue: '완료' },
      { key: 'btn_confirm', label: '확인 버튼', defaultValue: '확인' },
      { key: 'btn_cancel', label: '취소 버튼', defaultValue: '취소' },
      { key: 'btn_close', label: '닫기 버튼', defaultValue: '닫기' },
      { key: 'btn_retry', label: '다시 시도 버튼', defaultValue: '다시 시도' },
      { key: 'btn_retake', label: '다시 촬영 버튼', defaultValue: '다시 촬영' },
      { key: 'btn_start_verification', label: '신분증 인증 시작 버튼', defaultValue: '신분증 인증 시작' },
      { key: 'btn_checkin', label: '체크인 버튼 (시작 화면)', defaultValue: '예약 확인' },
      { key: 'btn_walkin', label: '현장예약 버튼 (시작 화면)', defaultValue: '현장예약' },
      { key: 'btn_checkout', label: '체크아웃 버튼 (시작 화면)', defaultValue: '체크아웃' },
      { key: 'btn_staff_call', label: '직원 호출 버튼', defaultValue: '고객 서비스 요청' },
      { key: 'btn_agree_terms', label: '약관 동의 체크박스 라벨', defaultValue: '위 약관에 동의합니다 (필수)' },
      { key: 'btn_validating', label: '확인 중 메시지', defaultValue: '확인 중...' },
      { key: 'btn_processing', label: '처리 중 메시지', defaultValue: '처리 중...' },
      { key: 'btn_card_payment', label: '카드 결제 버튼', defaultValue: '카드 결제' },
      { key: 'btn_tablet_payment', label: '태블릿 결제 버튼', defaultValue: '태블릿 결제' },
      { key: 'btn_cash_payment', label: '현금 결제 버튼', defaultValue: '현금 결제' },
      { key: 'btn_free_stay', label: '무료 숙박 버튼', defaultValue: '무료 숙박' },
    ],
  },
  {
    title: '입력 필드 & 라벨',
    description: '키오스크 화면의 입력 필드 라벨 및 플레이스홀더',
    fields: [
      { key: 'label_reservation_number', label: '예약번호 라벨', defaultValue: '예약번호' },
      { key: 'placeholder_reservation_number', label: '예약번호 플레이스홀더', defaultValue: '예약번호를 입력하세요' },
      { key: 'label_signature', label: '서명 라벨', defaultValue: '서명 (이름을 입력해 주세요)' },
      { key: 'placeholder_signature', label: '서명 플레이스홀더', defaultValue: '홍길동' },
      { key: 'label_guest_count', label: '인원수 라벨', defaultValue: '인원' },
      { key: 'label_room_type', label: '객실 타입 라벨', defaultValue: '객실 타입' },
      { key: 'label_room_price', label: '객실 가격 라벨', defaultValue: '가격' },
    ],
  },
];

// Get all content keys from schema
export const getAllContentKeys = (): string[] => {
  return contentSchema.flatMap(section => section.fields.map(field => field.key));
};

// Get default values for all content
export const getDefaultContent = (): Record<string, string> => {
  const defaults: Record<string, string> = {};
  contentSchema.forEach(section => {
    section.fields.forEach(field => {
      defaults[field.key] = field.defaultValue;
    });
  });
  return defaults;
};

export default function ContentEditor({
  initialContent,
  projects,
  defaultProjectId,
  isSuperAdmin,
}: ContentEditorProps) {
  const [content, setContent] = useState<Record<string, KioskContent>>({});
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Convert content array to map
  useEffect(() => {
    const contentMap: Record<string, KioskContent> = {};
    initialContent.forEach(item => {
      contentMap[item.content_key] = item;
    });
    setContent(contentMap);
  }, [initialContent]);

  const loadContent = async (pid: string) => {
    try {
      const response = await fetch(`/api/content?projectId=${pid}`);
      if (response.ok) {
        const data = await response.json();
        const contentMap: Record<string, KioskContent> = {};
        (data.content || []).forEach((item: KioskContent) => {
          contentMap[item.content_key] = item;
        });
        setContent(contentMap);
      }
    } catch (error) {
      console.error('Error loading content:', error);
    }
  };

  const loadProjectSettings = async (pid: string) => {
    try {
      const response = await fetch(`/api/projects/${pid}/settings`);
      if (response.ok) {
        const data = await response.json();
        setProjectSettings(data.settings || {});
      }
    } catch (error) {
      console.error('Error loading project settings:', error);
    }
  };

  const saveProjectSettings = async (settings: Partial<ProjectSettings>) => {
    if (!projectId) return;
    setSavingSettings(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (response.ok) {
        const data = await response.json();
        setProjectSettings(data.settings);
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2000);
      }
    } catch (error) {
      console.error('Error saving project settings:', error);
    }
    setSavingSettings(false);
  };

  useEffect(() => {
    if (projectId) {
      loadContent(projectId);
      loadProjectSettings(projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSave = async (key: string, value: string) => {
    setSaving(key);
    try {
      const existingItem = content[key];

      if (existingItem) {
        // Update existing
        const response = await fetch('/api/content', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingItem.id,
            contentValue: value,
            projectId,
          }),
        });

        if (response.ok) {
          setContent(prev => ({
            ...prev,
            [key]: { ...existingItem, content_value: value },
          }));
          setSavedKeys(prev => new Set(prev).add(key));
          setTimeout(() => {
            setSavedKeys(prev => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          }, 2000);
        }
      } else {
        // Create new
        const response = await fetch('/api/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            contentKey: key,
            contentValue: value,
            language: 'ko',
          }),
        });

        const result = await response.json();

        if (response.ok && result.content) {
          setContent(prev => ({
            ...prev,
            [key]: result.content,
          }));
          setSavedKeys(prev => new Set(prev).add(key));
          setTimeout(() => {
            setSavedKeys(prev => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error saving content:', error);
    }
    setSaving(null);
  };

  const initializeAllContent = async () => {
    if (!projectId) return;

    const defaults = getDefaultContent();
    const keysToCreate = Object.keys(defaults).filter(key => !content[key]);

    if (keysToCreate.length === 0) {
      alert('모든 콘텐츠가 이미 초기화되어 있습니다.');
      return;
    }

    setSaving('all');
    try {
      for (const key of keysToCreate) {
        await fetch('/api/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            contentKey: key,
            contentValue: defaults[key],
            language: 'ko',
          }),
        });
      }
      await loadContent(projectId);
      alert(`${keysToCreate.length}개의 콘텐츠가 초기화되었습니다.`);
    } catch (error) {
      console.error('Error initializing content:', error);
      alert('콘텐츠 초기화 중 오류가 발생했습니다.');
    }
    setSaving(null);
  };

  return (
    <div className="max-w-4xl">
      {isSuperAdmin && projects && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            프로젝트 선택
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">프로젝트 선택</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {projectId && (
        <>
          {/* Project Settings Section */}
          <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="text-lg font-semibold text-gray-900">프로젝트 설정</h3>
              <p className="text-sm text-gray-500 mt-1">당일 객실 데이터 자동 초기화 설정 및 결제 에이전트 URL</p>
            </div>
            <div className="px-6 py-4 space-y-6">
              {/* Daily Reset Time */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    일일 리셋 시간 (KST)
                  </label>
                  <p className="text-xs text-gray-500">
                    매일 지정된 시간에 당일 객실 데이터가 자동으로 삭제됩니다
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={projectSettings.daily_reset_time || ''}
                    onChange={(e) => {
                      setProjectSettings(prev => ({
                        ...prev,
                        daily_reset_time: e.target.value,
                      }));
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => saveProjectSettings({ daily_reset_time: projectSettings.daily_reset_time })}
                    disabled={savingSettings}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingSettings ? '저장 중...' : '저장'}
                  </button>
                  {settingsSaved && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      저장됨
                    </span>
                  )}
                </div>
              </div>
              {projectSettings.daily_reset_time && (
                <p className="text-sm text-blue-600">
                  현재 설정: 매일 {projectSettings.daily_reset_time} (한국 시간)에 당일 객실 데이터가 초기화됩니다
                </p>
              )}

              {/* Payment Agent URL */}
              <div className="pt-4 border-t">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    결제 에이전트 URL
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    키오스크 결제 시 사용할 Payment Agent URL (예: http://localhost:8085)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={projectSettings.payment_agent_url || ''}
                    onChange={(e) => {
                      setProjectSettings(prev => ({
                        ...prev,
                        payment_agent_url: e.target.value,
                      }));
                    }}
                    placeholder="http://localhost:8085"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => saveProjectSettings({ payment_agent_url: projectSettings.payment_agent_url })}
                    disabled={savingSettings}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingSettings ? '저장 중...' : '저장'}
                  </button>
                </div>
                {projectSettings.payment_agent_url && (
                  <p className="text-sm text-blue-600 mt-2">
                    현재 설정: {projectSettings.payment_agent_url}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6 flex justify-between items-center">
            <p className="text-sm text-gray-600">
              이 프로젝트의 모든 키오스크에 동일한 텍스트가 적용됩니다.
            </p>
            <button
              onClick={initializeAllContent}
              disabled={saving === 'all'}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
            >
              {saving === 'all' ? '초기화 중...' : '기본값으로 초기화'}
            </button>
          </div>

          <div className="space-y-8">
            {contentSchema.map((section) => (
              <ContentSection
                key={section.title}
                section={section}
                content={content}
                onSave={handleSave}
                saving={saving}
                savedKeys={savedKeys}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface ContentSectionProps {
  section: ContentSection;
  content: Record<string, KioskContent>;
  onSave: (key: string, value: string, field: ContentField) => void;
  saving: string | null;
  savedKeys: Set<string>;
}

function ContentSection({ section, content, onSave, saving, savedKeys }: ContentSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b">
        <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
        <p className="text-sm text-gray-500 mt-1">{section.description}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {section.fields.map((field) => (
          <ContentField
            key={field.key}
            field={field}
            currentValue={content[field.key]?.content_value ?? undefined}
            onSave={onSave}
            saving={saving === field.key}
            saved={savedKeys.has(field.key)}
          />
        ))}
      </div>
    </div>
  );
}

interface ContentFieldProps {
  field: ContentField;
  currentValue?: string;
  onSave: (key: string, value: string, field: ContentField) => void;
  saving: boolean;
  saved: boolean;
}

function ContentField({ field, currentValue, onSave, saving, saved }: ContentFieldProps) {
  const [value, setValue] = useState(currentValue ?? field.defaultValue);
  const [isEdited, setIsEdited] = useState(false);

  useEffect(() => {
    setValue(currentValue ?? field.defaultValue);
    setIsEdited(false);
  }, [currentValue, field.defaultValue]);

  const handleChange = (newValue: string) => {
    setValue(newValue);
    // Allow saving empty values - compare against current value (or default if no current value exists)
    const compareValue = currentValue !== undefined ? currentValue : field.defaultValue;
    setIsEdited(newValue !== compareValue);
  };

  const handleSave = () => {
    onSave(field.key, value, field);
    setIsEdited(false);
  };

  const handleReset = () => {
    setValue(currentValue ?? field.defaultValue);
    setIsEdited(false);
  };

  return (
    <div className="px-6 py-4">
      <div className="flex justify-between items-start mb-2">
        <label className="block text-sm font-medium text-gray-700">
          {field.label}
        </label>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              저장됨
            </span>
          )}
          {isEdited && (
            <>
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </>
          )}
        </div>
      </div>
      {field.multiline ? (
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          rows={Math.min(10, Math.max(3, value.split('\n').length + 1))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      )}
      {!currentValue && (
        <p className="text-xs text-gray-400 mt-1">기본값 사용 중 (저장되지 않음)</p>
      )}
    </div>
  );
}
