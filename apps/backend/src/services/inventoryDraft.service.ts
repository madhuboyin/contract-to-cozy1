// apps/backend/src/services/inventoryDraft.service.ts
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

export class InventoryDraftService {
  async createDraftFromOcr(args: {
    propertyId: string;
    userId: string;
    sessionId: string;
    manufacturer?: string | null;
    modelNumber?: string | null;
    serialNumber?: string | null;
    upc?: string | null;
    sku?: string | null;
    confidenceJson?: any;
  }) {

    return prisma.inventoryDraftItem.create({
      data: {
        propertyId: args.propertyId,
        userId: args.userId,
        sessionId: args.sessionId,
        status: 'DRAFT',

        manufacturer: args.manufacturer || null,
        modelNumber: args.modelNumber || null,
        serialNumber: args.serialNumber || null,
        upc: args.upc || null,
        sku: args.sku || null,

        // best-effort legacy sync (optional)
        brand: args.manufacturer || null,
        model: args.modelNumber || null,
        serialNo: args.serialNumber || null,

        confidenceJson: args.confidenceJson || {},
      },
    });
  }

  async listDrafts(propertyId: string, userId: string) {
    return prisma.inventoryDraftItem.findMany({
      where: { propertyId, userId, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async dismissDraft(propertyId: string, userId: string, draftId: string) {
    const d = await prisma.inventoryDraftItem.findFirst({ where: { id: draftId, propertyId, userId } });
    if (!d) throw new APIError('Draft not found', 404, 'DRAFT_NOT_FOUND');

    return prisma.inventoryDraftItem.update({
      where: { id: draftId },
      data: { status: 'DISMISSED' },
    });
  }

  async confirmDraftToInventoryItem(propertyId: string, userId: string, draftId: string) {
    const d = await prisma.inventoryDraftItem.findFirst({ where: { id: draftId, propertyId, userId } });
    if (!d) throw new APIError('Draft not found', 404, 'DRAFT_NOT_FOUND');
    if (d.status !== 'DRAFT') throw new APIError('Draft not in DRAFT state', 409, 'DRAFT_NOT_CONFIRMABLE');

    // Create inventory item from draft
    const item = await prisma.inventoryItem.create({
      data: {
        propertyId,
        name: d.name || d.modelNumber || d.manufacturer || 'New item',
        category: d.category || 'OTHER',
        condition: d.condition || 'UNKNOWN',
        brand: d.brand || null,
        model: d.model || null,
        serialNo: d.serialNo || null,

        manufacturer: d.manufacturer || null,
        modelNumber: d.modelNumber || null,
        serialNumber: d.serialNumber || null,
        upc: d.upc || null,
        sku: d.sku || null,

        manufacturerNorm: d.manufacturer ? d.manufacturer.toLowerCase().replace(/[^a-z0-9]/g, '') : null,
        modelNumberNorm: d.modelNumber ? d.modelNumber.toLowerCase().replace(/[^a-z0-9]/g, '') : null,
      },
    });

    await prisma.inventoryDraftItem.update({
      where: { id: draftId },
      data: { status: 'CONFIRMED' },
    });

    return item;
  }
}
