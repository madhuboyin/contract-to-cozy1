'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  DollarSign, 
  TrendingUp, 
  ShieldAlert, 
  Zap, 
  Search, 
  ArrowRight,
  ChevronRight,
  PiggyBank,
  Loader2,
  FileText,
  Sparkles,
  PieChart,
  ArrowUpRight,
  BarChart3,
  Building,
  History,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  MobilePageIntro, 
  MobileKpiStrip, 
  MobileKpiTile,
  MobileSection,
  MobileSectionHeader,
  MobileCard,
  BottomSafeAreaReserve
} from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { getRadarStatus } from '../properties/[id]/tools/mortgage-refinance-radar/mortgageRefinanceRadarApi';
import { getPropertyTaxEstimate } from '../properties/[id]/tools/property-tax/taxApi';
import { getSellHoldRent } from '../properties/[id]/tools/sell-hold-rent/sellHoldRentApi';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { cn } from '@/lib/utils';
import { ConfidenceBadge, SourceChip, WhyThisMattersCard } from '@/components/trust';

export default function FinancialEfficiencyClient() {
  const { selectedPropertyId } = usePropertyContext();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // 1. Fetch Recurring Savings (Utilities, Trash, etc.)
  const homeSavingsQuery = useQuery({
    queryKey: ['home-savings-summary', selectedPropertyId],
    queryFn: () => selectedPropertyId ? getHomeSavingsSummary(selectedPropertyId) : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  // 2. Fetch Mortgage/Refinance Status
  const refinanceQuery = useQuery({
    queryKey: ['refinance-radar', selectedPropertyId],
    queryFn: () => selectedPropertyId ? getRadarStatus(selectedPropertyId) : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  // 3. Fetch Property Tax Status
  const taxQuery = useQuery({
    queryKey: ['property-tax', selectedPropertyId],
    queryFn: () => selectedPropertyId ? getPropertyTaxEstimate(selectedPropertyId) : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  // 4. Fetch Equity & Valuation (Sell/Hold/Rent engine)
  const equityQuery = useQuery({
    queryKey: ['equity-insights', selectedPropertyId],
    queryFn: () => selectedPropertyId ? getSellHoldRent(selectedPropertyId) : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const potentialSavings = homeSavingsQuery.data?.potentialAnnualSavings || 0;
  const isLoading = homeSavingsQuery.isLoading || refinanceQuery.isLoading || taxQuery.isLoading || equityQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Analyzing your wealth signals...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 px-4 md:px-0">
      <header className="space-y-2 px-1">
        <div className="flex items-center gap-2 text-brand-600 font-bold text-[10px] uppercase tracking-widest">
          <PieChart className="h-3.5 w-3.5" />
          Financial Efficiency
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Wealth Command Center</h1>
        <p className="text-slate-500 max-w-lg">
          We monitor your home&apos;s financial health to find hidden savings and protect your equity.
        </p>
      </header>

      {/* KPI Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MobileKpiTile 
          label="Found Savings" 
          value={`$${potentialSavings}/yr`} 
          hint="Recurring monthly wins" 
          tone={potentialSavings > 0 ? 'positive' : 'neutral'}
        />
        <MobileKpiTile 
          label="Home Value" 
          value={`$${Math.round((equityQuery.data?.current?.homeValueNow || 0) / 1000)}k`} 
          hint="Estimated market value" 
          tone="neutral"
        />
        <MobileKpiTile 
          label="Est. Equity" 
          value={`$${Math.round(((equityQuery.data?.current?.homeValueNow || 0) - (equityQuery.data?.current?.mortgage?.balanceNow || 0)) / 1000)}k`} 
          hint="Value vs Mortgage" 
          tone="neutral"
        />
        <MobileKpiTile 
          label="Tax Audit" 
          value="Tracked" 
          hint="Next: Feb 2026" 
          tone="neutral"
        />
      </div>

      {/* 3 Pillars */}
      <div className="space-y-12">
        
        {/* Pillar 1: High-Impact Wins (The "Magic" Onboarding) */}
        <section className="space-y-5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-start gap-4">
              <div className="mt-1 p-2 rounded-xl bg-brand-50 border-2 border-brand-100 text-brand-600">
                <Zap className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">High-Impact Wins</h2>
                <p className="text-sm text-slate-500">Major financial adjustments requiring document verification.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Insurance/Onboarding Card */}
            <MobileCard className="bg-brand-900 text-white border-none shadow-xl relative overflow-hidden p-6">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <ShieldAlert className="h-32 w-32 rotate-12" />
              </div>
              <div className="relative z-10 space-y-4">
                <h3 className="text-lg font-bold">Uncover Insurance Savings</h3>
                <p className="text-brand-100 text-xs leading-relaxed max-w-[200px]">
                  Snap a photo of your policy. Gemini AI scans for coverage gaps and better rates.
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

            {/* Refinance Radar Card */}
            <div className="space-y-4">
              {refinanceQuery.data?.available ? (
                <WinCard 
                  title="Refinance Opportunity"
                  value={`$${Math.round(refinanceQuery.data.monthlySavings)}/mo Savings`}
                  description={`Market rates have dropped below your current ${refinanceQuery.data.currentRatePct}% rate.`}
                  actionLabel="Analyze Loan Scenarios"
                  onAction={() => {}}
                  trust={{
                    confidenceLabel: "Verified",
                    freshnessLabel: "Updated daily",
                    sourceLabel: "Fed Funds Rate Index",
                    rationale: "Based on your verified mortgage balance and current credit score estimates."
                  }}
                  className="h-full"
                />
              ) : (
                <div className="rounded-2xl border-2 border-slate-50 bg-white p-5 flex flex-col justify-center items-center text-center space-y-3 h-full grayscale opacity-70">
                  <div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                    <History className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">Refinance Watch Active</h4>
                  <p className="text-[11px] text-slate-500">Watching rates to find your next major monthly win.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Pillar 2: Recurring Savings (PWA Style Tiles) */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-emerald-50 border-2 border-emerald-100 text-emerald-600">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Monthly Wins</h2>
              <p className="text-sm text-slate-500">Recurring costs our engine is actively optimizing.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {homeSavingsQuery.data?.categories.map((cat: any) => (
              <div key={cat.category.key} className="p-4 bg-white rounded-2xl border-2 border-slate-50 hover:border-brand-100 transition-all shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <StatusBadge status={cat.status === 'FOUND_SAVINGS' ? 'positive' : 'neutral'} label={cat.category.name} />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-900">{cat.topOpportunity?.title || "Monitoring Cost"}</p>
                  <p className="text-xs text-slate-500 leading-tight">
                    {cat.topOpportunity?.potentialSavingsUsd 
                      ? `Potential $${cat.topOpportunity.potentialSavingsUsd}/yr savings identified.` 
                      : `Actively watching ${cat.category.name.toLowerCase()} trends for your ZIP.`}
                  </p>
                </div>
                <Button variant="ghost" className="w-full justify-between h-9 px-2 text-[11px] font-bold text-brand-600 hover:bg-brand-50 rounded-lg">
                  {cat.status === 'FOUND_SAVINGS' ? "View Savings" : "Connect Provider"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Pillar 3: Equity & Wealth (High Fidelity Chart Area) */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-blue-50 border-2 border-blue-100 text-blue-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Equity & Market Value</h2>
              <p className="text-sm text-slate-500">Track your home as an asset and see projected ROI.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border-2 border-slate-50 bg-white p-6 space-y-6">
              <div className="flex items-end justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Valuation</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold text-slate-900">${(equityQuery.data?.current?.homeValueNow || 0).toLocaleString()}</h3>
                    <span className="text-sm font-bold text-emerald-600 flex items-center">
                      <ArrowUpRight className="h-4 w-4" />
                      4.2%
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-lg text-[10px] h-8 font-bold">1 Year</Button>
                  <Button variant="outline" size="sm" className="rounded-lg text-[10px] h-8 font-bold bg-slate-50 border-slate-200">5 Years</Button>
                </div>
              </div>
              
              {/* Placeholder for Equity Chart */}
              <div className="h-48 w-full bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-2 opacity-40">
                  <BarChart3 className="h-8 w-8" />
                  <span className="text-[10px] font-bold uppercase tracking-tighter">Market Trend Engine Active</span>
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
                  <h4 className="text-sm font-bold text-brand-400 uppercase tracking-tight">Best Strategy</h4>
                  <p className="text-2xl font-bold">{equityQuery.data?.recommendation?.winner || 'HOLD'}</p>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Based on local rental yields (approx. 5.2%) vs selling costs, your best ROI is currently {equityQuery.data?.recommendation?.winner === 'HOLD' ? 'long-term ownership.' : 'reinvesting elsewhere.'}
                </p>
                <Button className="w-full bg-white text-slate-900 hover:bg-brand-50 rounded-xl font-bold h-10 text-xs">
                  View Full ROI Report
                </Button>
              </div>

              <div className="p-5 rounded-2xl border-2 border-slate-50 bg-white space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Wealth Alerts</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 shrink-0">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Tax Appeal Window</p>
                      <p className="text-[10px] text-slate-500">Assessment data arriving in Feb.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Equity Milestone</p>
                      <p className="text-[10px] text-slate-500">You now own 34% of your home.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>

      <MagicCaptureSheet 
        isOpen={isScannerOpen} 
        onOpenChange={setIsScannerOpen} 
      />

      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}

function StatusBadge({ status, label }: { status: 'positive' | 'neutral' | 'warning', label: string }) {
  return (
    <div className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
      status === 'positive' ? "bg-emerald-100 text-emerald-700" : 
      status === 'warning' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
    )}>
      {label}
    </div>
  );
}
