// apps/backend/src/services/insuranceAuditor.service.ts
import { prisma } from '../lib/prisma';

export type ProtectionGapResult = {
  propertyId: string;
  policyId: string | null;
  hasActivePolicy: boolean;
  isPolicyVerified: boolean;
  totalInventoryValueCents: number;
  personalPropertyLimitCents: number;
  deductibleCents: number;
  gapCents: number;
  underInsuredCents: number;
};

export async function getActiveInsurancePolicy(propertyId: string) {
  const now = new Date();

  return prisma.insurancePolicy.findFirst({
    where: {
      propertyId,
      startDate: { lte: now },
      expiryDate: { gte: now },
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getUnverifiedActiveInsurancePolicy(propertyId: string) {
  const policy = await getActiveInsurancePolicy(propertyId);
  if (!policy || policy.isVerified) return null;
  return policy;
}

export async function calculateProtectionGap(propertyId: string): Promise<ProtectionGapResult> {
  const [inventoryTotals, activePolicy] = await Promise.all([
    prisma.inventoryItem.aggregate({
      where: {
        propertyId,
        isVerified: true,
        replacementCostCents: { not: null },
      },
      _sum: {
        replacementCostCents: true,
      },
    }),
    getActiveInsurancePolicy(propertyId),
  ]);

  const totalInventoryValueCents = inventoryTotals._sum.replacementCostCents ?? 0;
  const personalPropertyLimitCents = activePolicy?.personalPropertyLimitCents ?? 0;
  const deductibleCents = activePolicy?.deductibleCents ?? 0;
  const gapCents = totalInventoryValueCents - personalPropertyLimitCents;
  const underInsuredCents = Math.max(0, gapCents);

  return {
    propertyId,
    policyId: activePolicy?.id ?? null,
    hasActivePolicy: Boolean(activePolicy),
    isPolicyVerified: activePolicy?.isVerified ?? false,
    totalInventoryValueCents,
    personalPropertyLimitCents,
    deductibleCents,
    gapCents,
    underInsuredCents,
  };
}
