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
  plantAdvisorPropertyParamsSchema,
  plantAdvisorRecommendationParamsSchema,
  plantAdvisorRoomParamsSchema,
  upsertRoomPlantProfileBodySchema,
} from '../validators/roomPlantAdvisor.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get(
  '/properties/:propertyId/plant-advisor/rooms',
  propertyAuthMiddleware,
  validate(plantAdvisorPropertyParamsSchema.transform((params) => ({ params }))),
  listEligiblePlantAdvisorRooms
);

router.get(
  '/properties/:propertyId/plant-advisor/catalog',
  propertyAuthMiddleware,
  validate(plantAdvisorPropertyParamsSchema.transform((params) => ({ params }))),
  validate(listPlantCatalogQuerySchema.transform((query) => ({ query }))),
  listPlantCatalog
);

router.get(
  '/properties/:propertyId/plant-advisor/rooms/:roomId',
  propertyAuthMiddleware,
  validate(plantAdvisorRoomParamsSchema.transform((params) => ({ params }))),
  getRoomPlantAdvisorState
);

router.put(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/profile',
  propertyAuthMiddleware,
  validate(plantAdvisorRoomParamsSchema.transform((params) => ({ params }))),
  validateBody(upsertRoomPlantProfileBodySchema),
  upsertRoomPlantProfile
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/generate',
  propertyAuthMiddleware,
  validate(plantAdvisorRoomParamsSchema.transform((params) => ({ params }))),
  validateBody(generateRoomPlantRecommendationsBodySchema),
  generateRoomPlantRecommendations
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/save',
  propertyAuthMiddleware,
  validate(plantAdvisorRecommendationParamsSchema.transform((params) => ({ params }))),
  saveRoomPlantRecommendation
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/dismiss',
  propertyAuthMiddleware,
  validate(plantAdvisorRecommendationParamsSchema.transform((params) => ({ params }))),
  dismissRoomPlantRecommendation
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/add-to-home',
  propertyAuthMiddleware,
  validate(plantAdvisorRecommendationParamsSchema.transform((params) => ({ params }))),
  validateBody(addRoomPlantRecommendationToHomeBodySchema),
  addRoomPlantRecommendationToHome
);

export default router;
