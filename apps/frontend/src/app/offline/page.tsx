// apps/frontend/src/app/offline/page.tsx

'use client';

import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function OfflinePage() {
  const router = useRouter();

  const handleRetry = () => {
    if (navigator.onLine) {
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <WifiOff className="h-10 w-10 text-red-600" />
            </div>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              You're Offline
            </h1>
            <p className="text-gray-600">
              It looks like you've lost your internet connection. Some features may not be available.
            </p>
          </div>

          {/* Features available offline */}
          <div className="bg-blue-50 rounded-lg p-4 text-left">
            <p className="font-semibold text-blue-900 mb-2 text-sm">
              Still available offline:
            </p>
            <ul className="space-y-1 text-sm text-blue-800">
              <li>• View cached property details</li>
              <li>• Complete maintenance tasks</li>
              <li>• Take photos and add notes</li>
              <li>• Browse saved documents</li>
            </ul>
            <p className="text-xs text-blue-700 mt-3">
              Your changes will sync automatically when you're back online.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button 
              onClick={handleRetry}
              className="w-full"
              size="lg"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>

            <Button 
              onClick={() => router.push('/dashboard')}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>

          {/* Connection tips */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              <strong>Tip:</strong> Check your WiFi or cellular connection and try again.
            </p>
          </div>
        </div>

        {/* App info */}
        <p className="text-xs text-gray-500 mt-6">
          Contract to Cozy • Your property management companion
        </p>
      </div>
    </div>
  );
}