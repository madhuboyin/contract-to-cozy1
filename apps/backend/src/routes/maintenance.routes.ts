// apps/backend/src/routes/maintenance.routes.ts
import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenance.controller';
import { authenticate } from '../middleware/auth.middleware';

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

export default router;