'use client';

import Link from 'next/link';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { MobileSection, MobileSectionHeader, StatusChip, SummaryCard } from '@/components/mobile/dashboard/MobilePrimitives';
import {
  getModulePersonalizationRecommendations,
  PersonalizationModule,
} from '@/lib/api/personalizationApi';

export function PersonalizedReadOnlySuggestions({
  propertyId,
  module,
  title,
  limit = 3,
}: {
  propertyId?: string;
  module: 'DASHBOARD' | 'HEALTH';
  title: string;
  limit?: number;
}) {
  const recommendations = useQuery({
    queryKey: ['personalization-module', propertyId, module],
    queryFn: () => getModulePersonalizationRecommendations(propertyId!, module as PersonalizationModule, limit),
    enabled: Boolean(propertyId),
    retry: false,
    staleTime: 30_000,
  });
  const items = recommendations.data?.items ?? [];
  if (recommendations.isLoading || recommendations.isError || items.length === 0) return null;

  return (
    <MobileSection>
      <MobileSectionHeader title={title} subtitle="Reviewed guidance ranked from this home's current signals" />
      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <SummaryCard key={item.id} title={item.title} subtitle={item.summary}>
            <div className="space-y-3">
              {item.governance.professionalBoundary ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {item.governance.professionalBoundary}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <StatusChip tone={item.priority === 'HIGH' ? 'elevated' : 'info'}>{item.priority}</StatusChip>
                <StatusChip tone={item.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'elevated' : 'info'}>{item.governance.safetyTier.replaceAll('_', ' ')}</StatusChip>
              </div>
              <Link
                href={`/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId!)}`}
                className="inline-flex min-h-[44px] items-center rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Review in Maintenance
              </Link>
              </div>
            </div>
          </SummaryCard>
        ))}
      </div>
    </MobileSection>
  );
}
