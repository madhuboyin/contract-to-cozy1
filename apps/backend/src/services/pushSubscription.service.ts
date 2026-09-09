// apps/backend/src/services/pushSubscription.service.ts
//
// Feature-agnostic Web Push (browser / installed-PWA) subscription management
// (PWA audit remediation C6). Previously the only path to register a browser
// for push lived inside the mortgage refinance radar tool; this is the shared
// implementation any feature — and a single "turn on notifications" setting —
// calls. The refinance service now delegates here.
//
// Native mobile device tokens are handled separately in pushDevice.service.ts.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The VAPID public key the browser needs to create a push subscription. */
export function getWebPushPublicKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null;
}

export function isWebPushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getWebPushPublicKey(env) !== null;
}

/**
 * Register (or refresh) a browser push subscription for the current user. The
 * subscription endpoint is globally unique; if it already belongs to a
 * different account we refuse rather than silently move it.
 */
export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
  userAgent?: string,
): Promise<void> {
  if (!isWebPushConfigured()) {
    throw new APIError('Push notifications are not configured.', 409, 'WEB_PUSH_NOT_CONFIGURED');
  }

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: input.endpoint },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) {
    throw new APIError(
      'This browser subscription is already registered to another account.',
      409,
      'WEB_PUSH_SUBSCRIPTION_CONFLICT',
    );
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 500),
    },
    update: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 500),
      revokedAt: null,
    },
  });
}

/** Revoke a browser push subscription (called when the user turns push off). */
export async function revokePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await prisma.pushSubscription.updateMany({
    where: { userId, endpoint, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Whether the user currently has at least one live browser subscription. */
export async function hasActivePushSubscription(userId: string): Promise<boolean> {
  const count = await prisma.pushSubscription.count({
    where: { userId, revokedAt: null },
  });
  return count > 0;
}
