'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <StatusChip tone={item.priority === 'HIGH' ? 'elevated' : 'info'}>{item.priority}</StatusChip>
              </div>
              <Link
                href={`/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId!)}`}
                className="inline-flex min-h-[44px] items-center rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Review in Maintenance
              </Link>
            </div>
          </SummaryCard>
        ))}
      </div>
    </MobileSection>
  );
}
