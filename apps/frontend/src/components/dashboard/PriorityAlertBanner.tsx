'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import { OrchestratedActionDTO } from '@/types';

type PriorityAlertBannerProps = {
  propertyId?: string;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function PriorityAlertBanner({ propertyId }: PriorityAlertBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!propertyId) return;
    const key = `priority_banner_dismissed_${propertyId}_${todayKey()}`;
    setDismissed(Boolean(window.localStorage.getItem(key)));
  }, [propertyId]);

  const bannerQuery = useQuery({
    queryKey: ['priority-alert-banner', propertyId],
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const summary = await api.getOrchestrationSummary(propertyId!);
      const actions = Array.isArray(summary?.actions) ? summary.actions : [];
      const highPriority = actions.filter((action: OrchestratedActionDTO) => {
        const status = String(action.status || '').toUpperCase();
        const level = String(action.riskLevel || '').toUpperCase();
        const isPending =
          !status ||
          status === 'PENDING' ||
          status === 'OPEN' ||
          status === 'TODO' ||
          status === 'IN_PROGRESS';
        return isPending && (level === 'HIGH' || level === 'CRITICAL');
      });
      const totalExposure = highPriority.reduce((sum, action) => {
        const cost = Number(action.exposure || 0);
        return sum + (Number.isFinite(cost) ? cost : 0);
      }, 0);
      return {
        count: highPriority.length,
        totalExposure,
      };
    },
  });

  if (!propertyId || dismissed || bannerQuery.isLoading || bannerQuery.isError) return null;

  const count = bannerQuery.data?.count ?? 0;
  const totalExposure = bannerQuery.data?.totalExposure ?? 0;
  if (count <= 0) return null;

  const dismiss = () => {
    const key = `priority_banner_dismissed_${propertyId}_${todayKey()}`;
    window.localStorage.setItem(key, '1');
    setDismissed(true);
  };

  return (
    <section className="mb-5 rounded-xl border border-red-200 bg-red-50 shadow-lg">
      <div className="border-l-4 border-red-500 px-4 py-4">
        <button
          type="button"
          aria-label="Dismiss priority banner"
          onClick={dismiss}
          className="float-right inline-flex h-8 w-8 items-center justify-center rounded-md text-red-700 hover:bg-red-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <div>
              <h3 className="text-base font-semibold text-red-900">
                You have {count} high-priority action{count === 1 ? '' : 's'} this week
              </h3>
              <p className="text-sm text-red-700">
                Estimated cost if ignored: {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                }).format(totalExposure)}
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/actions?propertyId=${encodeURIComponent(propertyId)}`}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-700 md:w-auto"
          >
            Review Actions →
          </Link>
        </div>
      </div>
    </section>
  );
}
