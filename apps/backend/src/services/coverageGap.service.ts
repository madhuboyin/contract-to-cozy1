import { prisma } from '../lib/prisma';

const HIGH_VALUE_THRESHOLD_CENTS = 150000;      // $1,500
const APPLIANCE_THRESHOLD_CENTS = 75000;        // $750  ✅ tune as needed

export type CoverageGapResult = {
  inventoryItemId: string;
  propertyId: string;

  itemName: string;
  roomName?: string | null;

  gapType:
    | 'NO_COVERAGE'
    | 'WARRANTY_ONLY'
    | 'INSURANCE_ONLY'
    | 'EXPIRED_WARRANTY'
    | 'EXPIRED_INSURANCE';

  exposureCents: number;
  currency: string;
  reasons: string[];
};

function isActive(expiryDate: Date | null | undefined, today: Date) {
  if (!expiryDate) return false;
  const d = new Date(expiryDate);
  if (Number.isNaN(d.getTime())) return false;
  return d > today;
}

export async function detectCoverageGaps(propertyId: string): Promise<CoverageGapResult[]> {
  const today = new Date();

  // ✅ Fetch:
  // - any item >= HIGH_VALUE threshold
  // - OR appliances >= APPLIANCE threshold
  const items = await prisma.inventoryItem.findMany({
    where: {
      propertyId,
      replacementCostCents: { not: null },
      OR: [
        { replacementCostCents: { gte: HIGH_VALUE_THRESHOLD_CENTS } },
        { category: 'APPLIANCE', replacementCostCents: { gte: APPLIANCE_THRESHOLD_CENTS } },
      ],
    },
    include: {
      room: { select: { name: true } },
      warranty: true,
      insurancePolicy: true,
    },
  });

  const results: CoverageGapResult[] = [];

  for (const item of items) {
    const hasWarranty = !!item.warranty;
    const hasInsurance = !!item.insurancePolicy;

    const warrantyActive = hasWarranty && isActive(item.warranty?.expiryDate as any, today);
    const insuranceActive = hasInsurance && isActive(item.insurancePolicy?.expiryDate as any, today);

    const reasons: string[] = [];
    const currency = item.currency || 'USD';
    const exposureCents = item.replacementCostCents ?? 0;

    // 1) No coverage at all
    if (!hasWarranty && !hasInsurance) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        roomName: item.room?.name ?? null,
        gapType: 'NO_COVERAGE',
        exposureCents,
        currency,
        reasons: ['No warranty or insurance coverage found'],
      });
      continue;
    }

    // 2) Expired coverage (even if present)
    if (hasWarranty && !warrantyActive) reasons.push('Warranty has expired');
    if (hasInsurance && !insuranceActive) reasons.push('Insurance policy has expired');

    // 3) Warranty only (active warranty, missing/expired insurance)
    if (warrantyActive && (!hasInsurance || !insuranceActive)) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        roomName: item.room?.name ?? null,
        gapType: hasInsurance ? 'EXPIRED_INSURANCE' : 'WARRANTY_ONLY',
        exposureCents,
        currency,
        reasons: hasInsurance ? reasons : ['Missing insurance coverage'],
      });
      continue;
    }

    // 4) Insurance only (active insurance, missing/expired warranty)
    if (insuranceActive && (!hasWarranty || !warrantyActive)) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        roomName: item.room?.name ?? null,
        gapType: hasWarranty ? 'EXPIRED_WARRANTY' : 'INSURANCE_ONLY',
        exposureCents,
        currency,
        reasons: hasWarranty ? reasons : ['Missing warranty coverage'],
      });
      continue;
    }

    // 5) Both exist but at least one expired (covers "both expired" too)
    if (!warrantyActive || !insuranceActive) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        roomName: item.room?.name ?? null,
        gapType: !warrantyActive ? 'EXPIRED_WARRANTY' : 'EXPIRED_INSURANCE',
        exposureCents,
        currency,
        reasons: reasons.length ? reasons : ['Coverage is not active'],
      });
    }
  }

  return results;
}
