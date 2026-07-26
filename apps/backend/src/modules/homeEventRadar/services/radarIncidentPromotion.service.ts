import {
  IncidentSeverity,
  IncidentSourceType,
  IncidentStatus,
  SignalType,
} from '@prisma/client';
import type {
  AddIncidentSignalInput,
  CreateIncidentInput,
} from '../../../types/incidents.types';

type RadarLifecycleStatus =
  | 'active'
  | 'updated'
  | 'resolved'
  | 'expired'
  | 'retracted'
  | 'archived';

export type RadarIncidentPromotionInput = {
  propertyId: string;
  event: {
    id: string;
    eventType: string;
    eventSubType?: string | null;
    title: string;
    severity: string;
    status: RadarLifecycleStatus;
    dedupeKey: string;
    sourceDefinitionId?: string | null;
    sourceRunId?: string | null;
    providerEventId?: string | null;
    providerRevision?: string | null;
    canonicalUrl?: string | null;
    observedAt?: Date | string | null;
  };
  match: {
    id: string;
    impactLevel: string;
    impactSummary?: string | null;
    matchScore?: unknown;
    confidence?: string | null;
    confidenceScore?: unknown;
    lifecycleStatus?: 'now' | 'upcoming' | 'recently_ended' | 'no_longer_applicable';
    matcherVersion?: string | null;
    propertyGeographyVersion?: number | null;
    matchExplanationJson?: unknown;
    impactFactorsJson?: unknown;
  };
  revision?: {
    radarEventRevisionId?: string | null;
    revisionIdentity?: string | null;
    sourceRunId?: string | null;
    sourceDefinitionId?: string | null;
    correlationId?: string | null;
  };
};

type LinkedIncident = {
  id: string;
  status: IncidentStatus;
};

export type RadarIncidentPromotionResult =
  | { outcome: 'created' | 'updated'; incidentId: string }
  | { outcome: 'resolved' | 'expired'; incidentId: string }
  | { outcome: 'not_promotable' | 'no_linked_incident'; incidentId: null }
  | { outcome: 'terminal_incident_unchanged'; incidentId: string };

export type RadarIncidentPromotionPort = {
  getIncidentByRadarMatchId(propertyRadarMatchId: string): Promise<LinkedIncident | null>;
  upsertIncident(
    input: CreateIncidentInput,
    signals?: AddIncidentSignalInput[],
  ): Promise<{ id: string } | null>;
  setStatus(id: string, status: IncidentStatus): Promise<{ id: string }>;
};

const defaultIncidentPort: RadarIncidentPromotionPort = {
  getIncidentByRadarMatchId: (id) =>
    incidentService().getIncidentByRadarMatchId(id),
  upsertIncident: (input, signals) => incidentService().upsertIncident(input, signals),
  setStatus: (id, status) => incidentService().setStatus(id, status),
};

function incidentService() {
  // Keep the bridge's pure scoring/lifecycle helpers independently testable.
  // The Incident stack loads Guidance and provider dependencies, so resolve it
  // only when the production port is actually used.
  return (
    require('../../../services/incidents/incident.service') as
      typeof import('../../../services/incidents/incident.service')
  ).IncidentService;
}

const CLOSED_INCIDENT_STATUSES = new Set<IncidentStatus>([
  IncidentStatus.RESOLVED,
  IncidentStatus.EXPIRED,
]);

function decimalToNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    const parsed = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function radarIncidentConfidence(
  confidence: string | null | undefined,
  confidenceScore: unknown,
): number | null {
  const score = decimalToNumber(confidenceScore);
  if (score !== null) {
    const decimalScore = score <= 1 ? score * 100 : score;
    return Math.min(100, Math.max(0, Number(decimalScore.toFixed(2))));
  }
  switch (confidence) {
    case 'verified':
      return 100;
    case 'high':
      return 90;
    case 'medium':
      return 70;
    case 'low':
      return 35;
    default:
      return null;
  }
}

