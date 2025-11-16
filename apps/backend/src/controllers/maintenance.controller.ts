// apps/backend/src/controllers/maintenance.controller.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth.types';
import { MaintenanceService } from '../services/maintenance.service';

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

export const maintenanceController = {
  handleGetMaintenanceTemplates,
};