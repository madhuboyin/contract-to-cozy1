'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { OnTheFlyItem } from './types';

interface Props {
  propertyId?: string;
}

export function AlertsTab({ propertyId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-alerts', propertyId],
    queryFn: () => api.getCommunityAlerts(propertyId!),
    enabled: !!propertyId,
  });

  if (!propertyId) {
    return <p className="text-muted-foreground">Select a property to view city alerts.</p>;
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading city alerts…</p>;
  }

  if (isError || !data?.success) {
    return <p className="text-red-500">Unable to load city alerts.</p>;
  }

  const items: OnTheFlyItem[] = data.data?.items ?? [];

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        No active city alerts available at this time.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item: OnTheFlyItem, idx: number) => (
        <a
          key={idx}
          href={item.url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="block border-l-4 border-orange-500 bg-orange-50 p-4 rounded-md hover:bg-orange-100 transition"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {item.title}
          </div>

          {item.description && (
            <p className="text-sm mt-1">
              {item.description}
            </p>
          )}

          <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {item.sourceName}
          </div>
        </a>
      ))}
    </div>
  );
}
