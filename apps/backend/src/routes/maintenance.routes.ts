// apps/backend/src/routes/maintenance.routes.ts
// --- MODIFIED FILE ---

import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenance.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware'; // --- ADDED ---
import { createCustomMaintenanceItemsSchema } from '../types/maintenance.types'; // --- ADDED ---


const router = Router();

/**
 * @route   GET /api/maintenance-templates
 * @desc    Get all available maintenance task templates for existing owners
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  maintenanceController.handleGetMaintenanceTemplates
);

// --- NEW ROUTE FOR PHASE 1 ---
/**
 * @route   POST /api/maintenance-templates/custom-items
 * @desc    Create custom maintenance checklist items from user config
 * @access  Private
 */
router.post(
  '/custom-items',
  authenticate,
  validate(createCustomMaintenanceItemsSchema), // Validates req.body
  maintenanceController.handleCreateCustomMaintenanceItems
);
// --- END NEW ROUTE ---

export default router;