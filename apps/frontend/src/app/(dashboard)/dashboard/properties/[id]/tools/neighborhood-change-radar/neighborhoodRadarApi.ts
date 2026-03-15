import { api } from '@/lib/api/client';
import type {
  NeighborhoodRadarSummaryDTO,
  NeighborhoodEventListDTO,
  NeighborhoodEventDetailDTO,
  NeighborhoodTrendSummaryDTO,
  NeighborhoodSignal,
} from '@/types';

export async function getNeighborhoodRadarSummary(
  propertyId: string,
): Promise<NeighborhoodRadarSummaryDTO | null> {
  return api.getNeighborhoodRadarSummary(propertyId);
}

export async function getNeighborhoodRadarEvents(
  propertyId: string,
  params?: {
    sortBy?: 'impact' | 'date';
    filterType?: string;
    filterEffect?: 'POSITIVE' | 'NEGATIVE' | 'MIXED';
    limit?: number;
    offset?: number;
  },
): Promise<NeighborhoodEventListDTO | null> {
  return api.getNeighborhoodRadarEvents(propertyId, params);
}

export async function getNeighborhoodRadarEventDetail(
  propertyId: string,
  eventId: string,
): Promise<NeighborhoodEventDetailDTO | null> {
  return api.getNeighborhoodRadarEventDetail(propertyId, eventId);
}

export async function getNeighborhoodRadarTrends(
  propertyId: string,
): Promise<NeighborhoodTrendSummaryDTO | null> {
  return api.getNeighborhoodRadarTrends(propertyId);
}

export async function getNeighborhoodSignals(propertyId: string): Promise<NeighborhoodSignal[]> {
  return api.getNeighborhoodSignals(propertyId);
}
