'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { NetworkStatus } from '@/components/mobile/OfflineBanner';
import { InstallPrompt } from '@/components/mobile/InstallPrompt';
import { registerServiceWorker } from '@/lib/pwa';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <QueryProvider>
      <AuthProvider>
        <NetworkStatus />
        {children}
        <InstallPrompt />
        <Toaster />
      </AuthProvider>
    </QueryProvider>
  );
}
