// apps/workers/src/jobs/ingestMortgageRates.job.ts
//
// Weekly mortgage rate ingestion job.
//
// Data source precedence:
//   1. FRED API (St. Louis Fed) — free, reliable, officially published weekly.
//      Requires FRED_API_KEY env var (free registration at fred.stlouisfed.org).
//      Series: MORTGAGE30US (30-year) and MORTGAGE15US (15-year).
//
//   2. Manual env var fallback — MORTGAGE_RATE_30YR_FALLBACK + MORTGAGE_RATE_15YR_FALLBACK.
//      Useful for local dev, demos, or when FRED is temporarily unreachable.
//
//   3. Skip — if neither source is configured or reachable, logs and exits cleanly
//      without crashing the worker. The radar will surface NO_RATE_DATA to users.
//
// Idempotent: MortgageRateService.ingestSnapshot() deduplicates on (source, date),
// so running this job multiple times on the same day is safe.

import fetch from 'node-fetch';
import { MortgageRateService } from '../../../backend/src/refinanceRadar/engine/mortgageRate.service';
import { logger } from '../lib/logger';

// ─── FRED API config ──────────────────────────────────────────────────────────

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_30YR_SERIES = 'MORTGAGE30US'; // Freddie Mac 30-Year Fixed-Rate Mortgage Average
const FRED_15YR_SERIES = 'MORTGAGE15US'; // Freddie Mac 15-Year Fixed-Rate Mortgage Average
const FRED_REQUEST_TIMEOUT_MS = 15_000;

interface FredObservation {
  date: string;   // YYYY-MM-DD
  value: string;  // rate as string, "." when data is missing
}

interface FredResponse {
  observations: FredObservation[];
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface MortgageRateIngestResult {
  success: boolean;
  source: 'FRED' | 'MANUAL' | 'NONE';
  date: string | null;
  rate30yr: number | null;
  rate15yr: number | null;
  created: boolean;   // false if snapshot already existed for this date
  skipped: boolean;
  reason?: string;
}

// ─── FRED fetch helper ────────────────────────────────────────────────────────

async function fetchFredSeries(
  seriesId: string,
  apiKey: string,
): Promise<{ date: string; rate: number } | null> {
  const url =
    `${FRED_BASE_URL}` +
    `?series_id=${seriesId}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&limit=1` +
    `&sort_order=desc` +
    `&file_type=json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FRED_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal as any });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`FRED API ${response.status} for series ${seriesId}: ${response.statusText}`);
  }

  const data = (await response.json()) as FredResponse;
  const latest = data.observations?.[0];

  // FRED returns "." for weeks with missing/preliminary data
  if (!latest || latest.value === '.' || latest.value === '') {
    return null;
  }

  const rate = parseFloat(latest.value);
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return { date: latest.date, rate };
}

// ─── Main job ─────────────────────────────────────────────────────────────────

const mortgageRateService = new MortgageRateService();

export async function ingestMortgageRatesJob(): Promise<MortgageRateIngestResult> {
  const fredApiKey = process.env.FRED_API_KEY?.trim();

  // ── Attempt 1: FRED API ──────────────────────────────────────────────────
  if (fredApiKey) {
    try {
      logger.info('[MORTGAGE-RATE-INGEST] Fetching from FRED API...');

      const [result30, result15] = await Promise.all([
        fetchFredSeries(FRED_30YR_SERIES, fredApiKey),
        fetchFredSeries(FRED_15YR_SERIES, fredApiKey),
      ]);

      if (!result30) {
        logger.warn(`[MORTGAGE-RATE-INGEST] FRED returned no data for ${FRED_30YR_SERIES}`);
      } else if (!result15) {
        logger.warn(`[MORTGAGE-RATE-INGEST] FRED returned no data for ${FRED_15YR_SERIES}`);
      } else {
        const { snapshot, created } = await mortgageRateService.ingestSnapshot({
          date: result30.date,   // both series report same survey date
          rate30yr: result30.rate,
          rate15yr: result15.rate,
          source: 'FRED',
          sourceRef: `FRED/${FRED_30YR_SERIES}+${FRED_15YR_SERIES}`,
          metadataJson: {
            fetchedAt: new Date().toISOString(),
            series30yr: FRED_30YR_SERIES,
            series15yr: FRED_15YR_SERIES,
          },
        });

        logger.info(
          `[MORTGAGE-RATE-INGEST] FRED ✓ — date=${snapshot.date} ` +
          `30yr=${snapshot.rate30yr}% 15yr=${snapshot.rate15yr}% ` +
          `${created ? '(new)' : '(already existed)'}`,
        );

        return {
          success: true,
          source: 'FRED',
          date: snapshot.date,
          rate30yr: snapshot.rate30yr,
          rate15yr: snapshot.rate15yr,
          created,
          skipped: false,
        };
      }
    } catch (err) {
      logger.warn(
        '[MORTGAGE-RATE-INGEST] FRED API fetch failed:',
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    logger.warn('[MORTGAGE-RATE-INGEST] FRED_API_KEY not set — skipping FRED fetch.');
  }

  // ── Attempt 2: Manual env var fallback ───────────────────────────────────
  const rate30yrEnv = parseFloat(process.env.MORTGAGE_RATE_30YR_FALLBACK ?? '');
  const rate15yrEnv = parseFloat(process.env.MORTGAGE_RATE_15YR_FALLBACK ?? '');

  if (Number.isFinite(rate30yrEnv) && rate30yrEnv > 0 &&
      Number.isFinite(rate15yrEnv) && rate15yrEnv > 0) {
    const today = new Date().toISOString().split('T')[0];

    const { snapshot, created } = await mortgageRateService.ingestSnapshot({
      date: today,
      rate30yr: rate30yrEnv,
      rate15yr: rate15yrEnv,
      source: 'MANUAL',
      sourceRef: 'env:MORTGAGE_RATE_30YR_FALLBACK+MORTGAGE_RATE_15YR_FALLBACK',
      metadataJson: { fetchedAt: new Date().toISOString() },
    });

    logger.info(
      `[MORTGAGE-RATE-INGEST] Manual fallback ✓ — date=${snapshot.date} ` +
      `30yr=${snapshot.rate30yr}% 15yr=${snapshot.rate15yr}% ` +
      `${created ? '(new)' : '(already existed)'}`,
    );

    return {
      success: true,
      source: 'MANUAL',
      date: snapshot.date,
      rate30yr: snapshot.rate30yr,
      rate15yr: snapshot.rate15yr,
      created,
      skipped: false,
    };
  }

  // ── Nothing worked ────────────────────────────────────────────────────────
  const reason = !fredApiKey
    ? 'Set FRED_API_KEY (free at fred.stlouisfed.org) or MORTGAGE_RATE_30YR_FALLBACK + MORTGAGE_RATE_15YR_FALLBACK.'
    : 'FRED API fetch failed. Set MORTGAGE_RATE_30YR_FALLBACK + MORTGAGE_RATE_15YR_FALLBACK as a fallback.';

  logger.warn(`[MORTGAGE-RATE-INGEST] No rate data ingested. ${reason}`);

  return {
    success: false,
    source: 'NONE',
    date: null,
    rate30yr: null,
    rate15yr: null,
    created: false,
    skipped: true,
    reason,
  };
}
