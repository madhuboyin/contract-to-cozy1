// apps/workers/src/jobs/severeWeatherAlerts.job.ts
//
// Polls live NOAA/NWS severe weather alerts (flash flood, severe thunderstorm,
// tornado, high wind, excessive heat, winter storm) per property and creates
// Incidents for any that are active. Runs every 15 minutes (see
// workerJobRegistry.ts + worker.ts) since NWS warnings can be issued and
// expire within a few hours — unlike the daily freeze-risk check.
import { prisma } from '../lib/prisma';
import { IncidentStatus } from '@prisma/client';
import { IncidentService } from '../../../backend/src/services/incidents/incident.service';
import { guidanceJourneyService } from '../../../backend/src/services/guidanceEngine/guidanceJourney.service';
import {
  severeWeatherAlertService,
  HazardFamily,
  NwsSeverity,
  SevereWeatherAlert,
} from '../../../backend/src/services/severeWeatherAlert.service';
import { geocodeZip, Geo } from '../lib/geocodeZip';
import { logger } from '../lib/logger';

const TYPE_KEY = 'SEVERE_WEATHER_ALERT';

const OPEN_SEVERE_WEATHER_STATUSES: IncidentStatus[] = [
  IncidentStatus.DETECTED,
  IncidentStatus.EVALUATED,
  IncidentStatus.ACTIVE,
  IncidentStatus.ACTIONED,
  IncidentStatus.MITIGATED,
];

const HAZARD_INTENT_FAMILY: Record<HazardFamily, string> = {
  FLOOD: 'flood_risk',
  STORM: 'wind_risk',
  HEATWAVE: 'heat_risk',
  SNOW: 'freeze_risk',
};

const HAZARD_CATEGORY: Record<HazardFamily, string> = {
  FLOOD: 'EXTERIOR',
  STORM: 'EXTERIOR',
  HEATWAVE: 'HVAC',
  SNOW: 'EXTERIOR',
};

// Rough exposure defaults per hazard family (Warning-level NWS severity).
const HAZARD_EXPOSURE_USD: Record<HazardFamily, number> = {
  FLOOD: 8000,
  STORM: 5000,
  HEATWAVE: 1000,
  SNOW: 2000,
};

function isWarningLevel(sev: NwsSeverity): boolean {
  return sev === 'Extreme' || sev === 'Severe';
}

// Initial estimate only — evaluateIncident() recomputes the authoritative
// severityScore from the scoring inputs (exposureUsd/safetyCritical/etc.)
// immediately after upsertIncident() creates/updates the row.
function initialScoreFor(sev: NwsSeverity): number {
  switch (sev) {
    case 'Extreme': return 90;
    case 'Severe': return 75;
    case 'Moderate': return 55;
    default: return 35;
  }
}

function isSafetyCritical(alert: SevereWeatherAlert): boolean {
  if (alert.hazardFamily === 'FLOOD' || alert.hazardFamily === 'STORM') return true;
  if (alert.hazardFamily === 'HEATWAVE' && alert.severity === 'Extreme') return true;
  return false;
}

function scoringInputsFor(alert: SevereWeatherAlert) {
  const warningLevel = isWarningLevel(alert.severity);
  const baseExposure = HAZARD_EXPOSURE_USD[alert.hazardFamily];

  const expiresAt = alert.expires ? new Date(alert.expires) : null;
  const timeWindowHours =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 3_600_000))
      : 6; // sane default if NWS omits expires

  return {
    safetyCritical: isSafetyCritical(alert),
    exposureUsd: warningLevel ? baseExposure : Math.round(baseExposure / 2),
    probabilityPct: warningLevel ? 90 : 50,
    timeWindowHours,
  };
}

function summaryFor(alert: SevereWeatherAlert): string {
  const firstSentence = (alert.headline || alert.description || '').split(/(?<=[.!?])\s/)[0];
  const sender = alert.senderName ? ` — ${alert.senderName}` : '';
  return firstSentence ? `${firstSentence}${sender}` : `${alert.event} in effect${sender}`;
}

export async function severeWeatherAlertsJob() {
  const props = await prisma.property.findMany({
    where: { zipCode: { not: undefined } },
    select: { id: true, zipCode: true, city: true, state: true },
    take: 500,
  });

  let createdOrUpdated = 0;
  let resolved = 0;
  const now = new Date();

  // In-run caches so properties sharing a zip don't repeat geocoding/NWS calls.
  const geoCache = new Map<string, Geo | null>();
  const alertsCache = new Map<string, SevereWeatherAlert[]>();

  for (const p of props) {
    const zip = (p.zipCode ?? '').trim();
    if (!zip) continue;

    let geo = geoCache.get(zip);
    if (geo === undefined) {
      geo = await geocodeZip(zip, 'US');
      geoCache.set(zip, geo);
    }
    if (!geo) continue;

    let alerts = alertsCache.get(zip);
    if (alerts === undefined) {
      alerts = await severeWeatherAlertService.getActiveAlerts(geo.lat, geo.lon);
      alertsCache.set(zip, alerts);
    }

    const activeAlertIds = new Set(alerts.map(a => a.nwsAlertId));

    for (const alert of alerts) {
      const scoring = scoringInputsFor(alert);
      const fingerprint = `property:${p.id}|${TYPE_KEY}|${alert.nwsAlertId}`;

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

    // Resolve any open severe-weather incidents for this property that are no
    // longer represented in the currently active alert list.
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

    for (const incident of openIncidents) {
      const details = (incident.details as Record<string, unknown> | null) ?? {};
      const nwsAlertId = typeof details.nwsAlertId === 'string' ? details.nwsAlertId : null;
      if (nwsAlertId && !activeAlertIds.has(nwsAlertId)) {
        // Route through IncidentService.setStatus (not a raw prisma update) so its
        // RESOLVED-transition hook archives the linked guidance journey/signal too.
        await IncidentService.setStatus(incident.id, IncidentStatus.RESOLVED);
        resolved++;
      }
    }
  }

  // Safety net: resolve lingering stale severe-weather incidents that were not
  // refreshed recently (e.g. property dropped out of the list, job failures).
  const staleCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const staleIncidents = await prisma.incident.findMany({
    where: {
      sourceType: 'WEATHER',
      typeKey: TYPE_KEY,
      isSuppressed: false,
      status: { in: OPEN_SEVERE_WEATHER_STATUSES },
      updatedAt: { lt: staleCutoff },
    },
    select: { id: true },
  });
  for (const incident of staleIncidents) {
    await IncidentService.setStatus(incident.id, IncidentStatus.RESOLVED);
    resolved++;
  }

  return { createdOrUpdated, resolved };
}
