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

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

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
