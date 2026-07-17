// apps/backend/src/services/recalls.service.ts
import { prisma } from '../lib/prisma';
import { RecallMatchStatus, RecallResolutionType } from '@prisma/client';

function withRecallApplicability<T extends {
  status: RecallMatchStatus;
  confirmedAt: Date | null;
  confidencePct: number;
  recall: { status: string };
  inventoryItem?: { isVerified?: boolean; manufacturer?: string | null; modelNumber?: string | null } | null;
}>(match: T) {
  const reasonCodes: string[] = [];
  let status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  if (match.status === RecallMatchStatus.RESOLVED) {
    status = 'NOT_APPLICABLE';
    reasonCodes.push('RECALL_RESOLVED');
  } else if (match.status === RecallMatchStatus.DISMISSED || match.recall.status !== 'ACTIVE') {
    status = 'NOT_APPLICABLE';
    reasonCodes.push(match.status === RecallMatchStatus.DISMISSED ? 'RECALL_DISMISSED' : 'RECALL_ENDED');
  } else if (match.status === RecallMatchStatus.NEEDS_CONFIRMATION) {
    status = 'UNKNOWN';
    reasonCodes.push('ITEM_IDENTITY_CONFIRMATION_REQUIRED');
  } else if (
    match.confirmedAt ||
    (match.confidencePct >= 90 && match.inventoryItem?.isVerified && match.inventoryItem.manufacturer && match.inventoryItem.modelNumber)
  ) {
    status = 'APPLICABLE';
    reasonCodes.push(match.confirmedAt ? 'USER_CONFIRMED_RECALL_MATCH' : 'VERIFIED_EXACT_ITEM_MATCH');
  } else {
    status = 'UNKNOWN';
    reasonCodes.push('ITEM_IDENTITY_UNVERIFIED');
  }
  return {
    ...match,
    applicability: {
      status,
      reasonCodes,
      usedFactKeys: ['recalls.unresolvedMatches', 'inventory.items'],
      missingFactKeys: status === 'UNKNOWN' ? ['inventory.itemIdentityVerification'] : [],
      conflictedFactKeys: [],
      validUntil: null,
    },
  };
}

export async function listPropertyRecallMatches(propertyId: string) {
  const matches = await prisma.recallMatch.findMany({
    where: { propertyId },
    include: {
      recall: true,
      inventoryItem: true,
      homeAsset: true,
      maintenanceTask: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return matches.map(withRecallApplicability);
}

export async function listInventoryItemRecallMatches(propertyId: string, itemId: string) {
  const matches = await prisma.recallMatch.findMany({
    where: { propertyId, inventoryItemId: itemId },
    include: {
      recall: true,
      maintenanceTask: true,
      inventoryItem: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return matches.map(withRecallApplicability);
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
  const existing = await requireMatch(propertyId, matchId);
  if (existing.status === RecallMatchStatus.RESOLVED) {
    throw Object.assign(new Error('Resolved recall matches cannot be reopened'), { statusCode: 409, code: 'RECALL_ALREADY_RESOLVED' });
  }

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
  const existing = await requireMatch(propertyId, matchId);
  if (existing.status === RecallMatchStatus.RESOLVED) {
    throw Object.assign(new Error('Resolved recall matches cannot be dismissed'), { statusCode: 409, code: 'RECALL_ALREADY_RESOLVED' });
  }

  await prisma.recallMatch.update({
    where: { id: matchId },
    data: {
      status: RecallMatchStatus.DISMISSED,
      dismissedAt: new Date(),
      // keep confirmedAt; a user could dismiss after confirming (optional)
    },
  });

  if (existing.maintenanceTaskId) {
    await prisma.propertyMaintenanceTask.updateMany({
      where: { id: existing.maintenanceTaskId, propertyId, status: { not: 'COMPLETED' } },
      data: { status: 'CANCELLED' },
    });
  }

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

  if (existing.maintenanceTaskId) {
    await prisma.propertyMaintenanceTask.updateMany({
      where: { id: existing.maintenanceTaskId, propertyId },
      data: { status: 'COMPLETED', lastCompletedDate: new Date() },
    });
  }

  return requireMatch(propertyId, matchId);
}
