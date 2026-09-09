import { z } from 'zod';

// APNs device tokens are 64 hex chars today but Apple has signalled they may
// grow, and FCM tokens are longer opaque strings — so validate loosely on
// shape, not exact length.
const deviceToken = z
  .string()
  .trim()
  .min(32, 'token is too short')
  .max(4096, 'token is too long')
  .regex(/^[A-Za-z0-9_:.\-]+$/, 'token contains unexpected characters');

export const registerPushDeviceSchema = z.object({
  token: deviceToken,
  platform: z.enum(['IOS', 'ANDROID']),
  bundleId: z.string().trim().max(255).optional(),
  appVersion: z.string().trim().max(64).optional(),
  deviceName: z.string().trim().max(120).optional(),
});

export const unregisterPushDeviceSchema = z.object({
  token: deviceToken,
  platform: z.enum(['IOS', 'ANDROID']),
});

export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;
export type UnregisterPushDeviceInput = z.infer<typeof unregisterPushDeviceSchema>;
