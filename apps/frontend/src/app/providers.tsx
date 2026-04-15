'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { NetworkStatus } from '@/components/mobile/OfflineBanner';
import { InstallPrompt } from '@/components/mobile/InstallPrompt';
import { registerServiceWorker } from '@/lib/pwa';
import { initFaro } from '@/lib/monitoring/faro';
import { ConsentProvider, useConsent } from '@/lib/consent';
import { CookieConsentBanner } from '@/components/system/CookieConsentBanner';
import { initSentryClient } from '../../sentry.client.config';

// Inner component — has access to ConsentContext so it can react to consent changes.
function AnalyticsGate() {
  const { analytics } = useConsent();

  useEffect(() => {
    if (!analytics) return;
    // Both Faro and Sentry are gated behind explicit analytics consent.
    initFaro();
    initSentryClient();
  }, [analytics]);

  return null;
}

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  useEffect(() => {
    const cleanup = registerServiceWorker();
    return cleanup;
  }, []);

  return (
    <ConsentProvider>
      <QueryProvider>
        <AuthProvider>
          <AnalyticsGate />
          <NetworkStatus />
          {children}
          <InstallPrompt />
          <Toaster />
          <CookieConsentBanner />
        </AuthProvider>
      </QueryProvider>
    </ConsentProvider>
  );
}
