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
import { MortgageRateService } from '@worker-shared/refinanceRadar/engine/mortgageRate.service';
import { logger, AppLogger } from '../lib/logger';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';

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
  /** Present when this run was manually/admin-triggered (W6 item 3) — lets a smoke run's writes be found and cleaned up by exact ID. */
  smokeCorrelationId?: string;
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

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern). fetchFredSeries is
// injected as a plain function reference — it imports node-fetch directly
// (not the global fetch), so a genuine require() of this job needs it
// substitutable the same way iterateAllProperties/getPropertyGeo are in
// freezeRiskIncidents.job.ts, rather than relying on a require.cache swap
// of the node-fetch package itself.
export interface IngestMortgageRatesDeps {
  fetchFredSeries: typeof fetchFredSeries;
  mortgageRateService: Pick<MortgageRateService, 'ingestSnapshot'>;
  logger: AppLogger;
}

const defaultDeps: IngestMortgageRatesDeps = { fetchFredSeries, mortgageRateService, logger };

export async function ingestMortgageRatesJob(
  opts?: { dryRun?: boolean },
  deps: IngestMortgageRatesDeps = defaultDeps,
): Promise<MortgageRateIngestResult> {
  const { fetchFredSeries, mortgageRateService, logger } = deps;
  const dryRun = opts?.dryRun === true;
  // Only a manual/admin trigger ever calls this with `opts` at all — the
  // nightly scheduled tick invokes every CRON_HANDLERS entry with zero
  // arguments (see scheduleCronJobs() in worker.ts). mortgage-rate-ingest
  // isn't property-scoped, so (unlike the two property-scoped W6 jobs)
  // there's no propertyId to key tagging off — "was this a manual trigger"
  // is the next best signal, and tagging every manually-triggered real
  // write (not just literal smoke runs) is harmless since the job is
  // already idempotent per (source, date).
  const smokeCorrelationId = opts !== undefined ? generateSmokeCorrelationId('mortgage-rate-ingest') : undefined;
  const fredApiKey = process.env.FRED_API_KEY?.trim();

  // ── Attempt 1: FRED API ──────────────────────────────────────────────────
  if (fredApiKey) {
    try {
      logger.info(`[MORTGAGE-RATE-INGEST] Fetching from FRED API...${dryRun ? ' (dry run)' : ''}`);

      const [result30, result15] = await Promise.all([
        fetchFredSeries(FRED_30YR_SERIES, fredApiKey),
        fetchFredSeries(FRED_15YR_SERIES, fredApiKey),
      ]);

      if (!result30) {
        logger.warn(`[MORTGAGE-RATE-INGEST] FRED returned no data for ${FRED_30YR_SERIES}`);
      } else if (!result15) {
        logger.warn(`[MORTGAGE-RATE-INGEST] FRED returned no data for ${FRED_15YR_SERIES}`);
      } else if (dryRun) {
        // The FRED fetch above is a harmless read — only the write needs
        // gating. Report exactly what a real run would have persisted.
        logger.info(
          `[MORTGAGE-RATE-INGEST] (dry run) Would ingest date=${result30.date} ` +
          `30yr=${result30.rate}% 15yr=${result15.rate}%`,
        );
        return {
          success: true,
          source: 'FRED',
          date: result30.date,
          rate30yr: result30.rate,
          rate15yr: result15.rate,
          created: false,
          skipped: true,
          reason: 'dry-run: no snapshot written',
        };
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
            ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
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
          smokeCorrelationId,
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

    if (dryRun) {
      logger.info(
        `[MORTGAGE-RATE-INGEST] (dry run) Would ingest manual-fallback date=${today} ` +
        `30yr=${rate30yrEnv}% 15yr=${rate15yrEnv}%`,
      );
      return {
        success: true,
        source: 'MANUAL',
        date: today,
        rate30yr: rate30yrEnv,
        rate15yr: rate15yrEnv,
        created: false,
        skipped: true,
        reason: 'dry-run: no snapshot written',
      };
    }

    const { snapshot, created } = await mortgageRateService.ingestSnapshot({
      date: today,
      rate30yr: rate30yrEnv,
      rate15yr: rate15yrEnv,
      source: 'MANUAL',
      sourceRef: 'env:MORTGAGE_RATE_30YR_FALLBACK+MORTGAGE_RATE_15YR_FALLBACK',
      metadataJson: { fetchedAt: new Date().toISOString(), ...(smokeCorrelationId ? { smokeCorrelationId } : {}) },
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
      smokeCorrelationId,
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
