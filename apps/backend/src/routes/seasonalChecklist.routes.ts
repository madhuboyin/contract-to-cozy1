// apps/backend/src/routes/seasonalChecklist.routes.ts
import { Router } from 'express';
import { SeasonalChecklistController } from '../controllers/seasonalChecklist.controller';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';

const router = Router();

// =============================================================================
// PROPERTY CLIMATE ZONE ROUTES
// =============================================================================

router.get(
  '/properties/:propertyId/climate',
  authenticate,
  propertyAuthMiddleware,
  SeasonalChecklistController.getClimateInfo
);

router.put(
  '/properties/:propertyId/climate',
  authenticate,
  propertyAuthMiddleware,
  SeasonalChecklistController.updateClimateSettings
);

// =============================================================================
// SEASONAL CHECKLIST ROUTES
// =============================================================================

router.get(
  '/properties/:propertyId/seasonal-checklists',
  authenticate,
  propertyAuthMiddleware,
  SeasonalChecklistController.getPropertyChecklists
);

router.get(
  '/seasonal-checklists/:checklistId',
  authenticate,
  SeasonalChecklistController.getChecklistDetails
);

router.post(
  '/seasonal-checklists/generate',
  authenticate,
  SeasonalChecklistController.generateChecklist
);

router.post(
  '/seasonal-checklists/:checklistId/dismiss',
  authenticate,
  SeasonalChecklistController.dismissChecklist
);

router.post(
  '/seasonal-checklists/:checklistId/add-all-critical',
  authenticate,
  SeasonalChecklistController.addAllCriticalTasks
);

// =============================================================================
// SEASONAL CHECKLIST ITEM ROUTES
// =============================================================================

/**
 * Legacy endpoint - still works for backward compatibility
 * @deprecated Use /add-to-maintenance for EXISTING_OWNER segment
 */
router.post(
  '/seasonal-checklist-items/:itemId/add-to-tasks',
  authenticate,
  SeasonalChecklistController.addTaskToChecklist
);

/**
 * PHASE 2.5: Add seasonal task to PropertyMaintenanceTask
 * POST /api/seasonal-checklist-items/:itemId/add-to-maintenance
 * 
 * Creates a PropertyMaintenanceTask from a seasonal item
 * - Only for EXISTING_OWNER segment
 * - Links via seasonalChecklistItemId
 * - Updates seasonal item status to 'ADDED'
 */
router.post(
  '/seasonal-checklist-items/:itemId/add-to-maintenance',
  authenticate,
  SeasonalChecklistController.addToMaintenance
);

/**
 * PHASE 2.5: Remove seasonal task from maintenance
 * DELETE /api/seasonal-checklist-items/:itemId/remove-from-maintenance
 * 
 * Unlinks seasonal item from PropertyMaintenanceTask
 * - Does NOT delete the maintenance task (user may have modified it)
 * - Resets seasonal item status to 'RECOMMENDED'
 */
router.delete(
  '/seasonal-checklist-items/:itemId/remove-from-maintenance',
  authenticate,
  SeasonalChecklistController.removeFromMaintenance
);

router.post(
  '/seasonal-checklist-items/:itemId/dismiss',
  authenticate,
  SeasonalChecklistController.dismissTask
);

router.post(
  '/seasonal-checklist-items/:itemId/snooze',
  authenticate,
  SeasonalChecklistController.snoozeTask
);

export default router;