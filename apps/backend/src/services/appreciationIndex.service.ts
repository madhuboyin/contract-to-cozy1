// apps/backend/src/services/appreciationIndex.service.ts
import { TTLCache } from './cache/ttlCache';

/**
 * Phase-3: Real appreciation comps using FHFA HPI (repeat-sale index).
 * - No API keys required (FHFA-direct CSV download).
 * - Best-effort metro (MSA) match by city/state; fallback to State; fallback to US.
 * - Cached (24h) to keep endpoint fast after warm-up.
 */

export type AppreciationHorizonYears = 5 | 10 | 20 | 30;

export type AppreciationIndexResult = {
  source: 'FHFA';
  regionLevel: 'MSA' | 'STATE' | 'US';
  regionLabel: string; // e.g. "New York-Newark-Jersey City, NY-NJ-PA" or "New Jersey"
  seriesKey: string; // internal key: `MSA:35620` or `STATE:NJ` or `US:US`
  asOf: string; // "2025-11" (best effort from CSV yr/period)
  annualizedRatePct: number; // percent, e.g. 4.2
  annualizedRate: number; // decimal, e.g. 0.042
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  fallbackChain: string[];
  notes: string[];
};

type FHFARecord = {
  hpi_type: string;
  hpi_flavor: string;
  frequency: string;
  level: string;
  place_name: string;
  place_id: string;
  yr: number;
  period: number; // month number in monthly file
  index: number;
};

type SeriesPoint = { y: number; m: number; index: number };

const FHFA_MASTER_MONTHLY_URL = 'https://www.fhfa.gov/hpi/download/monthly/hpi_master.csv';

// 24h cache for the parsed dataset (big CSV)
const DATASET_CACHE = new TTLCache<{
  fetchedAt: number;
  // key -> series points sorted by time asc
  series: Map<string, { level: 'MSA' | 'STATE' | 'US'; label: string; points: SeriesPoint[] }>;
}>(24 * 60 * 60 * 1000);

function clean(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function safeNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Minimal CSV parsing (no deps) for FHFA master.
 * This CSV is large; we parse only the slices we care about:
 * - hpi_flavor: all-transactions
 * - hpi_type: traditional
 * - frequency: monthly
 * - level: MSA / State / USA
 */
function parseCsvLines(csv: string): string[][] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const out: string[][] = [];
  for (const line of lines) {
    // FHFA file uses quoted fields occasionally; keep simple but robust enough:
    // split on commas not inside quotes
    const row: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) {
        row.push(cur.replace(/^"|"$/g, '').trim());
        cur = '';
      } else cur += ch;
    }
    row.push(cur.replace(/^"|"$/g, '').trim());
    out.push(row);
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FHFA fetch failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

function seriesKeyFor(level: string, placeId: string) {
  const L = String(level || '').toUpperCase();
  if (L === 'MSA') return `MSA:${placeId}`;
  if (L === 'STATE') return `STATE:${placeId}`;
  // FHFA uses "USA" in the CSV level column for national
  return `US:US`;
}

function normalizeLevel(level: string): 'MSA' | 'STATE' | 'US' | null {
  const L = String(level || '').toUpperCase();
  if (L === 'MSA') return 'MSA';
  if (L === 'STATE') return 'STATE';
  if (L === 'USA' || L === 'US' || L === 'NATION') return 'US';
  return null;
}

function bestEffortAsOf(points: SeriesPoint[]) {
  const last = points[points.length - 1];
  const mm = String(last.m).padStart(2, '0');
  return `${last.y}-${mm}`;
}

function annualizedRateFromIndex(startIndex: number, endIndex: number, years: number) {
  if (!(startIndex > 0) || !(endIndex > 0) || years <= 0) return 0;
  const cagr = Math.pow(endIndex / startIndex, 1 / years) - 1;
  return Number.isFinite(cagr) ? cagr : 0;
}

function findIndexAtOrBefore(points: SeriesPoint[], targetY: number, targetM: number): SeriesPoint | null {
  // points sorted asc
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.y < targetY) return p;
    if (p.y === targetY && p.m <= targetM) return p;
  }
  return null;
}

