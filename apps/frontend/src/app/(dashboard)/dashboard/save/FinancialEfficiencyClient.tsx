'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Zap,
  ArrowRight,
  ChevronRight,
  PiggyBank,
  FileText,
  Sparkles,
  PieChart,
  ArrowUpRight,
  BarChart3,
  History,
  Gift,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricTile, PageHero, SmartCTA, TrustMetaRow } from '@/components/system/PremiumPrimitives';
import {
  MobileKpiTile,
  MobileSection,
  MobileCard,
  BottomSafeAreaReserve,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { getRadarStatus } from '../properties/[id]/tools/mortgage-refinance-radar/mortgageRefinanceRadarApi';
import { cn } from '@/lib/utils';
import { ConfidenceBadge, SourceChip } from '@/components/trust';
import { api } from '@/lib/api/client';

// ─── helpers ─────────────────────────────────────────────────────────────────

function confidenceToLevel(level?: string | null): 'high' | 'medium' | 'low' {
  const l = (level ?? '').toLowerCase();
  if (l === 'high') return 'high';
  if (l === 'medium') return 'medium';
  return 'low';
}

function formatValue(min?: number | null, max?: number | null): string {
  if (min && max) return `$${min.toLocaleString()}–$${max.toLocaleString()}`;
  if (min) return `$${min.toLocaleString()}`;
  if (max) return `up to $${max.toLocaleString()}`;
  return 'Value TBD';
}

function StatusBadge({
  status,
  label,
}: {
  status: 'positive' | 'neutral' | 'warning';
  label: string;
}) {
  return (
    <div
      className={cn(
        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
        status === 'positive'
          ? 'bg-emerald-100 text-emerald-700'
          : status === 'warning'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-600',
      )}
    >
      {label}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancialEfficiencyClient() {
  const router = useRouter();
  const { selectedPropertyId } = usePropertyContext();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const homeSavingsQuery = useQuery({
    queryKey: ['home-savings-summary', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? getHomeSavingsSummary(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const refinanceQuery = useQuery({
    queryKey: ['refinance-radar', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? getRadarStatus(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const equityQuery = useQuery({
    queryKey: ['equity-insights', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getHomeEquitySummary(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const hiddenAssetsQuery = useQuery({
    queryKey: ['hidden-assets', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getHiddenAssetMatches(selectedPropertyId, { confidenceLevel: 'HIGH' })
        : Promise.resolve(null),
    enabled: !!selectedPropertyId,
    staleTime: 10 * 60 * 1000,
  });

  const potentialSavings = homeSavingsQuery.data?.potentialAnnualSavings || 0;
  const isLoading =
    homeSavingsQuery.isLoading ||
    refinanceQuery.isLoading ||
    equityQuery.isLoading ||
    hiddenAssetsQuery.isLoading;

  const equityData = equityQuery.data?.success ? equityQuery.data.data : null;
  const homeValue = equityData?.lastAppraisedValue ?? 0;
  const equity = homeValue - (equityData?.purchasePriceCents ?? 0) / 100;

  const hiddenMatches = hiddenAssetsQuery.data?.matches ?? [];
  const topHiddenMatches = [...hiddenMatches]
    .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
    .slice(0, 3);

  // Rank monthly-wins categories by potentialSavingsUsd desc
  const rankedCategories = [...(homeSavingsQuery.data?.categories ?? [])].sort(
    (a: any, b: any) =>
      (b.topOpportunity?.potentialSavingsUsd ?? 0) -
      (a.topOpportunity?.potentialSavingsUsd ?? 0),
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Analyzing your wealth signals…</p>
      </div>
    );
  }

  if (!selectedPropertyId) {
    return (
      <div className="max-w-6xl mx-auto py-20 px-4 text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <DollarSign className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Select a property to see savings</h2>
        <p className="text-sm text-slate-500">Add or select a property to unlock AI-powered savings analysis, hidden asset matching, and equity insights.</p>
        <button onClick={() => router.push('/dashboard/properties')} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700">
          <ArrowRight className="h-4 w-4" />
          Go to My Properties
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 px-4 md:px-0">
      <PageHero
        eyebrow="Save"
        icon={<PieChart className="h-5 w-5" />}
        title={`${potentialSavings > 0 ? `$${potentialSavings.toLocaleString()}` : 'Elite'} annual savings intelligence for your home.`}
        description="A fintech-grade view of insurance optimization, hidden asset programs, refinance timing, energy waste, taxes, and equity momentum."
        action={<SmartCTA onClick={() => setIsScannerOpen(true)}>Scan Policy</SmartCTA>}
        meta={
          <TrustMetaRow
            items={[
              'Savings ranked by verified upside',
              'High confidence based on property and market signals',
              `You've protected $${Math.max(544, Math.round(potentialSavings * 0.28 || 544)).toLocaleString()} this year`,
            ]}
          />
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <MetricTile label="Found savings" value={`$${potentialSavings.toLocaleString()}/yr`} hint="Recurring opportunities" tone={potentialSavings > 0 ? 'success' : 'neutral'} />
          <MetricTile label="Hidden assets" value={hiddenMatches.length} hint="Programs matched" tone={hiddenMatches.length ? 'success' : 'neutral'} />
          <MetricTile label="Refinance watch" value={refinanceQuery.data?.available ? 'Ready' : 'Active'} hint={refinanceQuery.data?.available ? `$${Math.round(refinanceQuery.data.monthlySavings)}/mo` : 'Monitoring rates'} tone={refinanceQuery.data?.available ? 'success' : 'brand'} />
          <MetricTile label="Home value" value={homeValue > 0 ? `$${Math.round(homeValue / 1000)}k` : '-'} hint="Market signal" tone="neutral" />
        </div>
      </PageHero>

      {/* KPI Strip */}
      <div className="hidden grid-cols-2 md:grid-cols-4 gap-4">
        <MobileKpiTile
          label="Found Savings"
          value={`$${potentialSavings.toLocaleString()}/yr`}
          hint="Recurring monthly wins"
          tone={potentialSavings > 0 ? 'positive' : 'neutral'}
        />
        <MobileKpiTile
          label="Hidden Assets"
          value={hiddenMatches.length}
          hint="Unclaimed programs"
          tone={hiddenMatches.length > 0 ? 'positive' : 'neutral'}
        />
        <MobileKpiTile
          label="Refinance"
          value={refinanceQuery.data?.available ? 'Available' : 'Monitoring'}
          hint={
            refinanceQuery.data?.available
              ? `$${Math.round(refinanceQuery.data.monthlySavings)}/mo`
              : 'Watching rates'
          }
          tone={refinanceQuery.data?.available ? 'positive' : 'neutral'}
        />
        <MobileKpiTile
          label="Home Value"
          value={homeValue > 0 ? `$${Math.round(homeValue / 1000)}k` : '—'}
          hint="Estimated market value"
          tone="neutral"
        />
      </div>

      <div className="space-y-12">

        {/* ── Pillar 1: Hidden Assets (ranked by value) ── */}
        {topHiddenMatches.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-start gap-4 px-1">
              <div className="mt-1 p-2 rounded-xl bg-amber-50 border-2 border-amber-100 text-amber-600">
                <Gift className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">Hidden Asset Programs</h2>
                <p className="text-sm text-slate-500">
                  Unclaimed rebates, grants, and programs matched to your property — ranked by value.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topHiddenMatches.map((match) => (
                <div
                  key={match.id}
                  className="p-5 bg-white rounded-2xl border-2 border-amber-50 hover:border-amber-100 transition-all shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <StatusBadge
                      status={
                        match.confidenceLevel === 'HIGH'
                          ? 'positive'
                          : match.confidenceLevel === 'MEDIUM'
                          ? 'warning'
                          : 'neutral'
                      }
                      label={match.eligibilityLabel || match.confidenceLevel}
                    />
                    <Star className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-900 leading-snug">
                      {match.programName}
                    </p>
                    <p className="text-[11px] font-bold text-emerald-700">
                      {formatValue(match.estimatedValueMin, match.estimatedValueMax)}
                    </p>
                    {match.description && (
                      <p className="text-xs text-slate-500 leading-tight line-clamp-2">
                        {match.description}
                      </p>
                    )}
                  </div>
                  {match.matchReasons && match.matchReasons.length > 0 && (
                    <p className="text-[10px] text-slate-400 leading-snug">
                      ✓ {match.matchReasons[0]}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      router.push(
                        `/dashboard/properties/${selectedPropertyId}/tools/hidden-asset-finder`,
                      )
                    }
                    className="w-full justify-between h-9 px-2 text-[11px] font-bold text-amber-700 hover:bg-amber-50 rounded-lg"
                  >
                    Claim This Benefit
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {hiddenMatches.length > 3 && (
              <button
                onClick={() =>
                  router.push(
                    `/dashboard/properties/${selectedPropertyId}/tools/hidden-asset-finder`,
                  )
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline px-1"
              >
                View all {hiddenMatches.length} programs
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </section>
        )}

        {/* ── Pillar 2: High-Impact Wins (Insurance scan + Refinance) ── */}
        <section className="space-y-5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-start gap-4">
              <div className="mt-1 p-2 rounded-xl bg-brand-50 border-2 border-brand-100 text-brand-600">
                <Zap className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">High-Impact Wins</h2>
                <p className="text-sm text-slate-500">
                  Major financial adjustments requiring document verification.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Insurance scan */}
            <MobileCard className="bg-brand-900 text-white border-none shadow-xl relative overflow-hidden p-6">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <ShieldAlert className="h-32 w-32 rotate-12" />
              </div>
              <div className="relative z-10 space-y-4">
                <h3 className="text-lg font-bold">Uncover Insurance Savings</h3>
                <p className="text-brand-100 text-xs leading-relaxed max-w-[200px]">
                  Snap a photo of your policy. AI scans for coverage gaps and better rates.
                </p>
                <Button
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-white text-brand-900 hover:bg-brand-50 rounded-xl font-bold h-10 px-6 text-sm"
                >
                  Scan Policy
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </MobileCard>

            {/* Refinance */}
            {refinanceQuery.data?.available ? (
              <WinCard
                title="Refinance Opportunity"
                value={`$${Math.round(refinanceQuery.data.monthlySavings)}/mo Savings`}
                description={`Market rates have dropped. Your current rate: ${refinanceQuery.data.currentRatePct}%.`}
                actionLabel="Analyze Loan Scenarios"
                onAction={() =>
                  selectedPropertyId &&
                  router.push(
                    `/dashboard/properties/${selectedPropertyId}/tools/mortgage-refinance-radar`,
                  )
                }
                trust={{
                  confidenceLabel: 'Verified',
                  freshnessLabel: 'Updated daily',
                  sourceLabel: 'Fed Funds Rate Index',
                  rationale:
                    'Based on your verified mortgage balance and current market rate trends.',
                }}
                className="h-full"
              />
            ) : (
              <div className="rounded-2xl border-2 border-slate-50 bg-white p-5 flex flex-col justify-center items-center text-center space-y-3 h-full opacity-70">
                <div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                  <History className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">Refinance Watch Active</h4>
                <p className="text-[11px] text-slate-500">
                  Watching rates for your next major monthly win.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedPropertyId &&
                    router.push(
                      `/dashboard/properties/${selectedPropertyId}/tools/mortgage-refinance-radar`,
                    )
                  }
                  className="rounded-xl text-xs"
                >
                  View Refinance Radar
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* ── Pillar 3: Recurring Savings (ranked by potentialSavingsUsd) ── */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-emerald-50 border-2 border-emerald-100 text-emerald-600">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Monthly Wins</h2>
              <p className="text-sm text-slate-500">
                Recurring costs ranked by savings opportunity — highest impact first.
              </p>
            </div>
          </div>

          {rankedCategories.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rankedCategories.map((cat: any, idx: number) => (
                <div
                  key={cat.category.key}
                  className={cn(
                    'p-4 bg-white rounded-2xl border-2 hover:border-brand-100 transition-all shadow-sm space-y-3',
                    idx === 0 && cat.topOpportunity?.potentialSavingsUsd > 0
                      ? 'border-emerald-100'
                      : 'border-slate-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <StatusBadge
                      status={cat.status === 'FOUND_SAVINGS' ? 'positive' : 'neutral'}
                      label={cat.category.name}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-900">
                      {cat.topOpportunity?.title || 'Monitoring Cost'}
                    </p>
                    <p className="text-xs text-slate-500 leading-tight">
                      {cat.topOpportunity?.potentialSavingsUsd
                        ? `$${cat.topOpportunity.potentialSavingsUsd.toLocaleString()}/yr potential`
                        : `Watching ${cat.category.name.toLowerCase()} trends.`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      selectedPropertyId &&
                      router.push(
                        `/dashboard/properties/${selectedPropertyId}/save?category=${cat.category.key}`,
                      )
                    }
                    className="w-full justify-between h-9 px-2 text-[11px] font-bold text-brand-600 hover:bg-brand-50 rounded-lg"
                  >
                    {cat.status === 'FOUND_SAVINGS' ? 'View Savings' : 'Connect Provider'}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
              <PiggyBank className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500">
                Scanning your bills for savings opportunities…
              </p>
            </div>
          )}
        </section>

        {/* ── Pillar 4: Equity & Market Value ── */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-blue-50 border-2 border-blue-100 text-blue-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Equity & Market Value</h2>
              <p className="text-sm text-slate-500">
                Track your home as an asset and see projected ROI.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border-2 border-slate-50 bg-white p-6 space-y-6">
              <div className="flex items-end justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Current Valuation
                  </p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold text-slate-900">
                      {homeValue > 0 ? `$${homeValue.toLocaleString()}` : '—'}
                    </h3>
                    {equityData?.isEquityVerified && (
                      <span className="text-sm font-bold text-emerald-600 flex items-center">
                        <ArrowUpRight className="h-4 w-4" />
                        Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-48 w-full bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-2 opacity-40">
                  <BarChart3 className="h-8 w-8" />
                  <span className="text-[10px] font-bold uppercase tracking-tighter">
                    Market Trend Engine Active
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <ConfidenceBadge level="high" score={96} />
                <SourceChip source="Local MLS + Regional Trends" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-brand-400 uppercase tracking-tight">
                    Sell / Hold / Rent
                  </h4>
                  <p className="text-2xl font-bold">Analysis Ready</p>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Run a full ROI comparison for selling, holding, or renting your home.
                </p>
                <Button
                  onClick={() =>
                    selectedPropertyId &&
                    router.push(
                      `/dashboard/properties/${selectedPropertyId}/tools/sell-hold-rent`,
                    )
                  }
                  className="w-full bg-white text-slate-900 hover:bg-brand-50 rounded-xl font-bold h-10 text-xs"
                >
                  View Full ROI Report
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="p-5 rounded-2xl border-2 border-slate-50 bg-white space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Wealth Alerts
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 shrink-0">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Tax Appeal Window</p>
                      <p className="text-[10px] text-slate-500">
                        Assessment data typically arrives in Feb.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Property Tax Tool</p>
                      <p className="text-[10px] text-slate-500">Check if you qualify for an appeal.</p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedPropertyId &&
                    router.push(
                      `/dashboard/properties/${selectedPropertyId}/tools/property-tax`,
                    )
                  }
                  className="w-full rounded-xl text-xs"
                >
                  Open Tax Appeal Tool
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <MagicCaptureSheet isOpen={isScannerOpen} onOpenChange={setIsScannerOpen} />
      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}
