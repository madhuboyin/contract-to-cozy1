// apps/backend/src/routes/homeBuyerTask.routes.ts
import { Router } from 'express';
import { homeBuyerTaskController } from '../controllers/homeBuyerTask.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/home-buyer-tasks/checklist
 * Get or create home buyer checklist (with 8 default tasks)
 */
router.get('/checklist', homeBuyerTaskController.handleGetChecklist);

/**
 * GET /api/home-buyer-tasks/tasks
 * Get all tasks for the user
 */
router.get('/tasks', homeBuyerTaskController.handleGetTasks);

/**
 * GET /api/home-buyer-tasks/stats
 * Get task statistics
 */
router.get('/stats', homeBuyerTaskController.handleGetStats);

/**
 * GET /api/home-buyer-tasks/tasks/:taskId
 * Get a single task
 */
router.get('/tasks/:taskId', homeBuyerTaskController.handleGetTask);

/**
 * POST /api/home-buyer-tasks/tasks
 * Create a custom task
 */
router.post('/tasks', homeBuyerTaskController.handleCreateTask);

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId
 * Update task details
 */
router.patch('/tasks/:taskId', homeBuyerTaskController.handleUpdateTask);

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId/status
 * Update task status
 */
router.patch('/tasks/:taskId/status', homeBuyerTaskController.handleUpdateTaskStatus);

/**
 * DELETE /api/home-buyer-tasks/tasks/:taskId
 * Delete a task
 */
router.delete('/tasks/:taskId', homeBuyerTaskController.handleDeleteTask);

/**
 * POST /api/home-buyer-tasks/tasks/:taskId/link-booking
 * Link task to a booking
 */
router.post('/tasks/:taskId/link-booking', homeBuyerTaskController.handleLinkToBooking);

export default router;