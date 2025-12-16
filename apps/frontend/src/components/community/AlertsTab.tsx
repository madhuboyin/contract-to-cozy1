// apps/frontend/src/components/community/AlertsTab.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { EmptyState } from './EmptyState';
import { Badge } from '@/components/ui/badge';

interface Props {
  propertyId?: string;
}

interface OnTheFlyItem {
  title: string;
  description?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  category: string;
  sourceName: string;
}

export function AlertsTab({ propertyId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-alerts', propertyId],
    queryFn: () => api.getCommunityAlerts(propertyId!),
    enabled: !!propertyId,
  });

  if (!propertyId) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-16 w-16" />}
        title="Select a property"
        description="Choose a property to view city alerts and notifications."
      />
    );
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-center py-12">Loading city alerts…</p>;
  }

  if (isError || !data?.success) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-16 w-16" />}
        title="Unable to load alerts"
        description="We couldn't fetch city alerts at this time. Please try again later."
        action={{
          label: 'Retry',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  const items: OnTheFlyItem[] = data.data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle className="h-16 w-16 text-green-500" />}
        title="No active alerts"
        description="Great news! There are no current alerts or emergency notifications for your area."
      />
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
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {item.title}
              </div>

              {item.description && (
                <p className="text-sm mt-2 text-gray-700">
                  {item.description}
                </p>
              )}

              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  {item.sourceName}
                </span>
                {item.publishedAt && (
                  <>
                    <span>•</span>
                    <span>
                      {new Date(item.publishedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>

            <Badge variant="destructive" className="flex-shrink-0">
              Alert
            </Badge>
          </div>
        </a>
      ))}
    </div>
  );
}