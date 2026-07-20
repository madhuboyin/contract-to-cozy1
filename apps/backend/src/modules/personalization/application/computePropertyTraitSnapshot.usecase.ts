// apps/backend/src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts
//
// Computes the current non-sensitive property traits used by the reviewed
// catalog and persists only their latest values. The evaluator records the
// complete input/evidence snapshot in PersonalizationEvaluationRun.resultJson.
import { TraitReading } from '../domain/evaluator';
import {
  deriveDryerVentCleaningOverdue,
  deriveDryerVentDaysSinceServiced,
  deriveHvacFilterDaysSinceServiced,
  deriveHvacFilterReplacementOverdue,
  deriveRoofReplacementOverdue,
  deriveRoofAgeYears,
  deriveSmokeDetectorBatteryOverdue,
  deriveSmokeDetectorBatteryDaysSinceServiced,
  deriveSmokeDetectorMissing,
} from '../domain/traits';
import {
  loadPropertyTraitFactsFromContext,
  persistDerivedTraits,
} from '../infrastructure/propertyTraitRepository';

export type ComputePropertyTraitSnapshotStatus = 'COMPLETED' | 'FAILED';

export interface ComputePropertyTraitSnapshotResult {
  status: ComputePropertyTraitSnapshotStatus;
  errorCode?: 'PROPERTY_NOT_FOUND';
  contextVersion?: string;
  traits?: Record<string, TraitReading>;
}

export async function computePropertyTraitSnapshot(
  propertyId: string,
  actorUserId?: string,
): Promise<ComputePropertyTraitSnapshotResult> {
  const facts = await loadPropertyTraitFactsFromContext(propertyId, actorUserId);
  if (!facts) {
    return { status: 'FAILED', errorCode: 'PROPERTY_NOT_FOUND' };
  }

  const traits: Record<string, TraitReading> = {
    hvacFilterReplacementOverdue: deriveHvacFilterReplacementOverdue(facts.inventoryItems),
    smokeDetectorMissing: deriveSmokeDetectorMissing(facts),
    roofReplacementOverdue: deriveRoofReplacementOverdue(facts),
    // Scoring input, not an eligibility trait — no rule AST references this key.
    hvacFilterDaysSinceServiced: deriveHvacFilterDaysSinceServiced(facts.inventoryItems),
    smokeDetectorBatteryOverdue: deriveSmokeDetectorBatteryOverdue(facts, facts.inventoryItems),
    smokeDetectorBatteryDaysSinceServiced: deriveSmokeDetectorBatteryDaysSinceServiced(facts, facts.inventoryItems),
    dryerVentCleaningOverdue: deriveDryerVentCleaningOverdue(facts.inventoryItems),
    dryerVentDaysSinceServiced: deriveDryerVentDaysSinceServiced(facts.inventoryItems),
    roofAgeYears: deriveRoofAgeYears(facts),
  };

  await persistDerivedTraits(
    propertyId,
    Object.entries(traits).map(([traitKey, reading]) => ({
      traitKey,
      known: reading.known,
      value: reading.known ? reading.value : undefined,
    })),
  );

  return { status: 'COMPLETED', contextVersion: facts.contextVersion, traits };
}