function pickMetroCandidate(
  city: string,
  state: string,
  msaSeries: Array<{ key: string; label: string }>
): { key: string; label: string } | null {
  const c = clean(city);
  const st = String(state || '').toUpperCase().trim();
  if (!c || !st) return null;

  // 1) strict: city token present AND state token present in label
  const strict = msaSeries
    .map((s) => {
      const L = clean(s.label);
      const hasCity = L.includes(c);
      const hasState = s.label.toUpperCase().includes(st);
      const score = (hasCity ? 10 : 0) + (hasState ? 5 : 0) + Math.min(L.length / 50, 2);
      return { ...s, score };
    })
    .filter((x) => x.score >= 15)
    .sort((a, b) => b.score - a.score);

  if (strict.length) return { key: strict[0].key, label: strict[0].label };

  // 2) loose: city token present (no state requirement)
  const loose = msaSeries
    .map((s) => {
      const L = clean(s.label);
      const score = (L.includes(c) ? 10 : 0) + Math.min(L.length / 50, 2);
      return { ...s, score };
    })
    .filter((x) => x.score >= 10)
    .sort((a, b) => b.score - a.score);

  if (loose.length) return { key: loose[0].key, label: loose[0].label };

  return null;
}

async function loadFhfaDataset() {
  const cached = DATASET_CACHE.get('fhfa_master_monthly');
  if (cached) return cached;

  const csv = await fetchText(FHFA_MASTER_MONTHLY_URL);
  const rows = parseCsvLines(csv);
  if (rows.length < 2) throw new Error('FHFA CSV empty');

  const header = rows[0];
  const idx = (name: string) => header.indexOf(name);

  const i_hpi_type = idx('hpi_type');
  const i_hpi_flavor = idx('hpi_flavor');
  const i_frequency = idx('frequency');
  const i_level = idx('level');
  const i_place_name = idx('place_name');
  const i_place_id = idx('place_id');
  const i_yr = idx('yr');
  const i_period = idx('period');
  // The value column name can be "index" or "value" depending on FHFA version.
  const i_index = header.indexOf('index') >= 0 ? header.indexOf('index') : header.indexOf('value');

  const series = new Map<string, { level: 'MSA' | 'STATE' | 'US'; label: string; points: SeriesPoint[] }>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const hpiType = row[i_hpi_type];
    const flavor = row[i_hpi_flavor];
    const freq = row[i_frequency];
    const levelRaw = row[i_level];
    const level = normalizeLevel(levelRaw);
    if (!level) continue;

    // Filter: use the broad all-transactions repeat-sale index
    // - traditional, all-transactions, monthly is a good default for comps
    if (String(hpiType).toLowerCase() !== 'traditional') continue;
    if (String(flavor).toLowerCase() !== 'all-transactions') continue;
    if (String(freq).toLowerCase() !== 'monthly') continue;

    const placeName = row[i_place_name] || '';
    const placeId = row[i_place_id] || 'US';
    const yr = safeNum(row[i_yr]);
    const period = safeNum(row[i_period]);
    const val = safeNum(row[i_index]);

    if (yr === null || period === null || val === null) continue;

    const key = seriesKeyFor(levelRaw, placeId);
    const label =
      level === 'US'
        ? 'United States'
        : level === 'STATE'
          ? placeName
          : placeName;

    const hit = series.get(key);
    if (!hit) {
      series.set(key, { level, label, points: [{ y: yr, m: period, index: val }] });
    } else {
      hit.points.push({ y: yr, m: period, index: val });
    }
  }

  // Sort points
  for (const v of series.values()) {
    v.points.sort((a, b) => (a.y - b.y) || (a.m - b.m));
  }

  const payload = { fetchedAt: Date.now(), series };
  DATASET_CACHE.set('fhfa_master_monthly', payload);
  return payload;
}

