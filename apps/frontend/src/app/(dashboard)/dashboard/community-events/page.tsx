'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';

import { api } from '@/lib/api/client';
import { CommunityEventsList } from '@/components/CommunityEventsList';

export default function CommunityEventsPage() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-events-full', propertyId],
    queryFn: () => api.getCommunityEvents(propertyId!, { limit: 50 }),
    enabled: !!propertyId,
  });

  const events = data?.success && data.data?.events
    ? data.data.events
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-semibold">
          Community Events
        </h1>
      </div>

      {!propertyId ? (
        <p className="text-sm text-muted-foreground">
          Select a property to view community events.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">
          Loading events…
        </p>
      ) : isError ? (
        <p className="text-sm text-red-500">
          Failed to load community events.
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No upcoming events found.
        </p>
      ) : (
        <CommunityEventsList events={events} />
      )}
    </div>
  );
}
