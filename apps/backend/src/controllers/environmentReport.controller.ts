// apps/backend/src/controllers/environmentReport.controller.ts

import { Response } from 'express';
import { CustomRequest } from '../types/express-extension.types';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getEnvironmentReport, recordHvacFilterMaintenance } from '../services/environmentReport.service';
import { getPropertyContext } from '../modules/propertyContext';

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

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          latitude: true,
          longitude: true,
          geocodedZipCode: true,
          hasDrainageIssues: true,
          hasSumpPump: true,
          hasSumpPumpBackup: true,
          isResilienceVerified: true,
          coolingType: true,
          heatingType: true,
          hvacInstallYear: true,
          roofType: true,
          roofReplacementYear: true,
          foundationType: true,
          hasIrrigation: true,
          hasSecondaryHeat: true,
        },
      });

      if (!property) {
        return res.status(404).json({ success: false, message: 'Property not found' });
      }

      const context = await getPropertyContext(
        propertyId,
        { userId: req.user!.userId },
        { scopes: ['LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'MAINTENANCE'] },
      );
      const report = await getEnvironmentReport(property, context);
      return res.json({ success: true, data: report });
    } catch (error: any) {
      logger.error({ err: error }, '[ENV_REPORT] /report/:propertyId error');
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch environment report' });
    }
  }
}

export default new EnvironmentReportController();
