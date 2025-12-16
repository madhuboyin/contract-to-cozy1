// apps/frontend/src/components/community/EventsTab.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, Calendar as CalendarIcon } from 'lucide-react';
import { api } from '@/lib/api/client';
import { CommunityEventsList } from '@/components/CommunityEventsList';
import { EmptyState } from './EmptyState';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  propertyId?: string;
}

type EventCategory = 'all' | 'FARMERS_MARKET' | 'FOOD_FESTIVAL' | 'COMMUNITY' | 'LIBRARY' | 'HOLIDAY';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  all: 'All Events',
  FARMERS_MARKET: "🌽 Farmers' Markets",
  FOOD_FESTIVAL: '🍔 Food Festivals',
  COMMUNITY: '🏘️ Community Events',
  LIBRARY: '📚 Library Events',
  HOLIDAY: '🎉 Holidays & Celebrations',
};

export function EventsTab({ propertyId }: Props) {
  const [category, setCategory] = useState<EventCategory>('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-events', propertyId, 50, category],
    queryFn: () => 
      api.getCommunityEvents(propertyId!, { 
        limit: 50,
        category: category === 'all' ? undefined : category,
      }),
    enabled: !!propertyId,
  });

  if (!propertyId) {
    return (
      <EmptyState
        icon={<CalendarIcon className="h-16 w-16" />}
        title="Select a property"
        description="Choose a property to view nearby community events."
      />
    );
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-center py-12">Loading events…</p>;
  }

  if (isError || !data?.success) {
    return (
      <EmptyState
        icon={<CalendarIcon className="h-16 w-16" />}
        title="Unable to load events"
        description="We couldn't fetch community events at this time. Please try again later."
        action={{
          label: 'Retry',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  const events = data.data?.events ?? [];

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? 's' : ''} found
        </p>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              {CATEGORY_LABELS[category]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((cat) => (
              <DropdownMenuItem
                key={cat}
                onClick={() => setCategory(cat)}
                className={category === cat ? 'bg-accent' : ''}
              >
                {CATEGORY_LABELS[cat]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-16 w-16" />}
          title={
            category === 'all' 
              ? "No upcoming events" 
              : `No ${CATEGORY_LABELS[category].toLowerCase()} found`
          }
          description={
            category === 'all'
              ? "There are no upcoming events near this property. Check back soon!"
              : "Try selecting a different category to see more events."
          }
          action={
            category !== 'all'
              ? {
                  label: 'Show all events',
                  onClick: () => setCategory('all'),
                }
              : undefined
          }
        />
      ) : (
        <CommunityEventsList events={events} />
      )}
    </div>
  );
}