// apps/workers/src/jobs/severeWeatherAlerts.job.ts
//
// Polls live NOAA/NWS severe weather alerts (flash flood, severe thunderstorm,
// tornado, high wind, excessive heat, winter storm) per property and creates
// Incidents for any that are active. Runs every 15 minutes (see
// workerJobRegistry.ts + worker.ts) since NWS warnings can be issued and
// expire within a few hours — unlike the daily freeze-risk check.
import { prisma } from '../lib/prisma';
import { IncidentStatus } from '@prisma/client';
import { IncidentService } from '@worker-shared/services/incidents/incident.service';
import { guidanceJourneyService } from '@worker-shared/services/guidanceEngine/guidanceJourney.service';
import {
  severeWeatherAlertService,
  SevereWeatherAlert,
} from '@worker-shared/services/severeWeatherAlert.service';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { Geo } from '../lib/geocodeZip';
import { getPropertyGeo } from '../lib/propertyGeo';
import { iterateAllProperties } from '../lib/paginateProperties';
import { logger } from '../lib/logger';
import {
  HAZARD_INTENT_FAMILY,
  HAZARD_CATEGORY,
  isWarningLevel,
  initialScoreFor,
  scoringInputsFor,
  summaryFor,
} from './severeWeatherAlerts.scoring';
import { nwsFetchOutcomeTotal, severeWeatherIncidentsTotal } from '../lib/metrics';

const TYPE_KEY = 'SEVERE_WEATHER_ALERT';

const OPEN_SEVERE_WEATHER_STATUSES: IncidentStatus[] = [
  IncidentStatus.DETECTED,
  IncidentStatus.EVALUATED,
  IncidentStatus.ACTIVE,
  IncidentStatus.ACTIONED,
  IncidentStatus.MITIGATED,
];

