import type { TraitReading } from './evaluator';

export type PriorityBand = 'LOW' | 'MEDIUM' | 'HIGH';

/** Maps the small code-owned personalization score to a display priority. */
export function priorityBandFromScore(score: number): PriorityBand {
  if (score >= 70) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

function numericTrait(traits: Record<string, TraitReading> | undefined, key: string): number | null {
  const reading = traits?.[key];
  return reading?.known && typeof reading.value === 'number' ? reading.value : null;
}

/**
 * Bounded, code-reviewed property scoring. Eligibility remains entirely in
 * the catalog rule; this only orders already-eligible recommendations.
 */
export function scoreDefinitionForProperty(
  definitionCode: string,
  defaultScore: number,
  traits: Record<string, TraitReading> | undefined,
): number {
  if (definitionCode !== 'hvac_filter_replacement_check_proof') return defaultScore;

  const days = numericTrait(traits, 'hvacFilterDaysSinceServiced');
  if (days === null || days < 180) return defaultScore;
  if (days < 365) return Math.min(defaultScore + 2, 69);
  return Math.min(defaultScore + 4, 69);
}

export function buildPropertyFactSummary(
  definitionCode: string,
  traits: Record<string, TraitReading> | undefined,
): string | null {
  const formats: Record<string, [string, string]> = {
    hvac_filter_replacement_check_proof: ['hvacFilterDaysSinceServiced', 'The recorded HVAC service date was {value} days ago.'],
    smoke_co_detector_battery_check: ['smokeDetectorBatteryDaysSinceServiced', 'The recorded detector check was {value} days ago.'],
    dryer_vent_cleaning_reminder: ['dryerVentDaysSinceServiced', 'The recorded dryer service date was {value} days ago.'],
    aging_roof_condition_review: ['roofAgeYears', 'The roof is approximately {value} years old based on the recorded replacement year.'],
  };
  if (definitionCode === 'smoke_detector_installation_review') {
    return 'Your Home Record currently says smoke detectors are not installed. Confirm or correct this detail.';
  }
  const format = formats[definitionCode];
  if (!format) return null;
  const value = numericTrait(traits, format[0]);
  return value === null ? null : format[1].replace('{value}', String(value));
}
