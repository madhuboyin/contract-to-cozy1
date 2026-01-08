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

export async function confirmRecallMatch(matchId: string) {
  return prisma.recallMatch.update({
    where: { id: matchId },
    data: {
      status: RecallMatchStatus.OPEN,
      confirmedAt: new Date(),
      dismissedAt: null,
    },
  });
}

export async function dismissRecallMatch(matchId: string) {
  return prisma.recallMatch.update({
    where: { id: matchId },
    data: {
      status: RecallMatchStatus.DISMISSED,
      dismissedAt: new Date(),
    },
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

export async function resolveRecallMatch(params: {
  matchId: string;
  resolutionType: RecallResolutionType;
  resolutionNotes?: string | null;
}) {
  return prisma.recallMatch.update({
    where: { id: params.matchId },
    data: {
      status: RecallMatchStatus.RESOLVED,
      resolvedAt: new Date(),
      resolutionType: params.resolutionType,
      resolutionNotes: params.resolutionNotes || null,
    },
  });
}
