import { Router } from 'express';
import { checklistController } from '../controllers/checklist.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../types/auth.types'; // <-- THE FIX IS HERE

const router = Router();

// Apply authentication middleware to all routes in this file
router.use(authenticate);

// --- Checklist Routes ---

/**
 * @route GET /api/checklist
 * @desc Get the authenticated homeowner's checklist
 * @access Private (Homeowner)
 */
router.get(
  '/api/checklist',
  requireRole(UserRole.HOMEOWNER), // This will now work
  checklistController.handleGetChecklist
);

/**
 * @route PUT /api/checklist/items/:itemId
 * @desc Update the status of a checklist item
 * @access Private (Homeowner)
 */
router.put(
  '/api/checklist/items/:itemId',
  requireRole(UserRole.HOMEOWNER), // This will also work
  checklistController.handleUpdateChecklistItem
);

export const checklistRoutes = router;