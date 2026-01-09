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
  const response = await api.get<ListIncidentsResponse>(`/api/properties/${args.propertyId}/incidents${qs ? `?${qs}` : ''}`);
  return response.data;
}

export async function getIncident(incidentId: string): Promise<IncidentDTO> {
  const response = await api.get<IncidentDTO>(`/api/incidents/${incidentId}`);
  return response.data;
}

export async function listIncidentEvents(incidentId: string, limit = 50): Promise<{ items: IncidentEventDTO[] }> {
  const response = await api.get<{ items: IncidentEventDTO[] }>(`/api/incidents/${incidentId}/events?limit=${limit}`);
  return response.data;
}

export async function evaluateIncidentNow(incidentId: string): Promise<IncidentDTO> {
  const response = await api.post<IncidentDTO>(`/api/incidents/${incidentId}/evaluate`, {});
  return response.data;
}

export async function orchestrateIncidentNow(incidentId: string): Promise<IncidentDTO> {
  const response = await api.post<IncidentDTO>(`/api/incidents/${incidentId}/orchestrate`, {});
  return response.data;
}

export async function executeIncidentAction(args: {
  incidentId: string;
  actionId: string;
}): Promise<ExecuteIncidentActionResponse> {
  const response = await api.post<ExecuteIncidentActionResponse>(`/api/incidents/${args.incidentId}/actions/${args.actionId}/execute`, {});
  return response.data;
}
