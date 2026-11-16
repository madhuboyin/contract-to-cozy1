import { Prisma, WarrantyScopeKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { assertCanonicalWarrantyApplicability, type WarrantyApplicabilityInput } from './warrantyCanonicalModel';

export async function recordWarrantyApplicability(
  homeownerProfileId: string,
  warrantyId: string,
  input: WarrantyApplicabilityInput,
) {
  assertCanonicalWarrantyApplicability(input);
  const targetKey = input.inventoryItemId
    ? `ITEM:${input.inventoryItemId}`
    : input.inventoryCategory
      ? `CATEGORY:${input.inventoryCategory}`
      : `SYSTEM:${input.homeSystemType}`;
  return prisma.$transaction(async (tx) => {
    const warranty = await tx.warranty.findFirst({
      where: { id: warrantyId, homeownerProfileId, scopeKind: WarrantyScopeKind.PROPERTY_PLAN },
      select: { id: true, propertyId: true },
    });
    if (!warranty?.propertyId) throw new Error('Whole-home warranty plan not found for this homeowner.');
    if (input.inventoryItemId) {
      const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, propertyId: warranty.propertyId }, select: { id: true } });
      if (!item) throw new Error('Warranty applicability item does not belong to this property.');
    }
    return tx.warrantyApplicability.upsert({
      where: { warrantyId_targetKey: { warrantyId, targetKey } },
      create: {
        propertyId: warranty.propertyId,
        warrantyId,
        targetKey,
        scope: input.scope as never,
        status: input.status as never,
        inventoryItemId: input.inventoryItemId ?? null,
        inventoryCategory: (input.inventoryCategory as never) ?? null,
        homeSystemType: input.homeSystemType ?? null,
        evidenceSource: input.evidenceSource ?? null,
        evidenceJson: input.evidenceJson ?? undefined,
      },
      update: {
        scope: input.scope as never,
        status: input.status as never,
        inventoryCategory: (input.inventoryCategory as never) ?? null,
        homeSystemType: input.homeSystemType ?? null,
        evidenceSource: input.evidenceSource ?? null,
        evidenceJson: input.evidenceJson === null ? Prisma.JsonNull : input.evidenceJson,
      },
    });
  });
}

export async function removeWarrantyApplicability(homeownerProfileId: string, warrantyId: string, applicabilityId: string): Promise<void> {
  const deleted = await prisma.warrantyApplicability.deleteMany({
    where: { id: applicabilityId, warrantyId, warranty: { homeownerProfileId } },
  });
  if (deleted.count !== 1) throw new Error('Warranty applicability record not found for this homeowner.');
}

export async function resolvePropertyPlanApplicabilityForItem(propertyId: string, inventoryItemId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: inventoryItemId, propertyId },
    select: { id: true, category: true, assetType: true },
  });
  if (!item) throw new Error('Warranty applicability item does not belong to this property.');
  return prisma.warrantyApplicability.findMany({
    where: {
      propertyId,
      warranty: { propertyId, scopeKind: WarrantyScopeKind.PROPERTY_PLAN },
      OR: [
        { scope: 'INVENTORY_ITEM', inventoryItemId: item.id },
        { scope: 'INVENTORY_CATEGORY', inventoryCategory: item.category },
        ...(item.assetType ? [{ scope: 'HOME_SYSTEM' as const, homeSystemType: item.assetType }] : []),
      ],
    },
    include: { warranty: true },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });
}