export class AppreciationIndexService {
  /**
   * Returns an annualized appreciation rate for the requested horizon.
   * Best effort:
   *   - Try MSA match using city/state
   *   - Else State
   *   - Else US
   */
  async getAnnualizedAppreciation(opts: {
    city: string;
    state: string;
    zipCode?: string;
    years: AppreciationHorizonYears;
  }): Promise<AppreciationIndexResult> {
    const years = opts.years;
    const state = String(opts.state || '').toUpperCase().trim();
    const city = String(opts.city || '').trim();

    const notes: string[] = [];
    const fallbackChain: string[] = [];
    let confidence: AppreciationIndexResult['confidence'] = 'LOW';

    const ds = await loadFhfaDataset();

    const msaSeries: Array<{ key: string; label: string }> = [];
    const stateSeries: Array<{ key: string; label: string }> = [];

    for (const [k, v] of ds.series.entries()) {
      if (v.level === 'MSA') msaSeries.push({ key: k, label: v.label });
      if (v.level === 'STATE') stateSeries.push({ key: k, label: v.label });
    }

    // 1) MSA pick
    const metro = pickMetroCandidate(city, state, msaSeries);
    let chosen: { key: string; label: string; level: 'MSA' | 'STATE' | 'US' } | null = null;

    if (metro) {
      chosen = { key: metro.key, label: metro.label, level: 'MSA' };
      fallbackChain.push('Metro HPI (FHFA MSA)');
      confidence = 'MEDIUM';
    } else {
      notes.push('Could not confidently match a metro series for this city; using state-level HPI.');
    }

    // 2) State fallback
    if (!chosen) {
      const st = state;
      const stateKey = `STATE:${st}`;
      const s = ds.series.get(stateKey);
      if (s) {
        chosen = { key: stateKey, label: s.label || st, level: 'STATE' };
        fallbackChain.push('State HPI (FHFA)');
        confidence = 'MEDIUM';
      }
    }

    // 3) US fallback
    if (!chosen) {
      const usKey = 'US:US';
      const u = ds.series.get(usKey);
      if (u) {
        chosen = { key: usKey, label: 'United States', level: 'US' };
        fallbackChain.push('US HPI (FHFA)');
        confidence = 'LOW';
      }
    }

    if (!chosen) {
      // Should be very rare; dataset missing or parsing failed.
      return {
        source: 'FHFA',
        regionLevel: 'US',
        regionLabel: 'United States',
        seriesKey: 'US:US',
        asOf: new Date().toISOString(),
        annualizedRatePct: 0,
        annualizedRate: 0,
        confidence: 'LOW',
        fallbackChain: ['Heuristic fallback required'],
        notes: ['FHFA dataset unavailable; no appreciation comps could be derived.'],
      };
    }

    const series = ds.series.get(chosen.key);
    if (!series || series.points.length < 24) {
      notes.push('Insufficient FHFA series history; appreciation comps may be less reliable.');
      confidence = 'LOW';
    }

    const points = series?.points ?? [];
    const last = points[points.length - 1];
    const asOf = points.length ? bestEffortAsOf(points) : new Date().toISOString();

    // anchor end as last point; start = end minus horizon years (same month)
    const endY = last?.y ?? new Date().getFullYear();
    const endM = last?.m ?? new Date().getMonth() + 1;

    const startY = endY - years;
    const startP = findIndexAtOrBefore(points, startY, endM);

    if (!startP || !last) {
      notes.push('Could not align enough FHFA points for the requested horizon; falling back to conservative estimate.');
      confidence = 'LOW';
      return {
        source: 'FHFA',
        regionLevel: chosen.level,
        regionLabel: chosen.label,
        seriesKey: chosen.key,
        asOf,
        annualizedRatePct: 0,
        annualizedRate: 0,
        confidence,
        fallbackChain: fallbackChain.length ? fallbackChain : ['FHFA'],
        notes,
      };
    }

    const cagr = annualizedRateFromIndex(startP.index, last.index, years);
    const annualizedRate = clamp(cagr, -0.05, 0.20); // sanity clamp for tool stability
    const annualizedRatePct = Math.round(annualizedRate * 1000) / 10;

    // Confidence bump if metro matched
    if (chosen.level === 'MSA') confidence = 'HIGH';

    return {
      source: 'FHFA',
      regionLevel: chosen.level,
      regionLabel: chosen.label,
      seriesKey: chosen.key,
      asOf,
      annualizedRatePct,
      annualizedRate,
      confidence,
      fallbackChain,
      notes,
    };
  }
}
