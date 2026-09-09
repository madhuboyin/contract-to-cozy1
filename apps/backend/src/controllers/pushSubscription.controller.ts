// apps/backend/src/controllers/pushSubscription.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import {
  getWebPushPublicKey,
  upsertPushSubscription,
  revokePushSubscription,
  hasActivePushSubscription,
} from '../services/pushSubscription.service';
import type {
  PushSubscriptionInput,
  PushSubscriptionRevokeInput,
} from '../validators/pushSubscription.validators';

/** GET /api/push/vapid-public-key — the key a browser needs to subscribe. */
export const getVapidPublicKey = async (_req: AuthRequest, res: Response) => {
  const publicKey = getWebPushPublicKey();
  res.json({ success: true, data: { publicKey, configured: publicKey !== null } });
};

/** GET /api/push/subscriptions/status — does this user have a live subscription. */
export const getPushSubscriptionStatus = async (req: AuthRequest, res: Response) => {
  try {
    const active = await hasActivePushSubscription(req.user!.userId);
    res.json({
      success: true,
      data: { configured: getWebPushPublicKey() !== null, hasActiveSubscription: active },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error reading push subscription status');
    res.status(500).json({ success: false, message: 'Failed to read notification status.' });
  }
};

/** POST /api/push/subscriptions — register/refresh a browser push subscription. */
export const registerPushSubscription = async (req: AuthRequest, res: Response) => {
  try {
    await upsertPushSubscription(
      req.user!.userId,
      req.body as PushSubscriptionInput,
      req.get('user-agent') ?? undefined,
    );
    res.status(201).json({ success: true, data: { message: 'Push notifications enabled.' } });
  } catch (error) {
    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json({ success: false, error: { message: error.message, code: error.code } });
    }
    logger.error({ err: error }, 'Error registering push subscription');
    res.status(500).json({ success: false, message: 'Failed to enable push notifications.' });
  }
};

/** DELETE /api/push/subscriptions — revoke a browser push subscription. */
export const revokePushSubscriptionHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body as PushSubscriptionRevokeInput;
    await revokePushSubscription(req.user!.userId, endpoint);
    res.json({ success: true, data: { message: 'Push notifications disabled.' } });
  } catch (error) {
    logger.error({ err: error }, 'Error revoking push subscription');
    res.status(500).json({ success: false, message: 'Failed to disable push notifications.' });
  }
};
