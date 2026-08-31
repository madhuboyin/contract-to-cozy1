// C2C Intelligence & Agentic Evolution — Phase 4A (§9.1 of the
// implementation plan; architecture §12.7). The Decision Platform family
// that backs generic-appliance repair-or-replace recommendations.
//
// Like the six configs in domainSnapshotAdapters.ts, this is a thin
// `loadSourceState` function passed to the shared
// createSnapshotDecisionFamilyAdapter factory — non-HVAC
// `ReplaceRepairAnalysis` already IS the authoritative appliance
// evaluation (replaceRepairAnalysis.service.ts persists its own
// verdict/confidence/impactLevel); this adapter snapshots that current
// state into a DecisionThread/RecommendationSnapshot, it never recomputes
// an independent verdict.
//
// HVAC is explicitly excluded here: architecture §12.5.1 assigns HVAC
// computation to evaluateHvacRepairReplace() (hvacDecisionFamilyAdapter in
// decisionThreadService.ts), and a generic `ReplaceRepairAnalysis.verdict`
// is non-authoritative for HVAC per ARD-003. An InventoryItem HVAC already
// owns must never also resolve non-null under APPLIANCE_REPAIR_REPLACE.
//
// IPD-006 was approved on 2026-08-29: this family is APPLIANCE-only. Water
// heaters and the other higher-risk system categories remain outside this
// family and must pass their own admission review before gaining a profile.

import type { ReplaceRepairVerdict } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { InventoryItemCategory } from '../../productFramework/intelligence/entityRef.contract';
import { isGenericApplianceRepairReplaceEligible } from '../repairReplaceEligibility';
import {
  createSnapshotDecisionFamilyAdapter,
  hashSourceState,
  type SnapshotDecisionFamilyAdapterDependencies,
  type SnapshotSourceState,
} from './snapshotDecisionFamilyAdapter';

// Reviewed IPD-006 boundary. `APPLIANCE` is the canonical low-risk appliance
// category. PLUMBING (including water heaters), ELECTRICAL, ROOF_EXTERIOR,
// and STRUCTURAL are deliberately not admitted by analogy.
export const APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES: readonly InventoryItemCategory[] = Object.freeze(['APPLIANCE']);

// Explicit table, not an inferred 1:1 — `ReplaceRepairVerdict` (4 values)
// and the Decision Platform verdict vocabulary are not the same shape, and
// a silent assumption here is exactly the kind of unreviewed mapping the
// architecture insists on avoiding (§14.2). Exhaustive over the Prisma
// enum; a new enum value fails the build here rather than defaulting.
// Approved under IPD-006 on 2026-08-29.
export const APPLIANCE_VERDICT_TO_DECISION_VERDICT: Readonly<Record<ReplaceRepairVerdict, 'REPAIR' | 'REPLACE'>> = Object.freeze({
  REPLACE_NOW: 'REPLACE',
  REPLACE_SOON: 'REPLACE',
  REPAIR_AND_MONITOR: 'REPAIR',
  REPAIR_ONLY: 'REPAIR',
});

export function mapApplianceVerdictToDecisionVerdict(verdict: ReplaceRepairVerdict): 'REPAIR' | 'REPLACE' {
  return APPLIANCE_VERDICT_TO_DECISION_VERDICT[verdict];
}

export async function loadApplianceRepairReplaceSourceState(
  propertyId: string,
  primaryEntityId: string, // an InventoryItem id — the same identity HVAC's adapter uses
  db: Pick<typeof prisma, 'replaceRepairAnalysis'> = prisma,
): Promise<SnapshotSourceState | null> {
  const analysis = await db.replaceRepairAnalysis.findFirst({
    where: {
      propertyId,
      inventoryItemId: primaryEntityId,
      status: 'READY',
      currentMarker: 'CURRENT',
      inventoryItem: { category: { in: [...APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES] } },
    },
    orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, verdict: true, confidence: true, impactLevel: true, summary: true,
      ageYears: true, remainingYears: true, estimatedNextRepairCostCents: true,
      estimatedReplacementCostCents: true, breakEvenMonths: true, updatedAt: true,
      inventoryItem: { select: { name: true, category: true } },
    },
  });
  if (!analysis || !isGenericApplianceRepairReplaceEligible(analysis.inventoryItem)) return null;

  const verdictCode = mapApplianceVerdictToDecisionVerdict(analysis.verdict);
  const itemName = analysis.inventoryItem?.name?.trim() || 'this appliance';

  return {
    title: `Repair or replace ${itemName}`,
    goalCode: 'APPLIANCE_REPAIR_REPLACE_DECISION',
    verdictCode,
    reasonCodes: [
      `SOURCE_VERDICT_${analysis.verdict}`,
      `CONFIDENCE_${analysis.confidence}`,
      `IMPACT_${analysis.impactLevel ?? 'UNKNOWN'}`,
    ],
    confidenceBreakdown: {
      label: analysis.confidence,
      impactLevel: analysis.impactLevel,
      remainingYears: analysis.remainingYears,
      breakEvenMonths: analysis.breakEvenMonths,
    },
    // Only the fields a changed recommendation would actually change —
    // field-scoped, not a full-object hash (same rationale as the other
    // snapshot families' digests).
    inputDigest: hashSourceState({
      id: analysis.id,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      impactLevel: analysis.impactLevel,
      ageYears: analysis.ageYears,
      remainingYears: analysis.remainingYears,
      estimatedNextRepairCostCents: analysis.estimatedNextRepairCostCents,
      estimatedReplacementCostCents: analysis.estimatedReplacementCostCents,
      breakEvenMonths: analysis.breakEvenMonths,
      updatedAt: analysis.updatedAt.toISOString(),
    }),
    // ReplaceRepairAnalysis.id is preserved as durable snapshot provenance,
    // the same way homeCapitalTimelineWindowDecisionFamilyAdapter points
    // canonicalFactReferences at the inventory item it derives from.
    canonicalFactReferences: [
      { entityType: 'REPLACE_REPAIR_ANALYSIS', entityId: analysis.id },
      { entityType: 'INVENTORY_ITEM', entityId: primaryEntityId, fieldPath: 'condition' },
    ],
  };
}

export function createApplianceDecisionFamilyAdapter(
  dependencies: SnapshotDecisionFamilyAdapterDependencies & {
    sourceDb?: Pick<typeof prisma, 'replaceRepairAnalysis'>;
    loadSourceState?: (propertyId: string, primaryEntityId: string) => Promise<SnapshotSourceState | null>;
  } = {},
) {
  return createSnapshotDecisionFamilyAdapter({
    decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE',
    primaryEntityType: 'InventoryItem',
    recommendationDefinitionVersion: '1.0',
    engineVersion: 'replace-repair-analysis-v1',
    contextContractVersion: '1.0',
    loadSourceState: dependencies.loadSourceState ?? ((propertyId, primaryEntityId) => loadApplianceRepairReplaceSourceState(
      propertyId, primaryEntityId, dependencies.sourceDb,
    )),
  }, dependencies);
}

export const applianceDecisionFamilyAdapter = createApplianceDecisionFamilyAdapter();
