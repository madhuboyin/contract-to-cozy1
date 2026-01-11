// apps/backend/src/services/recalls.service.ts
import { prisma } from '../lib/prisma';
import { RecallMatchStatus, RecallResolutionType } from '@prisma/client';

export async function listPropertyRecallMatches(propertyId: string) {
  return prisma.recallMatch.findMany({
    where: { propertyId },
    include: {
      recall: true,
      inventoryItem: true,
      homeAsset: true,
      maintenanceTask: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listInventoryItemRecallMatches(propertyId: string, itemId: string) {
  return prisma.recallMatch.findMany({
    where: { propertyId, inventoryItemId: itemId },
    include: {
      recall: true,
      maintenanceTask: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ---- Property-scoped mutation helpers ----

async function requireMatch(propertyId: string, matchId: string) {
  const row = await prisma.recallMatch.findFirst({
    where: { id: matchId, propertyId },
    include: { recall: true, maintenanceTask: true },
  });
  if (!row) throw new Error('Recall match not found');
  return row;
}

export async function confirmRecallMatch(propertyId: string, matchId: string) {
  // Ensure it belongs to property (prevents IDOR even if middleware is wrong)
  await requireMatch(propertyId, matchId);

  await prisma.recallMatch.update({
    where: { id: matchId },
    data: {
      status: RecallMatchStatus.OPEN,
      confirmedAt: new Date(),
      dismissedAt: null,
      // leave resolvedAt as-is; if you want to "re-open" from RESOLVED,
      // you can also set resolvedAt: null here.
    },
  });

  return requireMatch(propertyId, matchId);
}

export async function dismissRecallMatch(propertyId: string, matchId: string) {
  await requireMatch(propertyId, matchId);

  await prisma.recallMatch.update({
    where: { id: matchId },
    data: {
      status: RecallMatchStatus.DISMISSED,
      dismissedAt: new Date(),
      // keep confirmedAt; a user could dismiss after confirming (optional)
    },
  });

  return requireMatch(propertyId, matchId);
}

export async function resolveRecallMatch(params: {
  propertyId: string;
  matchId: string;
  resolutionType: RecallResolutionType;
  resolutionNotes?: string | null;
}) {
  const { propertyId, matchId } = params;
  const existing = await requireMatch(propertyId, matchId);

  await prisma.recallMatch.update({
    where: { id: matchId },
    data: {
      status: RecallMatchStatus.RESOLVED,
      resolvedAt: new Date(),
      resolutionType: params.resolutionType,
      resolutionNotes: params.resolutionNotes || null,

      // ✅ important corrections:
      dismissedAt: null, // resolving implies it's not dismissed
      // confirmedAt: keep it if it exists; set if missing (optional but nice)
      confirmedAt: existing.confirmedAt ?? new Date(),
    },
  });

  return requireMatch(propertyId, matchId);
}
