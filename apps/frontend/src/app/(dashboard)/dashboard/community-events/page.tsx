// apps/frontend/src/app/(dashboard)/dashboard/community-events/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Calendar, ExternalLink, Trash2 } from 'lucide-react';

import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  BottomSafeAreaReserve,
  CompactEntityRow,
  EmptyStateCard,
  MobileCard,
  MobileFilterSurface,
  MobilePageIntro,
  MobileToolWorkspace,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

type CommunityTab = 'events' | 'trash' | 'alerts';

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function CommunityPage() {
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId;
  const [isResolvingProperty, setIsResolvingProperty] = useState(!selectedPropertyId);
  const [tab, setTab] = useState<CommunityTab>('events');

  useEffect(() => {
    let isActive = true;

    const resolveDefaultProperty = async () => {
      if (selectedPropertyId) {
        setIsResolvingProperty(false);
        return;
      }

      setIsResolvingProperty(true);

      try {
        const propertiesRes = await api.getProperties();
        const properties = propertiesRes.success ? propertiesRes.data.properties || [] : [];
        if (!isActive) return;
        if (properties.length > 0) {
          setSelectedPropertyId(properties[0].id);
        }
      } catch (error) {
        console.error('Failed to resolve property for community events:', error);
      } finally {
        if (isActive) {
          setIsResolvingProperty(false);
        }
      }
    };

    resolveDefaultProperty();

    return () => {
      isActive = false;
    };
  }, [selectedPropertyId, setSelectedPropertyId]);

  const { data: property } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getProperty(propertyId);
      return response.success ? response.data : null;
    },
    enabled: !!propertyId,
  });

  const eventsQuery = useQuery({
    queryKey: ['community-events', propertyId],
    queryFn: () => api.getCommunityEvents(propertyId!, { limit: 20 }),
    enabled: !!propertyId && tab === 'events',
  });

  const trashQuery = useQuery({
    queryKey: ['community-trash', propertyId],
    queryFn: () => api.getCommunityTrash(propertyId!),
    enabled: !!propertyId && tab === 'trash',
  });

  const alertsQuery = useQuery({
    queryKey: ['community-alerts', propertyId],
    queryFn: () => api.getCommunityAlerts(propertyId!),
    enabled: !!propertyId && tab === 'alerts',
  });

  if (isResolvingProperty && !propertyId) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
        intro={<MobilePageIntro title="Community" subtitle="Loading local services and events for your selected home." />}
      >
        <MobileCard variant="compact" className="py-10 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-b-2 border-brand-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading community data...</p>
        </MobileCard>
      </MobileToolWorkspace>
    );
  }

  if (!propertyId) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
        intro={<MobilePageIntro title="Community" subtitle="Events, city services, and municipal alerts." />}
      >
        <EmptyStateCard
          title="Select a property"
          description="Choose a property to view community events, trash schedules, and city alerts."
        />
      </MobileToolWorkspace>
    );
  }

  const locationLabel = [property?.city, property?.state].filter(Boolean).join(', ') || 'Selected property area';

  return (
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={<MobilePageIntro title="Community" subtitle="Local events, city services, and municipal alerts." />}
      summary={
        <MobileCard variant="compact" className="flex items-center justify-between gap-3">
          <div>
            <p className="mb-0 text-xs tracking-normal text-slate-500">Coverage area</p>
            <p className="mb-0 mt-1 text-sm font-semibold text-slate-900">{locationLabel}</p>
          </div>
          <StatusChip tone="info">Live feed</StatusChip>
        </MobileCard>
      }
      filters={
        <MobileFilterSurface className="space-y-2.5">
          <p className="text-[11px] font-medium tracking-normal text-slate-500">Sections</p>
          <div className="inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1">
            <TabButton label="Events" icon={<Calendar className="h-3.5 w-3.5" />} active={tab === 'events'} onClick={() => setTab('events')} />
            <TabButton label="Trash" icon={<Trash2 className="h-3.5 w-3.5" />} active={tab === 'trash'} onClick={() => setTab('trash')} />
            <TabButton label="Alerts" icon={<AlertTriangle className="h-3.5 w-3.5" />} active={tab === 'alerts'} onClick={() => setTab('alerts')} />
          </div>
        </MobileFilterSurface>
      }
    >
      {tab === 'events' ? (
        eventsQuery.isLoading ? (
          <MobileCard variant="compact" className="py-8 text-center text-sm text-muted-foreground">
            Loading events...
          </MobileCard>
        ) : eventsQuery.isError ? (
          <EmptyStateCard title="Unable to load events" description="Please try again in a moment." />
        ) : !eventsQuery.data?.success || (eventsQuery.data.data?.events?.length ?? 0) === 0 ? (
          <EmptyStateCard title="No upcoming events" description="No nearby events are available for this property right now." />
        ) : (
          <div className="space-y-2.5">
            {eventsQuery.data.data.events.map((ev) => (
              <CompactEntityRow
                key={ev.id}
                title={ev.title}
                subtitle={new Date(ev.startTime).toLocaleString()}
                meta={
                  ev.externalUrl ? (
                    <a
                      href={ev.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary hover:underline"
                    >
                      Source
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : undefined
                }
                status={<StatusChip tone="info">Event</StatusChip>}
              />
            ))}
          </div>
        )
      ) : null}

      {tab === 'trash' ? (
        trashQuery.isLoading ? (
          <MobileCard variant="compact" className="py-8 text-center text-sm text-muted-foreground">
            Loading trash and recycling details...
          </MobileCard>
        ) : !trashQuery.data?.success || (trashQuery.data.data?.items?.length ?? 0) === 0 ? (
          <EmptyStateCard
            title="No trash feed available"
            description="This city does not currently provide a public trash/recycling feed."
          />
        ) : (
          <div className="space-y-2.5">
            {trashQuery.data.data.items.map((item: { title: string; description?: string; url?: string }, idx: number) => (
              <CompactEntityRow
                key={`${item.title}-${idx}`}
                title={item.title}
                subtitle={item.description}
                meta={
                  item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary hover:underline"
                    >
                      View source
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : undefined
                }
                status={<StatusChip tone="protected">City service</StatusChip>}
              />
            ))}
          </div>
        )
      ) : null}

      {tab === 'alerts' ? (
        alertsQuery.isLoading ? (
          <MobileCard variant="compact" className="py-8 text-center text-sm text-muted-foreground">
            Loading city alerts...
          </MobileCard>
        ) : !alertsQuery.data?.success || (alertsQuery.data.data?.items?.length ?? 0) === 0 ? (
          <EmptyStateCard title="No active alerts" description="No current municipal alerts are active for this area." />
        ) : (
          <div className="space-y-2.5">
            {alertsQuery.data.data.items.map((item: { title: string; description?: string; url?: string }, idx: number) => (
              <CompactEntityRow
                key={`${item.title}-${idx}`}
                title={item.title}
                subtitle={item.description}
                meta={
                  item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary hover:underline"
                    >
                      Official notice
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : undefined
                }
                status={<StatusChip tone="needsAction">Alert</StatusChip>}
              />
            ))}
          </div>
        )
      ) : null}

      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