export async function severeWeatherAlertsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
) {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[SevereWeatherAlerts] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('severe-weather-alerts') : undefined;

  let createdOrUpdated = 0;
  let resolved = 0;
  const now = new Date();

  // In-run cache so properties sharing an as-yet-uncached zip within this run
  // don't each trigger their own geocode call. getPropertyGeo also persists
  // resolved coordinates onto Property.latitude/longitude, so future runs
  // skip geocoding entirely for properties whose zip hasn't changed.
  const geoRunCache = new Map<string, Geo | null>();
  // WKR (risk/weather/coverage W3 fix): getActiveAlerts returns [] both when
  // there are genuinely no active alerts AND when the NWS fetch itself
  // failed (timeout/HTTP error/exception) — the two are indistinguishable
  // from the array alone. Caching `fetchSucceeded` alongside the alerts
  // lets the resolution loop below tell "confirmed clear" apart from
  // "we don't know" so a transient NWS outage can't silently auto-resolve
  // real, still-active severe weather incidents.
  const alertsCache = new Map<string, { alerts: SevereWeatherAlert[]; fetchSucceeded: boolean }>();

  for await (const p of iterateAllProperties()) {
    if (opts?.propertyId && p.id !== opts.propertyId) continue;
    const zip = (p.zipCode ?? '').trim();
    if (!zip) continue;

    const geo = await getPropertyGeo(p, geoRunCache);
    if (!geo) continue;

    let cached = alertsCache.get(zip);
    if (cached === undefined) {
      let fetchSucceeded = false;
      const alerts = await severeWeatherAlertService.getActiveAlerts(geo.lat, geo.lon, (outcome) => {
        nwsFetchOutcomeTotal.inc({ outcome });
        fetchSucceeded = outcome === 'ok';
      });
      cached = { alerts, fetchSucceeded };
      alertsCache.set(zip, cached);
    }
    const { alerts, fetchSucceeded } = cached;

    const activeAlertIds = new Set(alerts.map(a => a.nwsAlertId));

    // Fetch this property's currently-open severe-weather incidents once —
    // used both to resolve incidents explicitly superseded by a newer alert
    // (a Watch upgraded to a Warning, or a warning re-issued/extended under a
    // new alert id, signaled via that new alert's `references`) and, further
    // below, to resolve incidents whose alert has simply dropped out of the
    // active feed.
    const openIncidents = await prisma.incident.findMany({
      where: {
        propertyId: p.id,
        sourceType: 'WEATHER',
        typeKey: TYPE_KEY,
        isSuppressed: false,
        status: { in: OPEN_SEVERE_WEATHER_STATUSES },
      },
      select: { id: true, details: true },
    });

    const openIncidentIdByAlertId = new Map<string, string>();
    for (const incident of openIncidents) {
      const details = (incident.details as Record<string, unknown> | null) ?? {};
      const nwsAlertId = typeof details.nwsAlertId === 'string' ? details.nwsAlertId : null;
      if (nwsAlertId) openIncidentIdByAlertId.set(nwsAlertId, incident.id);
    }

    const supersededIncidentIds = new Set<string>();
    for (const alert of alerts) {
      for (const referencedAlertId of alert.referencedAlertIds) {
        const supersededIncidentId = openIncidentIdByAlertId.get(referencedAlertId);
        if (supersededIncidentId) supersededIncidentIds.add(supersededIncidentId);
      }
    }
    for (const incidentId of supersededIncidentIds) {
      if (dryRun) {
        resolved++;
        logger.info(`[SevereWeatherAlerts] (dry run) Would resolve superseded incident ${incidentId}`);
        continue;
      }
      // Same archival-hook rationale as the resolves below.
      await IncidentService.setStatus(incidentId, IncidentStatus.RESOLVED);
      resolved++;
    }

    for (const alert of alerts) {
      const scoring = scoringInputsFor(alert);
      const fingerprint = `property:${p.id}|${TYPE_KEY}|${alert.nwsAlertId}`;

      if (dryRun) {
        createdOrUpdated++;
        logger.info(`[SevereWeatherAlerts] (dry run) Would upsert incident for property ${p.id} (alert=${alert.nwsAlertId})`);
        continue;
      }

      await IncidentService.upsertIncident(
        {
          propertyId: p.id,
          userId: null,
          sourceType: 'WEATHER',
          typeKey: TYPE_KEY,
          category: HAZARD_CATEGORY[alert.hazardFamily],
          title: alert.event,
          summary: summaryFor(alert),
          details: {
            hazardFamily: alert.hazardFamily,
            nwsEvent: alert.event,
            nwsAlertId: alert.nwsAlertId,
            nwsSeverity: alert.severity,
            senderName: alert.senderName,
            effective: alert.effective,
            expires: alert.expires,
            headline: alert.headline,
            instruction: alert.instruction,
            description: alert.description,
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
            provider: 'nws',
            ...scoring,
            ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
          },
          status: 'DETECTED',
          fingerprint,
          dedupeWindowMins: 24 * 60,
          severityScore: initialScoreFor(alert.severity),
          confidence: 70,
        },
        [
          {
            signalType: 'WEATHER_ALERT_NWS',
            externalRef: `nws:${alert.nwsAlertId}`,
            observedAt: now.toISOString(),
            payload: {
              zip,
              hazardFamily: alert.hazardFamily,
              event: alert.event,
              severity: alert.severity,
              lat: geo.lat,
              lon: geo.lon,
              expires: alert.expires,
            },
            scoreHint: null,
            confidence: 70,
          },
        ]
      );

      createdOrUpdated++;

      try {
        await guidanceJourneyService.ingestSignal({
          propertyId: p.id,
          signalIntentFamily: HAZARD_INTENT_FAMILY[alert.hazardFamily],
          issueDomain: 'WEATHER',
          decisionStage: 'AWARENESS',
          executionReadiness: 'NEEDS_CONTEXT',
          severity: isWarningLevel(alert.severity) ? 'HIGH' : 'MEDIUM',
          severityScore: isWarningLevel(alert.severity) ? 85 : 55,
          confidenceScore: 0.7,
          sourceType: 'EXTERNAL',
          sourceFeatureKey: 'severe-weather-alerts',
          sourceEntityType: 'INCIDENT',
          payloadJson: {
            hazardFamily: alert.hazardFamily,
            event: alert.event,
            zip,
            provider: 'nws',
          },
          expiresAt: alert.expires ? new Date(alert.expires) : new Date(now.getTime() + 6 * 3_600_000),
        });
      } catch (guidanceError) {
        logger.warn({ err: guidanceError }, '[GUIDANCE] severe weather alert signal ingest failed');
      }
    }

    // Resolve any remaining open severe-weather incidents for this property
    // that are no longer represented in the currently active alert list
    // (already-superseded ones were handled above and are skipped here).
    // Conservative failure: only when the NWS fetch actually succeeded —
    // an empty result from a failed fetch means "unknown", not "cleared",
    // and must not auto-resolve real open incidents. The 48h stale safety
    // net below still catches genuinely-cleared incidents if the outage
    // persists across runs.
    if (fetchSucceeded) {
      for (const [nwsAlertId, incidentId] of openIncidentIdByAlertId) {
        if (supersededIncidentIds.has(incidentId)) continue;
        if (!activeAlertIds.has(nwsAlertId)) {
          if (dryRun) {
            resolved++;
            logger.info(`[SevereWeatherAlerts] (dry run) Would resolve cleared incident ${incidentId}`);
            continue;
          }
          // Route through IncidentService.setStatus (not a raw prisma update) so its
          // RESOLVED-transition hook archives the linked guidance journey/signal too.
          await IncidentService.setStatus(incidentId, IncidentStatus.RESOLVED);
          resolved++;
        }
      }
    }
  }

  // Safety net: resolve lingering stale severe-weather incidents that were not
  // refreshed recently (e.g. property dropped out of the list, job failures).
  // Scoped to opts.propertyId when set, so a scoped smoke run can't touch
  // stale incidents on unrelated properties.
  const staleCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const staleIncidents = await prisma.incident.findMany({
    where: {
      sourceType: 'WEATHER',
      typeKey: TYPE_KEY,
      isSuppressed: false,
      status: { in: OPEN_SEVERE_WEATHER_STATUSES },
      updatedAt: { lt: staleCutoff },
      ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
    },
    select: { id: true },
  });
  for (const incident of staleIncidents) {
    if (dryRun) {
      resolved++;
      logger.info(`[SevereWeatherAlerts] (dry run) Would resolve stale incident ${incident.id}`);
      continue;
    }
    await IncidentService.setStatus(incident.id, IncidentStatus.RESOLVED);
    resolved++;
  }

  // Dry-run activity is hypothetical, not real — don't pollute the
  // production metric with counts that never actually happened.
  if (!dryRun) {
    severeWeatherIncidentsTotal.inc({ action: 'created_or_updated' }, createdOrUpdated);
    severeWeatherIncidentsTotal.inc({ action: 'resolved' }, resolved);
  }

  return { createdOrUpdated, resolved, smokeCorrelationId };
}
