// apps/workers/src/jobs/freezeRiskIncidents.job.ts
import { prisma } from '../lib/prisma';
import { IncidentStatus } from '@prisma/client';
import { IncidentService } from '@worker-shared/services/incidents/incident.service';
import { guidanceJourneyService } from '@worker-shared/services/guidanceEngine/guidanceJourney.service';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { logger } from '../lib/logger';
import { Geo } from '../lib/geocodeZip';
import { getPropertyGeo } from '../lib/propertyGeo';
import { iterateAllProperties } from '../lib/paginateProperties';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const OPEN_FREEZE_STATUSES: IncidentStatus[] = [
  IncidentStatus.DETECTED,
  IncidentStatus.EVALUATED,
  IncidentStatus.ACTIVE,
  IncidentStatus.ACTIONED,
  IncidentStatus.MITIGATED,
];

function scoreFromMinF(minF: number) {
  if (minF <= 15) return 85;
  if (minF <= 20) return 75;
  if (minF <= 27) return 60;
  return 0;
}

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

/**
 * Returns minimum forecast temp in °F in the next 36 hours for given lat/lon.
 * Uses Open-Meteo hourly temperature_2m.
 */
async function getForecastMinF(lat: number, lon: number): Promise<number | null> {
  const now = new Date();
  const end = new Date(now.getTime() + 36 * 3600 * 1000);

  // Open-Meteo expects dates. We'll request today..tomorrow and then slice to next 36h.
  const startDate = now.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      String(lat)
    )}&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=temperature_2m&temperature_unit=celsius&timezone=UTC&start_date=${startDate}&end_date=${endDate}`;

  // WKR (risk/weather/coverage W3 fix): a thrown fetch/JSON-parse exception
  // (network error, timeout, malformed body) used to propagate unhandled
  // out of this function and crash the whole job — every other property
  // in the run would be skipped too. Treat it the same as the existing
  // "no data" (null) path below, which the caller already handles
  // conservatively (skip that property, don't create or resolve anything).
  let json: any;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
      if (!res.ok) return null;
      json = await res.json();
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    logger.error({ err: error, lat, lon }, '[FREEZE-RISK] Forecast fetch failed');
    return null;
  }

  const times: string[] = json?.hourly?.time ?? [];
  const tempsC: number[] = json?.hourly?.temperature_2m ?? [];

  if (!Array.isArray(times) || !Array.isArray(tempsC) || times.length !== tempsC.length) return null;

  const nowMs = now.getTime();
  const endMs = end.getTime();

  let minF: number | null = null;

  for (let i = 0; i < times.length; i++) {
    const tMs = Date.parse(times[i] + 'Z'); // times are UTC like "2026-01-08T12:00"
    if (Number.isNaN(tMs)) continue;
    if (tMs < nowMs || tMs > endMs) continue;

    const f = cToF(tempsC[i]);
    if (minF == null || f < minF) minF = f;
  }

  // Round to 1 decimal for display
  return minF == null ? null : Math.round(minF * 10) / 10;
}

export async function freezeRiskIncidentsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
) {
  const dryRun = opts?.dryRun === true;
  // W6 item 5 (smoke validation): a scoped smoke run passes an explicit
  // propertyId — that property must itself be operator-allowlisted, so a
  // caller can't accidentally point a "safe" scoped run at a real
  // homeowner's property. The unscoped nightly sweep passes no propertyId
  // at all and is unaffected by this check.
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[FreezeRiskIncidents] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('freeze-risk-incidents') : undefined;

  let createdOrUpdated = 0;
  let resolved = 0;
  const now = new Date();

  // In-run cache so properties sharing an as-yet-uncached zip within this run
  // don't each trigger their own geocode call. getPropertyGeo also persists
  // resolved coordinates onto Property.latitude/longitude, so future runs
  // skip geocoding entirely for properties whose zip hasn't changed.
  const geoRunCache = new Map<string, Geo | null>();

  for await (const p of iterateAllProperties()) {
    if (opts?.propertyId && p.id !== opts.propertyId) continue;
    const zip = (p.zipCode ?? '').trim();
    if (!zip) continue;

    const geo = await getPropertyGeo(p, geoRunCache);
    if (!geo) continue;

    const minF = await getForecastMinF(geo.lat, geo.lon);
    if (minF == null) continue;

    // trigger: < 28F
    if (minF >= 28) {
      // Forecast no longer indicates freeze risk; resolve active/open freeze incidents.
      // Routed through IncidentService.setStatus (not a raw prisma update) so its
      // RESOLVED-transition hook archives the linked guidance journey/signal too.
      const openFreezeIncidents = await prisma.incident.findMany({
        where: {
          propertyId: p.id,
          sourceType: 'WEATHER',
          typeKey: 'FREEZE_RISK',
          isSuppressed: false,
          status: { in: OPEN_FREEZE_STATUSES },
        },
        select: { id: true },
      });
      for (const incident of openFreezeIncidents) {
        if (dryRun) {
          resolved++;
          logger.info(`[FreezeRiskIncidents] (dry run) Would resolve incident ${incident.id}`);
          continue;
        }
        await IncidentService.setStatus(incident.id, IncidentStatus.RESOLVED);
        resolved++;
      }
      continue;
    }

    const score = scoreFromMinF(minF);

    if (dryRun) {
      createdOrUpdated++;
      logger.info(`[FreezeRiskIncidents] (dry run) Would upsert freeze incident for property ${p.id} (minF=${minF})`);
      await sleep(200);
      continue;
    }

    await IncidentService.upsertIncident(
      {
        propertyId: p.id,
        userId: null,
        sourceType: 'WEATHER',
        typeKey: 'FREEZE_RISK',
        category: 'PLUMBING',
        title: 'Freeze Risk Detected',
        summary: `Forecast minimum temperature is ${minF}°F in the next 36 hours.`,
        details: {
          minF,
          timeWindowHours: 36,
          probabilityPct: 80,
          exposureUsd: 5000,
          geoHint: {
            zip,
            city: p.city ?? null,
            state: p.state ?? null,
            lat: geo.lat,
            lon: geo.lon,
            geoName: geo.name ?? null,
            admin1: geo.admin1 ?? null,
            country: geo.country ?? null,
          },
          mitigationLevel: 'NONE',
          provider: 'open-meteo',
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
        status: 'DETECTED',
        fingerprint: `property:${p.id}|FREEZE_RISK`,
        dedupeWindowMins: 24 * 60,
        severityScore: score,
        confidence: 70,
      },
      [
        {
          signalType: 'WEATHER_FORECAST_MIN_TEMP',
          externalRef: `open-meteo:${zip}`,
          observedAt: now.toISOString(),
          payload: { zip, minF, windowHours: 36, lat: geo.lat, lon: geo.lon },
          scoreHint: score,
          confidence: 70,
        },
      ]
    );

    createdOrUpdated++;

    try {
      await guidanceJourneyService.ingestSignal({
        propertyId: p.id,
        signalIntentFamily: 'freeze_risk',
        issueDomain: 'WEATHER',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        severity: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
        severityScore: score,
        confidenceScore: 0.70,
        sourceType: 'EXTERNAL',
        sourceFeatureKey: 'freeze-risk-incidents',
        sourceEntityType: 'INCIDENT',
        payloadJson: { minF, timeWindowHours: 36, zip, provider: 'open-meteo' },
        expiresAt: new Date(Date.now() + 36 * 60 * 60 * 1000),
      });
    } catch (guidanceError) {
      logger.warn({ err: guidanceError }, '[GUIDANCE] freeze risk signal ingest failed');
    }

    // Rate limit Open-Meteo API calls (free tier)
    await sleep(200);
  }

  // Safety net: resolve lingering stale freeze incidents that were not refreshed recently.
  // Scoped to opts.propertyId when set, so a scoped smoke run can't touch
  // stale incidents on unrelated properties.
  const staleCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const staleFreezeIncidents = await prisma.incident.findMany({
    where: {
      sourceType: 'WEATHER',
      typeKey: 'FREEZE_RISK',
      isSuppressed: false,
      status: { in: OPEN_FREEZE_STATUSES },
      updatedAt: { lt: staleCutoff },
      ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
    },
    select: { id: true },
  });
  for (const incident of staleFreezeIncidents) {
    if (dryRun) {
      resolved++;
      logger.info(`[FreezeRiskIncidents] (dry run) Would resolve stale incident ${incident.id}`);
      continue;
    }
    await IncidentService.setStatus(incident.id, IncidentStatus.RESOLVED);
    resolved++;
  }

  return { createdOrUpdated, resolved, smokeCorrelationId };
}
