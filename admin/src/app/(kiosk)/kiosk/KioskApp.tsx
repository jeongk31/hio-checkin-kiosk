'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Kiosk } from '@/types/database';
import {
  launchPayment,
  generateTransactionNo,
  EasyCheckPaymentRequest,
} from '@/lib/easycheck';

// Helper functions to use fetch API for database operations
async function updateKiosk(kioskId: string, updates: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch('/api/kiosks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: kioskId, ...updates }),
      credentials: 'include',
    });
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
      return false;
    }
    return response.ok;
  } catch (error) {
    console.error('Error updating kiosk:', error);
    return false;
  }
}

async function createVideoSession(data: {
  kiosk_id: string;
  project_id: string;
  room_name: string;
  status: string;
  caller_type: string;
}): Promise<{ id: string; room_name: string } | null> {
  try {
    const response = await fetch('/api/video-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    
    if (response.status === 401) {
      console.error('[Kiosk] Unauthorized: Session expired or invalid');
      // Redirect to login if session expired
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return null;
    }
    
    if (response.ok) {
      const result = await response.json();
      return result.session;
    }
    
    // Log error details
    const errorText = await response.text();
    console.error('[Kiosk] Failed to create video session:', response.status, errorText);
    return null;
  } catch (error) {
    console.error('Error creating video session:', error);
    return null;
  }
}

async function updateVideoSession(id: string, updates: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch('/api/video-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
      credentials: 'include',
    });
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
      return false;
    }
    return response.ok;
  } catch (error) {
    console.error('Error updating video session:', error);
    return false;
  }
}

// Helper to poll for control commands
async function pollControlCommands(): Promise<{ command: string; payload: Record<string, unknown> }[]> {
  try {
    const response = await fetch('/api/kiosk-control', {
      credentials: 'include',
    });
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
      return [];
    }
    if (response.ok) {
      const data = await response.json();
      return data.commands || [];
    }
    return [];
  } catch (error) {
    console.error('Error polling control commands:', error);
    return [];
  }
}

// Helper to poll for incoming calls from manager
async function pollIncomingCalls(kioskId: string): Promise<{ id: string; room_name: string } | null> {
  try {
    const response = await fetch(`/api/video-sessions?status=waiting&caller_type=manager&kiosk_id=${kioskId}`, {
      credentials: 'include',
    });
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
      return null;
    }
    if (response.ok) {
      const data = await response.json();
      const sessions = data.sessions || [];
      return sessions[0] || null;
    }
    return null;
  } catch (error) {
    console.error('Error polling incoming calls:', error);
    return null;
  }
}

// Helper to upload screen frame
async function uploadScreenFrame(frameData: string): Promise<boolean> {
  try {
    const response = await fetch('/api/kiosk-screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frameData }),
      credentials: 'include',
    });
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
      return false;
    }
    return response.ok;
  } catch (error) {
    console.error('Error uploading screen frame:', error);
    return false;
  }
}

// Signaling message types for WebRTC
type SignalingMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'call-answered' }
  | { type: 'call-ended'; reason: 'declined' | 'ended' | 'timeout' | 'error' };

// Polling-based signaling channel (replaces Supabase Realtime)
class SignalingChannel {
  private sessionId: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private messageHandler: ((msg: SignalingMessage) => void) | null = null;
  private lastMessageId: number = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  onMessage(handler: (msg: SignalingMessage) => void) {
    this.messageHandler = handler;
  }

