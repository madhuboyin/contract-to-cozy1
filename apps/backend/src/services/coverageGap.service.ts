import { prisma } from '../lib/prisma';
import { isCoverageActive } from './coverage/contextPolicy';
import { visibleInventoryItemWhere } from './riskAssetApplicability';

const HIGH_VALUE_THRESHOLD_CENTS = 50000;       // $500
const APPLIANCE_THRESHOLD_CENTS = 25000;        // $250

export type CoverageGapResult = {
  inventoryItemId: string;
  propertyId: string;

  itemName: string;
  itemCategory?: string | null;
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

export type WaivedCoverageResult = {
  inventoryItemId: string;
  propertyId: string;
  itemName: string;
  itemCategory?: string | null;
  roomName?: string | null;
  exposureCents: number;
  currency: string;
};

export type CoverageGapDetectResult = {
  gaps: CoverageGapResult[];
  waived: WaivedCoverageResult[];
};

export async function detectCoverageGaps(propertyId: string): Promise<CoverageGapResult[]>;
export async function detectCoverageGaps(
  propertyId: string,
  opts: { includeWaived: true }
): Promise<CoverageGapDetectResult>;
export async function detectCoverageGaps(
  propertyId: string,
  opts?: { includeWaived?: boolean }
): Promise<CoverageGapResult[] | CoverageGapDetectResult> {
  const today = new Date();

  const items = await prisma.inventoryItem.findMany({
    where: {
      propertyId,
      ...visibleInventoryItemWhere(),
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

  const waived: WaivedCoverageResult[] = [];
  const results: CoverageGapResult[] = [];

  for (const item of items) {
    if (item.coverageNotRequired) {
      waived.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        itemCategory: item.category ? String(item.category) : null,
        roomName: item.room?.name ?? null,
        exposureCents: item.replacementCostCents ?? 0,
        currency: item.currency || 'USD',
      });
      continue;
    }

    const itemCategory = item.category ? String(item.category) : null;
    const hasWarranty = !!item.warranty;
    const hasInsurance = !!item.insurancePolicy;

    const warrantyActive =
      hasWarranty && isCoverageActive(item.warranty as any, propertyId, today);
    const insuranceActive =
      hasInsurance && isCoverageActive(item.insurancePolicy as any, propertyId, today);

    const reasons: string[] = [];
    const currency = item.currency || 'USD';
    const exposureCents = item.replacementCostCents ?? 0;

    // 1) No coverage at all
    if (!hasWarranty && !hasInsurance) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        itemCategory,
        roomName: item.room?.name ?? null,
        gapType: 'NO_COVERAGE',
        exposureCents,
        currency,
        reasons: ['No warranty or insurance coverage found'],
      });
      continue;
    }

    // 2) Expired coverage (even if present)
    if (hasWarranty && !warrantyActive) reasons.push('Warranty is not active for this property');
    if (hasInsurance && !insuranceActive) reasons.push('Insurance policy is not active for this property');

    // 3) Warranty only (active warranty, missing/expired insurance)
    if (warrantyActive && (!hasInsurance || !insuranceActive)) {
      results.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        itemCategory,
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
        itemCategory,
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
        itemCategory,
        roomName: item.room?.name ?? null,
        gapType: !warrantyActive ? 'EXPIRED_WARRANTY' : 'EXPIRED_INSURANCE',
        exposureCents,
        currency,
        reasons: reasons.length ? reasons : ['Coverage is not active'],
      });
    }
  }

  if (opts?.includeWaived) {
    return { gaps: results, waived };
  }
  return results;
}
