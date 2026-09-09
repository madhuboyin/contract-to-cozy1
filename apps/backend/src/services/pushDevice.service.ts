// apps/backend/src/services/pushDevice.service.ts
//
// Native mobile push device registration (PWA audit remediation B4). Stores
// APNs / FCM device tokens so the workers push pipeline can deliver to a native
// app alongside browser Web Push. The tokens themselves are not credentials —
// delivery credentials (APNS_*) live only in the workers environment.

import { prisma } from '../lib/prisma';
import type {
  RegisterPushDeviceInput,
  UnregisterPushDeviceInput,
} from '../validators/pushDevice.validators';

export interface PushDeviceView {
  id: string;
  platform: 'IOS' | 'ANDROID';
  bundleId: string | null;
  appVersion: string | null;
  deviceName: string | null;
  lastSeenAt: string;
  createdAt: string;
}

function toView(device: {
  id: string;
  platform: string;
  bundleId: string | null;
  appVersion: string | null;
  deviceName: string | null;
  lastSeenAt: Date;
  createdAt: Date;
}): PushDeviceView {
  return {
    id: device.id,
    platform: device.platform as 'IOS' | 'ANDROID',
    bundleId: device.bundleId,
    appVersion: device.appVersion,
    deviceName: device.deviceName,
    lastSeenAt: device.lastSeenAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}

/**
 * Register (or refresh) a device token for the current user. A token is unique
 * per platform, so if it was previously registered — even to another account
 * on a shared device — it is re-pointed at this user and re-enabled.
 */
export async function registerDevice(
  userId: string,
  input: RegisterPushDeviceInput,
): Promise<PushDeviceView> {
  const now = new Date();
  const device = await prisma.pushDevice.upsert({
    where: { platform_token: { platform: input.platform, token: input.token } },
    create: {
      userId,
      platform: input.platform,
      token: input.token,
      bundleId: input.bundleId ?? null,
      appVersion: input.appVersion ?? null,
      deviceName: input.deviceName ?? null,
      lastSeenAt: now,
    },
    update: {
      userId,
      bundleId: input.bundleId ?? null,
      appVersion: input.appVersion ?? null,
      deviceName: input.deviceName ?? null,
      lastSeenAt: now,
      disabledAt: null,
      disabledReason: null,
    },
  });
  return toView(device);
}

/**
 * Unregister a device token (called on sign-out or when the user turns
 * notifications off). Soft-disable so we keep a record and the delivery worker
 * stops targeting it. No-op — not an error — if the token is unknown or already
 * belongs to someone else.
 */
export async function unregisterDevice(
  userId: string,
  input: UnregisterPushDeviceInput,
): Promise<void> {
  await prisma.pushDevice.updateMany({
    where: { platform: input.platform, token: input.token, userId, disabledAt: null },
    data: { disabledAt: new Date(), disabledReason: 'unregistered_by_user' },
  });
}

export async function listDevices(userId: string): Promise<PushDeviceView[]> {
  const devices = await prisma.pushDevice.findMany({
    where: { userId, disabledAt: null },
    orderBy: { lastSeenAt: 'desc' },
  });
  return devices.map(toView);
}
