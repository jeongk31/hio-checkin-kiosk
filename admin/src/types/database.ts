export type UserRole = 'super_admin' | 'project_admin' | 'kiosk' | 'call_only';
export type KioskStatus = 'online' | 'offline' | 'busy' | 'error';
export type VoiceCallCallerType = 'kiosk' | 'manager';

export interface Project {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  project_id: string | null; // Legacy single project - use projects array for team leaders
  is_active: boolean;
  created_at: string;
  updated_at: string;
  project?: Project;
  projects?: Project[]; // Multi-project support for team leaders
}

export interface Kiosk {
  id: string;
  project_id: string;
  profile_id: string | null;
  name: string;
  location: string | null;
  status: KioskStatus;
  current_screen: string;
  current_session_id: string | null;
  last_seen: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  project?: Project | null;
  profile?: Profile | null;
}

export interface KioskContent {
  id: string;
  project_id: string;
  content_key: string;
  content_value: string | null;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface VideoSession {
  id: string;
  kiosk_id: string;
  project_id: string;
  staff_user_id: string | null;
  room_name: string;
  status: 'waiting' | 'connected' | 'ended';
  caller_type: VoiceCallCallerType;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  kiosk?: Kiosk | null | {
    id: string;
    name: string;
    project_id: string;
    project?: { id: string; name: string } | null;
  };
}

export interface CheckinSession {
  id: string;
  kiosk_id: string;
  project_id: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_count: number;
  room_number: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  current_step: string | null;
  data: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

// Payment Types
export type PaymentType = 'credit' | 'debit' | 'cash_receipt' | 'simple_pay';
export type PaymentStatus = 'pending' | 'approved' | 'cancelled' | 'failed';

export interface PaymentTransaction {
  id: string;
  reservation_id: string | null;
  project_id: string | null;
  transaction_id: string;
  amount: number;
  tax: number;
  payment_type: PaymentType;
  status: PaymentStatus;
  approval_no: string | null;
  auth_date: string | null;
  auth_time: string | null;
  card_no: string | null;
  card_name: string | null;
  installment_months: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  // Joined fields
  reservation_number?: string;
  room_number?: string;
  guest_name?: string;
}
