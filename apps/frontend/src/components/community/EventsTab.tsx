'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { CommunityEventsList } from '@/components/CommunityEventsList';

interface Props {
  propertyId?: string;
}

export function EventsTab({ propertyId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-events', propertyId, 50],
    queryFn: () => api.getCommunityEvents(propertyId!, { limit: 50 }),
    enabled: !!propertyId,
  });

  if (!propertyId) {
    return <p className="text-muted-foreground">Select a property to view events.</p>;
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading events…</p>;
  }

  if (isError || !data?.success) {
    return <p className="text-red-500">Failed to load community events.</p>;
  }

  const events = data.data?.events ?? [];

  if (events.length === 0) {
    return <p className="text-muted-foreground">No upcoming events found.</p>;
  }

  return <CommunityEventsList events={events} />;
}
