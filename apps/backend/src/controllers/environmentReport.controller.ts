// apps/backend/src/controllers/environmentReport.controller.ts

import { Response } from 'express';
import { CustomRequest } from '../types/express-extension.types';
import { logger } from '../lib/logger';
import {
  getEnvironmentReportForProperty,
  recordHvacFilterMaintenance,
} from '../services/environmentReport.service';
import { getPropertyContext } from '../modules/propertyContext';
import {
  getWeatherPreparation,
  getWeatherPreparationByInsight,
  startWeatherPreparation,
  updateWeatherPreparationItem,
  type WeatherPreparationItemStatus,
} from '../services/environment/weatherPreparation.service';

class EnvironmentReportController {
  async recordMaintenanceContext(req: CustomRequest, res: Response) {
    try {
      const propertyId = req.property!.id;
      const { field, completedDate } = req.body ?? {};
      if (field !== 'hvacFilterLastCompletedDate' || typeof completedDate !== 'string') {
        return res.status(400).json({ success: false, message: 'A supported maintenance field and completion date are required.' });
      }
      const context = await getPropertyContext(
        propertyId,
        { userId: req.user!.userId },
        { scopes: ['SYSTEMS', 'RESPONSIBILITY'] },
      );
      const task = await recordHvacFilterMaintenance(propertyId, completedDate, context);
      return res.json({ success: true, data: { taskId: task.id, completedDate: task.lastCompletedDate } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to record maintenance context' });
    }
  }

  /**
   * GET /api/environment/report/:propertyId
   * propertyAuthMiddleware only attaches { id } to req.property, so this
   * re-fetches the columns the report needs (lat/lon/zip/geocodedZipCode).
   */
  async getReport(req: CustomRequest, res: Response) {
    try {
      const propertyId = req.property!.id;
      const report = await getEnvironmentReportForProperty(propertyId, req.user!.userId);
      if (!report) return res.status(404).json({ success: false, message: 'Property not found' });
      return res.json({ success: true, data: report });
    } catch (error: any) {
      logger.error({ err: error }, '[ENV_REPORT] /report/:propertyId error');
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch environment report' });
    }
  }

  async startPreparation(req: CustomRequest, res: Response) {
    try {
      const propertyId = req.property!.id;
      const insightId = typeof req.body?.insightId === 'string' ? req.body.insightId : '';
      if (!insightId) return res.status(400).json({ success: false, message: 'Insight ID is required.' });
      const existing = await getWeatherPreparationByInsight(propertyId, insightId);
      if (existing) return res.json({ success: true, data: existing });
      const report = await getEnvironmentReportForProperty(propertyId, req.user!.userId);
      if (!report) return res.status(404).json({ success: false, message: 'Property not found' });
      const insight = report.insights.find(candidate => candidate.id === insightId);
      if (!insight) {
        return res.status(409).json({
          success: false,
          message: 'This weather insight is no longer active. Return to the Environment Report for the latest outlook.',
        });
      }
      const plan = await startWeatherPreparation(propertyId, req.user!.userId, insight);
      return res.json({ success: true, data: plan });
    } catch (error: any) {
      logger.error({ err: error }, '[ENV_REPORT] start preparation error');
      return res.status(500).json({ success: false, message: error.message || 'Failed to start weather preparation' });
    }
  }

  async getPreparation(req: CustomRequest, res: Response) {
    const plan = await getWeatherPreparation(req.property!.id, req.params.preparationId);
    if (!plan) return res.status(404).json({ success: false, message: 'Weather preparation not found' });
    return res.json({ success: true, data: plan });
  }

  async updatePreparationItem(req: CustomRequest, res: Response) {
    const allowed: WeatherPreparationItemStatus[] = ['CREATED', 'COMPLETED', 'CANCELED'];
    const status = req.body?.status as WeatherPreparationItemStatus;
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'A valid checklist status is required.' });
    }
    const plan = await updateWeatherPreparationItem(
      req.property!.id,
      req.params.preparationId,
      req.params.itemId,
      status,
    );
    if (!plan) return res.status(404).json({ success: false, message: 'Weather preparation item not found' });
    return res.json({ success: true, data: plan });
  }
}

export default new EnvironmentReportController();
