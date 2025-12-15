// apps/frontend/src/app/(dashboard)/dashboard/community-events/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';

import { api } from '@/lib/api/client';
import { CommunityEventsList } from '@/components/community/CommunityEventsList';

export default function CommunityEventsPage() {
  const params = useParams();
  const propertyId = params.propertyId as string;

  const { data, isLoading } = useQuery({
    queryKey: ['community-events-full', propertyId],
    queryFn: () => api.getCommunityEvents(propertyId, { limit: 50 }),
    enabled: !!propertyId
  });

  const events = data?.success && data.data?.events ? data.data.events : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-semibold">Community Events</h1>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500">No upcoming events found.</p>
      ) : (
        <CommunityEventsList events={events} />
      )}
    </div>
  );
}
