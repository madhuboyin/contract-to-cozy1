// apps/frontend/src/components/mobile/OfflineBanner.tsx

'use client';

import { WifiOff, Wifi, AlertCircle } from 'lucide-react';
import { useOnline, useSlowConnection } from '@/hooks/useOnline';
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const isOnline = useOnline();
  const isSlowConnection = useSlowConnection();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" message briefly
      setTimeout(() => {
        setShowBanner(false);
        setWasOffline(false);
      }, 3000);
    } else {
      setShowBanner(false);
    }
  }, [isOnline, wasOffline]);

  if (!showBanner) return null;

  return (
    <>
      {!isOnline ? (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white px-4 py-3 text-center text-sm font-medium z-[60] shadow-lg animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-center gap-2">
            <WifiOff className="h-4 w-4 animate-pulse" />
            <span>You're offline. Changes will sync when reconnected.</span>
          </div>
        </div>
      ) : wasOffline ? (
        <div className="fixed top-0 left-0 right-0 bg-green-500 text-white px-4 py-3 text-center text-sm font-medium z-[60] shadow-lg animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-center gap-2">
            <Wifi className="h-4 w-4" />
            <span>Back online! Syncing your changes...</span>
          </div>
        </div>
      ) : null}
    </>
  );
}

// Slow connection warning
export function SlowConnectionBanner() {
  const isSlowConnection = useSlowConnection();
  const [dismissed, setDismissed] = useState(false);

  if (!isSlowConnection || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium z-[59] shadow-md">
      <div className="flex items-center justify-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span>Slow connection detected. Some features may be limited.</span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 underline hover:no-underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Combined network status component
export function NetworkStatus() {
  return (
    <>
      <OfflineBanner />
      <SlowConnectionBanner />
    </>
  );
}