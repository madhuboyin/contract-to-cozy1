// apps/backend/src/services/propertyApplianceInventory.service.ts

import { Prisma, InventoryItemCategory, RoomType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface HomeAssetInput {
  id?: string;
  type: string;        // e.g. "DISHWASHER"
  installYear: number; // e.g. 2016
}

const SOURCE_HASH_PREFIX = 'property_appliance::';
const TAG_PROPERTY_APPLIANCE = 'PROPERTY_APPLIANCE';

const APPLIANCE_ROOM_MAP: Record<string, RoomType> = {
  DISHWASHER: 'KITCHEN',
  REFRIGERATOR: 'KITCHEN',
  OVEN_RANGE: 'KITCHEN',
  MICROWAVE_HOOD: 'KITCHEN',
  WATER_SOFTENER: 'LAUNDRY',
  WASHER_DRYER: 'LAUNDRY', // ✅ matches frontend
};

function prettyApplianceName(type: string) {
  return String(type || '')
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function installYearToDate(installYear?: number | null): Date | null {
  const y = Number(installYear);
  if (!Number.isFinite(y) || y <= 0) return null;
  return new Date(Date.UTC(y, 0, 1)); // Jan 1 UTC
}

async function ensureRoomId(propertyId: string, roomType: RoomType): Promise<string | null> {
  const byType = await prisma.inventoryRoom.findFirst({
    where: { propertyId, type: roomType },
    select: { id: true },
  });
  if (byType?.id) return byType.id;

  const fallbackName = roomType
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

  const byName = await prisma.inventoryRoom.findFirst({
    where: { propertyId, name: fallbackName },
    select: { id: true },
  });
  if (byName?.id) return byName.id;

  const created = await prisma.inventoryRoom.create({
    data: { propertyId, name: fallbackName, type: roomType },
    select: { id: true },
  });

  return created.id;
}

/**
 * Canonical sync: Property "Major Appliances" -> InventoryItems.
 */
export async function syncPropertyApplianceInventoryItems(
  propertyId: string,
  incomingAssets: HomeAssetInput[]
): Promise<void> {
  const normalized = (incomingAssets || [])
    .filter((a) => a && a.type)
    .map((a) => ({
      type: String(a.type).trim().toUpperCase(),
      installYear: Number(a.installYear), // ✅ FIX: correct field name
    }));

  const incomingTypes = new Set(normalized.map((a) => a.type));

  const existing = await prisma.inventoryItem.findMany({
    where: { propertyId, sourceHash: { startsWith: SOURCE_HASH_PREFIX } },
    select: { id: true, sourceHash: true },
  });

  const ops: Prisma.PrismaPromise<any>[] = [];

  for (const a of normalized) {
    const roomType = APPLIANCE_ROOM_MAP[a.type] ?? 'KITCHEN';
    const roomId = await ensureRoomId(propertyId, roomType);
    const sourceHash = `${SOURCE_HASH_PREFIX}${a.type}`;
    const installedOn = installYearToDate(a.installYear);
    const name = prettyApplianceName(a.type);

    const existingItem = await prisma.inventoryItem.findFirst({
      where: { propertyId, sourceHash },
      select: { id: true, tags: true },
    });

    const typeTag = `APPLIANCE_TYPE:${a.type}`;
    const nextTags = Array.from(
      new Set([TAG_PROPERTY_APPLIANCE, typeTag, ...(existingItem?.tags || [])])
    );

    if (existingItem) {
      ops.push(
        prisma.inventoryItem.update({
          where: { id: existingItem.id },
          data: {
            category: InventoryItemCategory.APPLIANCE,
            name,
            installedOn,
            roomId,
            tags: nextTags,
          },
        })
      );
    } else {
      ops.push(
        prisma.inventoryItem.create({
          data: {
            propertyId,
            category: InventoryItemCategory.APPLIANCE,
            name,
            installedOn,
            roomId,
            sourceHash,
            tags: nextTags,
          },
        })
      );
    }
  }

  // Delete removed property-appliance items
  for (const ex of existing) {
    const type = String(ex.sourceHash || '').replace(SOURCE_HASH_PREFIX, '');
    if (type && !incomingTypes.has(type)) {
      ops.push(prisma.inventoryItem.delete({ where: { id: ex.id } }));
    }
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }
}

/**
 * Back-compat DTO (minimal shape the frontend already uses)
 */
export type HomeAssetDTO = {
  id: string;
  propertyId: string;
  assetType: string;
  installationYear: number | null;
};

export async function listPropertyAppliancesAsHomeAssets(propertyId: string): Promise<HomeAssetDTO[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { propertyId, sourceHash: { startsWith: SOURCE_HASH_PREFIX } },
    select: { id: true, propertyId: true, sourceHash: true, installedOn: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return items.map((it) => ({
    id: it.id,
    propertyId: it.propertyId,
    assetType: String(it.sourceHash || '').replace(SOURCE_HASH_PREFIX, '') || 'UNKNOWN',
    installationYear: it.installedOn ? it.installedOn.getUTCFullYear() : null,
  }));
}
