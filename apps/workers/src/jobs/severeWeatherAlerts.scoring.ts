// apps/workers/src/jobs/severeWeatherAlerts.scoring.ts
//
// Pure scoring, hazard-mapping, and formatting helpers for
// severeWeatherAlerts.job.ts — split out so they can be unit tested without
// pulling in the job's DB/service dependencies (IncidentService,
// guidanceJourneyService, prisma, etc.).
//
// HazardFamily/NwsSeverity intentionally duplicate the definitions in
// severeWeatherAlert.service.ts rather than importing them, so this file has
// zero cross-app dependencies and needs no Docker build wiring. Keep them in
// sync if the source enum ever changes.

export type HazardFamily = 'FLOOD' | 'STORM' | 'HEATWAVE' | 'SNOW';
export type NwsSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

export interface ScorableAlert {
  hazardFamily: HazardFamily;
  severity: NwsSeverity;
  expires: string | null;
  headline?: string | null;
  description?: string | null;
  senderName?: string | null;
  event: string;
}

export const HAZARD_INTENT_FAMILY: Record<HazardFamily, string> = {
  FLOOD: 'flood_risk',
  STORM: 'wind_risk',
  HEATWAVE: 'heat_risk',
  SNOW: 'freeze_risk',
};

export const HAZARD_CATEGORY: Record<HazardFamily, string> = {
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

export function isWarningLevel(sev: NwsSeverity): boolean {
  return sev === 'Extreme' || sev === 'Severe';
}

// Initial estimate only — evaluateIncident() recomputes the authoritative
// severityScore from the scoring inputs (exposureUsd/safetyCritical/etc.)
// immediately after upsertIncident() creates/updates the row.
export function initialScoreFor(sev: NwsSeverity): number {
  switch (sev) {
    case 'Extreme': return 90;
    case 'Severe': return 75;
    case 'Moderate': return 55;
    default: return 35;
  }
}

export function isSafetyCritical(alert: Pick<ScorableAlert, 'hazardFamily' | 'severity'>): boolean {
  if (alert.hazardFamily === 'FLOOD' || alert.hazardFamily === 'STORM') return true;
  if (alert.hazardFamily === 'HEATWAVE' && alert.severity === 'Extreme') return true;
  return false;
}

export function scoringInputsFor(alert: Pick<ScorableAlert, 'hazardFamily' | 'severity' | 'expires'>) {
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

export function summaryFor(alert: Pick<ScorableAlert, 'headline' | 'description' | 'senderName' | 'event'>): string {
  const firstSentence = (alert.headline || alert.description || '').split(/(?<=[.!?])\s/)[0];
  const sender = alert.senderName ? ` — ${alert.senderName}` : '';
  return firstSentence ? `${firstSentence}${sender}` : `${alert.event} in effect${sender}`;
}
