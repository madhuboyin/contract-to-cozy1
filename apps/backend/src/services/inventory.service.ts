// apps/backend/src/services/inventory.service.ts
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { InventoryItemCategory } from '@prisma/client';
import crypto from 'crypto';
import { HomeEventsAutoGen } from './homeEvents/homeEvents.autogen';

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
    return prisma.inventoryRoom.findMany({
      where: { propertyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
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
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      include: {
        room: true,
        warranty: true,
        insurancePolicy: true,
        homeAsset: true,
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    return item;
  }
  async listItems(propertyId: string, query: ListItemsQuery) {
    const where: any = { propertyId };

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

    return prisma.inventoryItem.findMany({
      where,
      include: {
        room: true,
        warranty: true,
        insurancePolicy: true,
        homeAsset: true,
        documents: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async createItem(propertyId: string, data: any, userId: string | null) {
    await this.assertRoomBelongs(propertyId, data.roomId);
    await this.assertWarrantyBelongs(propertyId, data.warrantyId);
    await this.assertInsuranceBelongs(propertyId, data.insurancePolicyId);
    await this.assertHomeAssetBelongs(propertyId, data.homeAssetId);
  
    const manufacturerNorm = norm(data.manufacturer);
    const modelNumberNorm = norm(data.modelNumber);
  
    const created = await prisma.inventoryItem.create({
      data: {
        propertyId,
        name: data.name,
        category: data.category,
        condition: data.condition || 'UNKNOWN',
  
        roomId: data.roomId || null,
        warrantyId: data.warrantyId || null,
        insurancePolicyId: data.insurancePolicyId || null,
        homeAssetId: data.homeAssetId || null,
  
        brand: data.brand || null,
        model: data.model || null,
        serialNo: data.serialNo || null,
        notes: data.notes || null,
        tags: data.tags || [],
  
        purchaseCostCents: data.purchaseCostCents || null,
        replacementCostCents: data.replacementCostCents || null,
        currency: data.currency || 'USD',
  
        installedOn: data.installedOn ? new Date(data.installedOn) : null,
        purchasedOn: data.purchasedOn ? new Date(data.purchasedOn) : null,
        lastServicedOn: data.lastServicedOn ? new Date(data.lastServicedOn) : null,
  
        // ✅ barcode/recall fields
        manufacturer: data.manufacturer || null,
        modelNumber: data.modelNumber || null,
        serialNumber: data.serialNumber || null,
        upc: data.upc || null,
        sku: data.sku || null,
  
        // ✅ normalized (future-proof for matching)
        manufacturerNorm,
        modelNumberNorm,
      },
      include: {
        room: true,
        warranty: true,
        insurancePolicy: true,
        homeAsset: true,
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
  
    // ✅ Home Timeline Replay™: auto-generate purchase moment (safe + idempotent)
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
      console.error('[HOME_EVENTS_AUTOGEN] onInventoryItemCreated failed:', e);
    }
  
    return created;
  }
  

  async updateItem(propertyId: string, itemId: string, patch: any) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: { id: true },
    });
    if (!existing) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');

    if ('roomId' in patch) await this.assertRoomBelongs(propertyId, patch.roomId);
    if ('warrantyId' in patch) await this.assertWarrantyBelongs(propertyId, patch.warrantyId);
    if ('insurancePolicyId' in patch) await this.assertInsuranceBelongs(propertyId, patch.insurancePolicyId);
    if ('homeAssetId' in patch) await this.assertHomeAssetBelongs(propertyId, patch.homeAssetId);

    const updateData: any = { ...patch };

    if ('installedOn' in patch) updateData.installedOn = patch.installedOn ? new Date(patch.installedOn) : null;
    if ('purchasedOn' in patch) updateData.purchasedOn = patch.purchasedOn ? new Date(patch.purchasedOn) : null;
    if ('lastServicedOn' in patch) updateData.lastServicedOn = patch.lastServicedOn ? new Date(patch.lastServicedOn) : null;

    if ('warrantyId' in patch) updateData.warrantyId = patch.warrantyId || null;
    if ('insurancePolicyId' in patch) updateData.insurancePolicyId = patch.insurancePolicyId || null;
    if ('roomId' in patch) updateData.roomId = patch.roomId || null;

    // ✅ keep normalized fields consistent if these change
    if ('manufacturer' in patch) updateData.manufacturerNorm = norm(patch.manufacturer);
    if ('modelNumber' in patch) updateData.modelNumberNorm = norm(patch.modelNumber);

    return prisma.inventoryItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        room: true,
        warranty: true,
        insurancePolicy: true,
        homeAsset: true,
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
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

    // Unlink docs (Document.inventoryItemId is SetNull)
    await prisma.document.updateMany({
      where: { inventoryItemId: itemId },
      data: { inventoryItemId: null },
    });

    await prisma.inventoryItem.delete({ where: { id: itemId } });
  }

  // ---------------- Document linking ----------------

  async linkDocument(propertyId: string, itemId: string, documentId: string) {
    // Ensure item belongs to property
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: { id: true },
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

    return prisma.document.update({
      where: { id: documentId },
      data: {
        propertyId, // ensure it is set for inventory docs
        inventoryItemId: itemId,
      },
    });
  }

  async unlinkDocument(propertyId: string, itemId: string, documentId: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: { id: true },
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

  private async assertHomeAssetBelongs(propertyId: string, homeAssetId?: string | null) {
    if (!homeAssetId) return;
    const a = await prisma.homeAsset.findFirst({ where: { id: homeAssetId, propertyId }, select: { id: true } });
    if (!a) throw new APIError('Home asset not found for property', 404, 'HOME_ASSET_NOT_FOUND');
  }

}
