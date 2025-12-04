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

/**
 * @route   PATCH /api/checklist/items/:itemId
 * @desc    Update a checklist item's configuration (title, description, etc.)
 * @access  Private
 */
router.patch(
  '/items/:itemId',
  authenticate,
  checklistController.handlePatchChecklistItem
);

/**
 * @route   DELETE /api/checklist/items/:itemId
 * @desc    Delete a checklist item (used for recurring maintenance tasks)
 * @access  Private
 */
router.delete(
  '/items/:itemId',
  authenticate,
  checklistController.handleDeleteChecklistItem
);

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

export default router;