'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ExternalLink } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { api } from '@/lib/api/client';
import { CommunityEvent } from '@/types';

interface Props {
  propertyId?: string;
}

export default function CommunityEventsCard({ propertyId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-events', propertyId],
    queryFn: () => api.getCommunityEvents(propertyId!, { limit: 3 }),
    enabled: !!propertyId,
  });

  const events: CommunityEvent[] =
    data?.success && data.data?.events ? data.data.events : [];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Community Events
        </CardTitle>
        <CardDescription>
          Local events and meetings near your home
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        {!propertyId ? (
          <p className="text-sm text-gray-500">
            Select a property to view events.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-gray-500">Loading events...</p>
        ) : isError ? (
          <p className="text-sm text-red-500">
            Unable to load community events.
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-gray-500">
            No upcoming events found.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event, idx) => (
              <div key={event.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">
                      {event.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(event.startTime).toLocaleString()}
                    </p>
                  </div>

                  {event.externalUrl && (
                    <a
                      href={event.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      View <ExternalLink className="inline h-3 w-3" />
                    </a>
                  )}
                </div>

                {idx < events.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter>
        {propertyId && events.length > 0 && (
          <Link
            href={`/dashboard/properties/${propertyId}/community`}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            View All →
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
