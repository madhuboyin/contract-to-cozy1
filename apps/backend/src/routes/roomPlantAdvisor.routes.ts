import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validate, validateBody } from '../middleware/validate.middleware';
import {
  addRoomPlantRecommendationToHome,
  dismissRoomPlantRecommendation,
  generateRoomPlantRecommendations,
  getRoomPlantAdvisorState,
  listEligiblePlantAdvisorRooms,
  listPlantCatalog,
  saveRoomPlantRecommendation,
  upsertRoomPlantProfile,
} from '../controllers/roomPlantAdvisor.controller';
import {
  addRoomPlantRecommendationToHomeBodySchema,
  generateRoomPlantRecommendationsBodySchema,
  listPlantCatalogQuerySchema,
  upsertRoomPlantProfileBodySchema,
} from '../validators/roomPlantAdvisor.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/plant-advisor/rooms',
  propertyAuthMiddleware,
  listEligiblePlantAdvisorRooms
);

router.get(
  '/properties/:propertyId/plant-advisor/catalog',
  propertyAuthMiddleware,
  validate(listPlantCatalogQuerySchema.transform((query) => ({ query }))),
  listPlantCatalog
);

router.get(
  '/properties/:propertyId/plant-advisor/rooms/:roomId',
  propertyAuthMiddleware,
  getRoomPlantAdvisorState
);

router.put(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/profile',
  propertyAuthMiddleware,
  validateBody(upsertRoomPlantProfileBodySchema),
  upsertRoomPlantProfile
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/generate',
  propertyAuthMiddleware,
  validateBody(generateRoomPlantRecommendationsBodySchema),
  generateRoomPlantRecommendations
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/save',
  propertyAuthMiddleware,
  saveRoomPlantRecommendation
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/dismiss',
  propertyAuthMiddleware,
  dismissRoomPlantRecommendation
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/add-to-home',
  propertyAuthMiddleware,
  validateBody(addRoomPlantRecommendationToHomeBodySchema),
  addRoomPlantRecommendationToHome
);

export default router;

