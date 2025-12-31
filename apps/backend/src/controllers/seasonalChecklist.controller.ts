// apps/backend/src/controllers/seasonalChecklist.controller.ts
import { Request, Response, NextFunction } from 'express';
import { SeasonalChecklistService } from '../services/seasonalChecklist.service';
import { ClimateZoneService } from '../services/climateZone.service';
import { Season } from '@prisma/client';
import { prisma } from '../config/database';
// PHASE 2.5 INTEGRATION
import { 
  addSeasonalTaskToMaintenance, 
  removeSeasonalTaskFromMaintenance 
} from '../services/seasonalChecklistIntegration.service';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export class SeasonalChecklistController {
  /**
   * GET /api/properties/:propertyId/seasonal-checklists
   */
  static async getPropertyChecklists(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { propertyId } = req.params;
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { homeownerProfile: true },
      });
      
      if (property?.homeownerProfile?.segment !== 'EXISTING_OWNER') {
        res.status(403).json({
          success: false,
          message: 'Seasonal maintenance is only available for existing homeowners',
        });
        return;
      }
      const { year, season, status } = req.query;

      const filters: any = {};
      if (year) filters.year = parseInt(year as string);
      if (season) filters.season = season as Season;
      if (status) filters.status = status as string;

      const checklists = await SeasonalChecklistService.getPropertySeasonalChecklists(
        propertyId,
        filters
      );

      res.json({
        success: true,
        data: {
          checklists,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/seasonal-checklists/:checklistId
   */
  static async getChecklistDetails(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { checklistId } = req.params;

      const result = await SeasonalChecklistService.getSeasonalChecklist(checklistId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Seasonal checklist not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * POST /api/seasonal-checklists/:checklistId/generate
   */
  static async generateChecklist(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { propertyId } = req.body;
      const { season, year } = req.body;

      if (!propertyId || !season || !year) {
        res.status(400).json({
          success: false,
          message: 'propertyId, season, and year are required',
        });
        return;
      }

      const checklist = await SeasonalChecklistService.generateSeasonalChecklist(
        propertyId,
        season as Season,
        parseInt(year)
      );

      res.status(201).json({
        success: true,
        data: checklist,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/seasonal-checklists/:checklistId/dismiss
   */
  static async dismissChecklist(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { checklistId } = req.params;

      const result = await SeasonalChecklistService.dismissChecklist(checklistId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/seasonal-checklist-items/:itemId/add-to-tasks
   * @deprecated Use addToMaintenance for EXISTING_OWNER
   */
  static async addTaskToChecklist(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { itemId } = req.params;
      const { nextDueDate, isRecurring, frequency, notes } = req.body;

      const options: any = {};
      if (nextDueDate) options.nextDueDate = new Date(nextDueDate);
      if (isRecurring !== undefined) options.isRecurring = isRecurring;
      if (frequency) options.frequency = frequency;
      if (notes) options.notes = notes;

      const checklistItem = await SeasonalChecklistService.addTaskToChecklist(itemId, options);

      res.status(201).json({
        success: true,
        data: {
          checklistItem,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * PHASE 2.5: POST /api/seasonal-checklist-items/:itemId/add-to-maintenance
   * Add seasonal task to PropertyMaintenanceTask
   */
  static async addToMaintenance(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          message: 'Authentication required' 
        });
        return;
      }

      const { itemId } = req.params;
      const userId = req.user.userId;

      const result = await addSeasonalTaskToMaintenance(userId, itemId);

      res.status(result.success ? 201 : 200).json({
        success: result.success,
        message: result.message,
        data: result.task,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
          return;
        }
        if (error.message.includes('only available')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
          return;
        }
        if (error.message.includes('does not have access')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }

  /**
   * PHASE 2.5: DELETE /api/seasonal-checklist-items/:itemId/remove-from-maintenance
   * Remove link between seasonal item and maintenance task
   */
  static async removeFromMaintenance(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          message: 'Authentication required' 
        });
        return;
      }

      const { itemId } = req.params;
      const userId = req.user.userId;

      const result = await removeSeasonalTaskFromMaintenance(userId, itemId);

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({
            success: false,
            message: error.message,
          });
          return;
        }
        if (error.message.includes('does not have access')) {
          res.status(403).json({
            success: false,
            message: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }

  /**
   * POST /api/seasonal-checklist-items/:itemId/dismiss
   */
  static async dismissTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { itemId } = req.params;

      const result = await SeasonalChecklistService.dismissTask(itemId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/seasonal-checklist-items/:itemId/snooze
   */
  static async snoozeTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { itemId } = req.params;
      const { days } = req.body;

      const result = await SeasonalChecklistService.snoozeTask(
        itemId,
        days ? parseInt(days) : 7
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/seasonal-checklists/:checklistId/add-all-critical
   */
  static async addAllCriticalTasks(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { checklistId } = req.params;

      const result = await SeasonalChecklistService.addAllCriticalTasks(checklistId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/properties/:propertyId/climate
   */
  static async getClimateInfo(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { propertyId } = req.params;

      const climateInfo = await ClimateZoneService.getClimateInfo(propertyId);

      res.json({
        success: true,
        data: climateInfo,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Property not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else {
        next(error);
      }
    }
  }

  /**
   * PUT /api/properties/:propertyId/climate
   */
  static async updateClimateSettings(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { propertyId } = req.params;
      const { climateRegion, notificationTiming, notificationEnabled, autoGenerateChecklists, excludedTaskKeys } = req.body;

      const updates: any = {};
      if (climateRegion) updates.climateRegion = climateRegion;
      if (notificationTiming) updates.notificationTiming = notificationTiming;
      if (notificationEnabled !== undefined) updates.notificationEnabled = notificationEnabled;
      if (autoGenerateChecklists !== undefined) updates.autoGenerateChecklists = autoGenerateChecklists;
      if (excludedTaskKeys) updates.excludedTaskKeys = excludedTaskKeys;

      const settings = await ClimateZoneService.updateClimateSettings(propertyId, updates);

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default SeasonalChecklistController;