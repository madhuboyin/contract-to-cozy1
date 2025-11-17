// apps/backend/src/controllers/maintenance.controller.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { MaintenanceService } from '../services/maintenance.service';
import { ChecklistService } from '../services/checklist.service'; // --- ADDED ---
import { MaintenanceTaskConfig } from '../types/maintenance.types'; // --- ADDED ---

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

    const templates = await MaintenanceService.getMaintenanceTemplates();
    
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

// --- NEW CONTROLLER FUNCTION FOR PHASE 1 ---
/**
 * Creates new custom maintenance items for the authenticated user.
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

    // Body is already validated by the 'validate' middleware
    const { tasks } = req.body as { tasks: MaintenanceTaskConfig[] };
    const { userId } = req.user;

    const result = await ChecklistService.createCustomMaintenanceItems(userId, tasks);

    res.status(201).json({
      success: true,
      message: `${result.count} custom maintenance tasks created.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
// --- END NEW FUNCTION ---

export const maintenanceController = {
  handleGetMaintenanceTemplates,
  handleCreateCustomMaintenanceItems, // <-- Make sure this line is saved
};