export function radarIncidentSeverity(
  impactLevel: string,
  confidence: string | null | undefined,
): IncidentSeverity {
  if (impactLevel === 'high' && confidence !== 'low') {
    return IncidentSeverity.CRITICAL;
  }
  if (impactLevel === 'moderate' || impactLevel === 'high') {
    return IncidentSeverity.WARNING;
  }
  return IncidentSeverity.INFO;
}

function incidentStatusForLifecycle(
  status: RadarLifecycleStatus,
): IncidentStatus | null {
  if (status === 'expired') return IncidentStatus.EXPIRED;
  if (status === 'resolved' || status === 'retracted' || status === 'archived') {
    return IncidentStatus.RESOLVED;
  }
  return null;
}

function isPromotableImpact(impactLevel: string): boolean {
  return impactLevel === 'moderate' || impactLevel === 'high';
}

function isPromotionConfidenceEligible(confidence: number | null): boolean {
  // HER-302 bands scores below 60% as low confidence. Those matches remain
  // visible for awareness but cannot create or retain an Incident. Null is
  // retained only for pre-engine/backward-compatible records.
  return confidence === null || confidence >= 60;
}

function incidentTypeKey(eventType: string): string {
  return `RADAR_${eventType.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

const WEATHER_EVENT_TYPES = new Set([
  'weather',
  'flood_risk',
  'heat_wave',
  'freeze',
  'hail',
  'heavy_rain',
  'wind',
]);

export function radarIncidentSignals(
  input: RadarIncidentPromotionInput,
  confidence: number | null,
): AddIncidentSignalInput[] {
  const eventType = input.event.eventType.trim().toLowerCase();
  if (!WEATHER_EVENT_TYPES.has(eventType)) return [];
  const isFreezeForecast =
    eventType === 'freeze' ||
    input.event.providerEventId?.startsWith('open-meteo:freeze-risk:') === true;
  let canonicalHost: string | null = null;
  try {
    canonicalHost = input.event.canonicalUrl
      ? new URL(input.event.canonicalUrl).hostname.toLowerCase()
      : null;
  } catch {
    canonicalHost = null;
  }
  const isNwsAlert =
    canonicalHost === 'api.weather.gov' ||
    input.event.providerEventId?.startsWith('urn:oid:') === true;
  if (!isFreezeForecast && !isNwsAlert) return [];
  const externalRef =
    input.revision?.revisionIdentity ??
    input.event.providerRevision ??
    input.event.providerEventId ??
    input.event.id;
  return [{
    signalType: isFreezeForecast
      ? SignalType.WEATHER_FORECAST_MIN_TEMP
      : SignalType.WEATHER_ALERT_NWS,
    externalRef,
    observedAt: input.event.observedAt ?? new Date(),
    payload: {
      radarEventId: input.event.id,
      radarEventRevisionId: input.revision?.radarEventRevisionId ?? null,
      revisionIdentity: input.revision?.revisionIdentity ?? null,
      sourceDefinitionId:
        input.revision?.sourceDefinitionId ??
        input.event.sourceDefinitionId ??
        null,
      sourceRunId:
        input.revision?.sourceRunId ??
        input.event.sourceRunId ??
        null,
      providerEventId: input.event.providerEventId ?? null,
      providerRevision: input.event.providerRevision ?? null,
      eventType,
      eventSeverity: input.event.severity,
      lifecycleStatus: input.event.status,
      impactLevel: input.match.impactLevel,
      matchScore: decimalToNumber(input.match.matchScore),
    },
    confidence,
  }];
}

export class RadarIncidentPromotionService {
  constructor(
    private readonly incidentPort: RadarIncidentPromotionPort = defaultIncidentPort,
  ) {}

  async project(
    input: RadarIncidentPromotionInput,
  ): Promise<RadarIncidentPromotionResult> {
    const existing = await this.incidentPort.getIncidentByRadarMatchId(input.match.id);
    const confidence = radarIncidentConfidence(
      input.match.confidence,
      input.match.confidenceScore,
    );
    const lifecycleStatus = incidentStatusForLifecycle(input.event.status);
    const shouldClose = lifecycleStatus !== null ||
      input.match.lifecycleStatus === 'no_longer_applicable' ||
      !isPromotableImpact(input.match.impactLevel) ||
      !isPromotionConfidenceEligible(confidence);

    if (shouldClose) {
      if (!existing) {
        return {
          outcome: lifecycleStatus ? 'no_linked_incident' : 'not_promotable',
          incidentId: null,
        };
      }
      const targetStatus = lifecycleStatus ?? IncidentStatus.RESOLVED;
      if (existing.status === targetStatus || CLOSED_INCIDENT_STATUSES.has(existing.status)) {
        return { outcome: 'terminal_incident_unchanged', incidentId: existing.id };
      }
      await this.incidentPort.setStatus(existing.id, targetStatus);
      return {
        outcome: targetStatus === IncidentStatus.EXPIRED ? 'expired' : 'resolved',
        incidentId: existing.id,
      };
    }

    if (existing && CLOSED_INCIDENT_STATUSES.has(existing.status)) {
      return { outcome: 'terminal_incident_unchanged', incidentId: existing.id };
    }

    const severity = radarIncidentSeverity(
      input.match.impactLevel,
      input.match.confidence,
    );
    const typeKey = incidentTypeKey(input.event.eventType);
    const revisionSourceRunId =
      input.revision?.sourceRunId ?? input.event.sourceRunId ?? null;
    const revisionSourceDefinitionId =
      input.revision?.sourceDefinitionId ?? input.event.sourceDefinitionId ?? null;
    const incident = await this.incidentPort.upsertIncident({
      propertyId: input.propertyId,
      propertyRadarMatchId: input.match.id,
      userId: null,
      sourceType: IncidentSourceType.RADAR_EVENT,
      typeKey,
      category: input.event.eventType.toUpperCase(),
      title: input.event.title,
      summary:
        input.match.impactSummary ??
        'A Home Event Radar signal may require attention.',
      details: {
        propertyRadarMatchId: input.match.id,
        radarEventId: input.event.id,
        radarEventRevisionId: input.revision?.radarEventRevisionId ?? null,
        revisionIdentity: input.revision?.revisionIdentity ?? null,
        sourceDefinitionId: revisionSourceDefinitionId,
        sourceRunId: revisionSourceRunId,
        correlationId: input.revision?.correlationId ?? null,
        providerEventId: input.event.providerEventId ?? null,
        providerRevision: input.event.providerRevision ?? null,
        eventType: input.event.eventType,
        eventSubType: input.event.eventSubType ?? null,
        eventSeverity: input.event.severity,
        eventStatus: input.event.status,
        eventObservedAt: input.event.observedAt ?? null,
        canonicalUrl: input.event.canonicalUrl ?? null,
        matchScore: decimalToNumber(input.match.matchScore),
        impactLevel: input.match.impactLevel,
        confidence: input.match.confidence ?? null,
        confidenceScore: confidence,
        matcherVersion: input.match.matcherVersion ?? null,
        propertyGeographyVersion: input.match.propertyGeographyVersion ?? null,
        matchExplanation: input.match.matchExplanationJson ?? null,
        impactFactors: input.match.impactFactorsJson ?? null,
      },
      severity,
      severityScore: severity === IncidentSeverity.CRITICAL ? 90 : 65,
      confidence,
      scoreBreakdown: {
        impactLevel: input.match.impactLevel,
        matchScore: decimalToNumber(input.match.matchScore),
        confidence: input.match.confidence ?? null,
        confidenceScore: confidence,
      },
      fingerprint: `property:${input.propertyId}|RADAR_MATCH:${input.match.id}`,
      recurrenceKey: `radar-event:${input.event.id}`,
    }, radarIncidentSignals(input, confidence));
    if (!incident) {
      throw new Error(`Incident projection returned no incident for Radar match ${input.match.id}`);
    }
    return {
      outcome: existing ? 'updated' : 'created',
      incidentId: incident.id,
    };
  }
}

export const radarIncidentPromotionService = new RadarIncidentPromotionService();