  async subscribe(): Promise<void> {
    // Start polling for messages
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/signaling?sessionId=${this.sessionId}&lastId=${this.lastMessageId}`, {
          credentials: 'include',
        });
        if (response.status === 401 && typeof window !== 'undefined') {
          window.location.href = '/login';
          return;
        }
        if (response.ok) {
          const data = await response.json();
          if (data.messages && Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              this.lastMessageId = Math.max(this.lastMessageId, msg.id);
              if (this.messageHandler) {
                this.messageHandler(msg.payload);
              }
            }
          }
        }
      } catch (error) {
        console.error('[Signaling] Poll error:', error);
      }
    }, 500);
  }

  async send(payload: SignalingMessage): Promise<void> {
    try {
      await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, payload }),
        credentials: 'include',
      });
    } catch (error) {
      console.error('[Signaling] Send error:', error);
    }
  }

  close() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.messageHandler = null;
  }
}

// Payment result from URL callback
interface PaymentResult {
  status: 'success' | 'failed';
  transactionNo?: string;
  approvalNum?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface KioskAppProps {
  kiosk: Kiosk | null;
  content: Record<string, string>;
  paymentResult?: PaymentResult;
}

// Default content values (fallback when not set in database)
const defaultContent: Record<string, string> = {
  // Start Screen
  start_welcome_title: '환영합니다',
  start_welcome_subtitle: '원하시는 서비스를 선택해 주세요',
  start_footer_info: '문의사항이 있으시면 우측 상단 직원 호출 버튼을 눌러주세요',
  // Checkout
  checkout_title: '체크아웃',
  checkout_thank_you: '호텔 그라체를 찾아주셔서 감사합니다.',
  checkout_instructions: '편안한 휴식이 되셨길 바라며\n사용하신 키는 키 박스의 반납함에\n반납해 주시기 바랍니다.',
  checkout_final_thanks: '감사합니다.',
  // Check-in Reservation
  checkin_title: '체크인',
  checkin_reservation_description: '예약하신 사이트에서 받으신 예약번호를 입력해 주세요',
  // Consent
  consent_title: '성인인증 및 숙박동의',
  consent_description: '스크롤을 내려 동의해 주시고 다음을 눌러주세요',
  consent_terms_title: '숙박 이용 약관',
  consent_terms_content: `제1조 (목적)
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
  // Verification
  verification_description: '신분증 인증과 얼굴 실물 인증을 진행합니다.\n인원을 입력해주세요.',
  // Hotel Info
  info_keybox_instruction: '키 박스 내의 키와 어메니티를 챙겨주세요',
  info_welcome_message: '호텔 그라체와 함께 즐거운 시간 되세요',
  info_section_title: '호텔 안내',
  info_room_section_title: '객실 안내',
  info_checkin_label: '체크인 시간:',
  info_checkin_time: '오후 3시 이후',
  info_checkout_label: '체크아웃 시간:',
  info_checkout_time: '오전 11시 이전',
  info_room_notice_label: '객실에서의 주의사항:',
  info_room_notice: '객실 내 흡연 금지',
  info_emergency_label: '긴급 전화번호:',
  info_emergency_number: '프론트 내선 0번',
  // Walk-in
  walkin_title: '현장예약',
  walkin_room_description: '원하시는 객실을 선택해 주신 후 다음을 눌러주세요',
};

// Helper to get content with fallback
const getContent = (content: Record<string, string>, key: string): string => {
  return content[key] || defaultContent[key] || key;
};

interface Room {
  id: string;
  name: string;
  description: string;
  price: number;
  capacity: string;
}

// Room type from database
interface RoomTypeData {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  max_guests: number;
  image_url: string | null;
}

// Assigned room details with access info
interface AssignedRoom {
  id: string;
  roomNumber: string;
  accessType: 'password' | 'card';
  roomPassword: string | null;
  keyBoxNumber: string | null;
  keyBoxPassword: string | null;
  floor: number | null;
  roomType: RoomTypeData | null;
}

type ScreenName =
  | 'start'
  | 'checkin-reservation'
  | 'checkin-consent'
  | 'checkin-id-verification'
  | 'checkin-amenity-selection'
  | 'checkin-info'
  | 'room-selection'
  | 'walkin-consent'
  | 'walkin-id-verification'
  | 'walkin-amenity-selection'
  | 'payment-confirm'
  | 'payment-process'
  | 'walkin-info'
  | 'checkout';

// Amenity data from database
interface AmenityData {
  id: string;
  name: string;
  price: number;
  description: string | null;
}

// Selected amenity with quantity
interface SelectedAmenity {
  amenityId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

// Reservation data from validation
interface ReservationData {
  id: string;
  reservationNumber: string;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  guestCount: number;
  checkInDate: string;
  checkOutDate: string;
  roomNumber: string | null;
  roomType: Room | null;
  source: string | null;
}

// Input data to sync to admin preview
interface InputData {
  reservationNumber?: string;
  guestCount?: number;
  currentGuest?: number;
  signature?: string;
  selectedRoom?: Room | null;
  selectedRoomTypeId?: string | null;
  agreed?: boolean;
  reservation?: ReservationData | null;
  assignedRoom?: AssignedRoom | null;
}

// Call props for TopButtonRow
interface CallProps {
  callStatus: 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';
  callDuration: number;
  onEndCall: () => void;
  isCallActive: boolean;
}

export default function KioskApp({ kiosk, content, paymentResult }: KioskAppProps) {
  // Helper for this component
  const t = (key: string) => getContent(content, key);
  const router = useRouter();
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('start');
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // Staff call state (lifted from StaffCallModal for TopButtonRow access)
  const [staffCallStatus, setStaffCallStatus] = useState<'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed'>('calling');
  const [staffCallDuration, setStaffCallDuration] = useState(0);
  // Incoming call from manager state (lifted from IncomingCallFromManager for TopButtonRow access)
  const [incomingCallStatus, setIncomingCallStatus] = useState<'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed'>('ringing');
  const [incomingCallDuration, setIncomingCallDuration] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [inputData, setInputData] = useState<InputData>({});
  const [paymentState, setPaymentState] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Amenity state
  const [selectedAmenities, setSelectedAmenities] = useState<SelectedAmenity[]>([]);
  const [amenityTotal, setAmenityTotal] = useState(0);

  // Reset amenity selections (called when returning to home)
  const resetAmenities = () => {
    setSelectedAmenities([]);
    setAmenityTotal(0);
  };

  // Incoming call from manager
  const [incomingCallSession, setIncomingCallSession] = useState<{ id: string; room_name: string } | null>(null);
  const [showIncomingCall, setShowIncomingCall] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync projects from PMS on kiosk load (runs once on mount)
  useEffect(() => {
    const syncFromPMS = async () => {
      try {
        const response = await fetch('/api/sync', {
          method: 'POST',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          if (!data.cached) {
            console.log('[Kiosk] Synced from PMS:', data.synced);
          }
        }
      } catch (error) {
        console.error('[Kiosk] Failed to sync from PMS:', error);
      }
    };

    syncFromPMS();
  }, []); // Run once on mount

  // Handle payment result from URL callback (returned from EasyCheck app)
  useEffect(() => {
    if (paymentResult) {
      if (paymentResult.status === 'success') {
        setPaymentState('success');
        setCurrentScreen('payment-process');
        // After showing success, navigate to hotel info
        const timer = setTimeout(() => {
          setCurrentScreen('walkin-info');
          // Clear URL params
          router.replace('/kiosk');
        }, 2000);
        return () => clearTimeout(timer);
      } else {
        setPaymentState('failed');
        setPaymentError(paymentResult.errorMessage || '결제에 실패했습니다');
        setCurrentScreen('payment-process');
      }
    }
  }, [paymentResult, router]);

  // Poll for remote logout/control signals from admin
  useEffect(() => {
    if (!kiosk) return;

    let isActive = true;

    const pollControls = async () => {
      if (!isActive) return;
      
      const commands = await pollControlCommands();
      for (const cmd of commands) {
        if (cmd.command === 'logout') {
          console.log('Remote logout signal received');
          window.location.href = '/api/auth/logout';
          return;
        }
      }
    };

    // Poll every 5 seconds (reduced to prevent DB exhaustion)
    const interval = setInterval(pollControls, 5000);
    pollControls(); // Initial poll

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [kiosk, router]);

  // Poll for incoming calls from manager
  useEffect(() => {
    if (!kiosk) return;

    let isActive = true;
    let lastSeenSessionId: string | null = null;

    const pollCalls = async () => {
      if (!isActive) return;
      
      const session = await pollIncomingCalls(kiosk.id);
      if (session && session.id !== lastSeenSessionId) {
        console.log('[Kiosk] Incoming call from manager:', session);
        lastSeenSessionId = session.id;
        setIncomingCallSession({ id: session.id, room_name: session.room_name });
        setShowIncomingCall(true);
      }
    };

    // Poll every 3 seconds for call detection (reduced to prevent DB exhaustion)
    const interval = setInterval(pollCalls, 3000);
    pollCalls(); // Initial poll

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [kiosk]);

  // Screen capture and upload for live preview
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!kiosk) return;

    let isCapturing = false;
    let isActive = true;

    const captureAndUpload = async () => {
      if (!containerRef.current || isCapturing || !isActive) return;
      isCapturing = true;

      try {
        // Dynamic import to avoid SSR issues
        const { domToPng } = await import('modern-screenshot');

        // Use modern-screenshot for high quality capture
        const dataUrl = await domToPng(containerRef.current, {
          scale: 1,
          backgroundColor: '#f2f4f6',
        });

        if (isActive && dataUrl) {
          // Upload to server via API
          await uploadScreenFrame(dataUrl);
        }
      } catch {
        // Don't log every error to avoid console spam
        // The interval will retry on next tick
      } finally {
        isCapturing = false;
      }
    };

    // Start capturing
    console.log('Kiosk screen capture started');
    captureAndUpload();
    captureIntervalRef.current = setInterval(captureAndUpload, 500); // 2fps

    return () => {
      isActive = false;
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk?.id]);

  // Sync input data to database for admin preview
  const syncInputData = useCallback((data: Partial<InputData>) => {
    const newInputData = { ...inputData, ...data };
    setInputData(newInputData);
    if (kiosk) {
      updateKiosk(kiosk.id, {
        settings: {
          ...kiosk.settings,
          inputData: newInputData
        }
      }).then((success) => {
        if (!success) console.error('Error syncing input data');
      });
    }
  }, [inputData, kiosk]);

  // Set kiosk status to online when app loads
  // Use a ref to track mount state and debounce offline to handle React StrictMode
  const offlineTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!kiosk) {
      console.warn('No kiosk object provided to KioskApp');
      return;
    }

    isMountedRef.current = true;

    // Clear any pending offline timeout (handles StrictMode remount)
    if (offlineTimeoutRef.current) {
      clearTimeout(offlineTimeoutRef.current);
      offlineTimeoutRef.current = null;
    }

    const setKioskStatus = async (status: 'online' | 'offline') => {
      const updates: Record<string, unknown> = {
        status,
        last_seen: new Date().toISOString(),
      };
      if (status === 'online') {
        updates.current_screen = 'start';
      }

      const success = await updateKiosk(kiosk.id, updates);
      if (!success) {
        console.error(`Error setting kiosk ${status}`);
      } else {
        console.log(`Kiosk ${kiosk.id} set to ${status}`);
      }
    };

    // Set online immediately
    setKioskStatus('online');

    // Update last_seen frequently (every 10 seconds)
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        updateKiosk(kiosk.id, { 
          last_seen: new Date().toISOString(), 
          status: 'online' 
        }).then((success) => {
          if (!success) console.error('Error updating last_seen');
        });
      }
    }, 10000); // Every 10 seconds

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      // Debounce offline status to handle React StrictMode double-mount
      // Only set offline if component doesn't remount within 100ms
      offlineTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) {
          setKioskStatus('offline');
        }
      }, 100);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsStaffModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const goToScreen = useCallback((screenName: ScreenName) => {
    setCurrentScreen(screenName);
    if (screenName === 'start') {
      setSelectedRoom(null);
      setInputData({});
    }
    // Sync current screen to database
    if (kiosk) {
      const updates: Record<string, unknown> = { current_screen: screenName };
      if (screenName === 'start') {
        updates.settings = { ...kiosk.settings, inputData: {} };
      }
      updateKiosk(kiosk.id, updates).then((success) => {
        if (!success) console.error('Error updating current_screen');
      });
    }
  }, [kiosk]);

  const openStaffModal = useCallback(async () => {
    // Reset call state
    setStaffCallStatus('calling');
    setStaffCallDuration(0);
    setIsStaffModalOpen(true);
    // Create video session for staff call (only if kiosk exists)
    if (!kiosk) {
      console.error('[Kiosk] Cannot create video session: kiosk object not available');
      setIsStaffModalOpen(false);
      return;
    }
    
    // Validate kiosk has required fields
    if (!kiosk.id || !kiosk.project_id) {
      console.error('[Kiosk] Cannot create video session: missing required kiosk fields', {
        kiosk_id: kiosk.id,
        project_id: kiosk.project_id
      });
      setIsStaffModalOpen(false);
      return;
    }
    
    const roomName = `voice-${kiosk.id}-${Date.now()}`;
    console.log('[Kiosk] Creating video session:', { kiosk_id: kiosk.id, project_id: kiosk.project_id, roomName });
    const session = await createVideoSession({
      kiosk_id: kiosk.id,
      project_id: kiosk.project_id,
      room_name: roomName,
      status: 'waiting',
      caller_type: 'kiosk',
    });

    if (!session) {
      console.error('[Kiosk] Failed to create video session');
    } else {
      console.log('[Kiosk] Video session created successfully:', session);
      setCurrentSessionId(session.id);
      // Manager will poll for waiting sessions via API
      console.log('[Kiosk] Video session ready for manager to pick up');
    }
  }, [kiosk]);

  const closeStaffModal = useCallback(async () => {
    // Update session status if we have one
    if (currentSessionId) {
      await updateVideoSession(currentSessionId, {
        status: 'ended',
        ended_at: new Date().toISOString(),
      });
    }
    setIsStaffModalOpen(false);
    setCurrentSessionId(null);
  }, [currentSessionId]);

  // Common call props for TopButtonRow in all screens
  // Handler to close incoming call - sets status to 'ended' which triggers cleanup in IncomingCallFromManager
  const closeIncomingCall = useCallback(() => {
    setIncomingCallStatus('ended');
    // The IncomingCallFromManager component will handle the rest (signaling, database, cleanup)
    // and call its onClose which resets the state
  }, []);

  // Determine active call state (outgoing takes priority, then incoming)
  const isOutgoingCallActive = isStaffModalOpen && (staffCallStatus === 'connecting' || staffCallStatus === 'connected');
  const isIncomingCallActive = showIncomingCall && (incomingCallStatus === 'connecting' || incomingCallStatus === 'connected');

  const callProps = {
    callStatus: isOutgoingCallActive ? staffCallStatus : (isIncomingCallActive ? incomingCallStatus : staffCallStatus),
    callDuration: isOutgoingCallActive ? staffCallDuration : (isIncomingCallActive ? incomingCallDuration : 0),
    onEndCall: isOutgoingCallActive ? closeStaffModal : (isIncomingCallActive ? closeIncomingCall : closeStaffModal),
    isCallActive: isOutgoingCallActive || isIncomingCallActive,
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'start':
        return <StartScreen goToScreen={goToScreen} t={t} openStaffModal={openStaffModal} callProps={callProps} />;
      case 'checkin-reservation':
        return <CheckinReservationScreen goToScreen={goToScreen} syncInputData={syncInputData} t={t} projectId={kiosk?.project_id} openStaffModal={openStaffModal} callProps={callProps} />;
      case 'checkin-consent':
        return <ConsentScreen goToScreen={goToScreen} flowType="checkin" syncInputData={syncInputData} t={t} openStaffModal={openStaffModal} callProps={callProps} />;
      case 'checkin-id-verification':
        return <IDVerificationScreen goToScreen={goToScreen} flowType="checkin" syncInputData={syncInputData} t={t} projectId={kiosk?.project_id} reservationId={inputData.reservation?.id} openStaffModal={openStaffModal} signatureName={inputData.signature} callProps={callProps} />;
      case 'checkin-amenity-selection':
        return <AmenitySelectionScreen goToScreen={goToScreen} flowType="checkin" t={t} projectId={kiosk?.project_id} openStaffModal={openStaffModal} callProps={callProps} selectedAmenities={selectedAmenities} setSelectedAmenities={setSelectedAmenities} amenityTotal={amenityTotal} setAmenityTotal={setAmenityTotal} reservationId={inputData.reservation?.id} />;
      case 'checkin-info':
        return <HotelInfoScreen goToScreen={goToScreen} flowType="checkin" t={t} projectId={kiosk?.project_id} syncInputData={syncInputData} inputData={inputData} openStaffModal={openStaffModal} callProps={callProps} amenityTotal={amenityTotal} selectedAmenities={selectedAmenities} resetAmenities={resetAmenities} />;
      case 'room-selection':
        return <RoomSelectionScreen goToScreen={goToScreen} setSelectedRoom={setSelectedRoom} syncInputData={syncInputData} t={t} projectId={kiosk?.project_id} openStaffModal={openStaffModal} callProps={callProps} />;
      case 'walkin-consent':
        return <ConsentScreen goToScreen={goToScreen} flowType="walkin" syncInputData={syncInputData} t={t} openStaffModal={openStaffModal} callProps={callProps} />;
      case 'walkin-id-verification':
        return <IDVerificationScreen goToScreen={goToScreen} flowType="walkin" syncInputData={syncInputData} t={t} projectId={kiosk?.project_id} openStaffModal={openStaffModal} signatureName={inputData.signature} callProps={callProps} />;
      case 'walkin-amenity-selection':
        return <AmenitySelectionScreen goToScreen={goToScreen} flowType="walkin" t={t} projectId={kiosk?.project_id} openStaffModal={openStaffModal} callProps={callProps} selectedAmenities={selectedAmenities} setSelectedAmenities={setSelectedAmenities} amenityTotal={amenityTotal} setAmenityTotal={setAmenityTotal} selectedRoom={selectedRoom} />;
      case 'payment-confirm':
        return <PaymentConfirmScreen goToScreen={goToScreen} selectedRoom={selectedRoom} t={t} openStaffModal={openStaffModal} callProps={callProps} amenityTotal={amenityTotal} />;
      case 'payment-process':
        return <PaymentProcessScreen goToScreen={goToScreen} selectedRoom={selectedRoom} t={t} openStaffModal={openStaffModal} kioskId={kiosk?.id} paymentState={paymentState} paymentError={paymentError} setPaymentState={setPaymentState} setPaymentError={setPaymentError} callProps={callProps} amenityTotal={amenityTotal} />;
      case 'walkin-info':
        return <HotelInfoScreen goToScreen={goToScreen} flowType="walkin" t={t} projectId={kiosk?.project_id} selectedRoomTypeId={selectedRoom?.id} syncInputData={syncInputData} inputData={inputData} openStaffModal={openStaffModal} callProps={callProps} amenityTotal={amenityTotal} selectedAmenities={selectedAmenities} selectedRoom={selectedRoom} resetAmenities={resetAmenities} />;
      case 'checkout':
        return <CheckoutScreen goToScreen={goToScreen} t={t} openStaffModal={openStaffModal} callProps={callProps} />;
      default:
        return <StartScreen goToScreen={goToScreen} t={t} openStaffModal={openStaffModal} callProps={callProps} />;
    }
  };

  return (
    <div ref={containerRef} className="kiosk-app">
      {renderScreen()}
      <StaffCallModal
        isOpen={isStaffModalOpen}
        onClose={closeStaffModal}
        sessionId={currentSessionId}
        callStatus={staffCallStatus}
        onCallStatusChange={setStaffCallStatus}
        callDuration={staffCallDuration}
        onCallDurationChange={setStaffCallDuration}
      />
      {showIncomingCall && incomingCallSession && (
        <IncomingCallFromManager
          session={incomingCallSession}
          onClose={() => {
            // Reset all incoming call state after cleanup
            setShowIncomingCall(false);
            setIncomingCallSession(null);
            setIncomingCallStatus('ringing');
            setIncomingCallDuration(0);
          }}
          callStatus={incomingCallStatus}
          onCallStatusChange={setIncomingCallStatus}
          callDuration={incomingCallDuration}
          onCallDurationChange={setIncomingCallDuration}
        />
      )}
    </div>
  );
}

