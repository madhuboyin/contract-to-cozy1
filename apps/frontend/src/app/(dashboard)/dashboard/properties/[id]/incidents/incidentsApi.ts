// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/incidentsApi.ts
import { api } from '@/lib/api/client';
import type {
  ExecuteIncidentActionResponse,
  IncidentDTO,
  IncidentEventDTO,
  ListIncidentsResponse,
  IncidentStatus,
} from '@/types/incidents.types';

export async function listIncidents(args: {
  propertyId: string;
  status?: IncidentStatus;
  includeSuppressed?: boolean;
  limit?: number;
  cursor?: string | null;
}): Promise<ListIncidentsResponse> {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  if (args.includeSuppressed) params.set('includeSuppressed', 'true');
  if (args.limit) params.set('limit', String(args.limit));
  if (args.cursor) params.set('cursor', args.cursor);

  const qs = params.toString();
  const response = await api.get<ListIncidentsResponse>(
    `/api/properties/${args.propertyId}/incidents${qs ? `?${qs}` : ''}`
  );
  return response.data;
}

/**
 * ✅ Property-scoped incident detail endpoint
 * NOTE: backend currently returns:
 * {
 *   incident,
 *   latestActionProposedEvent,
 *   decisionTrace
 * }
 * If your IncidentDTO type is "incident only", you can either:
 * - create a new type for the response (recommended), or
 * - keep IncidentDTO and treat this as "any".
 */
export type GetIncidentDetailResponse = {
  incident: IncidentDTO;
  latestActionProposedEvent: IncidentEventDTO | null;
  decisionTrace: any | null;
};

export async function getIncident(args: {
  propertyId: string;
  incidentId: string;
}): Promise<GetIncidentDetailResponse> {
  const response = await api.get<GetIncidentDetailResponse>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}`
  );
  return response.data;
}

export async function listIncidentEvents(args: {
  propertyId: string;
  incidentId: string;
  limit?: number;
}): Promise<{ items: IncidentEventDTO[] }> {
  const limit = args.limit ?? 50;
  const response = await api.get<{ items: IncidentEventDTO[] }>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/events?limit=${limit}`
  );
  return response.data;
}

export async function evaluateIncidentNow(args: {
  propertyId: string;
  incidentId: string;
}): Promise<IncidentDTO> {
  const response = await api.post<IncidentDTO>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/evaluate`,
    {}
  );
  return response.data;
}

export async function orchestrateIncidentNow(args: {
  propertyId: string;
  incidentId: string;
}): Promise<IncidentDTO> {
  const response = await api.post<IncidentDTO>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/orchestrate`,
    {}
  );
  return response.data;
}

export async function executeIncidentAction(args: {
  propertyId: string;
  incidentId: string;
  actionId: string;
}): Promise<ExecuteIncidentActionResponse> {
  const response = await api.post<ExecuteIncidentActionResponse>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/actions/${args.actionId}/execute`,
    {}
  );
  return response.data;
}

/**
 * ✅ New combined endpoint: evaluate + orchestrate
 * Matches backend controller:
 * {
 *   incidentId,
 *   evaluated,
 *   orchestrated
 * }
 */
export type ReevaluateIncidentResponse = {
  incidentId: string;
  evaluated: any;    // your evaluator return shape
  orchestrated: any; // your orchestrator return shape
};

export async function reevaluateIncidentNow(args: {
  propertyId: string;
  incidentId: string;
}): Promise<ReevaluateIncidentResponse> {
  const response = await api.post<ReevaluateIncidentResponse>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/reevaluate`,
    {}
  );
  return response.data;
}

export type AcknowledgeIncidentInput = {
  type: 'ACKNOWLEDGED' | 'DISMISSED' | 'SNOOZED';
  note?: string | null;
  snoozeUntil?: string | null; // ISO string
};

export async function acknowledgeIncident(args: {
  propertyId: string;
  incidentId: string;
  input: AcknowledgeIncidentInput;
}): Promise<any> {
  const response = await api.post(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/ack`,
    args.input
  );
  return response.data;
}

// ============================================================================
// INCIDENT LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Update incident user preferences (pin/archive)
 */
export async function updateIncidentPreferences(args: {
  propertyId: string;
  incidentId: string;
  isPinned?: boolean;
  pinnedNote?: string;
  isArchived?: boolean;
  archivedReason?: string;
}): Promise<{ success: boolean; preference: any }> {
  const response = await api.patch<{ success: boolean; preference: any }>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/preferences`,
    {
      isPinned: args.isPinned,
      pinnedNote: args.pinnedNote,
      isArchived: args.isArchived,
      archivedReason: args.archivedReason,
    }
  );
  return response.data;
}

/**
 * Archive an incident
 */
export async function archiveIncident(args: {
  propertyId: string;
  incidentId: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  const response = await api.post<{ success: boolean }>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/archive`,
    { reason: args.reason }
  );
  return response.data;
}

/**
 * Restore an archived incident
 */
export async function restoreIncident(args: {
  propertyId: string;
  incidentId: string;
}): Promise<{ success: boolean }> {
  const response = await api.post<{ success: boolean }>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/restore`,
    {}
  );
  return response.data;
}

/**
 * Cancel auto-resolution for an incident
 */
export async function cancelAutoResolution(args: {
  propertyId: string;
  incidentId: string;
}): Promise<{ success: boolean }> {
  const response = await api.post<{ success: boolean }>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/auto-resolution/cancel`,
    {}
  );
  return response.data;
}

/**
 * Set incident status (including RESOLVED)
 */
export async function setIncidentStatus(args: {
  propertyId: string;
  incidentId: string;
  status: IncidentStatus;
}): Promise<IncidentDTO> {
  const response = await api.patch<IncidentDTO>(
    `/api/properties/${args.propertyId}/incidents/${args.incidentId}/status`,
    { status: args.status }
  );
  return response.data;
}

