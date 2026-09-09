// apps/frontend/src/app/offline/page.tsx
//
// The offline fallback shell. The service worker precaches this page and serves
// it when a navigation cannot reach the network (see public/sw.js). It is a
// server component with plain <a> links and no client JS on purpose (PWA audit
// F20): when it is served offline its bundle chunks may not be cached, so it
// must be fully functional as static HTML.

import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: "You're offline • ContractToCozy",
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <WifiOff className="h-10 w-10 text-red-600" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              You&apos;re Offline
            </h1>
            <p className="text-gray-600">
              It looks like you&apos;ve lost your internet connection. Some features may not be available.
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 text-left">
            <p className="font-semibold text-blue-900 mb-2 text-sm">
              While you&apos;re offline
            </p>
            <p className="text-sm text-blue-800">
              ContractToCozy needs a connection for most things. Pages you&apos;ve
              already opened may still be visible, but new information won&apos;t
              load and changes can&apos;t be saved until you&apos;re back online.
            </p>
          </div>

          <div className="space-y-3">
            {/* Plain links so the shell works with zero JS. "Try again" just
                re-navigates — the browser retries the network on the way. */}
            <Button asChild className="w-full" size="lg">
              <a href="/dashboard">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </a>
            </Button>

            <Button asChild variant="outline" className="w-full" size="lg">
              <a href="/dashboard">
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </a>
            </Button>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              <strong>Tip:</strong> Check your WiFi or cellular connection and try again.
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-6">
          ContractToCozy • Your property management companion
        </p>
      </div>
    </div>
  );
}
