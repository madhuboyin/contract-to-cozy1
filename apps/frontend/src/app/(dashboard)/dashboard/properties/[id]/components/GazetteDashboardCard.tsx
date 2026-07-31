'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText } from 'lucide-react';
import { MobileCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { getHomeBriefing } from '../tools/home-briefing/homeBriefingApi';

export default function GazetteDashboardCard({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['home-briefing', propertyId],
    queryFn: () => getHomeBriefing(propertyId),
    enabled: Boolean(propertyId) && FEATURE_FLAGS.HOME_GAZETTE,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />;
  }

  // Home Briefing earns Home-page space only for unread material.
  if (!data?.current || data.unreadMaterialCount === 0) return null;

  const headline = data.current.items.find((item) =>
    !item.seenAt && !item.actedAt && !item.dismissedAt && !item.notUsefulAt)?.title;

  return (
    <Link
      href={`/dashboard/properties/${propertyId}/tools/home-briefing`}
      className="no-brand-style block"
    >
      <MobileCard
        variant="standard"
        className="space-y-2.5 border-indigo-200 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
              <FileText className="h-4 w-4 text-indigo-700" aria-hidden="true" />
            </div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Home Briefing
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="elevated">
            {data.unreadMaterialCount} unread
          </StatusChip>
          <span className="text-xs text-[hsl(var(--mobile-text-secondary))]">
            Meaningful canonical changes
          </span>
        </div>
        {headline ? (
          <p className="mb-0 line-clamp-2 text-[13px] text-[hsl(var(--mobile-text-primary))]">
            {headline}
          </p>
        ) : null}
      </MobileCard>
    </Link>
  );
}
