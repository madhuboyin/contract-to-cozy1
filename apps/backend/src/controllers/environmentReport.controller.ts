// apps/backend/src/controllers/environmentReport.controller.ts

import { Response } from 'express';
import { CustomRequest } from '../types/express-extension.types';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getEnvironmentReport } from '../services/environmentReport.service';

class EnvironmentReportController {
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
        select: { id: true, zipCode: true, latitude: true, longitude: true, geocodedZipCode: true },
      });

      if (!property) {
        return res.status(404).json({ success: false, message: 'Property not found' });
      }

      const report = await getEnvironmentReport(property);
      return res.json({ success: true, data: report });
    } catch (error: any) {
      logger.error({ err: error }, '[ENV_REPORT] /report/:propertyId error');
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch environment report' });
    }
  }
}

export default new EnvironmentReportController();
