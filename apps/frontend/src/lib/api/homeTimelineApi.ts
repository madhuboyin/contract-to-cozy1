import { api } from './client';

export async function reviewHomeTimelineEvent(
  propertyId: string,
  eventId: string,
  status: 'HOMEOWNER_CONFIRMED' | 'DISPUTED',
) {
  return api.post(`/api/properties/${propertyId}/home-events/${eventId}/confirmation`, {
    status,
    reason: status === 'HOMEOWNER_CONFIRMED'
      ? 'Confirmed by homeowner in Ask Cozy timeline review.'
      : 'Disputed by homeowner in Ask Cozy timeline review.',
  });
}

export async function exportHomeTimelineEvents(propertyId: string, eventIds: string[]) {
  return api.post(`/api/properties/${propertyId}/home-events/export`, { eventIds });
}
