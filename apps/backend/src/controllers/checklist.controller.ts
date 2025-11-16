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
    res.status(200).json(checklist);
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
      return res.status(400).json({ message: 'Invalid or missing status.' });
    }

    const updatedItem = await ChecklistService.updateChecklistItemStatus(
      userId,
      itemId,
      status
    );

    res.status(200).json(updatedItem);
  } catch (error) {
    // Handle specific error from the service
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};

// --- NEW FUNCTION for Phase 3 ---
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
    const { templateIds } = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({
        message: 'Invalid input: templateIds must be a non-empty array.',
      });
    }

    const result = await ChecklistService.addMaintenanceItemsToChecklist(
      userId,
      templateIds
    );

    res
      .status(201)
      .json({ success: true, message: `Added ${result.count} items.` });
  } catch (error) {
    next(error);
  }
};
// --- END NEW FUNCTION ---

export const checklistController = {
  handleGetChecklist,
  handleUpdateChecklistItem,
  // --- Add new handler ---
  handleCreateMaintenanceItems,
};