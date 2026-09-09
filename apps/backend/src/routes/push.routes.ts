import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  registerPushDeviceSchema,
  unregisterPushDeviceSchema,
} from '../validators/pushDevice.validators';
import {
  registerPushDevice,
  unregisterPushDevice,
  getPushDevices,
} from '../controllers/pushDevice.controller';
import {
  pushSubscriptionSchema,
  pushSubscriptionRevokeSchema,
} from '../validators/pushSubscription.validators';
import {
  getVapidPublicKey,
  getPushSubscriptionStatus,
  registerPushSubscription,
  revokePushSubscriptionHandler,
} from '../controllers/pushSubscription.controller';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

/**
 * @swagger
 * /api/push/vapid-public-key:
 *   get:
 *     summary: The VAPID public key a browser needs to create a Web Push subscription
 *     tags: [Push]
 * /api/push/subscriptions:
 *   get:
 *     summary: Whether the current user has an active browser push subscription
 *     tags: [Push]
 *   post:
 *     summary: Register or refresh a browser Web Push subscription
 *     tags: [Push]
 * /api/push/subscriptions/revoke:
 *   post:
 *     summary: Revoke a browser Web Push subscription (notifications off)
 *     tags: [Push]
 */
router.get('/vapid-public-key', getVapidPublicKey);
router.get('/subscriptions', getPushSubscriptionStatus);
router.post('/subscriptions', validateBody(pushSubscriptionSchema), registerPushSubscription);
router.post(
  '/subscriptions/revoke',
  validateBody(pushSubscriptionRevokeSchema),
  revokePushSubscriptionHandler,
);

/**
 * @swagger
 * /api/push/devices:
 *   get:
 *     summary: List the current user's registered native push devices
 *     tags: [Push]
 *   post:
 *     summary: Register or refresh a native push device token (APNs / FCM)
 *     tags: [Push]
 *   delete:
 *     summary: Unregister a native push device token (sign-out / notifications off)
 *     tags: [Push]
 */
router.get('/devices', getPushDevices);
router.post('/devices', validateBody(registerPushDeviceSchema), registerPushDevice);
router.delete('/devices', validateBody(unregisterPushDeviceSchema), unregisterPushDevice);

export default router;
