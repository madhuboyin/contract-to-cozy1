'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/api/client';
import { OnTheFlyItem } from './types';

interface Props {
  propertyId?: string;
}

export function TrashTab({ propertyId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-trash', propertyId],
    queryFn: () => api.getCommunityTrash(propertyId!),
    enabled: !!propertyId,
  });

  if (!propertyId) {
    return <p className="text-muted-foreground">Select a property to view trash & recycling info.</p>;
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading trash & recycling info…</p>;
  }

  if (isError || !data?.success) {
    return <p className="text-red-500">Unable to load trash & recycling info.</p>;
  }

  const items: OnTheFlyItem[] = data.data?.items ?? [];

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        No official trash or recycling sources available yet for this city.
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
          className="block border rounded-md p-4 bg-white hover:bg-gray-50 transition"
        >
          <div className="flex items-center justify-between">
            <div className="font-medium">{item.title}</div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </div>

          {item.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {item.description}
            </p>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Source: {item.sourceName}
          </div>
        </a>
      ))}
    </div>
  );
}
