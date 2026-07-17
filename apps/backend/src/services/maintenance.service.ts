// apps/backend/src/services/maintenance.service.ts

import { prisma } from '../lib/prisma';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateMaintenanceTemplateApplicability } from './maintenance/applicabilityPolicy';


export class MaintenanceService {
  /**
   * Get all active maintenance task templates.
   * (These are assumed to be for EXISTING_OWNERs only)
   *
   * @returns A list of maintenance task templates.
   */
  static async getMaintenanceTemplates(userId?: string, propertyId?: string) {
    const templates = await prisma.maintenanceTaskTemplate.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    if (!userId || !propertyId) return templates;
    const context = await getPropertyContext(propertyId, { userId }, {
      scopes: ['EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'MAINTENANCE'],
    });
    return templates.map((template) => ({
      ...template,
      applicability: evaluateMaintenanceTemplateApplicability(context, template),
    }));
  }
}
