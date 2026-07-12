'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CloudSun } from 'lucide-react';
import { MobileCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { api } from '@/lib/api/client';
import type { SectionResult } from '@/types';

export default function EnvironmentReportDashboardCard({ propertyId }: { propertyId: string }) {
  const { data: report, isLoading } = useQuery({
    queryKey: ['environment-report', propertyId],
    queryFn: async () => {
      const response = await api.getEnvironmentReport(propertyId);
      return response.success ? response.data : null;
    },
    enabled: Boolean(propertyId),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />;
  }

  const sections = report?.sections;
  const href = `/dashboard/properties/${propertyId}/environment-report`;

  const availableCount = sections
    ? Object.values(sections).filter((s: SectionResult<unknown>) => s.status === 'ok').length
    : 0;
  const totalSections = sections ? Object.keys(sections).length : 7;
  const topInsight = report?.insights?.[0];

  return (
    <Link href={href} className="no-brand-style block">
      <MobileCard
        variant="compact"
        className="flex items-center gap-3 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
          <CloudSun className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
            Environment Report
          </p>
          <p className="mb-0 mt-0.5 flex items-center gap-2 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
            {topInsight ? (
              <StatusChip tone={topInsight.severity === 'action' ? 'danger' : 'info'}>
                {topInsight.title}
              </StatusChip>
            ) : sections ? (
              <StatusChip tone={availableCount >= totalSections ? 'good' : 'info'}>
                No immediate concerns
              </StatusChip>
            ) : (
              'Weather, air quality, flood risk, and more'
            )}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </MobileCard>
    </Link>
  );
}
