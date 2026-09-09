import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(512),
    auth: z.string().trim().min(1).max(512),
  }),
});

export const pushSubscriptionRevokeSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type PushSubscriptionRevokeInput = z.infer<typeof pushSubscriptionRevokeSchema>;
