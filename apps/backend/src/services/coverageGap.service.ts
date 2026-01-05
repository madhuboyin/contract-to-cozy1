import { prisma } from '../lib/prisma';

const HIGH_VALUE_THRESHOLD_CENTS = 150000;

export type CoverageGapResult = {
  inventoryItemId: string;
  propertyId: string;
  gapType:
    | 'NO_COVERAGE'
    | 'WARRANTY_ONLY'
    | 'INSURANCE_ONLY'
    | 'EXPIRED_WARRANTY'
    | 'EXPIRED_INSURANCE';
  exposureCents: number;
  reasons: string[];
};

export async function detectCoverageGaps(propertyId: string): Promise<CoverageGapResult[]> {
  const today = new Date();

  const items = await prisma.inventoryItem.findMany({
    where: {
      propertyId,
      replacementCostCents: {
        gte: HIGH_VALUE_THRESHOLD_CENTS,
      },
    },
    include: {
      warranty: true,
      insurancePolicy: true,
    },
  });

  const results: CoverageGapResult[] = [];

  for (const item of items) {
    const hasWarranty = !!item.warranty;
    const hasInsurance = !!item.insurancePolicy;

    const warrantyActive =
      hasWarranty && item.warranty!.expiryDate > today;

    const insuranceActive =
      hasInsurance && item.insurancePolicy!.expiryDate > today;

    const reasons: string[] = [];

    if (!hasWarranty && !hasInsurance) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        gapType: 'NO_COVERAGE',
        exposureCents: item.replacementCostCents!,
        reasons: ['No warranty or insurance coverage found'],
      });
      continue;
    }

    if (hasWarranty && !warrantyActive) {
      reasons.push('Warranty has expired');
    }

    if (hasInsurance && !insuranceActive) {
      reasons.push('Insurance policy has expired');
    }

    if (hasWarranty && warrantyActive && !hasInsurance) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        gapType: 'WARRANTY_ONLY',
        exposureCents: item.replacementCostCents!,
        reasons: ['Warranty exists but no insurance coverage'],
      });
      continue;
    }

    if (hasInsurance && insuranceActive && !hasWarranty) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        gapType: 'INSURANCE_ONLY',
        exposureCents: item.replacementCostCents!,
        reasons: ['Insurance exists but no warranty coverage'],
      });
      continue;
    }

    if (!warrantyActive || !insuranceActive) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        gapType: !warrantyActive
          ? 'EXPIRED_WARRANTY'
          : 'EXPIRED_INSURANCE',
        exposureCents: item.replacementCostCents!,
        reasons,
      });
    }
  }

  return results;
}
