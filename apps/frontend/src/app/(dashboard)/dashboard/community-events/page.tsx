// apps/frontend/src/app/(dashboard)/dashboard/community-events/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Trash2, AlertTriangle } from 'lucide-react';

import { api } from '@/lib/api/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Button } from '@/components/ui/button';

/* ----------------------------- helpers ----------------------------- */

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="text-center py-12">
      <p className="font-medium text-gray-800">{title}</p>
      <p className="text-sm text-muted-foreground mt-2">{description}</p>
    </div>
  );
}

/* ----------------------------- page ----------------------------- */

export default function CommunityPage() {
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId;

  const [tab, setTab] = useState<'events' | 'trash' | 'alerts'>('events');

  // Fetch property to get city and state for trash/alerts
  const { data: property } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getProperty(propertyId);
      return response.success ? response.data : null;
    },
    enabled: !!propertyId,
  });

  const city = property?.city;
  const state = property?.state;

  /* ---------------- Events ---------------- */

  const eventsQuery = useQuery({
    queryKey: ['community-events', propertyId],
    queryFn: () => api.getCommunityEvents(propertyId!, { limit: 20 }),
    enabled: !!propertyId && tab === 'events',
  });

  /* ---------------- Trash ---------------- */

  const trashQuery = useQuery({
    queryKey: ['community-trash', propertyId],
    queryFn: () => api.getCommunityTrash(propertyId!),
    enabled: !!propertyId && tab === 'trash',
  });

  /* ---------------- Alerts ---------------- */

  const alertsQuery = useQuery({
    queryKey: ['community-alerts', propertyId],
    queryFn: () => api.getCommunityAlerts(propertyId!),
    enabled: !!propertyId && tab === 'alerts',
  });

  /* ---------------- guards ---------------- */

  if (!propertyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Community</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Select a property"
            description="Choose a property to view community events, trash schedules, and alerts."
          />
        </CardContent>
      </Card>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Community</h1>
        <p className="text-sm text-muted-foreground">
          Local events, city services, and municipal alerts
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'events' | 'trash' | 'alerts')}>
        <TabsList>
          <TabsTrigger value="events">
            <Calendar className="w-4 h-4 mr-2" />
            Events
          </TabsTrigger>
          <TabsTrigger value="trash">
            <Trash2 className="w-4 h-4 mr-2" />
            Trash & Recycling
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Alerts & Notifications
          </TabsTrigger>
        </TabsList>

        {/* ================= EVENTS ================= */}

        <TabsContent value="events">
          <Card>
            <CardContent className="pt-6">
              {eventsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading events…</p>
              ) : eventsQuery.isError ? (
                <EmptyState
                  title="Unable to load events"
                  description="Please try again later."
                />
              ) : !eventsQuery.data?.success || (eventsQuery.data.data?.events?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No upcoming events"
                  description="There are no upcoming events near this property."
                />
              ) : (
                <div className="space-y-4">
                  {eventsQuery.data.data.events.map((ev: any) => (
                    <div
                      key={ev.externalId}
                      className="flex justify-between items-start border-b pb-3"
                    >
                      <div>
                        <p className="font-medium">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ev.startTime).toLocaleString()}
                        </p>
                      </div>
                      <Button size="sm" variant="link" asChild>
                        <a
                          href={ev.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= TRASH ================= */}

        <TabsContent value="trash">
          <Card>
            <CardContent className="pt-6">
              {trashQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading trash & recycling info…
                </p>
              ) : !trashQuery.data?.success || (trashQuery.data.data?.items?.length ?? 0) === 0 ? (
                <EmptyState
                  title="Trash schedule not available yet"
                  description="This city does not provide a public trash or recycling feed yet."
                />
              ) : (
                <div className="space-y-4">
                  {trashQuery.data.data.items.map((item: any, idx: number) => (
                    <div key={idx}>
                      <p className="font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      <a
                        href={item.url}
                        target="_blank"
                        className="text-sm text-blue-600"
                      >
                        View source →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ALERTS ================= */}

        <TabsContent value="alerts">
          <Card>
            <CardContent className="pt-6">
              {alertsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading city alerts…
                </p>
              ) : !alertsQuery.data?.success || (alertsQuery.data.data?.items?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No active alerts"
                  description="There are no current municipal alerts for this area."
                />
              ) : (
                <div className="space-y-4">
                  {alertsQuery.data.data.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="border-l-4 border-yellow-400 pl-3"
                    >
                      <p className="font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      <a
                        href={item.url}
                        target="_blank"
                        className="text-sm text-blue-600"
                      >
                        Official notice →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
