import { MaterialCategory, MaterialScopeLevel, MaterialSpecExportStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { presignGetObject } from './storage/presign';

// Static paint brand color-code → hex lookup (BM, SW, Behr, PPG representative values)
const PAINT_COLOR_HEX: Record<string, Record<string, string>> = {
  'benjamin moore': {
    'oc-17': '#F4F0E8',
    'oc-65': '#F5F0E0',
    'oc-57': '#F7F3E8',
    'hc-172': '#C2C0B8',
    'hc-173': '#A8A49C',
    '2126-60': '#E8E4DC',
    '2155-70': '#D6E8F0',
    'csp-10': '#F5F2EC',
  },
  'sherwin-williams': {
    'sw 7006': '#F2EFE4',
    'sw 7015': '#9E9B8E',
    'sw 7016': '#808080',
    'sw 7029': '#8C8680',
    'sw 7057': '#717C7F',
    'sw 6119': '#C8A882',
    'sw 6385': '#F0E6D0',
    'sw 7005': '#E8E3D8',
    'sw 9140': '#EDE8E0',
  },
  'behr': {
    'n100-1': '#F5F2EB',
    'n120-1': '#F0EDE5',
    '75': '#F2EDE0',
    'pr-w15': '#EAE6DC',
    '790c-3': '#C0B8A8',
  },
  'ppg': {
    'ppg1001-1': '#F5F3EC',
    'ppg1025-1': '#EDE9E0',
    'ppg1002-3': '#D8D4C8',
  },
};

function lookupColorHex(manufacturer?: string | null, colorCode?: string | null): string | null {
  if (!manufacturer || !colorCode) return null;
  const brandKey = manufacturer.toLowerCase().trim();
  const codeKey = colorCode.toLowerCase().trim();
  const brandMap = PAINT_COLOR_HEX[brandKey];
  return brandMap?.[codeKey] ?? null;
}

function buildPresignedPhotoUrl(fileKey: string): Promise<string | null> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !fileKey) return Promise.resolve(null);
  return presignGetObject({ bucket, key: fileKey, expiresInSeconds: 3600 }).catch(() => null);
}

export class MaterialSpecService {
  // ── Guards ────────────────────────────────────────────────────────────────

  private async assertSpecBelongs(propertyId: string, specId: string) {
    const spec = await prisma.materialSpec.findFirst({
      where: { id: specId, propertyId },
      select: { id: true },
    });
    if (!spec) throw new APIError('Material spec not found', 404, 'SPEC_NOT_FOUND');
    return spec;
  }

