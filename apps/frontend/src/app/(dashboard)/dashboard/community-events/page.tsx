// apps/frontend/src/app/(dashboard)/dashboard/community-events/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { CommunityEvent, Property, APIError } from '@/types';
import { CommunityEventsList } from '@/components/CommunityEventsList';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

const SELECT_NONE_VALUE = '__NONE__';

export default function CommunityEventsPage() {
  const { toast } = useToast();

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null
  );

  /* ---------------- Fetch Properties ---------------- */
  const {
    isLoading: isLoadingProperties,
  } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await api.getProperties();
      if (!res.success) {
        throw new Error((res as APIError).message);
      }
      setProperties(res.data.properties);
      return res.data.properties;
    },
  });

  /* ---------------- Fetch Community Events ---------------- */
  const {
    data,
    isLoading: isLoadingEvents,
    isError,
  } = useQuery({
    queryKey: ['community-events', selectedPropertyId],
    queryFn: () =>
      api.getCommunityEvents(selectedPropertyId!, { limit: 50 }),
    enabled: !!selectedPropertyId,
  });

  const events: CommunityEvent[] =
    data?.success && data.data?.events ? data.data.events : [];

  /* ---------------- Error Handling ---------------- */
  useEffect(() => {
    if (isError) {
      toast({
        title: 'Failed to load events',
        description:
          'Unable to fetch community events for the selected property.',
        variant: 'destructive',
      });
    }
  }, [isError, toast]);

  /* ---------------- UI ---------------- */
  return (
    <div className="space-y-6 pb-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-semibold">Community Events</h1>
      </div>

      {/* Property Selector */}
      <Card>
        <CardContent className="pt-6">
          {isLoadingProperties ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading properties…
            </div>
          ) : (
            <div className="max-w-sm">
              <Select
                value={selectedPropertyId ?? SELECT_NONE_VALUE}
                onValueChange={(v) =>
                  setSelectedPropertyId(
                    v === SELECT_NONE_VALUE ? null : v
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE_VALUE}>
                    Select a property
                  </SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events Section */}
      {!selectedPropertyId ? (
        <p className="text-sm text-muted-foreground">
          Select a property to view community events near your home.
        </p>
      ) : isLoadingEvents ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading events…
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No upcoming events found for this area.
        </p>
      ) : (
        <CommunityEventsList events={events} />
      )}
    </div>
  );
}
