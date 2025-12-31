// apps/backend/src/routes/propertyMaintenanceTask.routes.ts
import { Router } from 'express';
import { propertyMaintenanceTaskController } from '../controllers/propertyMaintenanceTask.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/maintenance-tasks/property/:propertyId
 * Get all tasks for a property
 * Query params: ?status=PENDING,IN_PROGRESS&priority=HIGH&source=USER_CREATED&includeCompleted=false
 */
router.get('/property/:propertyId', propertyMaintenanceTaskController.handleGetPropertyTasks);

/**
 * GET /api/maintenance-tasks/property/:propertyId/stats
 * Get task statistics for a property
 */
router.get('/property/:propertyId/stats', propertyMaintenanceTaskController.handleGetPropertyStats);

/**
 * GET /api/maintenance-tasks/:taskId
 * Get a single task
 */
router.get('/:taskId', propertyMaintenanceTaskController.handleGetTask);

/**
 * POST /api/maintenance-tasks/property/:propertyId
 * Create a user-defined maintenance task
 */
router.post('/property/:propertyId', propertyMaintenanceTaskController.handleCreateTask);

/**
 * POST /api/maintenance-tasks/from-action-center
 * Create task from Action Center (idempotent)
 * Body: { propertyId, title, assetType, priority, riskLevel?, serviceCategory?, estimatedCost?, nextDueDate }
 */
router.post('/from-action-center', propertyMaintenanceTaskController.handleCreateFromActionCenter);

/**
 * POST /api/maintenance-tasks/from-seasonal/:seasonalItemId
 * Create task from seasonal checklist item
 * Body: { propertyId }
 */
router.post('/from-seasonal/:seasonalItemId', propertyMaintenanceTaskController.handleCreateFromSeasonal);

/**
 * POST /api/maintenance-tasks/from-templates
 * Create tasks from templates
 * Body: { propertyId, templateIds: string[] }
 */
router.post('/from-templates', propertyMaintenanceTaskController.handleCreateFromTemplates);

/**
 * PATCH /api/maintenance-tasks/:taskId
 * Update task details
 */
router.patch('/:taskId', propertyMaintenanceTaskController.handleUpdateTask);

/**
 * PATCH /api/maintenance-tasks/:taskId/status
 * Update task status
 * Body: { status, actualCost? }
 */
router.patch('/:taskId/status', propertyMaintenanceTaskController.handleUpdateTaskStatus);

/**
 * DELETE /api/maintenance-tasks/:taskId
 * Delete a task (cannot delete ACTION_CENTER tasks)
 */
router.delete('/:taskId', propertyMaintenanceTaskController.handleDeleteTask);

/**
 * POST /api/maintenance-tasks/:taskId/link-booking
 * Link task to a booking
 * Body: { bookingId }
 */
router.post('/:taskId/link-booking', propertyMaintenanceTaskController.handleLinkToBooking);

export default router;