// apps/backend/src/services/inventoryDraft.service.ts
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { applianceOracleService } from './applianceOracle.service';
import { logger } from '../lib/logger';
import { emitPropertyChangeWithTransaction } from '../propertyChanges/propertyChange.service';
import type { Prisma } from '@prisma/client';

// Home Intelligence FRD §8.7 (HI-DOC-005), Phase 5 remediation item (d) —
// shared so confirmDraftToInventoryItem and bulkConfirm emit an identical
// PropertyChange shape for the same lifecycle transition.
async function emitInventoryDraftConfirmedChange(
  tx: Prisma.TransactionClient,
  params: { propertyId: string; draftId: string; itemId: string },
) {
  await emitPropertyChangeWithTransaction(tx, {
    propertyId: params.propertyId,
    sourceType: 'DOCUMENT',
    sourceEntityId: params.draftId,
    sourceRevision: 'CONFIRMED',
    changeType: 'SOURCE_LIFECYCLE_CHANGED',
    changedFactKeys: ['inventory.items'],
    canonicalReferences: [{ entityType: 'INVENTORY_ITEM', entityId: params.itemId }],
    occurredAt: new Date(),
    detectedAt: new Date(),
    confidence: 1,
    sourceHealth: 'CURRENT',
    signals: {
      homeownerRelevant: true,
      lifecycleAdvanced: true,
      propertyEffectConfirmed: true,
      urgentSafetyCondition: false,
      canonicalActionPriority: null,
    },
  });
}

