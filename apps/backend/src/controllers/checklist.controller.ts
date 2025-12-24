// apps/backend/src/controllers/checklist.controller.ts
import { Response, NextFunction } from 'express';
import { ChecklistService } from '../services/checklist.service';
import { AuthRequest } from '../types/auth.types';
import { ChecklistItemStatus } from '@prisma/client';

/**
 * Gets the user's checklist.
 * If a checklist doesn't exist, one will be created.
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
    const userId = req.user.userId;

    const checklist = await ChecklistService.getOrCreateChecklist(userId);
    return res.status(200).json(checklist);
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the status of a single checklist item.
 */
const handleUpdateChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;

    const { itemId } = req.params;
    const { status } = req.body;

    // Basic validation
    if (!status || !Object.values(ChecklistItemStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing status.',
      });
    }

    const updatedItem = await ChecklistService.updateChecklistItemStatus(
      userId,
      itemId,
      status
    );

    return res.status(200).json({
      success: true,
      data: updatedItem,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Updates configuration of a single checklist item (PATCH).
 */
const handlePatchChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;

    const { itemId } = req.params;
    const updateData = req.body;

    const updatedItem = await ChecklistService.updateChecklistItemConfig(
      userId,
      itemId,
      updateData
    );

    return res.status(200).json({
      success: true,
      data: updatedItem,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Deletes a single checklist item.
 */
const handleDeleteChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;

    const { itemId } = req.params;

    await ChecklistService.deleteChecklistItem(userId, itemId);

    return res.status(204).send();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Creates new maintenance checklist items from a list of template IDs.
 */
const handleCreateMaintenanceItems = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;
    const { templateIds, propertyId } = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input: templateIds must be a non-empty array.',
      });
    }

    const result = await ChecklistService.addMaintenanceItemsToChecklist(
      userId,
      templateIds,
      propertyId
    );

    return res.status(201).json({
      success: true,
      message: `Added ${result.count} items.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a single checklist item directly (used by orchestration/action center).
 * Idempotent: if an item already exists for (propertyId, orchestrationActionId),
 * returns the existing item instead of creating a duplicate.
 *
 * Response behavior:
 * - 201 Created when a new item is created
 * - 200 OK when an existing item is returned (deduped=true)
 */
const handleCreateChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const userId = req.user.userId;

    const {
      title,
      description,
      serviceCategory,
      propertyId,
      isRecurring,
      frequency,
      nextDueDate,
      orchestrationActionId,
    } = req.body ?? {};

    // ✅ Required fields for Action Center idempotency contract
    if (!title || !propertyId || !orchestrationActionId) {
      return res.status(400).json({
        success: false,
        message:
          'Missing required fields: title, propertyId, and orchestrationActionId are required.',
      });
    }

    // Light validation to prevent silent bad writes
    if (typeof title !== 'string' || typeof propertyId !== 'string' || typeof orchestrationActionId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid input: title, propertyId, and orchestrationActionId must be strings.',
      });
    }

    // nextDueDate is required in your current service signature — keep strict to avoid null date bugs
    if (!nextDueDate || typeof nextDueDate !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: nextDueDate must be an ISO date string.',
      });
    }

    const result = await ChecklistService.createDirectChecklistItem(userId, {
      title,
      description: description ?? null,
      serviceCategory: serviceCategory ?? null,
      propertyId,
      isRecurring: Boolean(isRecurring),
      frequency: frequency ?? null,
      nextDueDate,
      orchestrationActionId,
    });

    // If service returns { item, deduped }, honor status code accordingly.
    // If your service currently returns just ChecklistItem, this still works safely by normalizing.
    const deduped = (result as any)?.deduped === true;
    const item = (result as any)?.item ?? result;

    return res.status(deduped ? 200 : 201).json({
      success: true,
      data: deduped ? { item, deduped: true } : { item, deduped: false },
    });
  } catch (error) {
    next(error);
  }
};

export const checklistController = {
  handleGetChecklist,
  handleUpdateChecklistItem,
  handlePatchChecklistItem,
  handleCreateMaintenanceItems,
  handleDeleteChecklistItem,
  handleCreateChecklistItem,
};
