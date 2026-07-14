// apps/backend/src/modules/personalization/application/computePropertyTraitSnapshot.usecase.ts
//
// Computes the current non-sensitive property traits used by the reviewed
// catalog and persists only their latest values. The evaluator records the
// complete input/evidence snapshot in PersonalizationEvaluationRun.resultJson.
import { TraitReading } from '../domain/evaluator';
import {
  deriveDryerVentCleaningOverdue,
  deriveHvacFilterDaysSinceServiced,
  deriveHvacFilterReplacementOverdue,
  deriveRoofReplacementOverdue,
  deriveSmokeDetectorBatteryOverdue,
  deriveSmokeDetectorMissing,
} from '../domain/traits';
import { loadPropertyTraitFacts, persistDerivedTraits } from '../infrastructure/propertyTraitRepository';

export type ComputePropertyTraitSnapshotStatus = 'COMPLETED' | 'FAILED';

export interface ComputePropertyTraitSnapshotResult {
  status: ComputePropertyTraitSnapshotStatus;
  errorCode?: 'PROPERTY_NOT_FOUND';
  traits?: Record<string, TraitReading>;
}

export async function computePropertyTraitSnapshot(
  propertyId: string,
): Promise<ComputePropertyTraitSnapshotResult> {
  const facts = await loadPropertyTraitFacts(propertyId);
  if (!facts) {
    return { status: 'FAILED', errorCode: 'PROPERTY_NOT_FOUND' };
  }

  const traits: Record<string, TraitReading> = {
    hvacFilterReplacementOverdue: deriveHvacFilterReplacementOverdue(facts.homeAssets),
    smokeDetectorMissing: deriveSmokeDetectorMissing(facts),
    roofReplacementOverdue: deriveRoofReplacementOverdue(facts),
    // Scoring input, not an eligibility trait — no rule AST references this key.
    hvacFilterDaysSinceServiced: deriveHvacFilterDaysSinceServiced(facts.homeAssets),
    smokeDetectorBatteryOverdue: deriveSmokeDetectorBatteryOverdue(facts, facts.homeAssets),
    dryerVentCleaningOverdue: deriveDryerVentCleaningOverdue(facts.homeAssets),
  };

  await persistDerivedTraits(
    propertyId,
    Object.entries(traits).map(([traitKey, reading]) => ({
      traitKey,
      known: reading.known,
      value: reading.known ? reading.value : undefined,
    })),
  );

  return { status: 'COMPLETED', traits };
}
