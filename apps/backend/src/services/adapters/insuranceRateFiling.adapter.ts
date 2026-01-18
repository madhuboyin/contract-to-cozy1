// apps/backend/src/services/adapters/insuranceRateFiling.adapter.ts
import { TTLCache } from '../cache/ttlCache';

export type InsuranceShockType =
  | 'INFLATIONARY_DRIFT'
  | 'CATASTROPHE_REPRICING'
  | 'INSURER_CHURN_SHOCK';

export type InsuranceStepEvent = {
  year: number;
  yoyPct: number; // +18.4 means +18.4%
  kind: InsuranceShockType;
  description: string;
};

const cache = new TTLCache<InsuranceStepEvent[]>(6 * 60 * 60 * 1000);

function isCatState(state: string) {
  const s = String(state || '').toUpperCase().trim();
  return ['FL', 'LA', 'CA', 'TX', 'CO'].includes(s);
}

/**
 * Phase-2: Identify “step-change years” and classify.
 * This does NOT call external DOI APIs yet; it prepares the adapter boundary.
 */
export function detectInsuranceStepEvents(state: string, yoySeriesPct: Array<{ year: number; yoyInsurancePct: number | null }>) {
  const key = `insStep:${state}:${yoySeriesPct.map((x) => `${x.year}:${x.yoyInsurancePct ?? 'n'}`).join('|')}`;
  return cache.getOrSet(key, () => {
    const out: InsuranceStepEvent[] = [];

    // Thresholds can be tuned
    const SHOCK = 15; // >=15% jump is a “shock”
    const DRIFT = 6;  // smaller drift zone

    const s = String(state || '').toUpperCase().trim();

    for (let i = 0; i < yoySeriesPct.length; i++) {
      const p = yoySeriesPct[i]?.yoyInsurancePct;
      const year = yoySeriesPct[i]?.year;
      if (!year || p == null) continue;

      if (p >= SHOCK) {
        // classify shock
        const prev = yoySeriesPct[i - 1]?.yoyInsurancePct ?? null;
        const next = yoySeriesPct[i + 1]?.yoyInsurancePct ?? null;

        let kind: InsuranceShockType = 'INFLATIONARY_DRIFT';
        let desc = 'Insurance repricing shock (large year-over-year jump).';

        if (isCatState(s)) {
          kind = 'CATASTROPHE_REPRICING';
          desc = 'Catastrophe-driven repricing pattern (large jump in a shock-sensitive state).';
        }
        if (prev != null && prev < 0 && next != null && next < 0) {
          kind = 'INSURER_CHURN_SHOCK';
          desc = 'Insurer churn / re-entry pattern (jump followed by pullback).';
        }

        out.push({ year, yoyPct: p, kind, description: desc });
        continue;
      }

      // optional: drift tagging (not an “event”, but useful for narrative later)
      if (p >= DRIFT) {
        // no-op for now; keep calm UI with only shock flags
      }
    }

    return out;
  });
}
