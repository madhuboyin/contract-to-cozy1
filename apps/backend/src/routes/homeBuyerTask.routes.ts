// apps/backend/src/routes/homeBuyerTask.routes.ts
import { Router } from 'express';
import { homeBuyerTaskController } from '../controllers/homeBuyerTask.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/home-buyer-tasks/properties/:propertyId/closing-home
 * Read-only dashboard presentation dispatcher and Buyer Closing Home overview.
 */
router.get('/properties/:propertyId/closing-home', homeBuyerTaskController.handleGetClosingHome);
router.get('/properties/:propertyId/overview', homeBuyerTaskController.handleGetOverview);

/**
 * GET /api/home-buyer-tasks/properties/:propertyId/checklist
 * Get or create a property-scoped 90-day ownership plan
 */
router.get('/properties/:propertyId/checklist', homeBuyerTaskController.handleGetChecklist);

/**
 * GET /api/home-buyer-tasks/tasks
 * Get all tasks for the property plan
 */
router.get('/properties/:propertyId/tasks', homeBuyerTaskController.handleGetTasks);

/**
 * GET /api/home-buyer-tasks/stats
 * Get task statistics
 */
router.get('/properties/:propertyId/stats', homeBuyerTaskController.handleGetStats);
router.get('/properties/:propertyId/import-readiness', homeBuyerTaskController.handleGetImportReadiness);
router.get('/properties/:propertyId/evidence-review', homeBuyerTaskController.handleGetEvidenceReview);
router.get('/properties/:propertyId/acceptance-status', homeBuyerTaskController.handleGetAcceptanceStatus);
router.patch('/properties/:propertyId/lifecycle', homeBuyerTaskController.handleUpdateLifecycle);
router.patch('/properties/:propertyId/documents/:documentId/verification', homeBuyerTaskController.handleVerifyDocument);
router.post('/properties/:propertyId/findings/:findingId/disposition', homeBuyerTaskController.handleDispositionFinding);
router.post('/properties/:propertyId/handoff', homeBuyerTaskController.handleHandoff);

/**
 * GET /api/home-buyer-tasks/tasks/:taskId
 * Get a single task
 */
router.get('/properties/:propertyId/tasks/:taskId', homeBuyerTaskController.handleGetTask);

/**
 * POST /api/home-buyer-tasks/tasks
 * Create a custom property-plan task
 */
router.post('/properties/:propertyId/tasks', homeBuyerTaskController.handleCreateTask);

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId
 * Update task details
 */
router.patch('/properties/:propertyId/tasks/:taskId', homeBuyerTaskController.handleUpdateTask);

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId/status
 * Update task status
 */
router.patch('/properties/:propertyId/tasks/:taskId/status', homeBuyerTaskController.handleUpdateTaskStatus);

/**
 * DELETE /api/home-buyer-tasks/tasks/:taskId
 * Delete a task
 */
router.delete('/properties/:propertyId/tasks/:taskId', homeBuyerTaskController.handleDeleteTask);

/**
 * POST /api/home-buyer-tasks/tasks/:taskId/link-booking
 * Link task to a booking
 */
router.post('/properties/:propertyId/tasks/:taskId/link-booking', homeBuyerTaskController.handleLinkToBooking);

export default router;
