// apps/backend/src/services/maintenance.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class MaintenanceService {
  /**
   * Get all active maintenance task templates.
   * (These are assumed to be for EXISTING_OWNERs only)
   *
   * @returns A list of maintenance task templates.
   */
  static async getMaintenanceTemplates() {
    const templates = await prisma.maintenanceTaskTemplate.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return templates;
  }
}