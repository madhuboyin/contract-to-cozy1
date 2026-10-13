import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
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
router.post('/properties/:propertyId/plant-advisor/plants', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(createHomePlantBodySchema), createHomePlant);
router.patch('/properties/:propertyId/plant-advisor/plants/:plantId/care', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(updateHomePlantCareBodySchema), updateHomePlantCare);
router.post('/properties/:propertyId/plant-advisor/garden-zones', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(gardenZoneBodySchema), createGardenZone);
router.patch('/properties/:propertyId/plant-advisor/garden-zones/:zoneId', propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR'), validateBody(updateGardenZoneBodySchema), updateGardenZone);

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
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(upsertRoomPlantProfileBodySchema),
  upsertRoomPlantProfile
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/generate',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(generateRoomPlantRecommendationsBodySchema),
  generateRoomPlantRecommendations
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/save',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  saveRoomPlantRecommendation
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/dismiss',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  dismissRoomPlantRecommendation
);

router.post(
  '/properties/:propertyId/plant-advisor/rooms/:roomId/recommendations/:recommendationId/add-to-home',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(addRoomPlantRecommendationToHomeBodySchema),
  addRoomPlantRecommendationToHome
);

export default router;
