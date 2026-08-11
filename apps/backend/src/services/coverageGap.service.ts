import { prisma } from '../lib/prisma';
import { isCoverageActive } from './coverage/contextPolicy';
import { visibleInventoryItemWhere } from './riskAssetApplicability';
import { buildInventoryCoveragePresentation } from './inventoryCoverageState.service';

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

export type CoverageReviewGroup = 'NO_COVERAGE' | 'COVERAGE_UNCLEAR' | 'EXPIRED' | 'EXPIRING_SOON' | 'EVIDENCE_MISSING';

export type CoverageReviewItem = {
  inventoryItemId: string;
  propertyId: string;
  itemName: string;
  itemCategory: string | null;
  roomName: string | null;
  group: CoverageReviewGroup;
  detail: string;
  missingContext: string[];
  exposureCents: number | null;
  replacementValueSource: 'RECORDED' | 'ESTIMATED' | null;
  currency: string;
  coverageSources: string[];
  expiryDate: Date | null;
  responsibilityScope: string | null;
  updatedAt: Date;
};

/**
 * Canonical coverage-review read model for homeowner-facing surfaces. Unlike
 * detectCoverageGaps, this intentionally preserves uncertainty and missing
 * evidence instead of collapsing the result to actionable uncovered items.
 */
export async function getCoverageReviewItems(propertyId: string): Promise<CoverageReviewItem[]> {
  const today = new Date();
  const [items, responsibilities] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { propertyId, ...visibleInventoryItemWhere() },
      include: {
        room: { select: { name: true } },
        warranty: { include: { documents: { where: { deletedAt: null }, select: { id: true } } } },
        insurancePolicy: { include: { documents: { where: { deletedAt: null }, select: { id: true } } } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }),
    prisma.propertyResponsibility.findMany({ where: { propertyId }, select: { scope: true, party: true } }),
  ]);

  return items.flatMap((item): CoverageReviewItem[] => {
    const presentation = buildInventoryCoveragePresentation(item, responsibilities, today);
    const threshold = item.category === 'APPLIANCE' ? APPLIANCE_THRESHOLD_CENTS : HIGH_VALUE_THRESHOLD_CENTS;
    const isMaterialCandidate = presentation.recordGroup === 'SYSTEMS_STRUCTURE'
      || item.category === 'APPLIANCE'
      || (presentation.effectiveReplacementCostCents ?? 0) >= threshold;
    if (!isMaterialCandidate || ['NOT_REQUIRED', 'MANAGED_ELSEWHERE'].includes(presentation.coverageState)) return [];

    const warrantyDocuments = item.warranty?.documents.length ?? 0;
    const insuranceDocuments = item.insurancePolicy?.documents.length ?? 0;
    const hasLinkedCoverage = Boolean(item.warranty || item.insurancePolicy);
    const soonBoundary = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    const activeExpiries = [
      item.warranty && isCoverageActive(item.warranty, propertyId, today) ? item.warranty.expiryDate : null,
      item.insurancePolicy && isCoverageActive(item.insurancePolicy, propertyId, today) ? item.insurancePolicy.expiryDate : null,
    ].filter((value): value is Date => Boolean(value));
    const expiresSoon = activeExpiries.some((date) => date <= soonBoundary);
    const group: CoverageReviewGroup | null = presentation.coverageState === 'MISSING'
      ? hasLinkedCoverage ? 'EXPIRED' : 'NO_COVERAGE'
      : presentation.coverageState === 'INCOMPLETE'
        ? 'COVERAGE_UNCLEAR'
        : presentation.coverageState === 'CONFIRMED' && expiresSoon
          ? 'EXPIRING_SOON'
        : presentation.coverageState === 'CONFIRMED' && warrantyDocuments + insuranceDocuments === 0
          ? 'EVIDENCE_MISSING'
          : null;
    if (!group) return [];

    const expiryDates = (activeExpiries.length ? activeExpiries : [item.warranty?.expiryDate, item.insurancePolicy?.expiryDate])
      .filter((value): value is Date => Boolean(value));
    const coverageSources = [
      item.warranty ? `Warranty · ${item.warranty.providerName}` : null,
      item.insurancePolicy ? `Insurance · ${item.insurancePolicy.carrierName}` : null,
    ].filter((value): value is string => Boolean(value));
    const updatedAt = [item.updatedAt, item.warranty?.updatedAt, item.insurancePolicy?.updatedAt]
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? item.updatedAt;

    return [{
      inventoryItemId: item.id,
      propertyId,
      itemName: presentation.displayName,
      itemCategory: item.category ? String(item.category) : null,
      roomName: item.room?.name ?? null,
      group,
      detail: group === 'EVIDENCE_MISSING'
        ? 'Active coverage is linked, but no supporting document is attached.'
        : group === 'EXPIRING_SOON'
          ? 'Linked coverage expires within the next 90 days.'
        : presentation.coverageStateDetail,
      missingContext: presentation.missingContext,
      exposureCents: presentation.effectiveReplacementCostCents,
      replacementValueSource: presentation.replacementValueSource,
      currency: item.currency || 'USD',
      coverageSources,
      expiryDate: expiryDates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      responsibilityScope: presentation.responsibilityScope,
      updatedAt,
    }];
  });
}

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

  const [items, responsibilities] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { propertyId, ...visibleInventoryItemWhere() },
      include: {
        room: { select: { name: true } },
        warranty: true,
        insurancePolicy: true,
      },
    }),
    prisma.propertyResponsibility.findMany({ where: { propertyId }, select: { scope: true, party: true } }),
  ]);

  const waived: WaivedCoverageResult[] = [];
  const results: CoverageGapResult[] = [];

  for (const item of items) {
    const presentation = buildInventoryCoveragePresentation(item, responsibilities, today);
    if (item.coverageNotRequired) {
      waived.push({
        inventoryItemId: item.id,
        propertyId,
        itemName: item.name,
        itemCategory: item.category ? String(item.category) : null,
        roomName: item.room?.name ?? null,
        exposureCents: presentation.effectiveReplacementCostCents ?? 0,
        currency: item.currency || 'USD',
      });
      continue;
    }

    const exposureCents = presentation.effectiveReplacementCostCents ?? 0;
    const threshold = item.category === 'APPLIANCE' ? APPLIANCE_THRESHOLD_CENTS : HIGH_VALUE_THRESHOLD_CENTS;
    if (presentation.coverageState !== 'MISSING' || !presentation.coverageActionable || exposureCents < threshold) continue;

    const itemCategory = item.category ? String(item.category) : null;
    const hasWarranty = !!item.warranty;
    const hasInsurance = !!item.insurancePolicy;

    const warrantyActive =
      hasWarranty && isCoverageActive(item.warranty as any, propertyId, today);
    const insuranceActive =
      hasInsurance && isCoverageActive(item.insurancePolicy as any, propertyId, today);

    const reasons: string[] = [];
    const currency = item.currency || 'USD';

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
