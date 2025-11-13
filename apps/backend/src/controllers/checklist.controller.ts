import { Response, NextFunction } from 'express';
import { checklistService } from '../services/checklist.service';
import { AuthRequest } from '../types/auth.types'; // Correct import
import { ChecklistItemStatus } from '@prisma/client';

/**
 * Gets the user's checklist.
 * If the user is a HOME_BUYER and a checklist doesn't exist, one will be created.
 */
const handleGetChecklist = async (
  req: AuthRequest, // Use AuthRequest
  res: Response,
  next: NextFunction
) => {
  try {
    // --- FIX ---
    // 1. Check if user exists on req
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    // 2. Use req.user.userId (not req.user.id)
    const userId = req.user.userId;
    // --- END FIX ---

    const checklist = await checklistService.findOrCreateChecklistForUser(userId);
    res.status(200).json(checklist);
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the status of a single checklist item.
 */
const handleUpdateChecklistItem = async (
  req: AuthRequest, // Use AuthRequest
  res: Response,
  next: NextFunction
) => {
  try {
    // --- FIX ---
    // 1. Check if user exists on req
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    // 2. Use req.user.userId (not req.user.id)
    const userId = req.user.userId;
    // --- END FIX ---

    const { itemId } = req.params;
    const { status } = req.body;

    // Basic validation
    if (!status || !Object.values(ChecklistItemStatus).includes(status)) {
      return res.status(400).json({ message: 'Invalid or missing status.' });
    }

    const updatedItem = await checklistService.updateChecklistItemStatus(
      userId,
      itemId,
      status
    );

    res.status(200).json(updatedItem);
  } catch (error) {
    // Handle specific error from the service
    if (error instanceof Error && error.message.includes('access denied')) {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};

export const checklistController = {
  handleGetChecklist,
  handleUpdateChecklistItem,
};