// Top Button Row - shows call indicator (left) and staff button (right)
function TopButtonRow({
  onStaffCall,
  callStatus,
  callDuration,
  onEndCall,
  isCallActive
}: {
  onStaffCall: () => void;
  callStatus?: 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';
  callDuration?: number;
  onEndCall?: () => void;
  isCallActive?: boolean;
}) {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const showIndicator = isCallActive;

  return (
    <div className="top-button-row">
      {/* Call indicator - left side */}
      {showIndicator && (
        <div className="call-indicator">
          <div
            className="call-indicator-dot"
            style={{ backgroundColor: callStatus === 'connected' ? '#22c55e' : '#f59e0b' }}
          />
          <span className="call-indicator-text">
            {callStatus === 'connected' ? '통화중' : '연결중'}
          </span>
          {callStatus === 'connected' && callDuration !== undefined && (
            <span className="call-indicator-duration">
              {formatDuration(callDuration)}
            </span>
          )}
          <button className="call-indicator-end" onClick={onEndCall}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Staff call button - right side */}
      <button className="staff-call-btn" onClick={onStaffCall}>
        <span>직원 호출</span>
      </button>
    </div>
  );
}

// STUN servers for WebRTC
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type CallStatus = 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed';

interface StaffCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  callStatus: CallStatus;
  onCallStatusChange: (status: CallStatus) => void;
  callDuration: number;
  onCallDurationChange: (duration: number) => void;
}

