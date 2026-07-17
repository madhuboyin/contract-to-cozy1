// apps/backend/src/controllers/maintenance.controller.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { MaintenanceService } from '../services/maintenance.service';
import { PropertyMaintenanceTaskService } from '../services/PropertyMaintenanceTask.service';
import { MaintenanceTaskConfig } from '../types/maintenance.types';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

/**
 * Gets the list of available maintenance task templates.
 */
const handleGetMaintenanceTemplates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
    const templates = await MaintenanceService.getMaintenanceTemplates(req.user.userId, propertyId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user.userId,
      moduleKey: AnalyticsModule.MAINTENANCE,
      featureKey: AnalyticsFeature.MAINTENANCE_TASK,
      metadataJson: { templateCount: templates.length },
    });

    res.status(200).json({
      success: true,
      data: {
        templates,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates new custom maintenance tasks for the authenticated user.
 */
const handleCreateCustomMaintenanceItems = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { tasks } = req.body as { tasks: MaintenanceTaskConfig[] };
    const { userId } = req.user;

    const missingPropertyId = tasks.some(t => !t.propertyId);
    if (missingPropertyId) {
      return res.status(400).json({ success: false, message: 'Each task must include a propertyId.' });
    }

    await Promise.all(
      tasks.map(task =>
        PropertyMaintenanceTaskService.createUserTask(userId, task.propertyId as string, {
          title: task.title,
          description: task.description ?? undefined,
          serviceCategory: task.serviceCategory ?? undefined,
          isRecurring: task.isRecurring,
          frequency: task.frequency ?? undefined,
          nextDueDate: task.nextDueDate ? (task.nextDueDate as unknown as Date).toISOString() : undefined,
          templateId: task.templateId,
        })
      )
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      moduleKey: AnalyticsModule.MAINTENANCE,
      featureKey: AnalyticsFeature.MAINTENANCE_TASK,
      metadataJson: { actionType: 'create_custom_tasks', taskCount: tasks.length },
    });

    res.status(201).json({
      success: true,
      message: `${tasks.length} custom maintenance tasks created.`,
      data: { count: tasks.length },
    });
  } catch (error) {
    next(error);
  }
};

export const maintenanceController = {
  handleGetMaintenanceTemplates,
  handleCreateCustomMaintenanceItems, // <-- Make sure this line is saved
};
