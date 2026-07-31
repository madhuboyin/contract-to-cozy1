'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight, MapPin } from 'lucide-react';
import {
  MobileCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { getAroundYourHome } from '../tools/neighborhood-change-radar/aroundYourHomeApi';

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function NeighborhoodRadarDashboardCard({
  propertyId,
}: {
  propertyId: string;
}) {
  const toolHref = `/dashboard/properties/${propertyId}/tools/neighborhood-change-radar`;
  const { data, isLoading } = useQuery({
    queryKey: ['around-your-home', propertyId],
    queryFn: () => getAroundYourHome(propertyId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />;
  }

  const followedUpdates = data?.items.filter(
    (item) => item.interaction.disposition === 'FOLLOWING' && item.interaction.hasMaterialUpdate,
  ).length ?? 0;
  const visibleCount = data?.items.filter(
    (item) => !['DISMISSED', 'NOT_RELEVANT'].includes(item.interaction.disposition),
  ).length ?? 0;

  return (
    <Link href={toolHref} className="no-brand-style block">
      <MobileCard
        variant={visibleCount > 0 ? 'standard' : 'compact'}
        className="space-y-2.5 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
              <MapPin className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" aria-hidden="true" />
            </div>
            <div>
              <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                Around Your Home
              </p>
              <p className="mb-0 mt-0.5 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
                Reviewed local planning and infrastructure sources
              </p>
            </div>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[hsl(var(--mobile-text-secondary))]">
          <StatusChip tone={data?.coverage.state === 'CURRENT' ? 'good' : 'elevated'}>
            {humanize(data?.coverage.state ?? 'NOT_CONFIGURED')}
          </StatusChip>
          {visibleCount > 0
            ? <span>{visibleCount} reviewed {visibleCount === 1 ? 'record' : 'records'}</span>
            : <span>No matched records; coverage may be incomplete</span>}
          {followedUpdates > 0 ? (
            <span className="inline-flex items-center font-medium text-indigo-700">
              <Bell className="mr-1 h-3.5 w-3.5" />
              {followedUpdates} followed {followedUpdates === 1 ? 'update' : 'updates'}
            </span>
          ) : null}
        </div>

        <p className="mb-0 text-[12px] leading-relaxed text-[hsl(var(--mobile-text-secondary))]">
          Source facts are separate from possible relevance; no property-value prediction.
        </p>
      </MobileCard>
    </Link>
  );
}
