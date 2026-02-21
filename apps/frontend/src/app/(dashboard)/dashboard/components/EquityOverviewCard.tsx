// apps/frontend/src/app/(dashboard)/dashboard/components/EquityOverviewCard.tsx
'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Sparkles } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface EquityOverviewCardProps {
  propertyId: string | undefined;
  healthScore: number | null | undefined;
}

const HOME_EQUITY_QUERY_KEY = 'home-equity-summary';
const HOME_NUDGE_QUERY_KEY = 'home-health-nudge';
const PROPERTY_QUERY_KEY = 'property';
const PROPERTIES_QUERY_KEY = 'properties';
const RESALE_ADVANTAGE_BASELINE = 80;

function formatCents(cents: number | null | undefined) {
  const safe = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(safe / 100);
}

function formatCentsOrPlaceholder(cents: number | null | undefined, placeholder = 'Not set') {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return placeholder;
  return formatCents(cents);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function hasMaintenanceAlphaAdvantage(healthScore: number | null | undefined) {
  return typeof healthScore === 'number' && Number.isFinite(healthScore) && healthScore > RESALE_ADVANTAGE_BASELINE;
}

export function EquityOverviewCard({ propertyId, healthScore }: EquityOverviewCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [purchasePriceDollars, setPurchasePriceDollars] = React.useState('');
  const [purchaseDate, setPurchaseDate] = React.useState('');

  const { data } = useQuery({
    queryKey: [HOME_EQUITY_QUERY_KEY, propertyId],
    enabled: !!propertyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await api.getHomeEquitySummary(propertyId!);
      return response.success ? response.data : null;
    },
  });

  React.useEffect(() => {
    if (!data) return;
    setPurchasePriceDollars(
      typeof data.purchasePriceCents === 'number' ? String(data.purchasePriceCents / 100) : ''
    );
    setPurchaseDate(data.purchaseDate ? data.purchaseDate.slice(0, 10) : '');
  }, [data]);

  const saveEquityBaselineMutation = useMutation({
    mutationFn: async () => {
      if (!propertyId) {
        throw new Error('Property is required.');
      }

      const normalizedPrice = Number(purchasePriceDollars);
      if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
        throw new Error('Enter a valid purchase price.');
      }
      if (!purchaseDate) {
        throw new Error('Select the purchase date.');
      }

      const purchasePriceCents = Math.round(normalizedPrice * 100);
      return api.patch(`/api/properties/${propertyId}`, {
        purchasePriceCents,
        purchaseDate,
        isEquityVerified: true,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [HOME_EQUITY_QUERY_KEY, propertyId] }),
        queryClient.invalidateQueries({ queryKey: [PROPERTY_QUERY_KEY, propertyId] }),
        queryClient.invalidateQueries({ queryKey: [PROPERTIES_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [HOME_NUDGE_QUERY_KEY, propertyId] }),
      ]);

      toast({
        title: 'Equity baseline saved',
        description: 'Home equity intelligence has been refreshed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Unable to save equity baseline',
        description: error?.message || 'Please check purchase price and date.',
        variant: 'destructive',
      });
    },
  });

  if (!propertyId || !data) return null;

  const isMissingPurchasePrice = data.purchasePriceCents === null;
  const isMissingPurchaseDate = data.purchaseDate === null;
  const needsEquitySetup =
    !data.isEquityVerified || isMissingPurchasePrice || isMissingPurchaseDate;
  const appraisedCents = data.lastAppraisedValueCents;
  const purchaseCents = data.purchasePriceCents ?? 0;
  const positiveEquityCents = Math.max(0, appraisedCents - purchaseCents);
  const equityPercent =
    appraisedCents > 0 ? clampPercent((positiveEquityCents / appraisedCents) * 100) : 0;
  const showMaintenanceAlpha = hasMaintenanceAlphaAdvantage(healthScore);
  const normalizedPrice = Number(purchasePriceDollars);
  const canSaveBaseline =
    Number.isFinite(normalizedPrice) &&
    normalizedPrice > 0 &&
    purchaseDate.trim().length > 0 &&
    !saveEquityBaselineMutation.isPending;

  const setupPrompt =
    isMissingPurchasePrice && isMissingPurchaseDate
      ? 'Add purchase price and purchase date to unlock accurate equity insights.'
      : isMissingPurchasePrice
        ? 'Add purchase price to unlock accurate appreciation and equity insights.'
        : 'Add purchase date to unlock accurate appreciation timeline insights.';

  return (
    <div className="w-full rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-100 p-2 shrink-0">
          <LineChart className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">Home Equity Overview</h3>
          <p className="mt-1 text-sm text-gray-700">
            {isMissingPurchasePrice
              ? 'Add purchase price to calculate appreciation.'
              : `Appreciation since purchase: ${formatCents(data.appreciationCents)}`}
          </p>
          {needsEquitySetup && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-white/80 p-3">
              <p className="text-xs text-emerald-900">{setupPrompt}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Purchase price (USD)"
                  value={purchasePriceDollars}
                  onChange={(event) => setPurchasePriceDollars(event.target.value)}
                  disabled={saveEquityBaselineMutation.isPending}
                  className="min-h-[44px] rounded-md border border-emerald-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
                />
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                  disabled={saveEquityBaselineMutation.isPending}
                  className="min-h-[44px] rounded-md border border-emerald-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
                />
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[44px]"
                  disabled={!canSaveBaseline}
                  onClick={() => saveEquityBaselineMutation.mutate()}
                >
                  {saveEquityBaselineMutation.isPending ? 'Saving...' : 'Save Baseline'}
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                This updates your equity model without opening full property edit.
              </p>
            </div>
          )}

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
            <p>Purchase: {formatCentsOrPlaceholder(data.purchasePriceCents)}</p>
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
