// apps/backend/src/controllers/inventoryDraft.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { InventoryDraftService } from '../services/inventoryDraft.service';
import { prisma } from '../lib/prisma';

const svc = new InventoryDraftService();

export async function listInventoryDrafts(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const scanSessionId =
      typeof req.query.scanSessionId === 'string' && req.query.scanSessionId.trim()
        ? req.query.scanSessionId.trim()
        : undefined;

    const roomId =
      typeof req.query.roomId === 'string' && req.query.roomId.trim()
        ? req.query.roomId.trim()
        : undefined;

    // NOTE: service always filters status='DRAFT'
    const drafts = await svc.listDraftsFiltered({
      propertyId,
      userId,
      roomId,
      scanSessionId,
    });

    // ✅ IMPORTANT: return APISuccess envelope for frontend APIClient.get()
    return res.json({
      success: true,
      data: {
        drafts: Array.isArray(drafts) ? drafts : [],
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateInventoryDraft(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const draftId = req.params.draftId;
    const userId = req.user?.userId;
    if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const body = req.body || {};

    const updated = await svc.updateDraft({
      propertyId,
      userId,
      draftId,
      patch: {
        name: typeof body.name === 'string' ? body.name : undefined,
        category: typeof body.category === 'string' ? body.category : undefined,
        roomId: typeof body.roomId === 'string' ? body.roomId : undefined,

        condition: typeof body.condition === 'string' ? body.condition : undefined,
        brand: typeof body.brand === 'string' ? body.brand : undefined,
        model: typeof body.model === 'string' ? body.model : undefined,
        serialNo: typeof body.serialNo === 'string' ? body.serialNo : undefined,

        manufacturer: typeof body.manufacturer === 'string' ? body.manufacturer : undefined,
        modelNumber: typeof body.modelNumber === 'string' ? body.modelNumber : undefined,
        serialNumber: typeof body.serialNumber === 'string' ? body.serialNumber : undefined,
        upc: typeof body.upc === 'string' ? body.upc : undefined,
        sku: typeof body.sku === 'string' ? body.sku : undefined,
      },
    });

    return res.json({ success: true, data: { draft: updated } });
  } catch (err) {
    next(err);
  }
}

export async function exportInventoryDraftsCsv(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const scanSessionId =
      typeof req.query.scanSessionId === 'string' && req.query.scanSessionId.trim()
        ? req.query.scanSessionId.trim()
        : undefined;

    const roomId =
      typeof req.query.roomId === 'string' && req.query.roomId.trim()
        ? req.query.roomId.trim()
        : undefined;

    // Optional: allow status filtering, default = ALL
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim().toUpperCase()
        : undefined;

    const where: any = {
      propertyId,
      userId,
      ...(scanSessionId ? { scanSessionId } : {}),
      ...(roomId ? { roomId } : {}),
      ...(status ? { status } : {}),
    };

    const drafts = await prisma.inventoryDraftItem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        roomId: true,
        scanSessionId: true,

        name: true,
        category: true,
        condition: true,

        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        upc: true,
        sku: true,

        confidenceJson: true,

        // Phase 2 (optional)
        autoSelected: true,
        groupKey: true,
        groupLabel: true,
        duplicateOfItemId: true,
        duplicateScore: true,
        duplicateReason: true,
      } as any,
    });

    const headers = [
      'Draft ID',
      'Status',
      'Created At',
      'Updated At',
      'Room ID',
      'Scan Session ID',
      'Name',
      'Category',
      'Condition',
      'Manufacturer',
      'Model Number',
      'Serial Number',
      'UPC',
      'SKU',
      'Name Confidence',
      'Auto Selected',
      'Group Key',
      'Group Label',
      'Duplicate Of Item ID',
      'Duplicate Score',
      'Duplicate Reason',
    ];

    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const date = (d?: Date | null) => (d ? d.toISOString() : '');

    const rows = drafts.map((d: any) => {
      const nameConf = d?.confidenceJson?.name ?? '';
      return [
        d.id,
        d.status,
        date(d.createdAt),
        date(d.updatedAt),
        d.roomId ?? '',
        d.scanSessionId ?? '',
        d.name ?? '',
        d.category ?? '',
        d.condition ?? '',
        d.manufacturer ?? '',
        d.modelNumber ?? '',
        d.serialNumber ?? '',
        d.upc ?? '',
        d.sku ?? '',
        nameConf,
        typeof d.autoSelected === 'boolean' ? String(d.autoSelected) : '',
        d.groupKey ?? '',
        d.groupLabel ?? '',
        d.duplicateOfItemId ?? '',
        d.duplicateScore ?? '',
        d.duplicateReason ?? '',
      ]
        .map(escape)
        .join(',');
    });

    const csv = [headers.map(escape).join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inventory-drafts-${propertyId}-${scanSessionId || roomId || 'all'}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`
    );

    return res.send(csv);
  } catch (err) {
    next(err);
  }
}
