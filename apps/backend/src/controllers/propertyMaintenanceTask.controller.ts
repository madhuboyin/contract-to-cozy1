// apps/backend/src/controllers/propertyMaintenanceTask.controller.ts
import { Response, NextFunction } from 'express';
import { PropertyMaintenanceTaskService } from '../services/PropertyMaintenanceTask.service';
import { AuthRequest } from '../types/auth.types';
import {
  CreateMaintenanceTaskRequest,
  CreateActionCenterTaskRequest,
  UpdateMaintenanceTaskRequest,
  UpdateMaintenanceTaskStatusRequest,
  TaskFilterOptions,
  LinkTaskToBookingRequest,
  CreateFromTemplatesRequest,
} from '../types/task.types';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from '../services/coverageAnalysis.service';
import { markDoNothingRunsStale } from '../services/doNothingSimulator.service';

/**
 * GET /api/maintenance-tasks/property/:propertyId
 * Gets all maintenance tasks for a property
 */
const handleGetPropertyTasks = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { propertyId } = req.params;
    const filters: TaskFilterOptions = {
      status: req.query.status ? (req.query.status as string).split(',') as any[] : undefined,
      priority: req.query.priority ? (req.query.priority as string).split(',') as any[] : undefined,
      source: req.query.source ? (req.query.source as string).split(',') as any[] : undefined,
      includeCompleted: req.query.includeCompleted === 'true',
    };

    const tasks = await PropertyMaintenanceTaskService.getTasksForProperty(
      req.user.userId,
      propertyId,
      filters
    );

    return res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * GET /api/maintenance-tasks/:taskId
 * Gets a single task by ID
 */
const handleGetTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const task = await PropertyMaintenanceTaskService.getTask(req.user.userId, taskId);

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/maintenance-tasks/property/:propertyId
 * Creates a user-defined maintenance task
 */
const handleCreateTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { propertyId } = req.params;
    const data: CreateMaintenanceTaskRequest = req.body;

    if (!data.title) {
      return res.status(400).json({
        success: false,
        message: 'title is required.',
      });
    }

    const task = await PropertyMaintenanceTaskService.createUserTask(
      req.user.userId,
      propertyId,
      data
    );
    await markCoverageAnalysisStale(task.propertyId);
    await markItemCoverageAnalysesStale(task.propertyId);
    await markDoNothingRunsStale(task.propertyId);

    return res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not available')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/maintenance-tasks/from-action-center
 * Creates a task from Action Center (idempotent)
 */
const handleCreateFromActionCenter = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const data: CreateActionCenterTaskRequest & { propertyId: string } = req.body;

    if (!data.propertyId || !data.title || !data.assetType || !data.priority || !data.nextDueDate) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, title, assetType, priority, and nextDueDate are required.',
      });
    }

    const result = await PropertyMaintenanceTaskService.createFromActionCenter(
      req.user.userId,
      data.propertyId,
      data
    );
    await markCoverageAnalysisStale(result.task.propertyId);
    await markItemCoverageAnalysesStale(result.task.propertyId);
    await markDoNothingRunsStale(result.task.propertyId);

    return res.status(result.deduped ? 200 : 201).json({
      success: true,
      data: {
        task: result.task,
        deduped: result.deduped,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not available')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/maintenance-tasks/from-seasonal/:seasonalItemId
 * Creates a task from a seasonal checklist item
 */
const handleCreateFromSeasonal = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { seasonalItemId } = req.params;
    const { propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'propertyId is required.',
      });
    }

    const task = await PropertyMaintenanceTaskService.createFromSeasonalItem(
      req.user.userId,
      propertyId,
      seasonalItemId
    );
    await markCoverageAnalysisStale(task.propertyId);
    await markItemCoverageAnalysesStale(task.propertyId);
    await markDoNothingRunsStale(task.propertyId);

    return res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('already created')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/maintenance-tasks/from-templates
 * Creates tasks from templates
 */
const handleCreateFromTemplates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const data: CreateFromTemplatesRequest & { propertyId: string } = req.body;

    if (!data.propertyId || !data.templateIds || !Array.isArray(data.templateIds)) {
      return res.status(400).json({
        success: false,
        message: 'propertyId and templateIds (array) are required.',
      });
    }

    const result = await PropertyMaintenanceTaskService.createFromTemplates(
      req.user.userId,
      data.propertyId,
      data.templateIds
    );
    await markCoverageAnalysisStale(data.propertyId);
    await markItemCoverageAnalysesStale(data.propertyId);
    await markDoNothingRunsStale(data.propertyId);

    return res.status(201).json({
      success: true,
      message: `Created ${result.count} tasks from templates.`,
      data: result.tasks,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/maintenance-tasks/:taskId
 * Updates task details
 */
const handleUpdateTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const data: UpdateMaintenanceTaskRequest = req.body;

    const task = await PropertyMaintenanceTaskService.updateTask(
      req.user.userId,
      taskId,
      data
    );
    await markCoverageAnalysisStale(task.propertyId);
    await markItemCoverageAnalysesStale(task.propertyId);
    await markDoNothingRunsStale(task.propertyId);

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('not available')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/maintenance-tasks/:taskId/status
 * Updates task status
 */
const handleUpdateTaskStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const { status, actualCost }: UpdateMaintenanceTaskStatusRequest = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required.',
      });
    }

    const task = await PropertyMaintenanceTaskService.updateTaskStatus(
      req.user.userId,
      taskId,
      status,
      actualCost
    );
    await markCoverageAnalysisStale(task.propertyId);
    await markItemCoverageAnalysesStale(task.propertyId);
    await markDoNothingRunsStale(task.propertyId);

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * DELETE /api/maintenance-tasks/:taskId
 * Deletes a task
 */
const handleDeleteTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const existingTask = await PropertyMaintenanceTaskService.getTask(req.user.userId, taskId);
    await PropertyMaintenanceTaskService.deleteTask(req.user.userId, taskId);
    await markCoverageAnalysisStale(existingTask.propertyId);
    await markItemCoverageAnalysesStale(existingTask.propertyId);
    await markDoNothingRunsStale(existingTask.propertyId);

    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('cannot be deleted')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/maintenance-tasks/:taskId/link-booking
 * Links a task to a booking
 */
const handleLinkToBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const { bookingId }: LinkTaskToBookingRequest = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'bookingId is required.',
      });
    }

    const task = await PropertyMaintenanceTaskService.linkToBooking(
      req.user.userId,
      taskId,
      bookingId
    );
    await markCoverageAnalysisStale(task.propertyId);
    await markItemCoverageAnalysesStale(task.propertyId);
    await markDoNothingRunsStale(task.propertyId);

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * GET /api/maintenance-tasks/property/:propertyId/stats
 * Gets task statistics for a property
 */
const handleGetPropertyStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { propertyId } = req.params;
    const stats = await PropertyMaintenanceTaskService.getPropertyStats(
      req.user.userId,
      propertyId
    );

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('does not have access')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

export const propertyMaintenanceTaskController = {
  handleGetPropertyTasks,
  handleGetTask,
  handleCreateTask,
  handleCreateFromActionCenter,
  handleCreateFromSeasonal,
  handleCreateFromTemplates,
  handleUpdateTask,
  handleUpdateTaskStatus,
  handleDeleteTask,
  handleLinkToBooking,
  handleGetPropertyStats,
};