  private async assertRoomBelongs(propertyId: string, roomId?: string | null) {
    if (!roomId) return;
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      select: { id: true },
    });
    if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
  }

  private async assertInventoryItemBelongs(propertyId: string, id?: string | null) {
    if (!id) return;
    const item = await prisma.inventoryItem.findFirst({
      where: { id, propertyId },
      select: { id: true },
    });
    if (!item) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
  }

  private async assertHomeAssetBelongs(propertyId: string, id?: string | null) {
    if (!id) return;
    const asset = await prisma.homeAsset.findFirst({
      where: { id, propertyId },
      select: { id: true },
    });
    if (!asset) throw new APIError('Home asset not found', 404, 'ASSET_NOT_FOUND');
  }

  // ── List / Search ─────────────────────────────────────────────────────────

  async listSpecs(
    propertyId: string,
    query: {
      category?: MaterialCategory;
      scopeLevel?: MaterialScopeLevel;
      roomId?: string;
      isActive?: boolean;
      limit?: number;
      cursor?: string;
    }
  ) {
    const limit = query.limit ?? 50;
    const where: Prisma.MaterialSpecWhereInput = {
      propertyId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.scopeLevel ? { scopeLevel: query.scopeLevel } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const specs = await prisma.materialSpec.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      include: {
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { photoUrl: true, fileKey: true } },
        room: { select: { id: true, name: true } },
      },
    });

    const hasMore = specs.length > limit;
    const items = hasMore ? specs.slice(0, limit) : specs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { specs: items, nextCursor, hasMore };
  }

  async searchSpecs(propertyId: string, q: string) {
    const term = q.trim().toLowerCase();
    const specs = await prisma.materialSpec.findMany({
      where: {
        propertyId,
        isActive: true,
        OR: [
          { label: { contains: term, mode: 'insensitive' } },
          { manufacturer: { contains: term, mode: 'insensitive' } },
          { productName: { contains: term, mode: 'insensitive' } },
          { colorCode: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { notes: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { label: 'asc' },
      include: {
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { photoUrl: true, fileKey: true } },
        room: { select: { id: true, name: true } },
      },
    });
    return specs;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async getSpec(propertyId: string, specId: string) {
    const spec = await prisma.materialSpec.findFirst({
      where: { id: specId, propertyId },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        room: { select: { id: true, name: true } },
      },
    });
    if (!spec) throw new APIError('Material spec not found', 404, 'SPEC_NOT_FOUND');
    return spec;
  }

  async createSpec(propertyId: string, payload: {
    scopeLevel: MaterialScopeLevel;
    category: MaterialCategory;
    label: string;
    surface?: string | null;
    roomId?: string | null;
    manufacturer?: string | null;
    productLine?: string | null;
    productName?: string | null;
    sku?: string | null;
    colorCode?: string | null;
    colorHex?: string | null;
    finish?: string | null;
    dimensions?: string | null;
    material?: string | null;
    supplier?: string | null;
    supplierUrl?: string | null;
    purchaseDate?: string | null;
    quantityPurchased?: string | null;
    lotBatch?: string | null;
    notes?: string | null;
    isActive?: boolean;
    linkedInventoryItemId?: string | null;
    linkedHomeAssetId?: string | null;
  }) {
    await this.assertRoomBelongs(propertyId, payload.roomId);
    await this.assertInventoryItemBelongs(propertyId, payload.linkedInventoryItemId);
    await this.assertHomeAssetBelongs(propertyId, payload.linkedHomeAssetId);

    // Auto-populate colorHex from paint brand lookup if missing
    let colorHex = payload.colorHex ?? null;
    if (!colorHex && payload.colorCode && payload.category === 'PAINT') {
      colorHex = lookupColorHex(payload.manufacturer, payload.colorCode);
    }

    const spec = await prisma.materialSpec.create({
      data: {
        propertyId,
        scopeLevel: payload.scopeLevel,
        category: payload.category,
        surface: payload.surface as any ?? null,
        label: payload.label,
        roomId: payload.roomId ?? null,
        manufacturer: payload.manufacturer ?? null,
        productLine: payload.productLine ?? null,
        productName: payload.productName ?? null,
        sku: payload.sku ?? null,
        colorCode: payload.colorCode ?? null,
        colorHex,
        finish: payload.finish ?? null,
        dimensions: payload.dimensions ?? null,
        material: payload.material ?? null,
        supplier: payload.supplier ?? null,
        supplierUrl: payload.supplierUrl ?? null,
        purchaseDate: payload.purchaseDate ? new Date(payload.purchaseDate) : null,
        quantityPurchased: payload.quantityPurchased ?? null,
        lotBatch: payload.lotBatch ?? null,
        notes: payload.notes ?? null,
        isActive: payload.isActive ?? true,
        linkedInventoryItemId: payload.linkedInventoryItemId ?? null,
        linkedHomeAssetId: payload.linkedHomeAssetId ?? null,
      },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        room: { select: { id: true, name: true } },
      },
    });

    return spec;
  }

  async updateSpec(propertyId: string, specId: string, payload: Partial<Parameters<MaterialSpecService['createSpec']>[1]>) {
    await this.assertSpecBelongs(propertyId, specId);
    if (payload.roomId !== undefined) await this.assertRoomBelongs(propertyId, payload.roomId);
    if (payload.linkedInventoryItemId !== undefined) await this.assertInventoryItemBelongs(propertyId, payload.linkedInventoryItemId);
    if (payload.linkedHomeAssetId !== undefined) await this.assertHomeAssetBelongs(propertyId, payload.linkedHomeAssetId);

    // Re-run color lookup if colorCode changed and colorHex not explicitly set
    const updateData: Prisma.MaterialSpecUpdateInput = {};

    if (payload.scopeLevel !== undefined) updateData.scopeLevel = payload.scopeLevel;
    if (payload.category !== undefined) updateData.category = payload.category;
    if (payload.surface !== undefined) updateData.surface = payload.surface as any;
    if (payload.label !== undefined) updateData.label = payload.label;
    if (payload.roomId !== undefined) updateData.room = payload.roomId ? { connect: { id: payload.roomId } } : { disconnect: true };
    if (payload.manufacturer !== undefined) updateData.manufacturer = payload.manufacturer;
    if (payload.productLine !== undefined) updateData.productLine = payload.productLine;
    if (payload.productName !== undefined) updateData.productName = payload.productName;
    if (payload.sku !== undefined) updateData.sku = payload.sku;
    if (payload.finish !== undefined) updateData.finish = payload.finish;
    if (payload.dimensions !== undefined) updateData.dimensions = payload.dimensions;
    if (payload.material !== undefined) updateData.material = payload.material;
    if (payload.supplier !== undefined) updateData.supplier = payload.supplier;
    if (payload.supplierUrl !== undefined) updateData.supplierUrl = payload.supplierUrl;
    if (payload.purchaseDate !== undefined) updateData.purchaseDate = payload.purchaseDate ? new Date(payload.purchaseDate) : null;
    if (payload.quantityPurchased !== undefined) updateData.quantityPurchased = payload.quantityPurchased;
    if (payload.lotBatch !== undefined) updateData.lotBatch = payload.lotBatch;
    if (payload.notes !== undefined) updateData.notes = payload.notes;
    if (payload.isActive !== undefined) updateData.isActive = payload.isActive;
    if (payload.linkedInventoryItemId !== undefined) {
      updateData.inventoryItem = payload.linkedInventoryItemId
        ? { connect: { id: payload.linkedInventoryItemId } }
        : { disconnect: true };
    }
    if (payload.linkedHomeAssetId !== undefined) {
      updateData.homeAsset = payload.linkedHomeAssetId
        ? { connect: { id: payload.linkedHomeAssetId } }
        : { disconnect: true };
    }

    if (payload.colorHex !== undefined) {
      updateData.colorHex = payload.colorHex;
    } else if (payload.colorCode !== undefined) {
      updateData.colorCode = payload.colorCode;
      const current = await prisma.materialSpec.findUnique({ where: { id: specId }, select: { manufacturer: true, category: true, colorHex: true } });
      if (!current?.colorHex && payload.colorCode && current?.category === 'PAINT') {
        updateData.colorHex = lookupColorHex(payload.manufacturer ?? current?.manufacturer, payload.colorCode);
      }
    }
    if (payload.colorCode !== undefined) updateData.colorCode = payload.colorCode;

    const spec = await prisma.materialSpec.update({
      where: { id: specId },
      data: updateData,
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        room: { select: { id: true, name: true } },
      },
    });

    return spec;
  }

  async deleteSpec(propertyId: string, specId: string) {
    await this.assertSpecBelongs(propertyId, specId);
    await prisma.materialSpec.delete({ where: { id: specId } });
  }

  // ── Photos ────────────────────────────────────────────────────────────────

  async addPhoto(
    propertyId: string,
    specId: string,
    payload: { photoUrl: string; fileKey: string; caption?: string | null; sortOrder?: number }
  ) {
    await this.assertSpecBelongs(propertyId, specId);

    const existing = await prisma.materialSpecPhoto.count({ where: { materialSpecId: specId } });
    if (existing >= 10) throw new APIError('Maximum 10 photos per spec', 400, 'PHOTO_LIMIT_EXCEEDED');

    const photo = await prisma.materialSpecPhoto.create({
      data: {
        materialSpecId: specId,
        propertyId,
        photoUrl: payload.photoUrl,
        fileKey: payload.fileKey,
        caption: payload.caption ?? null,
        sortOrder: payload.sortOrder ?? existing,
      },
    });

    return photo;
  }

  async deletePhoto(propertyId: string, specId: string, photoId: string) {
    await this.assertSpecBelongs(propertyId, specId);
    const photo = await prisma.materialSpecPhoto.findFirst({
      where: { id: photoId, materialSpecId: specId },
    });
    if (!photo) throw new APIError('Photo not found', 404, 'PHOTO_NOT_FOUND');
    await prisma.materialSpecPhoto.delete({ where: { id: photoId } });
  }

  async reorderPhotos(propertyId: string, specId: string, orderedIds: string[]) {
    await this.assertSpecBelongs(propertyId, specId);

    const photos = await prisma.materialSpecPhoto.findMany({
      where: { materialSpecId: specId },
      select: { id: true },
    });
    const existingIds = new Set(photos.map((p) => p.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) throw new APIError(`Photo ${id} not found on this spec`, 400, 'PHOTO_NOT_FOUND');
    }

    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.materialSpecPhoto.update({ where: { id }, data: { sortOrder: idx } })
      )
    );

    return prisma.materialSpecPhoto.findMany({
      where: { materialSpecId: specId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  async requestExport(
    propertyId: string,
    userId: string,
    payload: { scopeType: string; title: string; roomId?: string | null; category?: string | null }
  ) {
    if (payload.roomId) await this.assertRoomBelongs(propertyId, payload.roomId);

    // Prevent duplicate pending/generating exports
    const inFlight = await prisma.materialSpecExport.findFirst({
      where: {
        propertyId,
        status: { in: [MaterialSpecExportStatus.PENDING, MaterialSpecExportStatus.GENERATING] },
      },
      select: { id: true, status: true },
    });
    if (inFlight) {
      throw new APIError('An export is already in progress', 409, 'EXPORT_IN_PROGRESS');
    }

    const titleParts = [payload.title];
    if (payload.scopeType === 'ROOM' && payload.roomId) {
      const room = await prisma.inventoryRoom.findUnique({ where: { id: payload.roomId }, select: { name: true } });
      if (room) titleParts[0] = `${payload.title} — ${room.name}`;
    }

    const specExport = await prisma.materialSpecExport.create({
      data: {
        propertyId,
        requestedByUserId: userId,
        status: MaterialSpecExportStatus.PENDING,
        scopeType: payload.scopeType,
        title: titleParts[0],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return specExport;
  }

  async listExports(propertyId: string) {
    const exports = await prisma.materialSpecExport.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, scopeType: true, title: true,
        totalSpecs: true, fileUrl: true, fileKey: true,
        expiresAt: true, errorMessage: true, createdAt: true, updatedAt: true,
      },
    });
    return exports;
  }

  async getExport(propertyId: string, exportId: string) {
    const specExport = await prisma.materialSpecExport.findFirst({
      where: { id: exportId, propertyId },
    });
    if (!specExport) throw new APIError('Export not found', 404, 'EXPORT_NOT_FOUND');

    let signedUrl: string | null = null;
    if (specExport.fileKey && specExport.status === MaterialSpecExportStatus.COMPLETED) {
      const bucket = process.env.S3_BUCKET;
      if (bucket) {
        signedUrl = await presignGetObject({
          bucket,
          key: specExport.fileKey,
          expiresInSeconds: 3600,
          downloadFilename: `${specExport.title}.pdf`,
        }).catch(() => null);
      }
    }

    return { ...specExport, signedUrl };
  }
}
