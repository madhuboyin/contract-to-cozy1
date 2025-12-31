// apps/backend/src/controllers/homeBuyerTask.controller.ts
import { Response, NextFunction } from 'express';
import { HomeBuyerTaskService } from '../services/HomeBuyerTask.service';
import { AuthRequest } from '../types/auth.types';
import {
  CreateHomeBuyerTaskRequest,
  UpdateHomeBuyerTaskRequest,
  UpdateHomeBuyerTaskStatusRequest,
  LinkTaskToBookingRequest,
} from '../types/task.types';

/**
 * GET /api/home-buyer-tasks/checklist
 * Gets the user's home buyer checklist (creates with 8 default tasks if doesn't exist)
 */
const handleGetChecklist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(req.user.userId);

    return res.status(200).json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('only available for')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * GET /api/home-buyer-tasks/tasks
 * Gets all tasks for the user
 */
const handleGetTasks = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const tasks = await HomeBuyerTaskService.getTasks(req.user.userId);

    return res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home-buyer-tasks/tasks/:taskId
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
    const task = await HomeBuyerTaskService.getTask(req.user.userId, taskId);

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
    next(error);
  }
};

/**
 * POST /api/home-buyer-tasks/tasks
 * Creates a custom task
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

    const data: CreateHomeBuyerTaskRequest = req.body;

    if (!data.title) {
      return res.status(400).json({
        success: false,
        message: 'title is required.',
      });
    }

    const task = await HomeBuyerTaskService.createTask(req.user.userId, data);

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
    next(error);
  }
};

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId
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
    const data: UpdateHomeBuyerTaskRequest = req.body;

    const task = await HomeBuyerTaskService.updateTask(
      req.user.userId,
      taskId,
      data
    );

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
    next(error);
  }
};

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId/status
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
    const { status }: UpdateHomeBuyerTaskStatusRequest = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required.',
      });
    }

    const task = await HomeBuyerTaskService.updateTaskStatus(
      req.user.userId,
      taskId,
      status
    );

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
    next(error);
  }
};

/**
 * DELETE /api/home-buyer-tasks/tasks/:taskId
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
    await HomeBuyerTaskService.deleteTask(req.user.userId, taskId);

    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/home-buyer-tasks/tasks/:taskId/link-booking
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

    const task = await HomeBuyerTaskService.linkToBooking(
      req.user.userId,
      taskId,
      bookingId
    );

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
    next(error);
  }
};

/**
 * GET /api/home-buyer-tasks/stats
 * Gets task statistics
 */
const handleGetStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const stats = await HomeBuyerTaskService.getTaskStats(req.user.userId);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

export const homeBuyerTaskController = {
  handleGetChecklist,
  handleGetTasks,
  handleGetTask,
  handleCreateTask,
  handleUpdateTask,
  handleUpdateTaskStatus,
  handleDeleteTask,
  handleLinkToBooking,
  handleGetStats,
};