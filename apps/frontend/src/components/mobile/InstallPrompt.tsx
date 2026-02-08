// apps/frontend/src/components/mobile/InstallPrompt.tsx

'use client';

import { useState, useEffect } from 'react';
import { X, Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isPWA, isIOS, isAndroid } from '@/lib/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed
    if (isPWA()) {
      return;
    }

    // Check if already dismissed
    const wasDismissed = localStorage.getItem('install-prompt-dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    // Check if iOS
    setIsIOSDevice(isIOS());

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    // For Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show prompt after 30 seconds
      timeoutIds.push(setTimeout(() => {
        setShowPrompt(true);
      }, 30000));
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, show prompt after 1 minute if not dismissed
    if (isIOS() && !wasDismissed) {
      timeoutIds.push(setTimeout(() => {
        setShowPrompt(true);
      }, 60000));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      timeoutIds.forEach(clearTimeout);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
      localStorage.setItem('install-prompt-dismissed', 'true');
    }
    
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    localStorage.setItem('install-prompt-dismissed', 'true');
  };

  if (!showPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 md:bottom-6 bg-white rounded-xl shadow-2xl p-5 z-40 border-2 border-blue-100 animate-in slide-in-from-bottom duration-500">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
          <Download className="h-6 w-6 text-white" />
        </div>
        
        <div className="flex-1 pr-6">
          <h3 className="font-bold text-gray-900 mb-1 text-lg">
            Install Contract to Cozy
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {isIOSDevice 
              ? 'Add to your home screen for quick access and a better experience'
              : 'Install our app for quick access, offline support, and push notifications'}
          </p>
          
          {isIOSDevice ? (
            <div className="bg-blue-50 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                <Share className="h-4 w-4" />
                To install:
              </p>
              <ol className="text-sm text-gray-700 space-y-1 ml-6 list-decimal">
                <li>Tap the Share button in Safari</li>
                <li>Scroll and tap "Add to Home Screen"</li>
                <li>Tap "Add" to confirm</li>
              </ol>
            </div>
          ) : (
            <Button onClick={handleInstall} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Install App
            </Button>
          )}
          
          <button
            onClick={handleDismiss}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-3 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact version for in-app placement
export function InstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isPWA()) return;

    const wasDismissed = localStorage.getItem('install-banner-dismissed');
    if (wasDismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShow(false);
      localStorage.setItem('install-banner-dismissed', 'true');
    }
    
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('install-banner-dismissed', 'true');
  };

  if (!show) return null;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-lg mb-4 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Download className="h-5 w-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Get the app</p>
            <p className="text-xs text-blue-100 truncate">Install for a better experience</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleInstall}
            variant="secondary"
            size="sm"
            className="bg-white text-blue-600 hover:bg-blue-50"
          >
            Install
          </Button>
          <button
            onClick={handleDismiss}
            className="text-blue-100 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}