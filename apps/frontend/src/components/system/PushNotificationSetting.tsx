'use client';

// PWA audit remediation C6 (F6): the single "push notifications on this device"
// control. Backed by the shared helpers in @/lib/pushNotifications, which talk
// to the feature-agnostic /api/push/* endpoints.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  disablePush,
  enablePush,
  getPushStatus,
  isPushSupported,
  type PushStatus,
} from '@/lib/pushNotifications';

const ENABLE_FAILURE_COPY: Record<string, string> = {
  permission_denied:
    'Your browser blocked notifications. Allow them for this site in your browser settings, then try again.',
  not_configured: 'Push notifications are not available right now.',
  unsupported: 'This browser cannot receive push notifications.',
  incomplete_subscription: 'The browser returned an incomplete subscription. Try again.',
  sw_unavailable:
    "The background service isn't ready yet. Reload the page and try again in a moment.",
  error: 'Something went wrong turning on notifications. Try again.',
};

export function PushNotificationSetting() {
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void getPushStatus().then(setStatus);
  }, []);

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus({ supported: false, configured: false, permission: 'unsupported', subscribed: false });
      return;
    }
    refresh();
  }, [refresh]);

  const handleToggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const result = await enablePush();
        if (result.ok) {
          toast({ title: 'Push notifications on', description: 'This device will now receive alerts.' });
        } else {
          toast({
            title: 'Could not turn on notifications',
            description: ENABLE_FAILURE_COPY[result.reason] ?? ENABLE_FAILURE_COPY.error,
            variant: 'destructive',
          });
        }
      } else {
        await disablePush();
        toast({ title: 'Push notifications off', description: 'This device will no longer receive alerts.' });
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (status && (!status.supported || !status.configured)) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {!status.supported
          ? 'This browser cannot receive push notifications.'
          : 'Push notifications are not available right now.'}
      </div>
    );
  }

  const enabled = Boolean(status?.subscribed);
  const blocked = status?.permission === 'denied';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-slate-800">Push notifications on this device</p>
        <p className="text-xs text-slate-500">
          {blocked
            ? 'Notifications are blocked in your browser settings for this site. Allow them there, then toggle this on.'
            : 'Get alerts on this device even when ContractToCozy is closed. In-app alerts are unaffected either way.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Push notifications on this device"
        disabled={busy || status === null || blocked}
        onClick={() => void handleToggle(!enabled)}
        className={`min-h-[32px] w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          enabled ? 'bg-brand-primary' : 'bg-slate-300'
        }`}
      >
        <span
          className={`block h-6 w-6 translate-x-1 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-7' : ''
          }`}
        />
      </button>
    </div>
  );
}
