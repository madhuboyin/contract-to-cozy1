import { api } from '@/lib/api/client';

export interface RadarSourceRun {
  id: string;
  status: string;
  correlationId: string;
  startedAt: string;
  finishedAt: string | null;
  observationsReceived: number;
  observationsRejected: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsResolved: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface RadarSourceAdmin {
  id: string;
  key: string;
  family: string;
  name: string;
  provider: string;
  adapterVersion: string;
  isEnabled: boolean;
  scheduleCron: string | null;
  freshnessSeconds: number;
  coverageDescription: string;
  supportedEventTypes: string[];
  operationsPausedAt: string | null;
  operationsPausedBy: string | null;
  operationsPauseReason: string | null;
  workerJobKey: string | null;
  operationsSupported: boolean;
  effectiveHealth: { status: string; stale: boolean };
  health: {
    status: string;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    dataFreshThrough: string | null;
    consecutiveFailures: number;
    message: string | null;
  } | null;
  coverage: Array<{
    id: string;
    coverageType: string;
    countryCode: string | null;
    stateCode: string | null;
    cityName: string | null;
    countyFips: string | null;
    postalCode: string | null;
  }>;
  runs: RadarSourceRun[];
  _count: { events: number; runs: number; propertyCoverage: number };
}

export interface RadarAnomaly {
  type: string;
  severity: string;
  sourceKey: string;
  detail: string;
  runId?: string;
  startedAt?: string;
  consecutiveFailures?: number;
}

export interface RadarEventLineage {
  id: string;
  title: string;
  status: string;
  providerEventId: string | null;
  sourceDefinition: { key: string; name: string; provider: string } | null;
  sourceRun: RadarSourceRun | null;
  revisions: Array<{ id: string; observedAt: string; lifecycleStatus: string; _count: { notificationDecisions: number } }>;
  propertyMatches: Array<{
    id: string;
    lifecycleStatus: string;
    property: { id: string; address: string; city: string; state: string };
    incident: { id: string; status: string } | null;
    _count: { states: number; actions: number; taskLinks: number; notificationDecisions: number };
  }>;
}

export async function fetchRadarSources(): Promise<RadarSourceAdmin[]> {
  return (await api.get<RadarSourceAdmin[]>('/api/admin/radar/sources')).data;
}

export async function fetchRadarAnomalies(): Promise<{
  generatedAt: string;
  anomalies: RadarAnomaly[];
}> {
  return (await api.get('/api/admin/radar/anomalies')).data;
}

export async function testRadarSource(sourceKey: string, propertyId?: string) {
  return (
    await api.post(`/api/admin/radar/sources/${encodeURIComponent(sourceKey)}/test-fetch`, {
      propertyId: propertyId || undefined,
    })
  ).data;
}

export async function runRadarSource(sourceKey: string, propertyId: string) {
  return (
    await api.post(`/api/admin/radar/sources/${encodeURIComponent(sourceKey)}/run`, {
      propertyId,
    })
  ).data;
}

export async function setRadarSourcePause(
  sourceKey: string,
  paused: boolean,
  reason: string,
) {
  return (
    await api.put(`/api/admin/radar/sources/${encodeURIComponent(sourceKey)}/pause`, {
      paused,
      reason,
    })
  ).data;
}

export async function replayRadarRun(runId: string) {
  return (await api.post(`/api/admin/radar/runs/${encodeURIComponent(runId)}/replay`, {})).data;
}

export async function fetchRadarEventLineage(eventId: string): Promise<RadarEventLineage> {
  return (
    await api.get<RadarEventLineage>(
      `/api/admin/radar/events/${encodeURIComponent(eventId)}/lineage`,
    )
  ).data;
}
