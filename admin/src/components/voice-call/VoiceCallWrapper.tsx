'use client';

import { VoiceCallProvider } from '@/contexts/VoiceCallContext';
import IncomingCallNotification from './IncomingCallNotification';
import ActiveCallOverlay from './ActiveCallOverlay';
import type { Profile } from '@/types/database';

interface VoiceCallWrapperProps {
  children: React.ReactNode;
  profile: Profile;
}

// Roles that can receive voice calls from kiosks
const VOICE_CALL_ENABLED_ROLES = ['super_admin', 'project_admin', 'manager'];

export default function VoiceCallWrapper({ children, profile }: VoiceCallWrapperProps) {
  // Only admin/manager roles can receive calls from kiosks
  // Kiosk users don't need voice call context (they use KioskApp directly)
  if (!VOICE_CALL_ENABLED_ROLES.includes(profile.role)) {
    return <>{children}</>;
  }

  return (
    <VoiceCallProvider profile={profile}>
      {children}
      <IncomingCallNotification />
      <ActiveCallOverlay />
    </VoiceCallProvider>
  );
}
