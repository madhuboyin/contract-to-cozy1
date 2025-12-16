// apps/frontend/src/components/community/TrashTab.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Trash2, Calendar, ExternalLink, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { EmptyState } from './EmptyState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  propertyId?: string;
}

interface TrashSchedule {
  type: 'trash' | 'recycling' | 'yard_waste' | 'bulk';
  frequency: string;
  nextPickup?: string;
  notes?: string;
}

const SCHEDULE_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  trash: { label: 'Trash', icon: '🗑️', color: 'bg-gray-100 text-gray-800' },
  recycling: { label: 'Recycling', icon: '♻️', color: 'bg-blue-100 text-blue-800' },
  yard_waste: { label: 'Yard Waste', icon: '🍂', color: 'bg-green-100 text-green-800' },
  bulk: { label: 'Bulk Pickup', icon: '📦', color: 'bg-orange-100 text-orange-800' },
};

export function TrashTab({ propertyId }: Props) {
  // Fetch AI-powered schedule
  const scheduleQuery = useQuery({
    queryKey: ['trash-schedule', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await fetch(`/api/community/trash-schedule?propertyId=${propertyId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch schedule');
      const data = await response.json();
      return data.success ? data.data : null;
    },
    enabled: !!propertyId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Fallback to RSS feeds
  const feedsQuery = useQuery({
    queryKey: ['community-trash', propertyId],
    queryFn: () => api.getCommunityTrash(propertyId!),
    enabled: !!propertyId && (!scheduleQuery.data || scheduleQuery.data.schedules?.length === 0),
  });

  if (!propertyId) {
    return (
      <EmptyState
        icon={<Trash2 className="h-16 w-16" />}
        title="Select a property"
        description="Choose a property to view trash and recycling schedules."
      />
    );
  }

  if (scheduleQuery.isLoading) {
    return <p className="text-muted-foreground text-center py-12">Loading schedule…</p>;
  }

  const schedule = scheduleQuery.data;
  const hasSchedule = schedule && schedule.schedules && schedule.schedules.length > 0;

  // Show AI-powered schedule if available
  if (hasSchedule) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Schedule information is automatically extracted from {schedule.city}, {schedule.state} official sources.
            Last updated: {new Date(schedule.lastUpdated).toLocaleDateString()}
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2">
          {schedule.schedules.map((s: TrashSchedule, idx: number) => {
            const config = SCHEDULE_TYPE_LABELS[s.type] || SCHEDULE_TYPE_LABELS.trash;
            
            return (
              <Card key={idx}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-2xl">{config.icon}</span>
                    {config.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Frequency</p>
                    <p className="text-sm">{s.frequency}</p>
                  </div>

                  {s.nextPickup && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Next Pickup</p>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold">
                          {new Date(s.nextPickup).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  )}

                  {s.notes && (
                    <div>
                      <p className="text-sm text-muted-foreground italic">{s.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {schedule.source && (
          <div className="text-center pt-2">
            <a
              href={schedule.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              View official city source
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    );
  }

  // Fallback to RSS feeds
  if (feedsQuery.isLoading) {
    return <p className="text-muted-foreground text-center py-12">Loading information…</p>;
  }

  const feedItems = feedsQuery.data?.success ? feedsQuery.data.data?.items ?? [] : [];

  if (feedItems.length === 0) {
    return (
      <EmptyState
        icon={<Trash2 className="h-16 w-16" />}
        title="Schedule not available yet"
        description={`We're working on adding trash collection schedules for ${schedule?.city || 'this city'}. Check back soon!`}
        action={{
          label: 'View city website',
          href: schedule?.source || '#',
        }}
      />
    );
  }

  // Show RSS feed links as fallback
  return (
    <div className="space-y-3">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Detailed schedules are not yet available. Visit your city's official website for more information.
        </AlertDescription>
      </Alert>

      {feedItems.map((item: any, idx: number) => (
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