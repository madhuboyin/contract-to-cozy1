import { Router } from 'express';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';

import {
  getRoomInsights,
  patchRoomMeta,
  listRoomChecklistItems,
  createRoomChecklistItem,
  updateRoomChecklistItem,
  deleteRoomChecklistItem,
  updateRoomProfile,
  getRoomTimeline,
} from '../controllers/roomInsights.controller';

import {
  updateRoomProfileBodySchema,
  createRoomChecklistItemBodySchema,
  updateRoomChecklistItemBodySchema,
} from '../validators/inventory.validators';

const router = Router();

/**
 * Room Insights (property-scoped)
 * Base: /api
 */

// Insights summary (no AI required)
router.get(
  '/properties/:propertyId/inventory/rooms/:roomId/insights',
  propertyAuthMiddleware,
  getRoomInsights
);

// Patch room metadata (name/type/sortOrder etc.)
router.patch(
  '/properties/:propertyId/inventory/rooms/:roomId',
  propertyAuthMiddleware,
  patchRoomMeta
);

// Profile (questionnaire) JSON stored in InventoryRoom.profile
router.patch(
  '/properties/:propertyId/inventory/rooms/:roomId/profile',
  propertyAuthMiddleware,
  validateBody(updateRoomProfileBodySchema),
  updateRoomProfile
);

// Checklist CRUD
router.get(
  '/properties/:propertyId/inventory/rooms/:roomId/checklist-items',
  propertyAuthMiddleware,
  listRoomChecklistItems
);

router.post(
  '/properties/:propertyId/inventory/rooms/:roomId/checklist-items',
  propertyAuthMiddleware,
  validateBody(createRoomChecklistItemBodySchema),
  createRoomChecklistItem
);

router.patch(
  '/properties/:propertyId/inventory/rooms/:roomId/checklist-items/:itemId',
  propertyAuthMiddleware,
  validateBody(updateRoomChecklistItemBodySchema),
  updateRoomChecklistItem
);

router.delete(
  '/properties/:propertyId/inventory/rooms/:roomId/checklist-items/:itemId',
  propertyAuthMiddleware,
  deleteRoomChecklistItem
);

// Timeline (tasks + incidents)
router.get(
  '/properties/:propertyId/inventory/rooms/:roomId/timeline',
  propertyAuthMiddleware,
  getRoomTimeline
);

export default router;
