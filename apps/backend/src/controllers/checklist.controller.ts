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
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or missing status.' 
      });
    }

    const updatedItem = await ChecklistService.updateChecklistItemStatus(
      userId,
      itemId,
      status
    );

    // FIX: Wrap response in standard APIResponse format
    res.status(200).json({
      success: true,
      data: updatedItem
    });
  } catch (error) {
    // Handle specific error from the service
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({ 
        success: false,
        message: error.message 
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

    // FIX: Wrap response in standard APIResponse format
    res.status(200).json({
      success: true,
      data: updatedItem
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({ 
        success: false,
        message: error.message 
      });
    }
    next(error);
  }
};

// --- NEW FUNCTION for DELETE (ADDED) ---
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

    // Send a 204 No Content response for successful deletion
    res.status(204).send();
  } catch (error) {
    // Handle specific error from the service (e.g., item not found or unauthorized access)
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};
// --- END NEW FUNCTION ---

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
    const { templateIds, propertyId } = req.body; // FIX: Extract propertyId from request

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({
        message: 'Invalid input: templateIds must be a non-empty array.',
      });
    }

    const result = await ChecklistService.addMaintenanceItemsToChecklist(
      userId,
      templateIds,
      propertyId // FIX: Pass propertyId to service
    );

    res
      .status(201)
      .json({ success: true, message: `Added ${result.count} items.` });
  } catch (error) {
    next(error);
  }
};
// --- END NEW FUNCTION ---

/**
 * Creates a single checklist item directly (used by orchestration/action center).
 * Does not use templates - creates item from provided data.
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
    const itemData = req.body;

    // Validate required fields
    if (!itemData.title || !itemData.propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title and propertyId are required.',
      });
    }

    const newItem = await ChecklistService.createDirectChecklistItem(
      userId,
      itemData
    );

    res.status(201).json({
      success: true,
      data: newItem,
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
  handleCreateChecklistItem, // ADD THIS LINE
};