// apps/frontend/src/lib/pushNotifications.ts
//
// Feature-agnostic Web Push helpers (PWA audit remediation C6). Previously the
// only code that subscribed a browser to push lived inside the mortgage
// refinance radar tool. Any feature — and the notifications settings toggle —
// now goes through here, talking to the shared /api/push/* endpoints.

import { api } from '@/lib/api/client';

export interface PushStatus {
  supported: boolean;
  configured: boolean; // the server has VAPID keys
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

export type EnablePushResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'unsupported'
        | 'not_configured'
        | 'permission_denied'
        | 'incomplete_subscription'
        | 'error';
    };

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Decode a base64url VAPID public key into the byte array `subscribe()` wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await api.get<{ publicKey: string | null; configured: boolean }>(
      '/api/push/vapid-public-key',
    );
    return res.data?.publicKey ?? null;
  } catch {
    return null;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return { supported: false, configured: false, permission: 'unsupported', subscribed: false };
  }

  const [publicKey, subscription] = await Promise.all([
    fetchVapidPublicKey(),
    currentSubscription().catch(() => null),
  ]);

  return {
    supported: true,
    configured: publicKey !== null,
    permission: Notification.permission,
    subscribed: subscription !== null,
  };
}

/**
 * Turn on push notifications for this browser: request permission, create a
 * Push subscription against the server VAPID key, and register it server-side.
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  try {
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return { ok: false, reason: 'not_configured' };

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'permission_denied' };

    // The service worker is registered globally by registerServiceWorker().
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'incomplete_subscription' };
    }

    await api.post('/api/push/subscriptions', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Turn off push notifications for this browser. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;

  const subscription = await currentSubscription();
  const endpoint = subscription?.endpoint;

  try {
    await subscription?.unsubscribe();
  } catch {
    /* best effort */
  }

  if (endpoint) {
    try {
      await api.post('/api/push/subscriptions/revoke', { endpoint });
    } catch {
      /* best effort — the local unsubscribe already happened */
    }
  }
}
