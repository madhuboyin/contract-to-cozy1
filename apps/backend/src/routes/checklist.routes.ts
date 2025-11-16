// apps/backend/src/routes/checklist.routes.ts
import { Router } from 'express';
import { checklistController } from '../controllers/checklist.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/checklist
 * @desc    Get the user's checklist
 * @access  Private
 */
router.get('/', authenticate, checklistController.handleGetChecklist);

/**
 * @route   PUT /api/checklist/items/:itemId
 * @desc    Update a checklist item's status
 * @access  Private
 */
router.put(
  '/items/:itemId',
  authenticate,
  checklistController.handleUpdateChecklistItem
);

// --- NEW ROUTE for Phase 3 ---
/**
 * @route   POST /api/checklist/maintenance-items
 * @desc    Add new recurring maintenance items to user's checklist
 * @access  Private
 * @body    { templateIds: string[] }
 */
router.post(
  '/maintenance-items',
  authenticate,
  checklistController.handleCreateMaintenanceItems
);
// --- END NEW ROUTE ---

export default router;