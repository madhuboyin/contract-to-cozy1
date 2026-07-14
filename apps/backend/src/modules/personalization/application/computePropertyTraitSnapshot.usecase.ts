// apps/backend/src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts
//
// Migration step 3's trait-derivation half: computes every non-sensitive
// property trait for one property and persists DerivedTrait rows + a
// TraitSnapshot. See docs/personalization/adr-0002-phase1-foundation-migration-steps-1-3.md.
//
// Not exposed via any route or job yet — internal only, same posture as
// Phase 0's evaluateHvacFilterProof.usecase.ts. Nothing consumes a
// TraitSnapshot to produce a recommendation yet; that's catalog
// activation (migration steps 4-6), out of scope for this slice.
import { createHash } from 'crypto';
import { TraitReading } from '../domain/evaluator';
import {
  deriveHvacFilterDaysSinceServiced,
  deriveHvacFilterReplacementOverdue,
  deriveRoofReplacementOverdue,
  deriveSmokeDetectorBatteryOverdue,
  deriveSmokeDetectorMissing,
} from '../domain/traits';
import {
  loadHouseholdIdForProperty,
  loadPropertyTraitFacts,
  persistDerivedTraits,
  persistTraitSnapshot,
} from '../infrastructure/traitSnapshotRepository';

export type ComputePropertyTraitSnapshotStatus = 'COMPLETED' | 'FAILED';

export interface ComputePropertyTraitSnapshotResult {
  status: ComputePropertyTraitSnapshotStatus;
  errorCode?: 'PROPERTY_NOT_FOUND';
  traits?: Record<string, TraitReading>;
}

function traitsHashOf(traits: Record<string, TraitReading>): string {
  // Stable stringify: traits are inserted in a fixed key order below, so
  // JSON.stringify's own key order is already deterministic here.
  return createHash('sha256').update(JSON.stringify(traits)).digest('hex');
}

export async function computePropertyTraitSnapshot(
  propertyId: string,
): Promise<ComputePropertyTraitSnapshotResult> {
  const facts = await loadPropertyTraitFacts(propertyId);
  if (!facts) {
    return { status: 'FAILED', errorCode: 'PROPERTY_NOT_FOUND' };
  }

  const householdId = await loadHouseholdIdForProperty(propertyId);

  const traits: Record<string, TraitReading> = {
    hvacFilterReplacementOverdue: deriveHvacFilterReplacementOverdue(facts.homeAssets),
    smokeDetectorMissing: deriveSmokeDetectorMissing(facts),
    roofReplacementOverdue: deriveRoofReplacementOverdue(facts),
    // Scoring input, not an eligibility trait — no rule AST references this key.
    hvacFilterDaysSinceServiced: deriveHvacFilterDaysSinceServiced(facts.homeAssets),
    smokeDetectorBatteryOverdue: deriveSmokeDetectorBatteryOverdue(facts, facts.homeAssets),
  };

  await persistDerivedTraits(
    propertyId,
    householdId,
    Object.entries(traits).map(([traitKey, reading]) => ({
      traitKey,
      known: reading.known,
      value: reading.known ? reading.value : undefined,
    })),
  );

  await persistTraitSnapshot(propertyId, householdId, traits, traitsHashOf(traits));

  return { status: 'COMPLETED', traits };
}
