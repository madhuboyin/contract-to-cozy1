import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  addRoomPlantRecommendationToHome,
  dismissRoomPlantRecommendation,
  generateRoomPlantRecommendations,
  getRoomPlantAdvisorState,
  listEligiblePlantAdvisorRooms,
  listPlantCatalog,
  saveRoomPlantRecommendation,
  upsertRoomPlantProfile,
  getPlantCareOutlook,
  createHomePlant,
  updateHomePlantCare,
  createGardenZone,
  updateGardenZone,
} from '../controllers/roomPlantAdvisor.controller';
import {
  addRoomPlantRecommendationToHomeBodySchema,
  generateRoomPlantRecommendationsBodySchema,
  upsertRoomPlantProfileBodySchema,
  createHomePlantBodySchema,
  updateHomePlantCareBodySchema,
  gardenZoneBodySchema,
  updateGardenZoneBodySchema,
} from '../validators/roomPlantAdvisor.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

router.get('/properties/:propertyId/plant-advisor/care-outlook', propertyAuthMiddleware, getPlantCareOutlook);
router.post('/properties/:propertyId/plant-advisor/plants', propertyAuthMiddleware, validateBody(createHomePlantBodySchema), createHomePlant);
router.patch('/properties/:propertyId/plant-advisor/plants/:plantId/care', propertyAuthMiddleware, validateBody(updateHomePlantCareBodySchema), updateHomePlantCare);
router.post('/properties/:propertyId/plant-advisor/garden-zones', propertyAuthMiddleware, validateBody(gardenZoneBodySchema), createGardenZone);
router.patch('/properties/:propertyId/plant-advisor/garden-zones/:zoneId', propertyAuthMiddleware, validateBody(updateGardenZoneBodySchema), updateGardenZone);

// Note: propertyAuthMiddleware already validates that :propertyId is a valid UUID
// that belongs to the authenticated user, so no separate params validate() is needed.

router.get(
  '/properties/:propertyId/plant-advisor/rooms',
  propertyAuthMiddleware,
  listEligiblePlantAdvisorRooms
);

router.get(
  '/properties/:propertyId/plant-advisor/catalog',
  propertyAuthMiddleware,
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
