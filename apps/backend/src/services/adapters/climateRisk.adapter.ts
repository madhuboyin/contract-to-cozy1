// apps/backend/src/services/adapters/climateRisk.adapter.ts
import { TTLCache } from '../cache/ttlCache';

export type ClimatePressure = {
  pressureScore: number; // 0..100 “repricing sensitivity”
  label: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

const cache = new TTLCache<ClimatePressure>(24 * 60 * 60 * 1000);

/**
 * Phase-2: Replace ZIP-prefix proxy with “regional sensitivity”.
 * Without county/tract in DB yet, we anchor at state-level.
 * You can later upgrade by: ZIP -> county/tract -> FEMA NRI normalized.
 */
const STATE_PRESSURE: Record<string, { score: number; label: string }> = {
  FL: { score: 78, label: 'Higher repricing sensitivity (storm exposure tends to amplify swings).' },
  LA: { score: 76, label: 'Higher repricing sensitivity (storm exposure tends to amplify swings).' },
  CA: { score: 72, label: 'Higher repricing sensitivity (wildfire exposure can trigger repricing).' },
  TX: { score: 66, label: 'Moderate-high sensitivity (storm/hail regions can amplify swings).' },
  CO: { score: 64, label: 'Moderate sensitivity (hail/wildfire pockets can amplify swings).' },
  NJ: { score: 58, label: 'Moderate sensitivity (coastal exposure can amplify swings).' },
  NY: { score: 56, label: 'Moderate sensitivity (coastal exposure can amplify swings).' },
};

export function getClimatePressure(state: string): ClimatePressure {
  const s = String(state || '').toUpperCase().trim();
  return cache.getOrSet(`climate:${s}`, () => {
    const r = STATE_PRESSURE[s];
    if (!r) return { pressureScore: 45, label: 'Stable pricing environment (lower regional shock sensitivity).', confidence: 'LOW' };
    return { pressureScore: r.score, label: r.label, confidence: 'MEDIUM' };
  });
}
