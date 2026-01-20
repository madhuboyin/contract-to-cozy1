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
    where: {
      propertyId,
      category: InventoryItemCategory.APPLIANCE,
    },
    select: {
      id: true,
      propertyId: true,
      sourceHash: true,
      installedOn: true,
      name: true,
      tags: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  function normalize(s: string) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function inferMajorType(it: { sourceHash: string | null; name: string | null; tags: string[] }) {
    // 1) If created from property page, it’s authoritative
    if (it.sourceHash?.startsWith(SOURCE_HASH_PREFIX)) {
      return it.sourceHash.replace(SOURCE_HASH_PREFIX, '') || null;
    }

    // 2) If tagged with a canonical appliance type (we already add APPLIANCE_TYPE:* for property items)
    const typeTag = (it.tags || []).find((t) => t.startsWith('APPLIANCE_TYPE:'));
    if (typeTag) return typeTag.replace('APPLIANCE_TYPE:', '') || null;

    // 3) Infer from name (manual inventory adds)
    const n = normalize(it.name || '');

    if (n.includes('dishwasher')) return 'DISHWASHER';
    if (n.includes('refrigerator') || n.includes('fridge')) return 'REFRIGERATOR';

    // Oven/Range/Stove/Cooktop
    if (
      n.includes('oven') ||
      n.includes('range') ||
      n.includes('stove') ||
      n.includes('cooktop')
    )
      return 'OVEN_RANGE';

    // Microwave + hood/vent
    if (n.includes('microwave') && (n.includes('hood') || n.includes('vent'))) return 'MICROWAVE_HOOD';
    if (n.includes('microwave')) return 'MICROWAVE_HOOD'; // fallback (still treat as major)

    // Laundry
    const hasWasher = n.includes('washer');
    const hasDryer = n.includes('dryer');
    if (hasWasher || hasDryer || n.includes('laundry')) return 'WASHER_DRYER';

    if (n.includes('water softener') || (n.includes('softener') && n.includes('water')))
      return 'WATER_SOFTENER';

    return null;
  }

  // Build canonical list and dedupe (prefer property_appliance sourceHash items)
  const byType = new Map<string, HomeAssetDTO>();

  for (const it of items) {
    const t = inferMajorType({ sourceHash: it.sourceHash, name: it.name, tags: it.tags || [] });
    if (!t) continue;

    const installationYear = it.installedOn ? it.installedOn.getUTCFullYear() : null;

    const dto: HomeAssetDTO = {
      id: it.id,
      propertyId: it.propertyId,
      assetType: t,
      installationYear,
    };

    const existing = byType.get(t);

    // Prefer property_appliance items if both exist
    const isPropertyBacked = !!it.sourceHash?.startsWith(SOURCE_HASH_PREFIX);
    const existingIsPropertyBacked = existing ? existing.id.startsWith('') : false; // placeholder

    if (!existing) {
      byType.set(t, dto);
      continue;
    }

    // If current is property-backed, overwrite inferred/manual
    if (isPropertyBacked) {
      byType.set(t, dto);
      continue;
    }

    // Otherwise keep existing (stable)
  }

  return Array.from(byType.values());
}

