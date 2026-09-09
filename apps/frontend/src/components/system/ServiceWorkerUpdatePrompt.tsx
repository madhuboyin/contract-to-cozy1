'use client';

// PWA audit remediation C3 (F9): the service worker used a blocking
// window.confirm() to offer a reload when a new version installed. That is
// unreliable in standalone display mode and a poor experience everywhere.
// registerServiceWorker() now dispatches SW_UPDATE_READY_EVENT instead, and
// this component turns it into a dismissible "Reload to update" toast.

import { useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { SW_UPDATE_READY_EVENT, applyServiceWorkerUpdate } from '@/lib/pwa';

export function ServiceWorkerUpdatePrompt() {
  useEffect(() => {
    const handleUpdateReady = () => {
      toast({
        title: 'Update available',
        description: 'A new version of ContractToCozy is ready.',
        action: (
          <ToastAction
            altText="Reload the page to load the latest version"
            onClick={() => { void applyServiceWorkerUpdate(); }}
          >
            Reload
          </ToastAction>
        ),
      });
    };

    window.addEventListener(SW_UPDATE_READY_EVENT, handleUpdateReady);
    return () => window.removeEventListener(SW_UPDATE_READY_EVENT, handleUpdateReady);
  }, []);

  return null;
}
