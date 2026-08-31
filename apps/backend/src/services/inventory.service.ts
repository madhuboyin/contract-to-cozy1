// apps/backend/src/services/inventory.service.ts
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { InventoryItemCategory, type Prisma } from '@prisma/client';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import crypto from 'crypto';
import { HomeEventsAutoGen } from './homeEvents/homeEvents.autogen';
import { NextFunction } from 'express';
import { applianceOracleService } from './applianceOracle.service';
import { generateForecast } from './maintenancePrediction.service';
import {
  formatMajorApplianceType,
  inferMajorApplianceType,
  PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX,
} from './majorAppliance.util';
import { assertSafeUrl } from '../utils/ssrfGuard';
import { logger } from '../lib/logger';
import { visibleInventoryItemWhere } from './riskAssetApplicability';
import { buildInventoryCoveragePresentation } from './inventoryCoverageState.service';
import JobQueueService from './JobQueue.service';
import { markThreadStaleOnFactCorrection } from './decisionPlatform/decisionThreadService';
import { emitPropertyChangeWithTransaction } from '../propertyChanges/propertyChange.service';
import { isWaterHeaterInventoryName } from './repairReplaceEligibility';

function normalize(v: any) {
  return String(v ?? '').trim().toLowerCase();
}
export function computeInventorySourceHash(input: {
  propertyId: string;
  roomName?: string;
  name: string;
  brand?: string;
  model?: string;
  serialNo?: string;
  upc?: string;
  sku?: string;
}) {
  const key = [
    input.propertyId,
    normalize(input.roomName),
    normalize(input.name),
    normalize(input.brand),
    normalize(input.model),
    normalize(input.serialNo),
    normalize(input.upc),
    normalize(input.sku),
  ].join('|');

  return crypto.createHash('sha256').update(key).digest('hex');
}

type ListItemsQuery = {
  q?: string;
  roomId?: string;
  category?: InventoryItemCategory;
  hasDocuments?: boolean;
};

function norm(v?: string | null) {
  return v ? v.toLowerCase().replace(/[^a-z0-9]/g, '') : null;
}
async function fetchJsonWithTimeout(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await assertSafeUrl(url);
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    // UPCitemdb returns JSON; keep error body if not
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new APIError(`Barcode lookup returned non-JSON response (${res.status})`, 502, 'BARCODE_LOOKUP_BAD_RESPONSE');
    }
    if (!res.ok) {
      throw new APIError(json?.message || `Barcode lookup failed (${res.status})`, 502, 'BARCODE_LOOKUP_FAILED');
    }
    return json;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new APIError('Barcode lookup timed out', 504, 'BARCODE_LOOKUP_TIMEOUT');
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const TAG_PROPERTY_APPLIANCE = 'PROPERTY_APPLIANCE';
const ROOM_REQUIRED_CATEGORIES = new Set(['APPLIANCE', 'FURNITURE', 'ELECTRONICS', 'OTHER']);
const INVENTORY_ITEMS_FACT_KEY = 'inventory.items';

type InventoryItemMutation = 'CREATED' | 'REVISED' | 'DELETED';

async function emitInventoryItemPropertyChange(
  tx: Prisma.TransactionClient,
  input: {
    propertyId: string;
    itemId: string;
    mutation: InventoryItemMutation;
    sourceRevision: string;
    changedAt: Date;
  },
) {
  const changeType = input.mutation === 'CREATED'
    ? 'SOURCE_RECORD_CREATED'
    : input.mutation === 'DELETED'
      ? 'SOURCE_LIFECYCLE_CHANGED'
      : 'PROPERTY_FACT_CHANGED';

  await emitPropertyChangeWithTransaction(tx, {
    propertyId: input.propertyId,
    // The consumer registry intentionally matches inventory-backed facts via
    // PROPERTY_FACT; INVENTORY_ITEM remains the canonical affected reference.
    sourceType: 'PROPERTY_FACT',
    sourceEntityId: input.itemId,
    sourceRevision: input.sourceRevision,
    changeType,
    changedFactKeys: [INVENTORY_ITEMS_FACT_KEY],
    canonicalReferences: [{ entityType: 'INVENTORY_ITEM', entityId: input.itemId }],
    occurredAt: input.changedAt,
    detectedAt: input.changedAt,
    confidence: 1,
    sourceHealth: 'CURRENT',
    signals: {
      homeownerRelevant: true,
      lifecycleAdvanced: input.mutation !== 'REVISED',
      propertyEffectConfirmed: true,
      urgentSafetyCondition: false,
      canonicalActionPriority: null,
    },
  });
}

