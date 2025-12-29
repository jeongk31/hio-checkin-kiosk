'use client';

import { VoiceCallProvider } from '@/contexts/VoiceCallContext';
import IncomingCallNotification from './IncomingCallNotification';
import ActiveCallOverlay from './ActiveCallOverlay';
import type { Profile } from '@/types/database';

interface VoiceCallWrapperProps {
  children: React.ReactNode;
  profile: Profile;
}

export default function VoiceCallWrapper({ children, profile }: VoiceCallWrapperProps) {
  // Only super_admin can receive calls from kiosks
  if (profile.role !== 'super_admin') {
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