// Staff Call Modal with WebRTC
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StaffCallModal({ isOpen, onClose, sessionId, callStatus, onCallStatusChange, callDuration, onCallDurationChange }: StaffCallModalProps) {
  const setCallStatus = onCallStatusChange;
  const setCallDuration = onCallDurationChange;
  const [error, setError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalingChannelRef = useRef<SignalingChannel | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const durationCounterRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    signalingChannelRef.current?.close();
    signalingChannelRef.current = null;
    pendingCandidatesRef.current = [];
  }, []);

  // Setup WebRTC when modal opens with a session
  useEffect(() => {
    if (!isOpen || !sessionId) return;

    let isActive = true;

    const setupCall = async () => {
      try {
        // Check if we're in a browser environment
        if (typeof window === 'undefined' || typeof navigator === 'undefined') {
          console.log('Not in browser environment, skipping call setup');
          return;
        }

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.warn('getUserMedia not supported in this browser');
          setError('이 브라우저는 음성 통화를 지원하지 않습니다');
          setCallStatus('failed');
          return;
        }

        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (!isActive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;

        // Create peer connection
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        // Add local tracks
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Setup signaling channel
        console.log('[Kiosk] Setting up signaling channel for session:', sessionId);
        const signalingChannel = new SignalingChannel(sessionId);
        signalingChannelRef.current = signalingChannel;

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate && signalingChannelRef.current) {
            console.log('[Kiosk] Sending ICE candidate');
            signalingChannelRef.current.send({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
          }
        };

        // Handle remote stream
        pc.ontrack = (event) => {
          console.log('[Kiosk] Received remote track');
          const [remoteStream] = event.streams;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(console.error);
          }
        };

        // Handle connection state
        pc.onconnectionstatechange = () => {
          console.log('[Kiosk] Connection state:', pc.connectionState);
          if (!isActive) return;
          switch (pc.connectionState) {
            case 'connected':
              console.log('[Kiosk] Call connected!');
              setCallStatus('connected');
              durationCounterRef.current = 0;
              durationIntervalRef.current = setInterval(() => {
                durationCounterRef.current += 1;
                setCallDuration(durationCounterRef.current);
              }, 1000);
              break;
            case 'disconnected':
            case 'failed':
              console.log('[Kiosk] Connection failed or disconnected');
              setError('연결이 끊어졌습니다');
              setCallStatus('failed');
              break;
          }
        };

        // Listen for signaling messages
        signalingChannel.onMessage(async (payload) => {
          console.log('[Kiosk] 📥 Received signaling message:', payload.type);
          if (!isActive) return;

          if (payload.type === 'answer' && 'sdp' in payload) {
            console.log('[Kiosk] Setting remote description from answer');
            await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];
          } else if (payload.type === 'ice-candidate' && 'candidate' in payload) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(payload.candidate);
            } else {
              pendingCandidatesRef.current.push(payload.candidate);
            }
          } else if (payload.type === 'call-answered') {
            console.log('[Kiosk] Manager answered the call!');
            setCallStatus('connecting');
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            // Create and send offer
            if (pc.signalingState === 'stable') {
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                console.log('[Kiosk] 📤 Sending offer to manager');
                signalingChannel.send({ type: 'offer', sdp: offer.sdp! });
              } catch (err) {
                console.error('[Kiosk] Failed to create/send offer:', err);
              }
            }
          } else if (payload.type === 'call-ended') {
            console.log('[Kiosk] Call ended by manager');
            setCallStatus('ended');
            cleanup();
          }
        });

        // Subscribe and start polling
        await signalingChannel.subscribe();
        console.log('[Kiosk] Signaling channel subscribed, waiting for manager to answer');
        setCallStatus('ringing');

        // Set timeout for no answer (60 seconds)
        timeoutRef.current = setTimeout(() => {
          if (isActive) {
            setError('응답이 없습니다. 잠시 후 다시 시도해 주세요.');
            setCallStatus('failed');
          }
        }, 60000);
      } catch (err) {
        console.error('Failed to setup call:', err);
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setError('마이크 권한이 필요합니다');
        } else if (err instanceof Error && err.message.includes('지원하지 않습니다')) {
          setError(err.message);
        } else {
          setError('통화를 시작할 수 없습니다');
        }
        setCallStatus('failed');
      }
    };

    setupCall();

    return () => {
      isActive = false;
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCallStatus('calling');
      setCallDuration(0);
      setError(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    // Send end signal if connected
    if (signalingChannelRef.current && (callStatus === 'connected' || callStatus === 'ringing' || callStatus === 'connecting')) {
      signalingChannelRef.current.send({ type: 'call-ended', reason: 'ended' });
    }
    cleanup();
    onClose();
  };

  // For connecting/connected states, just render audio element (indicator is in TopButtonRow)
  if (callStatus === 'connecting' || callStatus === 'connected') {
    return <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />;
  }

  if (!isOpen) return null;

  // Show modal for calling/ringing/ended/failed states
  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="modal-header">
          <h3>
            {callStatus === 'calling' && '직원 호출 중...'}
            {callStatus === 'ringing' && '직원 호출 중...'}
            {callStatus === 'ended' && '통화 종료'}
            {callStatus === 'failed' && '연결 실패'}
          </h3>
          <button className="close-btn" onClick={handleClose}>✕</button>
        </div>
        <div className="video-call-container">
          <div className="video-placeholder">
            <div className="calling-animation">
              {(callStatus === 'calling' || callStatus === 'ringing') && (
                <>
                  <div className="calling-icon"></div>
                  <p>직원과 연결 중입니다</p>
                  <p className="sub-text">잠시만 기다려주세요</p>
                </>
              )}
              {callStatus === 'failed' && (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                  <p style={{ color: '#dc2626' }}>{error || '연결에 실패했습니다'}</p>
                </>
              )}
              {callStatus === 'ended' && (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📞</div>
                  <p>통화가 종료되었습니다</p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="danger-btn" onClick={handleClose}>
            {(callStatus === 'ended' || callStatus === 'failed') ? '닫기' : '취소'}
          </button>
        </div>
      </div>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </div>
  );
}

// Incoming call from manager modal
interface IncomingCallFromManagerProps {
  session: { id: string; room_name: string };
  onClose: () => void;
  callStatus: CallStatus;
  onCallStatusChange: (status: CallStatus) => void;
  callDuration: number;
  onCallDurationChange: (duration: number) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function IncomingCallFromManager({ session, onClose, callStatus, onCallStatusChange, callDuration, onCallDurationChange }: IncomingCallFromManagerProps) {
  const setCallStatus = onCallStatusChange;
  const setCallDuration = onCallDurationChange;
  // Error state for logging purposes (errors are handled by parent component)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_error, setError] = useState<string | null>(null);
  const durationCounterRef = useRef(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalingChannelRef = useRef<SignalingChannel | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    signalingChannelRef.current?.close();
    signalingChannelRef.current = null;
    pendingCandidatesRef.current = [];
  }, []);

  // Auto-answer the call
  useEffect(() => {
    console.log('[IncomingCallFromManager] useEffect triggered, session:', session.id);
    let isActive = true;

    const answerCall = async () => {
      console.log('[IncomingCallFromManager] answerCall starting...');
      try {
        // Check if we're in a browser environment
        if (typeof window === 'undefined' || typeof navigator === 'undefined') {
          console.log('Not in browser environment, skipping call answer');
          return;
        }

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.warn('getUserMedia not supported in this browser');
          setError('이 브라우저는 음성 통화를 지원하지 않습니다');
          setCallStatus('failed');
          return;
        }
        // Get microphone
        console.log('[IncomingCallFromManager] Requesting microphone...');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        console.log('[IncomingCallFromManager] Microphone access granted');
        if (!isActive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;

        // Create peer connection
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        // Add local tracks
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Setup signaling channel
        console.log('[IncomingCallFromManager] Setting up signaling channel for session:', session.id);
        const signalingChannel = new SignalingChannel(session.id);
        signalingChannelRef.current = signalingChannel;

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate && signalingChannelRef.current) {
            signalingChannelRef.current.send({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
          }
        };

        // Handle remote stream
        pc.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(console.error);
          }
        };

        // Handle connection state
        pc.onconnectionstatechange = () => {
          if (!isActive) return;
          switch (pc.connectionState) {
            case 'connected':
              setCallStatus('connected');
              durationCounterRef.current = 0;
              durationIntervalRef.current = setInterval(() => {
                durationCounterRef.current += 1;
                setCallDuration(durationCounterRef.current);
              }, 1000);
              break;
            case 'disconnected':
            case 'failed':
              setCallStatus('failed');
              break;
          }
        };

        // Listen for signaling messages
        console.log('[IncomingCallFromManager] Setting up signaling message listener...');
        signalingChannel.onMessage(async (payload) => {
          console.log('[IncomingCallFromManager] 📥 Received signaling message:', payload.type);
          if (!isActive) return;

          if (payload.type === 'offer' && 'sdp' in payload) {
            console.log('[IncomingCallFromManager] Received SDP offer');
            await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signalingChannel.send({ type: 'answer', sdp: answer.sdp! });
            setCallStatus('connecting');
          } else if (payload.type === 'ice-candidate' && 'candidate' in payload) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(payload.candidate);
            } else {
              pendingCandidatesRef.current.push(payload.candidate);
            }
          } else if (payload.type === 'call-ended') {
            console.log('[IncomingCallFromManager] Call ended by manager');
            setCallStatus('ended');
            cleanup();
          }
        });

        // Subscribe to channel and send call-answered signal
        await signalingChannel.subscribe();
        console.log('[IncomingCallFromManager] Signaling channel subscribed');
        
        // Send call-answered signal after short delay
        setTimeout(() => {
          if (!isActive) return;
          console.log('[IncomingCallFromManager] 📤 Sending call-answered signal');
          signalingChannel.send({ type: 'call-answered' });
          updateVideoSession(session.id, { status: 'connected' });
          setCallStatus('connecting');
        }, 100);
      } catch (err) {
        console.error('[IncomingCallFromManager] Failed to answer call:', err);
        setCallStatus('failed');
      }
    };

    // Auto-answer after short delay
    const timer = setTimeout(() => {
      answerCall();
    }, 500);

    return () => {
      isActive = false;
      clearTimeout(timer);
      cleanup();
    };
  }, [session.id, cleanup, setCallDuration, setCallStatus]);

  // Send call-ended signal and cleanup when status changes to ended or failed
  useEffect(() => {
    if (callStatus === 'ended' || callStatus === 'failed') {
      // Send call-ended signal
      if (signalingChannelRef.current) {
        signalingChannelRef.current.send({ type: 'call-ended', reason: callStatus === 'ended' ? 'ended' : 'error' });
      }
      // Update database via fetch API
      updateVideoSession(session.id, {
        status: 'ended',
        ended_at: new Date().toISOString(),
      });
      // Cleanup and close after short delay
      const timer = setTimeout(() => {
        cleanup();
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [callStatus, session.id, cleanup, onClose]);

  // Only render the audio element - UI is handled by TopButtonRow
  return <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />;
}

// Navigation Arrow Component
function NavArrow({
  direction,
  label,
  onClick,
  disabled
}: {
  direction: 'left' | 'right';
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`nav-arrow ${direction}`}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {direction === 'left' ? (
          <polyline points="15,18 9,12 15,6" />
        ) : (
          <polyline points="9,6 15,12 9,18" />
        )}
      </svg>
      <span>{label}</span>
    </button>
  );
}

// Start Screen
function StartScreen({ goToScreen, t, openStaffModal, callProps }: { goToScreen: (screen: ScreenName) => void; t: (key: string) => string; openStaffModal: () => void; callProps: CallProps }) {
  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <div className="welcome-message">
            <h2>{t('start_welcome_title')}</h2>
            <p>{t('start_welcome_subtitle')}</p>
          </div>
          <div className="footer-info">
            <p>{t('start_footer_info')}</p>
          </div>
          <div className="menu-buttons">
            <button className="primary-btn large" onClick={() => goToScreen('checkin-reservation')}>
              체크인
            </button>
            <button className="primary-btn large" onClick={() => goToScreen('room-selection')}>
              예약없이 방문
            </button>
            <button className="primary-btn large" onClick={() => goToScreen('checkout')}>
              체크아웃
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Checkin Reservation Screen
function CheckinReservationScreen({
  goToScreen,
  syncInputData,
  t,
  projectId,
  openStaffModal,
  callProps,
}: {
  goToScreen: (screen: ScreenName) => void;
  syncInputData: (data: Partial<InputData>) => void;
  t: (key: string) => string;
  projectId?: string;
  openStaffModal: () => void;
  callProps: CallProps;
}) {
  const [reservationNumber, setReservationNumber] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (value: string) => {
    setReservationNumber(value);
    setError(null);
    syncInputData({ reservationNumber: value });
  };

  const handleNext = async () => {
    if (!reservationNumber.trim()) return;

    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch('/api/reservations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationNumber: reservationNumber.trim(),
          projectId,
        }),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.valid && data.reservation) {
        // Store reservation data and proceed
        syncInputData({
          reservationNumber: reservationNumber.trim(),
          reservation: data.reservation,
          guestCount: data.reservation.guestCount || 1,
        });
        goToScreen('checkin-consent');
      } else {
        setError(data.error || '예약을 찾을 수 없습니다');
      }
    } catch (err) {
      console.error('Validation error:', err);
      setError('예약 확인 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <NavArrow direction="left" label="이전" onClick={() => goToScreen('start')} disabled={isValidating} />
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <h2 className="screen-title">{t('checkin_title')}</h2>
          <p className="screen-description">
            {t('checkin_reservation_description')}
          </p>
          <div className="form-container">
            <div className="form-group">
              <label>예약번호</label>
              <input
                type="text"
                className="input-field"
                placeholder="예약번호를 입력하세요"
                value={reservationNumber}
                onChange={(e) => handleChange(e.target.value)}
                disabled={isValidating}
              />
              {error && (
                <p style={{ color: '#dc2626', marginTop: '8px', fontSize: '14px' }}>
                  {error}
                </p>
              )}
            </div>
          </div>
          <button
            className="bottom-next-btn"
            onClick={handleNext}
            disabled={!reservationNumber.trim() || isValidating}
          >
            {isValidating ? '확인 중...' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Consent Screen
function ConsentScreen({
  goToScreen,
  flowType,
  syncInputData,
  t,
  openStaffModal,
  callProps,
}: {
  goToScreen: (screen: ScreenName) => void;
  flowType: 'checkin' | 'walkin';
  syncInputData: (data: Partial<InputData>) => void;
  t: (key: string) => string;
  openStaffModal: () => void;
  callProps: CallProps;
}) {
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');

  const handleAgreedChange = (checked: boolean) => {
    setAgreed(checked);
    syncInputData({ agreed: checked });
  };

  const handleSignatureChange = (value: string) => {
    setSignature(value);
    syncInputData({ signature: value });
  };

  const handleNext = () => {
    if (agreed && signature.trim()) {
      if (flowType === 'checkin') {
        goToScreen('checkin-id-verification');
      } else {
        goToScreen('walkin-id-verification');
      }
    }
  };

  const handleBack = () => {
    if (flowType === 'checkin') {
      goToScreen('checkin-reservation');
    } else {
      goToScreen('room-selection');
    }
  };

  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <NavArrow direction="left" label="이전" onClick={handleBack} />
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <h2 className="screen-title">{t('consent_title')}</h2>
          <p className="screen-description">
            {t('consent_description')}
          </p>
          <div className="consent-container">
            <div className="consent-box">
              <h3>{t('consent_terms_title')}</h3>
              <div className="consent-content" style={{ whiteSpace: 'pre-wrap' }}>
                {t('consent_terms_content')}
              </div>
            </div>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => handleAgreedChange(e.target.checked)}
                />
                위 약관에 동의합니다 (필수)
              </label>
            </div>
            <div className="form-group">
              <label>서명 (이름을 입력해 주세요)</label>
              <input
                type="text"
                className="input-field"
                placeholder="홍길동"
                value={signature}
                onChange={(e) => handleSignatureChange(e.target.value)}
              />
            </div>
          </div>
          <button
            className="bottom-next-btn"
            onClick={handleNext}
            disabled={!agreed || !signature.trim()}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}

// ID Verification Screen with useB API integration
function IDVerificationScreen({
  goToScreen,
  flowType,
  syncInputData,
  t,
  projectId,
  reservationId,
  openStaffModal,
  signatureName,
  callProps,
}: {
  goToScreen: (screen: ScreenName) => void;
  flowType: 'checkin' | 'walkin';
  syncInputData: (data: Partial<InputData>) => void;
  t: (key: string) => string;
  projectId?: string;
  reservationId?: string;
  openStaffModal: () => void;
  signatureName?: string;
  callProps: CallProps;
}) {
  const [guestCount, setGuestCount] = useState(1);
  const [currentGuest, setCurrentGuest] = useState(0);
  const [verificationStep, setVerificationStep] = useState<'idle' | 'capturing-id' | 'id-preview' | 'ocr-confirm' | 'capturing-face' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [editedOcrData, setEditedOcrData] = useState<{
    name: string;
    juminNo1: string;
    juminNo2: string;
    issueDate: string;
    idType: string;
    driverNo?: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        console.log('Not in browser environment, skipping camera start');
        setErrorMessage('브라우저 환경이 감지되지 않았습니다.');
        setVerificationStep('error');
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not supported in this browser');
        setErrorMessage('이 브라우저는 카메라를 지원하지 않습니다.');
        setVerificationStep('error');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setErrorMessage('카메라에 접근할 수 없습니다. 카메라 권한을 확인해주세요.');
      setVerificationStep('error');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Capture ID card image - crops to match the mask area (x=7.5%, y=15%, w=85%, h=70%)
  // Note: We capture the raw video data without flipping - CSS transform only affects display
  const captureIdCardImage = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return null;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Match the SVG mask dimensions: x=7.5%, y=15%, width=85%, height=70%
    const cropX = videoWidth * 0.075;
    const cropY = videoHeight * 0.15;
    const cropWidth = videoWidth * 0.85;
    const cropHeight = videoHeight * 0.70;

    // Set canvas to crop dimensions
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Draw only the cropped region (no flip - raw video data is what we need)
    context.drawImage(
      video,
      cropX, cropY, cropWidth, cropHeight,  // Source (from video)
      0, 0, cropWidth, cropHeight           // Destination (on canvas)
    );

    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  };

  // Capture face image - crops to match the ellipse mask area (rx=25%, ry=35%)
  // Note: We capture the raw video data without flipping - CSS transform only affects display
  const captureFaceImage = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return null;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Match the SVG ellipse mask: cx=50%, cy=50%, rx=25%, ry=35%
    // Capture a rectangle that contains the ellipse
    const cropWidth = videoWidth * 0.50;   // 2 * rx = 50%
    const cropHeight = videoHeight * 0.70;  // 2 * ry = 70%
    const cropX = (videoWidth - cropWidth) / 2;
    const cropY = (videoHeight - cropHeight) / 2;

    // Set canvas to crop dimensions
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Draw only the cropped region (no flip - raw video data is what we need)
    context.drawImage(
      video,
      cropX, cropY, cropWidth, cropHeight,  // Source (from video)
      0, 0, cropWidth, cropHeight           // Destination (on canvas)
    );

    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  };

  const increaseCount = () => {
    if (guestCount < 10) {
      const newCount = guestCount + 1;
      setGuestCount(newCount);
      syncInputData({ guestCount: newCount });
    }
  };

  const decreaseCount = () => {
    if (guestCount > 1) {
      const newCount = guestCount - 1;
      setGuestCount(newCount);
      syncInputData({ guestCount: newCount });
    }
  };

  const handleStartVerification = async () => {
    setCurrentGuest(1);
    setVerificationStep('capturing-id');
    syncInputData({ currentGuest: 1, guestCount });
    await startCamera();
  };

  // Step 1: Capture ID card and show preview
  const handleCaptureIdCard = () => {
    const image = captureIdCardImage();
    if (image) {
      setIdCardImage(image);
      stopCamera();
      setVerificationStep('id-preview');
    }
  };

  // Step 2: From preview, retake or proceed to OCR
  const handleIdPreviewRetake = async () => {
    setIdCardImage(null);
    setVerificationStep('capturing-id');
    await startCamera();
  };

  const handleIdPreviewProceed = async () => {
    if (!idCardImage) return;
    setVerificationStep('verifying');

    // Call OCR to get ID card data
    try {
      const response = await fetch('/api/identity-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idCardImage: idCardImage,
          action: 'ocr',
        }),
        credentials: 'include',
      });

      const result = await response.json();

      if (result.success && result.data?.ocrResult?.data) {
        const ocr = result.data.ocrResult.data;
        const extractedData = {
          name: ocr.name || '',
          juminNo1: ocr.juminNo1 || '',
          juminNo2: ocr.juminNo2 || '',
          issueDate: ocr.issueDate || '',
          idType: ocr.idType || '1',
          driverNo: ocr.driverNo,
        };
        setEditedOcrData({ ...extractedData });
        setVerificationStep('ocr-confirm');
      } else {
        // OCR failed
        let errorMsg = result.error || result.data?.ocrResult?.error || '신분증 인식에 실패했습니다';
        if (result.data?.ocrResult?.errorCode === 'O003') {
          errorMsg = '주민등록증 또는 운전면허증만 인증 가능합니다.';
        }
        setErrorMessage(errorMsg);
        setVerificationStep('error');
      }
    } catch (error) {
      console.error('OCR API error:', error);
      setErrorMessage('서버 연결에 실패했습니다. 다시 시도해주세요.');
      setVerificationStep('error');
    }
  };

  // Step 3: OCR confirmation - user can edit or proceed
  const handleOcrConfirm = async () => {
    if (!editedOcrData) return;
    setVerificationStep('capturing-face');
    await startCamera();
  };

  const handleOcrRetake = async () => {
    setEditedOcrData(null);
    setIdCardImage(null);
    setVerificationStep('capturing-id');
    await startCamera();
  };

  const handleCaptureSelfie = async () => {
    const selfieImage = captureFaceImage();
    if (selfieImage && idCardImage) {
      stopCamera();
      setVerificationStep('verifying');
      await performVerification(idCardImage, selfieImage);
    }
  };

  // DEBUG: Skip face verification for testing
  const handleSkipVerification = () => {
    stopCamera();
    if (currentGuest >= guestCount) {
      setVerificationStep('success');
      setTimeout(() => {
        if (flowType === 'checkin') {
          goToScreen('checkin-amenity-selection');
        } else {
          goToScreen('walkin-amenity-selection');
        }
      }, 1500);
    } else {
      const nextGuest = currentGuest + 1;
      setCurrentGuest(nextGuest);
      setIdCardImage(null);
      setVerificationStep('capturing-id');
      syncInputData({ currentGuest: nextGuest });
      startCamera();
    }
  };

  const performVerification = async (idCard: string, selfie: string) => {
    try {
      // Use confirmed OCR data for status verification + face auth
      const response = await fetch('/api/identity-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idCardImage: idCard,
          faceImage: selfie,
          action: 'status-and-face',
          confirmedOcrData: editedOcrData, // Pass the user-confirmed/edited OCR data
          projectId,
          reservationId,
          guestIndex: currentGuest - 1,
          guestCount,
          signatureName,
        }),
        credentials: 'include',
      });

      const result = await response.json();

      if (result.success) {
        if (currentGuest >= guestCount) {
          setVerificationStep('success');
          setTimeout(() => {
            if (flowType === 'checkin') {
              goToScreen('checkin-amenity-selection');
            } else {
              goToScreen('walkin-amenity-selection');
            }
          }, 1500);
        } else {
          const nextGuest = currentGuest + 1;
          setCurrentGuest(nextGuest);
          setIdCardImage(null);
          setVerificationStep('capturing-id');
          syncInputData({ currentGuest: nextGuest });
          await startCamera();
        }
      } else {
        // Parse error message for better user experience
        let errorMsg = result.error || '인증에 실패했습니다';
        
        // Check for specific error types
        if (result.data?.ocrResult?.errorCode === 'O003' || errorMsg.includes('주민등록번호 없음')) {
          errorMsg = '주민등록증 또는 운전면허증만 인증 가능합니다.\n여권이나 외국인등록증은 지원하지 않습니다.\n다른 신분증을 사용해주세요.';
        } else if (errorMsg.includes('지원하지 않는 신분증')) {
          errorMsg = '주민등록증 또는 운전면허증을 사용해주세요.';
        } else if (errorMsg.includes('안면인증 실패') || errorMsg.includes('얼굴이 일치하지')) {
          errorMsg = '얼굴이 신분증과 일치하지 않습니다.\n다시 시도해주세요.';
        } else if (errorMsg.includes('미성년자')) {
          errorMsg = '만 19세 미만은 체크인이 불가합니다.';
        }
        
        setErrorMessage(errorMsg);
        setVerificationStep('error');
      }
    } catch (error) {
      console.error('Verification API error:', error);
      setErrorMessage('서버 연결에 실패했습니다. 다시 시도해주세요.');
      setVerificationStep('error');
    }
  };

  const handleRetry = async () => {
    setErrorMessage('');
    setIdCardImage(null);
    setEditedOcrData(null);
    setVerificationStep('capturing-id');
    await startCamera();
  };

  const handleBack = () => {
    stopCamera();
    if (verificationStep === 'capturing-face') {
      // Go back to OCR confirm (keep the OCR data)
      setVerificationStep('ocr-confirm');
      return;
    }
    if (verificationStep === 'ocr-confirm') {
      // Go back to ID preview
      setEditedOcrData(null);
      setVerificationStep('id-preview');
      return;
    }
    if (verificationStep === 'id-preview') {
      // Retake ID photo
      setIdCardImage(null);
      setVerificationStep('capturing-id');
      startCamera();
      return;
    }
    if (currentGuest > 0) {
      if (currentGuest === 1 && verificationStep === 'capturing-id') {
        setCurrentGuest(0);
        setVerificationStep('idle');
      } else {
        setCurrentGuest((prev) => prev - 1);
        setVerificationStep('capturing-id');
        startCamera();
      }
    } else {
      if (flowType === 'checkin') {
        goToScreen('checkin-consent');
      } else {
        goToScreen('walkin-consent');
      }
    }
  };

  const screenTitle = flowType === 'checkin' ? t('checkin_title') : t('walkin_title');

  // Guest count selection screen
  if (currentGuest === 0) {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <NavArrow direction="left" label="이전" onClick={handleBack} />
            <div className="logo"><Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" /></div>
            <h2 className="screen-title">{screenTitle}</h2>
            <div className="verification-intro" style={{ whiteSpace: 'pre-wrap' }}>
              {t('verification_description')}
            </div>
            <div className="guest-count-section">
              <div className="number-selector">
                <button className="number-btn" onClick={decreaseCount}>-</button>
                <span className="number-display">{guestCount}<span className="number-unit">명</span></span>
                <button className="number-btn" onClick={increaseCount}>+</button>
              </div>
            </div>
            <button
              className="bottom-next-btn"
              onClick={handleStartVerification}
            >
              인증 시작
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error screen
  if (verificationStep === 'error') {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <NavArrow direction="left" label="이전" onClick={handleBack} />
            <NavArrow direction="right" label="다시 시도" onClick={handleRetry} />
            <div className="logo"><Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" /></div>
            <h2 className="screen-title">인증 실패</h2>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ marginBottom: '12px' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p style={{ color: '#dc2626', fontSize: '14px' }}>{errorMessage}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success screen
  if (verificationStep === 'success') {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <div className="logo"><Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" /></div>
            <h2 className="screen-title">인증 완료</h2>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" style={{ marginBottom: '16px' }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="16,8 10,14 8,12" />
              </svg>
              <p style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>모든 투숙객 인증이 완료되었습니다</p>
              <p style={{ color: '#666', fontSize: '13px' }}>잠시 후 다음 화면으로 이동합니다...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ID Preview screen - shows captured image before sending to OCR
  if (verificationStep === 'id-preview' && idCardImage) {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <NavArrow direction="left" label="다시 촬영" onClick={handleIdPreviewRetake} />
            <div className="logo"><Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" /></div>
            <h2 className="screen-title">촬영된 신분증 확인</h2>
            <p className="screen-description">신분증이 정확하게 촬영되었는지 확인해주세요</p>

            {/* Captured image preview */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              margin: '24px auto',
              maxWidth: '480px',
            }}>
              <div style={{
                position: 'relative',
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                border: '3px solid #e5e7eb',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/jpeg;base64,${idCardImage}`}
                  alt="촬영된 신분증"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '24px' }}>
              <button
                onClick={handleIdPreviewRetake}
                style={{
                  padding: '14px 32px',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#64748b',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                다시 촬영
              </button>
              <button
                onClick={handleIdPreviewProceed}
                style={{
                  padding: '14px 48px',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'white',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                }}
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Verifying screen (shows spinner during OCR or final verification)
  if (verificationStep === 'verifying') {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <div className="logo"><Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" /></div>
            <h2 className="screen-title">{screenTitle}</h2>
            <div className="verification-progress">
              <span className="current-guest">{currentGuest}번째</span> / {guestCount}명 인증
            </div>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              <p>인증 중입니다...</p>
              <p style={{ color: '#666', fontSize: '13px' }}>신분증 진위확인 및 얼굴 인증을 진행하고 있습니다</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </div>
    );
  }

  // OCR Confirmation screen - allows user to verify/edit extracted data
  if (verificationStep === 'ocr-confirm' && editedOcrData) {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <NavArrow direction="left" label="다시 촬영" onClick={handleOcrRetake} />
            <div className="logo"><Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" /></div>
            <h2 className="screen-title">신분증 정보 확인</h2>
            <p className="screen-description">인식된 정보가 맞는지 확인해주세요. 틀린 부분은 수정할 수 있습니다.</p>

            <div style={{
              background: '#f8fafc',
              borderRadius: '16px',
              padding: '20px 24px',
              maxWidth: '480px',
              margin: '16px auto',
            }}>
              {/* ID Type Badge */}
              <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: editedOcrData.idType === '2' ? '#fef3c7' : '#dbeafe',
                  color: editedOcrData.idType === '2' ? '#92400e' : '#1e40af',
                }}>
                  {editedOcrData.idType === '2' ? '운전면허증' : '주민등록증'}
                </span>
              </div>

              {/* Form Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>
                    이름
                  </label>
                  <input
                    type="text"
                    value={editedOcrData.name}
                    onChange={(e) => setEditedOcrData({ ...editedOcrData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: 'white',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>
                      생년월일
                    </label>
                    <input
                      type="text"
                      value={editedOcrData.juminNo1}
                      onChange={(e) => setEditedOcrData({ ...editedOcrData, juminNo1: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) })}
                      placeholder="YYMMDD"
                      maxLength={6}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: 'white',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>
                      주민번호 뒷자리
                    </label>
                    <input
                      type="text"
                      value={editedOcrData.juminNo2}
                      onChange={(e) => setEditedOcrData({ ...editedOcrData, juminNo2: e.target.value.replace(/[^0-9]/g, '').slice(0, 7) })}
                      placeholder="7자리"
                      maxLength={7}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: 'white',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>
                    발급일자
                  </label>
                  <input
                    type="text"
                    value={editedOcrData.issueDate}
                    onChange={(e) => setEditedOcrData({ ...editedOcrData, issueDate: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })}
                    placeholder="YYYYMMDD"
                    maxLength={8}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: 'white',
                    }}
                  />
                </div>

                {editedOcrData.idType === '2' && editedOcrData.driverNo && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>
                      운전면허번호
                    </label>
                    <input
                      type="text"
                      value={editedOcrData.driverNo}
                      onChange={(e) => setEditedOcrData({ ...editedOcrData, driverNo: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        fontSize: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: 'white',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
              <button
                onClick={handleOcrRetake}
                style={{
                  padding: '12px 24px',
                  fontSize: '15px',
                  fontWeight: 500,
                  color: '#64748b',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                다시 촬영
              </button>
              <button
                onClick={handleOcrConfirm}
                style={{
                  padding: '12px 32px',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'white',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                확인 후 다음
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Camera capture screen
  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <NavArrow direction="left" label="이전" onClick={handleBack} />
          <div className="logo"><Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" /></div>
          <h2 className="screen-title">{screenTitle}</h2>
          <div className="verification-progress">
            <span className="current-guest">{currentGuest}번째</span> / {guestCount}명 인증
          </div>
          {verificationStep === 'capturing-face' && (
            <p className="screen-description">얼굴을 카메라에 잘 보이게 서 주세요</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', margin: '12px auto', maxWidth: '520px' }}>
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: '420px',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Video with clip-path mask - mirrored for natural preview */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  transform: 'scaleX(-1)', // Mirror the video for natural preview
                  clipPath: verificationStep === 'capturing-face'
                    ? 'ellipse(25% 35% at 50% 50%)'
                    : 'inset(15% 7.5% 15% 7.5% round 8px)',
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Dark overlay with cutout */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
              }}>
                {verificationStep === 'capturing-id' ? (
                  /* ID card mask - rectangular cutout */
                  <svg width="100%" height="100%" style={{ position: 'absolute' }}>
                    <defs>
                      <mask id="idCardMask">
                        <rect width="100%" height="100%" fill="white" />
                        <rect x="7.5%" y="15%" width="85%" height="70%" rx="8" fill="black" />
                      </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#idCardMask)" />
                    <rect x="7.5%" y="15%" width="85%" height="70%" rx="8" fill="none" stroke="white" strokeWidth="3" strokeDasharray="10,5" />
                  </svg>
                ) : (
                  /* Face mask - oval cutout */
                  <svg width="100%" height="100%" style={{ position: 'absolute' }}>
                    <defs>
                      <mask id="faceMask">
                        <rect width="100%" height="100%" fill="white" />
                        <ellipse cx="50%" cy="50%" rx="25%" ry="35%" fill="black" />
                      </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#faceMask)" />
                    <ellipse cx="50%" cy="50%" rx="25%" ry="35%" fill="none" stroke="white" strokeWidth="3" strokeDasharray="10,5" />
                  </svg>
                )}
              </div>

              {/* Helper text */}
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.6)',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '13px',
                whiteSpace: 'nowrap',
              }}>
                {verificationStep === 'capturing-id' ? '신분증을 영역 안에 맞춰주세요' : '얼굴을 원 안에 맞춰주세요'}
              </div>

              {/* DEBUG: Skip button for both ID and face capture */}
              <button
                onClick={handleSkipVerification}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: '#f97316',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              >
                건너뛰기 (DEBUG)
              </button>
            </div>
            {/* Camera capture button - positioned below camera */}
            <button
              onClick={verificationStep === 'capturing-id' ? handleCaptureIdCard : handleCaptureSelfie}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '16px 48px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span style={{ fontSize: '16px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {verificationStep === 'capturing-id' ? '신분증 촬영' : '얼굴 촬영'}
              </span>
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', margin: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: verificationStep === 'capturing-id' ? 1 : 0.5 }}>
              <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: verificationStep === 'capturing-id' ? '#3b82f6' : (idCardImage ? '#16a34a' : '#ccc'), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>1</span>
              <span style={{ fontSize: '13px' }}>신분증 촬영</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: verificationStep === 'capturing-face' ? 1 : 0.5 }}>
              <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: verificationStep === 'capturing-face' ? '#3b82f6' : '#ccc', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>2</span>
              <span style={{ fontSize: '13px' }}>얼굴 촬영</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hotel Info Screen
function HotelInfoScreen({
  goToScreen,
  flowType,
  t,
  projectId,
  selectedRoomTypeId,
  syncInputData,
  inputData,
  openStaffModal,
  callProps,
  amenityTotal,
  selectedAmenities,
  selectedRoom,
  resetAmenities,
}: {
  goToScreen: (screen: ScreenName) => void;
  flowType: 'checkin' | 'walkin';
  t: (key: string) => string;
  projectId?: string;
  selectedRoomTypeId?: string | null;
  amenityTotal?: number;
  selectedAmenities?: SelectedAmenity[];
  selectedRoom?: Room | null;
  resetAmenities?: () => void;
  syncInputData?: (data: Partial<InputData>) => void;
  inputData?: InputData;
  openStaffModal: () => void;
  callProps: CallProps;
}) {
  const [assignedRoom, setAssignedRoom] = useState<AssignedRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasAssignedRef = useRef(false);

  // Assign a room when component mounts (only once)
  useEffect(() => {
    // Prevent multiple API calls
    if (hasAssignedRef.current) return;

    const assignRoom = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      hasAssignedRef.current = true;

      try {
        // Get room price only (amenityTotal is added separately in the API)
        const roomPrice = selectedRoom?.price || inputData?.reservation?.roomType?.price || 0;

        const response = await fetch('/api/rooms/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            roomTypeId: selectedRoomTypeId || inputData?.reservation?.roomType?.id,
            guestName: inputData?.signature || inputData?.reservation?.guestName || null,
            guestCount: inputData?.guestCount || inputData?.reservation?.guestCount || 1,
            // Pass reservation info for pre-assigned reserved rooms
            reservationId: inputData?.reservation?.id,
            reservationNumber: inputData?.reservation?.reservationNumber,
            // Pass price info (totalPrice = room price, amenityTotal added in API)
            totalPrice: roomPrice,
            amenityTotal: amenityTotal || 0,
          }),
          credentials: 'include',
        });

        const data = await response.json();

        if (data.success && data.room) {
          setAssignedRoom(data.room);
          if (syncInputData) {
            syncInputData({ assignedRoom: data.room });
          }

          // Save selected amenities to reservation if any
          if (data.reservation && selectedAmenities && selectedAmenities.length > 0) {
            try {
              await fetch('/api/reservation-amenities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reservationId: data.reservation.id,
                  amenities: selectedAmenities.map(a => ({
                    amenityId: a.amenityId,
                    quantity: a.quantity,
                    unitPrice: a.unitPrice,
                  })),
                }),
                credentials: 'include',
              });
            } catch (amenityErr) {
              console.error('Error saving amenities:', amenityErr);
              // Don't fail the whole process if amenity saving fails
            }
          }
        } else {
          setError(data.error || '객실 배정 중 오류가 발생했습니다');
        }
      } catch (err) {
        console.error('Error assigning room:', err);
        setError('객실 배정 중 오류가 발생했습니다');
      } finally {
        setLoading(false);
      }
    };

    assignRoom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, selectedRoomTypeId]);

  // Auto-redirect countdown
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    // Only start countdown when room is assigned successfully
    if (!loading && assignedRoom && !error) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, assignedRoom, error]);

  const handleComplete = () => {
    // Reset amenity selections
    if (resetAmenities) {
      resetAmenities();
    }
    goToScreen('start');
  };

  const screenTitle = flowType === 'checkin' ? t('checkin_title') : t('walkin_title');

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <div className="logo">
              <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
            </div>
            <h2 className="screen-title">{screenTitle}</h2>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <p>객실을 배정하고 있습니다...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !assignedRoom) {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <NavArrow direction="right" label="확인" onClick={handleComplete} />
            <div className="logo">
              <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
            </div>
            <h2 className="screen-title">{screenTitle}</h2>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <p style={{ color: '#dc2626', marginBottom: '12px' }}>{error || '객실 배정에 실패했습니다'}</p>
              <p style={{ color: '#666', fontSize: '14px' }}>프론트 데스크로 문의해 주세요.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>

          <h2 className="screen-title">{screenTitle}</h2>

          <p className="screen-description" style={{ marginBottom: '4px', fontSize: '16px', color: '#4d5867', fontWeight: 500 }}>{t('info_keybox_instruction')}</p>
          <p className="screen-description">{t('info_welcome_message')}</p>

          <div className="hotelinfo-two-col">
            {/* Left: 호텔 안내 */}
            <div className="hotelinfo-left">
              <div className="info-section">
                <h3>{t('info_section_title')}</h3>
                <ul className="info-list">
                  <li>
                    <span className="info-label">{t('info_checkin_label')}</span> {t('info_checkin_time')}
                  </li>
                  <li>
                    <span className="info-label">{t('info_checkout_label')}</span> {t('info_checkout_time')}
                  </li>
                  <li>
                    <span className="info-label">{t('info_room_notice_label')}</span> {t('info_room_notice')}
                  </li>
                  <li>
                    <span className="info-label">{t('info_emergency_label')}</span> {t('info_emergency_number')}
                  </li>
                </ul>
              </div>
            </div>

            {/* Right: 객실 안내 */}
            <div className="hotelinfo-right">
              <div className="keybox-card">
                <h3>{t('info_room_section_title')}</h3>
                <div className="keybox-info">
                  <p>배정된 객실</p>
                  <p className="room-highlight">{assignedRoom.roomNumber}호</p>

                  {assignedRoom.roomType && (
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginBottom: '12px' }}>
                      {assignedRoom.roomType.name}
                    </p>
                  )}

                  {assignedRoom.accessType === 'password' ? (
                    <div className="keybox-details">
                      <div className="keybox-item">
                        <span className="keybox-label">객실 비밀번호</span>
                        <span className="keybox-value">{assignedRoom.roomPassword}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="keybox-details">
                      <div className="keybox-item">
                        <span className="keybox-label">키 박스 번호</span>
                        <span className="keybox-value">{assignedRoom.keyBoxNumber}번</span>
                      </div>
                      <div className="keybox-item">
                        <span className="keybox-label">키 박스 비밀번호</span>
                        <span className="keybox-value">{assignedRoom.keyBoxPassword}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Complete button at bottom */}
          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            <button
              onClick={handleComplete}
              className="primary-button"
              style={{
                padding: '16px 48px',
                fontSize: '18px',
                fontWeight: 600,
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                minWidth: '200px',
              }}
            >
              완료 ({countdown}초)
            </button>
            <p style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280' }}>
              {countdown}초 후 자동으로 처음 화면으로 돌아갑니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Room Selection Screen
function RoomSelectionScreen({
  goToScreen,
  setSelectedRoom,
  syncInputData,
  t,
  projectId,
  openStaffModal,
  callProps,
}: {
  goToScreen: (screen: ScreenName) => void;
  setSelectedRoom: (room: Room) => void;
  syncInputData: (data: Partial<InputData>) => void;
  t: (key: string) => string;
  projectId?: string;
  openStaffModal: () => void;
  callProps: CallProps;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomTypeData[]>([]);
  const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch room types and available rooms from database
  useEffect(() => {
    const fetchRoomData = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch room types and available rooms in parallel
        const [typesRes, roomsRes] = await Promise.all([
          fetch(`/api/room-types?projectId=${projectId}`),
          fetch(`/api/rooms?projectId=${projectId}&availableOnly=true`),
        ]);

        const typesData = await typesRes.json();
        const roomsData = await roomsRes.json();

        setRoomTypes(typesData.roomTypes || []);

        // Count available rooms by type (rooms with status='available')
        const counts: Record<string, number> = {};
        (roomsData.rooms || []).forEach((room: { room_type_id: string | null }) => {
          if (room.room_type_id) {
            counts[room.room_type_id] = (counts[room.room_type_id] || 0) + 1;
          }
        });
        setAvailableCounts(counts);
      } catch (error) {
        console.error('Error fetching room data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRoomData();
  }, [projectId]);

  // Filter room types that have available rooms
  const availableRoomTypes = roomTypes.filter(rt => (availableCounts[rt.id] || 0) > 0);

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', updateScrollState);
      window.addEventListener('resize', updateScrollState);
      // Initial check after cards render
      const timer = setTimeout(updateScrollState, 100);
      return () => {
        container.removeEventListener('scroll', updateScrollState);
        window.removeEventListener('resize', updateScrollState);
        clearTimeout(timer);
      };
    }
  }, [updateScrollState, availableRoomTypes]);

  const scrollLeftHandler = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: -220, behavior: 'smooth' });
    }
  };

  const scrollRightHandler = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollBy({ left: 220, behavior: 'smooth' });
    }
  };

  const handleSelectRoom = (roomTypeId: string) => {
    setSelected(roomTypeId);
    const roomType = roomTypes.find((r) => r.id === roomTypeId);
    if (roomType) {
      syncInputData({
        selectedRoom: {
          id: roomType.id,
          name: roomType.name,
          description: roomType.description || '',
          price: roomType.base_price,
          capacity: `최대 ${roomType.max_guests}인`,
        },
        selectedRoomTypeId: roomType.id,
      });
    }
  };

  const handleNext = () => {
    if (selected) {
      const roomType = roomTypes.find((r) => r.id === selected);
      if (roomType) {
        setSelectedRoom({
          id: roomType.id,
          name: roomType.name,
          description: roomType.description || '',
          price: roomType.base_price,
          capacity: `최대 ${roomType.max_guests}인`,
        });
        goToScreen('walkin-consent');
      }
    }
  };

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <div className="logo">
              <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
            </div>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <p>객실 정보를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <NavArrow direction="left" label="이전" onClick={() => goToScreen('start')} />
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <h2 className="screen-title">{t('walkin_title')}</h2>
          <p className="screen-description">
            {t('walkin_room_description')}
          </p>
          {availableRoomTypes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <p style={{ color: '#666', marginBottom: '12px' }}>현재 사용 가능한 객실이 없습니다.</p>
              <p style={{ color: '#999', fontSize: '13px' }}>프론트 데스크로 문의해 주세요.</p>
            </div>
          ) : (
            <>
              <div className="room-grid-container">
                {/* Left scroll arrow - only show if can scroll left */}
                {canScrollLeft && (
                  <button
                    className="room-scroll-arrow left"
                    onClick={scrollLeftHandler}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}

                {/* Right scroll arrow - only show if can scroll right */}
                {canScrollRight && (
                  <button
                    className="room-scroll-arrow right"
                    onClick={scrollRightHandler}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}

                {/* Horizontal scrollable room cards */}
                <div className="room-grid-scroll" ref={scrollContainerRef}>
                  {availableRoomTypes.map((roomType) => (
                    <div
                      key={roomType.id}
                      className={`room-grid-card ${selected === roomType.id ? 'selected' : ''}`}
                      onClick={() => handleSelectRoom(roomType.id)}
                    >
                      {roomType.image_url ? (
                        <div className="room-grid-image">
                          <img src={roomType.image_url} alt={roomType.name} />
                        </div>
                      ) : (
                        <div className="room-grid-image placeholder">
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                        </div>
                      )}
                      <div className="room-grid-info">
                        <h3>{roomType.name}</h3>
                        <p className="room-grid-capacity">최대 {roomType.max_guests}인 · 잔여 {availableCounts[roomType.id] || 0}실</p>
                        <div className="room-grid-price">
                          <span className="price-value">{Math.round(roomType.base_price).toLocaleString('ko-KR')}</span>
                          <span className="price-unit">원</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="bottom-next-btn"
                onClick={handleNext}
                disabled={!selected}
              >
                다음
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Amenity Selection Screen
function AmenitySelectionScreen({
  goToScreen,
  flowType,
  t,
  projectId,
  openStaffModal,
  callProps,
  selectedAmenities,
  setSelectedAmenities,
  amenityTotal,
  setAmenityTotal,
  selectedRoom,
  reservationId,
}: {
  goToScreen: (screen: ScreenName) => void;
  flowType: 'checkin' | 'walkin';
  t: (key: string) => string;
  projectId?: string;
  openStaffModal: () => void;
  callProps: CallProps;
  selectedAmenities: SelectedAmenity[];
  setSelectedAmenities: (amenities: SelectedAmenity[]) => void;
  amenityTotal: number;
  setAmenityTotal: (total: number) => void;
  selectedRoom?: Room | null;
  reservationId?: string;
}) {
  const [amenities, setAmenities] = useState<AmenityData[]>([]);
  const [loading, setLoading] = useState(true);

  // Reset amenities when screen opens (always start fresh)
  useEffect(() => {
    setSelectedAmenities([]);
    setAmenityTotal(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch amenities for this project
  useEffect(() => {
    const fetchAmenities = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/amenities?projectId=${projectId}&activeOnly=true`);
        const data = await res.json();
        setAmenities(data.amenities || []);
      } catch (error) {
        console.error('Error fetching amenities:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAmenities();
  }, [projectId]);

  // If no amenities available, skip to next screen
  useEffect(() => {
    if (!loading && amenities.length === 0) {
      if (flowType === 'checkin') {
        goToScreen('checkin-info');
      } else {
        goToScreen('payment-confirm');
      }
    }
  }, [loading, amenities, flowType, goToScreen]);

  const handleQuantityChange = (amenity: AmenityData, delta: number) => {
    const existing = selectedAmenities.find((a) => a.amenityId === amenity.id);
    let updated: SelectedAmenity[];

    if (existing) {
      const newQuantity = Math.max(0, existing.quantity + delta);
      if (newQuantity === 0) {
        updated = selectedAmenities.filter((a) => a.amenityId !== amenity.id);
      } else {
        updated = selectedAmenities.map((a) =>
          a.amenityId === amenity.id ? { ...a, quantity: newQuantity } : a
        );
      }
    } else if (delta > 0) {
      updated = [
        ...selectedAmenities,
        { amenityId: amenity.id, name: amenity.name, quantity: 1, unitPrice: amenity.price },
      ];
    } else {
      updated = selectedAmenities;
    }

    setSelectedAmenities(updated);
    const newTotal = updated.reduce((sum, a) => sum + a.quantity * a.unitPrice, 0);
    setAmenityTotal(newTotal);
  };

  const getQuantity = (amenityId: string) => {
    return selectedAmenities.find((a) => a.amenityId === amenityId)?.quantity || 0;
  };

  const handleSkip = () => {
    setSelectedAmenities([]);
    setAmenityTotal(0);
    if (flowType === 'checkin') {
      goToScreen('checkin-info');
    } else {
      goToScreen('payment-confirm');
    }
  };

  const handleNext = async () => {
    // Save amenities to reservation if we have amenities selected
    if (selectedAmenities.length > 0 && reservationId) {
      try {
        await fetch('/api/reservation-amenities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservationId,
            amenities: selectedAmenities,
          }),
        });
      } catch (error) {
        console.error('Error saving amenities:', error);
      }
    }

    if (flowType === 'checkin') {
      // For reserved customers: if amenities selected, go to payment, else go to info
      if (amenityTotal > 0) {
        goToScreen('payment-confirm');
      } else {
        goToScreen('checkin-info');
      }
    } else {
      // For walk-in: always go to payment
      goToScreen('payment-confirm');
    }
  };

  const handleBack = () => {
    if (flowType === 'checkin') {
      goToScreen('checkin-id-verification');
    } else {
      goToScreen('walkin-id-verification');
    }
  };

  const screenTitle = flowType === 'checkin' ? t('checkin_title') : t('walkin_title');
  const roomPrice = selectedRoom?.price || 0;

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <div className="logo">
              <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
            </div>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <NavArrow direction="left" label="이전" onClick={handleBack} />
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <h2 className="screen-title">{screenTitle}</h2>
          <p className="screen-description">
            추가 어메니티를 선택해 주세요
          </p>

          <div className="amenity-list" style={{ marginTop: '24px', maxWidth: '400px', width: '100%' }}>
            {amenities.map((amenity) => {
              const quantity = getQuantity(amenity.id);
              return (
                <div
                  key={amenity.id}
                  className="amenity-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    marginBottom: '12px',
                    backgroundColor: quantity > 0 ? '#eff6ff' : '#f9fafb',
                    borderRadius: '12px',
                    border: quantity > 0 ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '16px', color: '#111827' }}>{amenity.name}</div>
                    {amenity.description && (
                      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{amenity.description}</div>
                    )}
                    <div style={{ fontSize: '15px', color: '#2563eb', fontWeight: 500, marginTop: '4px' }}>
                      {amenity.price.toLocaleString('ko-KR')}원
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={() => handleQuantityChange(amenity, -1)}
                      disabled={quantity === 0}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: quantity === 0 ? '#e5e7eb' : '#3b82f6',
                        color: 'white',
                        fontSize: '20px',
                        fontWeight: 700,
                        cursor: quantity === 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '18px', fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>
                      {quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(amenity, 1)}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        fontSize: '20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {(roomPrice > 0 || amenityTotal > 0) && (
            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '12px', maxWidth: '400px', width: '100%' }}>
              {flowType === 'walkin' && roomPrice > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#6b7280' }}>객실 요금</span>
                  <span style={{ fontWeight: 500 }}>{roomPrice.toLocaleString('ko-KR')}원</span>
                </div>
              )}
              {amenityTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#6b7280' }}>어메니티</span>
                  <span style={{ fontWeight: 500, color: '#2563eb' }}>+{amenityTotal.toLocaleString('ko-KR')}원</span>
                </div>
              )}
              {flowType === 'walkin' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #d1d5db' }}>
                  <span style={{ fontWeight: 700, fontSize: '16px' }}>총 결제 금액</span>
                  <span style={{ fontWeight: 700, fontSize: '18px', color: '#111827' }}>
                    {(roomPrice + amenityTotal).toLocaleString('ko-KR')}원
                  </span>
                </div>
              )}
              {flowType === 'checkin' && amenityTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #d1d5db' }}>
                  <span style={{ fontWeight: 700, fontSize: '16px' }}>추가 결제 금액</span>
                  <span style={{ fontWeight: 700, fontSize: '18px', color: '#2563eb' }}>
                    {amenityTotal.toLocaleString('ko-KR')}원
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '32px', maxWidth: '400px', width: '100%' }}>
            <button
              onClick={handleSkip}
              style={{
                flex: 1,
                padding: '16px',
                fontSize: '16px',
                fontWeight: 600,
                color: '#4b5563',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              건너뛰기
            </button>
            <button
              onClick={handleNext}
              style={{
                flex: 1,
                padding: '16px',
                fontSize: '16px',
                fontWeight: 600,
                color: 'white',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              {amenityTotal > 0 ? '다음' : '확인'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Payment Confirm Screen
function PaymentConfirmScreen({
  goToScreen,
  selectedRoom,
  t,
  openStaffModal,
  callProps,
  amenityTotal = 0,
}: {
  goToScreen: (screen: ScreenName) => void;
  selectedRoom: Room | null;
  t: (key: string) => string;
  openStaffModal: () => void;
  callProps: CallProps;
  amenityTotal?: number;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const roomPrice = selectedRoom?.price || 65000;
  const totalPrice = roomPrice + amenityTotal;

  const handlePayment = () => {
    setIsProcessing(true);
    // Simulate payment processing (skip EasyCheck for now)
    setTimeout(() => {
      setIsProcessing(false);
      goToScreen('walkin-info');
    }, 1500);
  };

  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <NavArrow direction="left" label="이전" onClick={() => goToScreen('walkin-amenity-selection')} />
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <h2 className="screen-title">{t('walkin_title')}</h2>
          <p className="screen-description">
            선택하신 객실을 확인하시고 결제를 진행해 주세요
          </p>
          <div className="payment-summary">
            <div className="selected-room-card">
              <h3>{selectedRoom?.name || '스탠다드'}</h3>
              <p>{selectedRoom?.description || '깔끔하고 편안한 기본 객실'}</p>
              <p className="room-capacity">{selectedRoom?.capacity || '기준 2인 / 최대 2인'}</p>
            </div>
            <div className="payment-total">
              <span className="total-label">객실 요금</span>
              <span className="total-price">
                {Math.round(roomPrice).toLocaleString('ko-KR')}원
              </span>
            </div>
            {amenityTotal > 0 && (
              <div className="payment-total" style={{ marginTop: '8px' }}>
                <span className="total-label">어메니티</span>
                <span className="total-price" style={{ color: '#2563eb' }}>
                  +{amenityTotal.toLocaleString('ko-KR')}원
                </span>
              </div>
            )}
            <div className="payment-total" style={{ marginTop: '16px', borderTop: '2px solid #e5e7eb', paddingTop: '16px' }}>
              <span className="total-label" style={{ fontWeight: 700, fontSize: '18px' }}>총 결제 금액</span>
              <span className="total-price" style={{ fontSize: '24px' }}>
                {Math.round(totalPrice).toLocaleString('ko-KR')}원
              </span>
            </div>
          </div>
          <button
            className="payment-button"
            onClick={handlePayment}
            disabled={isProcessing}
            style={{
              width: '100%',
              maxWidth: '320px',
              padding: '16px 32px',
              fontSize: '18px',
              fontWeight: 600,
              color: 'white',
              backgroundColor: isProcessing ? '#9ca3af' : '#2563eb',
              border: 'none',
              borderRadius: '12px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              margin: '24px auto 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isProcessing ? (
              <>
                <div style={{ width: '20px', height: '20px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                결제 처리 중...
              </>
            ) : (
              '결제'
            )}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

// Payment Process Screen with EasyCheck Integration
function PaymentProcessScreen({
  goToScreen,
  selectedRoom,
  t,
  openStaffModal,
  kioskId,
  paymentState,
  paymentError,
  setPaymentState,
  setPaymentError,
  callProps,
  amenityTotal,
}: {
  goToScreen: (screen: ScreenName) => void;
  selectedRoom: Room | null;
  t: (key: string) => string;
  openStaffModal: () => void;
  kioskId?: string;
  paymentState: 'idle' | 'processing' | 'success' | 'failed';
  paymentError: string | null;
  setPaymentState: (state: 'idle' | 'processing' | 'success' | 'failed') => void;
  setPaymentError: (error: string | null) => void;
  callProps: CallProps;
  amenityTotal?: number;
}) {
  const handlePayment = () => {
    const roomPrice = selectedRoom?.price || 65000;
    const amount = roomPrice + (amenityTotal || 0);

    // Build payment request
    const paymentRequest: EasyCheckPaymentRequest = {
      transactionNo: generateTransactionNo(),
      transactionType: 'CARD',
      totalAmount: amount,
      orderNum: `ROOM-${selectedRoom?.name || 'WALK-IN'}-${Date.now()}`,
      callbackUrl: `${window.location.origin}/api/payment/callback${kioskId ? `?kiosk=${kioskId}` : ''}`,
    };

    setPaymentState('processing');
    setPaymentError(null);

    // Launch EasyCheck app
    // This will redirect the browser to the EasyCheck app
    // When payment completes, EasyCheck will redirect back to our callback URL
    launchPayment(paymentRequest);
  };

  const handleRetry = () => {
    setPaymentState('idle');
    setPaymentError(null);
  };

  // Show success state
  if (paymentState === 'success') {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <div className="logo">
              <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
            </div>
            <h2 className="screen-title">결제 완료</h2>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" style={{ marginBottom: '16px' }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="16,8 10,14 8,12" />
              </svg>
              <p style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>결제가 완료되었습니다</p>
              <p style={{ color: '#666', fontSize: '14px' }}>잠시 후 객실 안내 화면으로 이동합니다...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show failed state
  if (paymentState === 'failed') {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <NavArrow direction="left" label="이전" onClick={() => { setPaymentState('idle'); goToScreen('payment-confirm'); }} />
            <NavArrow direction="right" label="다시 시도" onClick={handleRetry} />
            <div className="logo">
              <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
            </div>
            <h2 className="screen-title">결제 실패</h2>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ marginBottom: '16px' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p style={{ fontSize: '18px', fontWeight: 500, color: '#dc2626', marginBottom: '8px' }}>결제에 실패했습니다</p>
              {paymentError && (
                <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>{paymentError}</p>
              )}
              <p style={{ color: '#666', fontSize: '14px' }}>다시 시도하시거나 직원을 호출해 주세요.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show processing state
  if (paymentState === 'processing') {
    return (
      <div className="screen">
        <div className="screen-wrapper">
          <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
          <div className="container">
            <div className="logo">
              <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
            </div>
            <h2 className="screen-title">{t('walkin_title')}</h2>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>결제 앱으로 이동 중...</p>
              <p style={{ color: '#666', fontSize: '14px' }}>이지체크 앱에서 결제를 진행해 주세요</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </div>
    );
  }

  // Default: idle state - show payment button
  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <NavArrow direction="left" label="이전" onClick={() => goToScreen('payment-confirm')} />
          <NavArrow direction="right" label="결제하기" onClick={handlePayment} />
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <h2 className="screen-title">{t('walkin_title')}</h2>
          <p className="screen-description">결제를 진행해 주세요</p>
          <div className="payment-process-container">
            <div className="payment-amount">
              <span className="amount-label">총 결제 금액</span>
              <span className="amount-value">
                {Math.round(selectedRoom?.price || 65000).toLocaleString('ko-KR')}원
              </span>
            </div>
            <div className="payment-instructions">
              <p>결제 버튼을 누르시면</p>
              <p>이지체크 결제 앱이 실행됩니다.</p>
              <p style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>카드 결제를 진행한 후 자동으로 돌아옵니다.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Checkout Screen
function CheckoutScreen({ goToScreen, t, openStaffModal, callProps }: { goToScreen: (screen: ScreenName) => void; t: (key: string) => string; openStaffModal: () => void; callProps: CallProps }) {
  const [countdown, setCountdown] = useState(10);

  const handleComplete = () => {
    goToScreen('start');
  };

  // Auto-redirect to home after 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          goToScreen('start');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [goToScreen]);

  return (
    <div className="screen">
      <div className="screen-wrapper">
        <TopButtonRow onStaffCall={openStaffModal} callStatus={callProps.callStatus} callDuration={callProps.callDuration} onEndCall={callProps.onEndCall} isCallActive={callProps.isCallActive} />
        <div className="container">
          <div className="logo">
            <Image src="/logo.png" alt="HiO" width={200} height={80} className="logo-image" />
          </div>
          <h2 className="screen-title">{t('checkout_title')}</h2>
          <div className="checkout-message">
            <p className="thank-you">{t('checkout_thank_you')}</p>
            <div style={{ whiteSpace: 'pre-wrap' }}>{t('checkout_instructions')}</div>
            <p className="thank-you">{t('checkout_final_thanks')}</p>
          </div>

          {/* Complete button and auto-redirect notice */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '32px', gap: '16px' }}>
            <button
              onClick={handleComplete}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '16px 64px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              완료
            </button>
            <p style={{ color: '#666', fontSize: '14px' }}>
              {countdown}초 후 자동으로 처음 화면으로 돌아갑니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
