// apps/backend/src/services/adapters/taxCadence.adapter.ts
import { TTLCache } from '../cache/ttlCache';

export type TaxCadenceProfile = {
  cadenceType: 'ANNUAL' | 'MULTI_YEAR' | 'MIXED';
  cycleYears: number; // typical reassessment interval (heuristic but anchored)
  pressureScore: number; // 0..100 (step-change risk)
  label: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

const cache = new TTLCache<TaxCadenceProfile>(24 * 60 * 60 * 1000);

/**
 * Phase-2: “cadence-aware” mapping.
 * NOTE: This is intentionally small + conservative; expand over time with county rules tables.
 */
const STATE_CADENCE: Record<string, Omit<TaxCadenceProfile, 'confidence'>> = {
  NJ: { cadenceType: 'MIXED', cycleYears: 3, pressureScore: 78, label: 'Reassessments can create step-changes (NJ is known for resets).' },
  NY: { cadenceType: 'MIXED', cycleYears: 3, pressureScore: 74, label: 'Reassessments can create step-changes (local resets vary).' },
  IL: { cadenceType: 'MULTI_YEAR', cycleYears: 3, pressureScore: 72, label: 'Multi-year reassessment cycles can create step changes.' },
  PA: { cadenceType: 'MIXED', cycleYears: 4, pressureScore: 70, label: 'Reassessments can be infrequent, creating resets.' },
  CA: { cadenceType: 'ANNUAL', cycleYears: 1, pressureScore: 42, label: 'Annual adjustments tend to be smoother (caps can still cause jumps).' },
  TX: { cadenceType: 'ANNUAL', cycleYears: 1, pressureScore: 55, label: 'Annual reassessments; exemptions and growth can still cause jumps.' },
  FL: { cadenceType: 'ANNUAL', cycleYears: 1, pressureScore: 52, label: 'Annual reassessments; caps/exemptions can cause step patterns.' },
  MA: { cadenceType: 'ANNUAL', cycleYears: 1, pressureScore: 48, label: 'Annual reassessments tend to be smoother.' },
};

export function getTaxCadenceProfile(state: string): TaxCadenceProfile {
  const s = String(state || '').toUpperCase().trim();
  return cache.getOrSet(`taxCadence:${s}`, () => {
    const base = STATE_CADENCE[s];
    if (!base) {
      return {
        cadenceType: 'ANNUAL',
        cycleYears: 1,
        pressureScore: 45,
        label: 'Annual adjustments tend to be smoother; local policy can still create jumps.',
        confidence: 'LOW',
      };
    }
    return { ...base, confidence: 'MEDIUM' };
  });
}