export class InventoryDraftService {
  async createDraftFromOcr(args: {
    propertyId: string;
    userId: string;
    // InventoryOcrSession.id (the single-label OCR scan), not
    // InventoryRoomScanSession.id — these are two distinct FK'd models on
    // InventoryDraftItem (sessionId vs. scanSessionId). This was previously
    // written into scanSessionId, a real foreign key to
    // InventoryRoomScanSession, which would reject an InventoryOcrSession id
    // as a constraint violation. Found and fixed while hardening this path
    // into the registered HI-DOC-003 promotion adapter.
    ocrSessionId: string;
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
        sessionId: args.ocrSessionId,
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

    // Build technical specs from OCR draft data
    const technicalSpecs: Record<string, string | null> = {};
    if (d.manufacturer) technicalSpecs.manufacturer = d.manufacturer;
    if (d.modelNumber) technicalSpecs.modelNumber = d.modelNumber;
    if (d.serialNumber) technicalSpecs.serialNumber = d.serialNumber;
    if (d.upc) technicalSpecs.upc = d.upc;
    if (d.sku) technicalSpecs.sku = d.sku;

    const hasTechSpecs = Object.keys(technicalSpecs).length > 0;

    // HI-DOC-003/005 promotion-adapter hardening: transactional (the item
    // create and draft-status transition previously ran as two independent
    // calls — a failure between them could leave a CONFIRMED-looking draft
    // with no item, or an orphaned item with a still-DRAFT source), with
    // durable OCR provenance (sourceOcrSessionId) and a PropertyChange
    // emission so dependent recommendations recompute.
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
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

          // Verification: OCR-confirmed items are auto-verified
          isVerified: true,
          verificationSource: 'OCR_LABEL',
          sourceOcrSessionId: d.sessionId ?? null,
          ...(hasTechSpecs ? { technicalSpecs } : {}),
        },
      });

      await tx.inventoryDraftItem.update({
        where: { id: draftId },
        data: { status: 'CONFIRMED' },
      });

      await emitInventoryDraftConfirmedChange(tx, { propertyId, draftId, itemId: created.id });

      return created;
    });

    // Fire-and-forget lifespan recalculation for OCR-verified item
    applianceOracleService.recalculateLifespan(item.id).catch((err) => {
      logger.error({ err }, '[OCR_CONFIRM] Lifespan recalculation failed (non-blocking)');
    });

    return item;
  }

  // ADD these methods to InventoryDraftService

  async listDraftsFiltered(args: {
    propertyId: string;
    userId: string;
    roomId?: string | null;
    scanSessionId?: string | null;
  }) {
    return prisma.inventoryDraftItem.findMany({
      where: {
        propertyId: args.propertyId,
        userId: args.userId,
        status: 'DRAFT',
        ...(args.roomId ? { roomId: args.roomId } : {}),
        ...(args.scanSessionId ? { scanSessionId: args.scanSessionId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async bulkDismiss(propertyId: string, userId: string, draftIds: string[]) {
    if (!draftIds.length) return { updated: 0 };

    const r = await prisma.inventoryDraftItem.updateMany({
      where: { id: { in: draftIds }, propertyId, userId, status: 'DRAFT' },
      data: { status: 'DISMISSED' },
    });

    return { updated: r.count };
  }

  async bulkConfirm(propertyId: string, userId: string, draftIds: string[]) {
    if (!draftIds.length) return { created: 0, itemIds: [] as string[] };

    // Confirm each draft into an InventoryItem (transaction keeps state consistent)
    const items = await prisma.$transaction(async (tx) => {
      const drafts = await tx.inventoryDraftItem.findMany({
        where: { id: { in: draftIds }, propertyId, userId, status: 'DRAFT' },
      });

      const created: string[] = [];

      for (const d of drafts) {
        const technicalSpecs: Record<string, string | null> = {};
        if (d.manufacturer) technicalSpecs.manufacturer = d.manufacturer;
        if (d.modelNumber) technicalSpecs.modelNumber = d.modelNumber;
        if (d.serialNumber) technicalSpecs.serialNumber = d.serialNumber;
        if (d.upc) technicalSpecs.upc = d.upc;
        if (d.sku) technicalSpecs.sku = d.sku;
        const hasTechSpecs = Object.keys(technicalSpecs).length > 0;

        const item = await tx.inventoryItem.create({
          data: {
            propertyId,
            roomId: d.roomId || null,

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

            // HI-DOC-003/005 promotion-adapter hardening: bring bulkConfirm
            // to parity with confirmDraftToInventoryItem — same
            // verification/provenance fields, same PropertyChange emission.
            isVerified: true,
            verificationSource: 'OCR_LABEL',
            sourceOcrSessionId: d.sessionId ?? null,
            ...(hasTechSpecs ? { technicalSpecs } : {}),
          },
          select: { id: true },
        });

        created.push(item.id);

        await tx.inventoryDraftItem.update({
          where: { id: d.id },
          data: { status: 'CONFIRMED' },
        });

        await emitInventoryDraftConfirmedChange(tx, { propertyId, draftId: d.id, itemId: item.id });
      }

      return created;
    });

    return { created: items.length, itemIds: items };
  }
  async updateDraft(args: {
    propertyId: string;
    userId: string;
    draftId: string;
    patch: {
      name?: string;
      category?: string;
      roomId?: string | null;

      condition?: string;
      brand?: string | null;
      model?: string | null;
      serialNo?: string | null;

      manufacturer?: string | null;
      modelNumber?: string | null;
      serialNumber?: string | null;
      upc?: string | null;
      sku?: string | null;
    };
  }) {
    const d = await prisma.inventoryDraftItem.findFirst({
      where: { id: args.draftId, propertyId: args.propertyId, userId: args.userId },
    });
    if (!d) throw new APIError('Draft not found', 404, 'DRAFT_NOT_FOUND');
    if (d.status !== 'DRAFT') throw new APIError('Draft not editable', 409, 'DRAFT_NOT_EDITABLE');

    if (args.patch.roomId) {
      const room = await prisma.inventoryRoom.findFirst({
        where: { id: args.patch.roomId, propertyId: args.propertyId },
        select: { id: true },
      });
      if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    // Track edits (optional)
    const edits = {
      at: new Date().toISOString(),
      patch: args.patch,
    };

    return prisma.inventoryDraftItem.update({
      where: { id: args.draftId },
      data: {
        ...args.patch,

        // Optional “legacy sync” for consistency with your item model conventions
        ...(args.patch.manufacturer !== undefined ? { brand: args.patch.manufacturer } : {}),
        ...(args.patch.modelNumber !== undefined ? { model: args.patch.modelNumber } : {}),
        ...(args.patch.serialNumber !== undefined ? { serialNo: args.patch.serialNumber } : {}),

        editsJson: edits as any,
      } as any,
    });
  }

}