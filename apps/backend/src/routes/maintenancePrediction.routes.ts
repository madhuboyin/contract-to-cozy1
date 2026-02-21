import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import {
  generateMaintenanceForecast,
  getMaintenanceForecast,
  patchMaintenanceForecastStatus,
} from '../controllers/maintenancePrediction.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/properties/:propertyId/maintenance-predictions/generate',
  propertyAuthMiddleware,
  generateMaintenanceForecast
);

router.get(
  '/properties/:propertyId/maintenance-predictions',
  propertyAuthMiddleware,
  getMaintenanceForecast
);

router.patch(
  '/properties/:propertyId/maintenance-predictions/:predictionId/status',
  propertyAuthMiddleware,
  patchMaintenanceForecastStatus
);

export default router;