function mergeTags(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined,
  enforced: string[]
): string[] {
  return Array.from(new Set([
    ...(existing || []),
    ...(incoming || []),
    ...enforced,
  ]));
}

export class InventoryService {
  private roomDisplayNameFromType(type: string) {
    // e.g. "LIVING_ROOM" -> "Living Room"
    return String(type || 'OTHER')
      .toLowerCase()
      .split('_')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  // ---------------- Rooms ----------------

  async listRooms(propertyId: string) {
    const rooms = await prisma.inventoryRoom.findMany({
      where: { propertyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            items: { where: visibleInventoryItemWhere() },
          },
        },
      },
    });

    return rooms.map(({ _count, ...room }) => ({
      ...room,
      itemCount: _count.items,
    }));
  }
  /**
   * Check if a major appliance already exists for this property.
   * Used for inline validation before save.
   */
  async checkDuplicateAppliance(
    propertyId: string, 
    name: string, 
    category: string
  ): Promise<{ isDuplicate: boolean; message?: string; applianceType?: string }> {
    // Only check for APPLIANCE category
    if (category !== 'APPLIANCE') {
      return { isDuplicate: false };
    }

    const inferredType = inferMajorApplianceType(name);
    
    // Not a recognized major appliance type
    if (!inferredType) {
      return { isDuplicate: false };
    }

    const sourceHash = `${PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX}${inferredType}`;

    const existing = await prisma.inventoryItem.findFirst({
      where: { propertyId, sourceHash },
      select: { id: true, name: true },
    });

    if (existing) {
      const friendlyName = formatMajorApplianceType(inferredType).toLowerCase();
      return {
        isDuplicate: true,
        message: `A ${friendlyName} already exists for this property.`,
        applianceType: friendlyName,
      };
    }

    return { isDuplicate: false };
  }

  async createRoom(
    propertyId: string,
    input: { type: any; name?: string; floorLevel?: number | null; sortOrder?: number; profile?: any | null }
  ) {
    const type = String((input as any)?.type || 'OTHER');
    const name =
      (input as any)?.name && String((input as any).name).trim()
        ? String((input as any).name).trim()
        : this.roomDisplayNameFromType(type);

    try {
      return await prisma.inventoryRoom.create({
        data: {
          propertyId,
          type: type as any,
          name,
          floorLevel: (input as any).floorLevel ?? null,
          sortOrder: (input as any).sortOrder ?? 0,
          profile: (input as any).profile ?? undefined,
        },
      });
    } catch (e: any) {
      // unique(propertyId,name) violation
      if (e?.code === 'P2002') {
        throw new APIError('Room name already exists for this property', 409, 'ROOM_ALREADY_EXISTS');
      }
      throw e;
    }
  }

  async updateRoom(propertyId: string, roomId: string, patch: any) {
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      select: { id: true },
    });
    if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');

    try {
      return await prisma.inventoryRoom.update({
        where: { id: roomId },
        data: patch,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new APIError('Room name already exists for this property', 409, 'ROOM_ALREADY_EXISTS');
      }
      throw e;
    }
  }

  async deleteRoom(propertyId: string, roomId: string) {
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      select: { id: true },
    });
    if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');

    // Set items.roomId = null first (room relation uses SetNull)
    await prisma.inventoryItem.updateMany({
      where: { propertyId, roomId },
      data: { roomId: null },
    });

    await prisma.inventoryRoom.delete({ where: { id: roomId } });
  }

  // ---------------- Items ----------------
  async getItem(propertyId: string, itemId: string) {
    const [item, responsibilities] = await Promise.all([
      prisma.inventoryItem.findFirst({
        where: { id: itemId, propertyId },
        include: {
          room: true,
          warranty: true,
          insurancePolicy: true,
          documents: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.propertyResponsibility.findMany({ where: { propertyId }, select: { scope: true, party: true } }),
    ]);
    if (!item) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    return { ...item, ...buildInventoryCoveragePresentation(item, responsibilities) };
  }
  async listItems(propertyId: string, query: ListItemsQuery) {
    const where: any = { propertyId, ...visibleInventoryItemWhere() };

    if (query.roomId) where.roomId = query.roomId;
    if (query.category) where.category = query.category;

    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { model: { contains: term, mode: 'insensitive' } },
        { serialNo: { contains: term, mode: 'insensitive' } },

        // ✅ helpful for barcode / recall fields
        { manufacturer: { contains: term, mode: 'insensitive' } },
        { modelNumber: { contains: term, mode: 'insensitive' } },
        { serialNumber: { contains: term, mode: 'insensitive' } },
        { upc: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.hasDocuments === true) where.documents = { some: {} };
    if (query.hasDocuments === false) where.documents = { none: {} };

    const [items, responsibilities] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: {
          room: true,
          warranty: true,
          insurancePolicy: true,
          documents: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      prisma.propertyResponsibility.findMany({ where: { propertyId }, select: { scope: true, party: true } }),
    ]);
    return items.map((item) => ({ ...item, ...buildInventoryCoveragePresentation(item, responsibilities) }));
  }

  async createItem(propertyId: string, data: any, userId: string | null) {
    if (String(data.category) === 'APPLIANCE' && isWaterHeaterInventoryName(data.name)) {
      throw new APIError('Water heaters are plumbing systems. Choose the PLUMBING category.', 400, 'WATER_HEATER_CATEGORY_MISMATCH');
    }
    if (ROOM_REQUIRED_CATEGORIES.has(String(data.category)) && !data.roomId) {
      throw new APIError(
        'Choose a room for appliances and belongings. Whole-home systems do not require a room.',
        400,
        'ROOM_REQUIRED',
      );
    }
    await this.assertRoomBelongs(propertyId, data.roomId);
    await this.assertWarrantyBelongs(propertyId, data.warrantyId);
    await this.assertInsuranceBelongs(propertyId, data.insurancePolicyId);
  
    const manufacturerNorm = norm(data.manufacturer);
    const modelNumberNorm = norm(data.modelNumber);
  
    // ═══════════════════════════════════════════════════════════════════════════
    // MAJOR APPLIANCE HANDLING
    // - Check if duplicate exists → simple error
    // - If no duplicate → allow creation with canonical sourceHash
    // ═══════════════════════════════════════════════════════════════════════════
  
    let sourceHash: string | null = null;
    let enforcedTags: string[] = [];
  
    if (String(data.category) === 'APPLIANCE') {
      const inferredType = inferMajorApplianceType(data.name);
      
      if (inferredType) {
        sourceHash = `${PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX}${inferredType}`;
        enforcedTags = [TAG_PROPERTY_APPLIANCE, `APPLIANCE_TYPE:${inferredType}`];
  
        // Check if this major appliance already exists
        const existingCanonical = await prisma.inventoryItem.findFirst({
          where: { propertyId, sourceHash },
          select: { id: true, name: true },
        });
  
        if (existingCanonical) {
          // Simple duplicate error - one liner
          const friendlyName = formatMajorApplianceType(inferredType).toLowerCase();
          throw new APIError(
            `A ${friendlyName} already exists for this property.`,
            409,
            'APPLIANCE_ALREADY_EXISTS'
          );
        }
      }      
    }
    // Check if install year is required
    if (String(data.category) === 'APPLIANCE') {
      if (!data.installedOn) {
        throw new APIError(
          'Install Year is required for appliances.',
          400,
          'INSTALL_YEAR_REQUIRED'
        );
      }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // CREATE THE ITEM
    // ═══════════════════════════════════════════════════════════════════════════
  
    const changedAt = new Date();
    const sourceRevision = `created:${crypto.randomUUID()}`;
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          propertyId,
          name: data.name,
          category: data.category,
          condition: data.condition || 'UNKNOWN',
          isVerified: true,
          verificationSource: 'USER_REPORTED',

          roomId: data.roomId || null,
          warrantyId: data.warrantyId || null,
          insurancePolicyId: data.insurancePolicyId || null,
          assetType: data.assetType || null,
          efficiencyRating: data.efficiencyRating || null,

          brand: data.brand || null,
          model: data.model || null,
          serialNo: data.serialNo || null,
          notes: data.notes || null,

          // Apply canonical sourceHash and tags for major appliances
          sourceHash: sourceHash || null,
          tags: mergeTags([], data.tags, enforcedTags),

          purchaseCostCents: data.purchaseCostCents || null,
          replacementCostCents: data.replacementCostCents || null,
          currency: data.currency || 'USD',

          installedOn: data.installedOn ? new Date(data.installedOn) : null,
          purchasedOn: data.purchasedOn ? new Date(data.purchasedOn) : null,
          lastServicedOn: data.lastServicedOn ? new Date(data.lastServicedOn) : null,

          // Barcode/recall fields
          manufacturer: data.manufacturer || null,
          modelNumber: data.modelNumber || null,
          serialNumber: data.serialNumber || null,
          upc: data.upc || null,
          sku: data.sku || null,

          // Normalized (for matching)
          manufacturerNorm,
          modelNumberNorm,
        },
        include: {
          room: true,
          warranty: true,
          insurancePolicy: true,
          documents: { orderBy: { createdAt: 'desc' } },
        },
      });
      await emitInventoryItemPropertyChange(tx, {
        propertyId,
        itemId: item.id,
        mutation: 'CREATED',
        sourceRevision,
        changedAt,
      });
      return item;
    });
  
    // Analytics: inventory item or system added
    {
      const itemCategory = String(created.category ?? '');
      const isSystem = itemCategory === 'APPLIANCE' || itemCategory === 'HVAC';
      analyticsEmitter.track({
        eventType: isSystem ? AnalyticsEvent.SYSTEM_ADDED : AnalyticsEvent.INVENTORY_ITEM_CREATED,
        userId,
        propertyId,
        moduleKey: isSystem ? AnalyticsModule.PROPERTY : AnalyticsModule.INVENTORY,
        featureKey: isSystem ? AnalyticsFeature.PROPERTY_PROFILE : AnalyticsFeature.INVENTORY_ITEM,
        metadataJson: { category: itemCategory, sourceType: created.sourceType },
      });
    }

    // Home Timeline event generation
    try {
      await HomeEventsAutoGen.onInventoryItemCreated({
        propertyId,
        itemId: created.id,
        userId: userId ?? null,
        name: created.name,
        category: String(created.category ?? ''),
        roomId: created.roomId ?? null,
        purchasedOn: created.purchasedOn ?? null,
        purchaseCostCents: created.purchaseCostCents ?? null,
        currency: created.currency ?? null,
        brand: created.brand ?? null,
        model: created.model ?? null,
        upc: created.upc ?? null,
        sku: created.sku ?? null,
      });
    } catch (e: any) {
      logger.error({ err: e }, '[HOME_EVENTS_AUTOGEN] onInventoryItemCreated failed');
    }
    JobQueueService.enqueueHomeDigitalTwinRefresh(
      propertyId,
      'Inventory changed; the home projection is being refreshed.',
      { sourceReferenceIds: [created.id] },
    ).catch((err) => logger.error({ err }, '[INVENTORY_CREATE] Twin refresh enqueue failed'));
  
    return created;
  }
  
  async updateItem(propertyId: string, itemId: string, patch: any) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: {
        id: true,
        category: true,
        tags: true,
        sourceHash: true,
        name: true,
        roomId: true,
        isVerified: true,
      },
    });
    
    if (!existing) {
      throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    }
  
    // ═══════════════════════════════════════════════════════════════════════════
    // PREVENT DUPLICATE MAJOR APPLIANCES ON UPDATE
    // ═══════════════════════════════════════════════════════════════════════════
  
    const nextName = ('name' in patch) ? patch.name : existing.name;
    const nextCategory = ('category' in patch) ? patch.category : existing.category;
    const nextRoomId = ('roomId' in patch) ? patch.roomId : existing.roomId;
    if (String(nextCategory) === 'APPLIANCE' && isWaterHeaterInventoryName(nextName)) {
      throw new APIError('Water heaters are plumbing systems. Choose the PLUMBING category.', 400, 'WATER_HEATER_CATEGORY_MISMATCH');
    }
    if (ROOM_REQUIRED_CATEGORIES.has(String(nextCategory)) && !nextRoomId) {
      throw new APIError(
        'Choose a room for appliances and belongings. Whole-home systems do not require a room.',
        400,
        'ROOM_REQUIRED',
      );
    }
    
    if (String(nextCategory) === 'APPLIANCE') {
      const inferredType = inferMajorApplianceType(nextName);
      
      if (inferredType) {
        const sourceHash = `${PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX}${inferredType}`;
        
        // Check if another item with this type exists
        const canonical = await prisma.inventoryItem.findFirst({
          where: { propertyId, sourceHash },
          select: { id: true },
        });
  
        if (canonical && canonical.id !== itemId) {
          const friendlyName = formatMajorApplianceType(inferredType).toLowerCase();
          throw new APIError(
            `A ${friendlyName} already exists for this property.`,
            409,
            'APPLIANCE_ALREADY_EXISTS'
          );
        }
  
        // Update sourceHash if this item is becoming a major appliance
        if (!existing.sourceHash?.startsWith(PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX)) {
          (patch as any).sourceHash = sourceHash;
          (patch as any).tags = mergeTags(existing.tags, patch.tags, [
            TAG_PROPERTY_APPLIANCE,
            `APPLIANCE_TYPE:${inferredType}`,
          ]);
        }
      }
    }
    if (String(nextCategory) === 'APPLIANCE') {
      // Check if installedOn is being set or already exists
      const hasInstalledOn = 'installedOn' in patch 
        ? !!patch.installedOn 
        : !!(await prisma.inventoryItem.findFirst({
            where: { id: itemId },
            select: { installedOn: true }
          }))?.installedOn;
      
      if (!hasInstalledOn && !patch.installedOn) {
        throw new APIError(
          'Install Year is required for appliances.',
          400,
          'INSTALL_YEAR_REQUIRED'
        );
      }
    }
    // Validate relations
    if ('roomId' in patch) await this.assertRoomBelongs(propertyId, patch.roomId);
    if ('warrantyId' in patch) await this.assertWarrantyBelongs(propertyId, patch.warrantyId);
    if ('insurancePolicyId' in patch) await this.assertInsuranceBelongs(propertyId, patch.insurancePolicyId);
  
    // Build update payload
    const updateData: any = { ...patch };
  
    if ('installedOn' in patch) {
      updateData.installedOn = patch.installedOn ? new Date(patch.installedOn) : null;
    }
    if ('purchasedOn' in patch) {
      updateData.purchasedOn = patch.purchasedOn ? new Date(patch.purchasedOn) : null;
    }
    if ('lastServicedOn' in patch) {
      updateData.lastServicedOn = patch.lastServicedOn ? new Date(patch.lastServicedOn) : null;
    }
  
    if ('warrantyId' in patch) updateData.warrantyId = patch.warrantyId || null;
    if ('insurancePolicyId' in patch) updateData.insurancePolicyId = patch.insurancePolicyId || null;
    if ('roomId' in patch) updateData.roomId = patch.roomId || null;
  
    // Keep normalized fields consistent
    if ('manufacturer' in patch) updateData.manufacturerNorm = norm(patch.manufacturer);
    if ('modelNumber' in patch) updateData.modelNumberNorm = norm(patch.modelNumber);
  
    const changedAt = new Date();
    const sourceRevision = `revised:${crypto.randomUUID()}`;
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.update({
        where: { id: itemId },
        data: updateData,
        include: {
          room: true,
          warranty: true,
          insurancePolicy: true,
          documents: { orderBy: { createdAt: 'desc' } },
        },
      });
      await emitInventoryItemPropertyChange(tx, {
        propertyId,
        itemId,
        mutation: 'REVISED',
        sourceRevision,
        changedAt,
      });
      return item;
    });

    // Recalculate lifespan if relevant fields changed on a verified item
    if (existing.isVerified && ('technicalSpecs' in patch || 'installedOn' in patch || 'purchasedOn' in patch)) {
      applianceOracleService.recalculateLifespan(itemId).catch((err) => {
        logger.error({ err }, '[INVENTORY_UPDATE] Lifespan recalculation failed (non-blocking)');
      });
    }

    const becameVerified = existing.isVerified === false && updateData.isVerified === true;
    if (becameVerified) {
      generateForecast(propertyId).catch((err) => {
        logger.error({ err }, '[INVENTORY_UPDATE] Maintenance forecast generation failed (non-blocking)');
      });
    }
    JobQueueService.enqueueHomeDigitalTwinRefresh(
      propertyId,
      'Inventory changed; the home projection is being refreshed.',
      { sourceReferenceIds: [itemId] },
    ).catch((err) => logger.error({ err }, '[INVENTORY_UPDATE] Twin refresh enqueue failed'));

    // Ask Intelligence FRD §10.4 correction/invalidation flow: a canonical
    // fact this item's active Decision Thread(s) depend on just changed.
    // The Specialist may recompute immediately after this method resolves, so
    // staleness is part of the correction contract and must be visible first.
    if (existing.category === 'HVAC' && ['condition', 'installedOn', 'purchasedOn', 'warrantyId', 'replacementCostCents'].some((field) => field in patch)) {
      await markThreadStaleOnFactCorrection(propertyId, itemId, 'HVAC_ITEM_FACT_CORRECTED');
    }

    return updated;
  }

  // ✅ NEW: barcode → product lookup (server-side)
  async lookupBarcode(code: string) {
    const clean = String(code || '').trim();
    if (!clean) throw new APIError('Missing barcode code', 400, 'BARCODE_CODE_REQUIRED');

    // UPCitemdb free tier endpoint is commonly used as:
    // https://api.upcitemdb.com/prod/trial/lookup?upc=...
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(clean)}`;

    const json = await fetchJsonWithTimeout(url, 8000);

    // best-effort “top hit”
    const item = Array.isArray(json?.items) && json.items.length ? json.items[0] : null;

    return {
      provider: 'UPCitemdb',
      code: clean,
      found: !!item,
      suggestion: item
        ? {
            title: item.title ?? null,
            brand: item.brand ?? null,
            model: item.model ?? null,
            category: item.category ?? null,
            images: Array.isArray(item.images) ? item.images : [],
          }
        : null,
      raw: json,
    };
  }

  async deleteItem(propertyId: string, itemId: string) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: { id: true },
    });
    if (!existing) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');

    const changedAt = new Date();
    const sourceRevision = `deleted:${crypto.randomUUID()}`;
    await prisma.$transaction(async (tx) => {
      // Unlink docs (Document.inventoryItemId is SetNull)
      await tx.document.updateMany({
        where: { inventoryItemId: itemId },
        data: { inventoryItemId: null },
      });

      await tx.inventoryItem.delete({ where: { id: itemId } });
      await emitInventoryItemPropertyChange(tx, {
        propertyId,
        itemId,
        mutation: 'DELETED',
        sourceRevision,
        changedAt,
      });
    });
    JobQueueService.enqueueHomeDigitalTwinRefresh(
      propertyId,
      'Inventory changed; the home projection is being refreshed.',
      { sourceReferenceIds: [itemId] },
    ).catch((err) => logger.error({ err }, '[INVENTORY_DELETE] Twin refresh enqueue failed'));
  }

  // ---------------- Document linking ----------------

  async linkDocument(propertyId: string, itemId: string, documentId: string) {
    // Ensure item belongs to property
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: { id: true, category: true },
    });
    if (!item) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');

    // Ensure document exists and is for this property
    const doc = await prisma.document.findFirst({
      where: { id: documentId },
      select: { id: true, propertyId: true },
    });
    if (!doc) throw new APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');

    // If document.propertyId is nullable in your schema, enforce it here
    if (doc.propertyId && doc.propertyId !== propertyId) {
      throw new APIError('Document does not belong to this property', 400, 'DOC_PROPERTY_MISMATCH');
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        propertyId, // ensure it is set for inventory docs
        inventoryItemId: itemId,
      },
    });
    JobQueueService.enqueueHomeDigitalTwinRefresh(
      propertyId,
      'Document evidence was linked to a home system.',
      { sourceReferenceIds: [itemId] },
    ).catch((err) => logger.error({ err }, '[INVENTORY_DOCUMENT_LINK] Twin refresh enqueue failed'));
    if (item.category === 'HVAC') {
      await markThreadStaleOnFactCorrection(propertyId, itemId, 'HVAC_DOCUMENT_EVIDENCE_LINKED');
    }
    return updated;
  }

  async unlinkDocument(propertyId: string, itemId: string, documentId: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: { id: true, category: true },
    });
    if (!item) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');

    const doc = await prisma.document.findFirst({
      where: { id: documentId, inventoryItemId: itemId },
      select: { id: true },
    });
    if (!doc) throw new APIError('Document not linked to this item', 404, 'DOC_NOT_LINKED');

    await prisma.document.update({
      where: { id: documentId },
      data: { inventoryItemId: null },
    });
    JobQueueService.enqueueHomeDigitalTwinRefresh(
      propertyId,
      'Document evidence was removed from a home system.',
      { sourceReferenceIds: [itemId] },
    ).catch((err) => logger.error({ err }, '[INVENTORY_DOCUMENT_UNLINK] Twin refresh enqueue failed'));
    if (item.category === 'HVAC') {
      await markThreadStaleOnFactCorrection(propertyId, itemId, 'HVAC_DOCUMENT_EVIDENCE_REMOVED');
    }
  }

  // ---------------- Import Batches ----------------

  async listImportBatches(propertyId: string) {
    return prisma.inventoryImportBatch.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        fileName: true,
        templateVersion: true,
        status: true,
        createdCount: true,
        skippedCount: true,
        errorCount: true,
        createdAt: true,
      },
    });
  }

  async rollbackImportBatch(propertyId: string, batchId: string) {
    // Ensure batch belongs to property
    const batch = await prisma.inventoryImportBatch.findFirst({
      where: { id: batchId, propertyId },
      select: { id: true },
    });
    if (!batch) throw new APIError('Import batch not found', 404, 'IMPORT_BATCH_NOT_FOUND');

    return prisma.$transaction(async (tx) => {
      // Find item ids first (needed to detach docs cleanly)
      const items = await tx.inventoryItem.findMany({
        where: { propertyId, sourceBatchId: batchId },
        select: { id: true },
      });

      const itemIds = items.map((x) => x.id);

      // Unlink documents (Document.inventoryItemId is SetNull in your codebase patterns)
      if (itemIds.length > 0) {
        await tx.document.updateMany({
          where: { inventoryItemId: { in: itemIds } },
          data: { inventoryItemId: null },
        });
      }

      // Delete items created by batch
      const deleted = await tx.inventoryItem.deleteMany({
        where: { propertyId, sourceBatchId: batchId },
      });

      // Mark batch as rolled back (keep record) OR delete it
      // ✅ Prefer keeping for audit/history
      await tx.inventoryImportBatch.update({
        where: { id: batchId },
        data: { status: 'ROLLED_BACK' },
      });

      return {
        batchId,
        deletedCount: deleted.count,
      };
    });
  }


  
  // ---------------- Containment guards ----------------

  private async assertRoomBelongs(propertyId: string, roomId?: string | null) {
    if (!roomId) return;
    const room = await prisma.inventoryRoom.findFirst({ where: { id: roomId, propertyId }, select: { id: true } });
    if (!room) throw new APIError('Room not found for property', 404, 'ROOM_NOT_FOUND');
  }

  private async assertWarrantyBelongs(propertyId: string, warrantyId?: string | null) {
    if (!warrantyId) return;
    const w = await prisma.warranty.findFirst({ where: { id: warrantyId, propertyId }, select: { id: true } });
    if (!w) throw new APIError('Warranty not found for property', 404, 'WARRANTY_NOT_FOUND');
  }

  private async assertInsuranceBelongs(propertyId: string, insurancePolicyId?: string | null) {
    if (!insurancePolicyId) return;
    const p = await prisma.insurancePolicy.findFirst({
      where: { id: insurancePolicyId, propertyId },
      select: { id: true },
    });
    if (!p) throw new APIError('Insurance policy not found for property', 404, 'INSURANCE_NOT_FOUND');
  }

}
