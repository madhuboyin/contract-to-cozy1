// apps/frontend/src/app/(dashboard)/dashboard/components/EquityOverviewCard.tsx
'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Sparkles } from 'lucide-react';
import { api } from '@/lib/api/client';

interface EquityOverviewCardProps {
  propertyId: string | undefined;
  healthScore: number | null | undefined;
}

const HOME_EQUITY_QUERY_KEY = 'home-equity-summary';
const RESALE_ADVANTAGE_BASELINE = 80;

function formatCents(cents: number | null | undefined) {
  const safe = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe / 100);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function hasMaintenanceAlphaAdvantage(healthScore: number | null | undefined) {
  return typeof healthScore === 'number' && Number.isFinite(healthScore) && healthScore > RESALE_ADVANTAGE_BASELINE;
}

export function EquityOverviewCard({ propertyId, healthScore }: EquityOverviewCardProps) {
  const { data } = useQuery({
    queryKey: [HOME_EQUITY_QUERY_KEY, propertyId],
    enabled: !!propertyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await api.getHomeEquitySummary(propertyId!);
      return response.success ? response.data : null;
    },
  });

  if (!propertyId || !data) return null;

  const appraisedCents = data.lastAppraisedValueCents;
  const purchaseCents = data.purchasePriceCents ?? 0;
  const positiveEquityCents = Math.max(0, appraisedCents - purchaseCents);
  const equityPercent =
    appraisedCents > 0 ? clampPercent((positiveEquityCents / appraisedCents) * 100) : 0;
  const showMaintenanceAlpha = hasMaintenanceAlphaAdvantage(healthScore);

  return (
    <div className="w-full rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-100 p-2 shrink-0">
          <LineChart className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">Home Equity Overview</h3>
          <p className="mt-1 text-sm text-gray-700">
            Appreciation since purchase: {formatCents(data.appreciationCents)}
          </p>

          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-gray-600">
              <span>Equity progress</span>
              <span>{Math.round(equityPercent)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${equityPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-1 text-xs text-gray-700 sm:grid-cols-3">
            <p>Purchase: {formatCents(data.purchasePriceCents)}</p>
            <p>Appraised: {formatCents(data.lastAppraisedValueCents)}</p>
            <p>Maintenance Premium: {formatCents(data.maintenancePremiumCents)}</p>
          </div>

          {showMaintenanceAlpha ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" />
              Documented care has added ~{formatCents(data.maintenancePremiumCents)} to your home&apos;s resale attractiveness.
            </div>
          ) : (
            <p className="mt-3 text-xs text-emerald-800">
              Keep your health score above {RESALE_ADVANTAGE_BASELINE} to unlock your Maintenance Alpha resale badge.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
