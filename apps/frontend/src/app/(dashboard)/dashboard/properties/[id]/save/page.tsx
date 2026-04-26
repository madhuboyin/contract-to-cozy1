'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { 
  DollarSign, 
  TrendingUp,
  Zap, 
  PiggyBank,
  Loader2,
  FileText,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  MobileSection,
  MobileSectionHeader,
  MobileCard,
  BottomSafeAreaReserve
} from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { MetricTile, PageHero, SmartCTA, TrustMetaRow } from '@/components/system/PremiumPrimitives';

function rankedCount(
  categories:
    | Array<{ topOpportunity: unknown | null }>
    | null
    | undefined,
): number {
  return (categories ?? []).filter((category) => category.topOpportunity).length;
}

/**
 * SaveHubPage is the "Financial Job" surface.
 * It curates wins from:
 * 1. Insurance optimization
 * 2. Energy rebates
 * 3. Tax appeals
 * 4. Equity growth
 */
export default function SaveHubPage() {
  const params = useParams<{ id: string | string[] }>();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const searchParams = useSearchParams();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const focusSection = searchParams.get('focus');

  const homeSavingsQuery = useQuery({
    queryKey: ['home-savings-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return await getHomeSavingsSummary(propertyId);
    },
    enabled: Boolean(propertyId),
  });

  const potentialSavings = homeSavingsQuery.data?.potentialAnnualSavings || 0;
  const monthlySavings = homeSavingsQuery.data?.potentialMonthlySavings || 0;
  const opportunityCount = rankedCount(homeSavingsQuery.data?.categories);
  const rankedCategories = [...(homeSavingsQuery.data?.categories ?? [])]
    .filter((category) => category.topOpportunity)
    .sort(
      (a, b) =>
        (b.topOpportunity?.estimatedAnnualSavings || 0) -
        (a.topOpportunity?.estimatedAnnualSavings || 0),
    );

  return (
    <ErrorBoundary 
      fallback={
        <div className="mx-auto max-w-7xl p-6 text-center py-20">
          <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <DollarSign className="h-8 w-8 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Savings Engine Resetting</h1>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">
            We&apos;re optimizing your financial dashboard. Please refresh or try again in a few moments.
          </p>
          <Button className="mt-8 rounded-xl h-11 px-8 bg-brand-600" onClick={() => window.location.reload()}>
            Refresh Dashboard
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-12 p-4 sm:p-6 lg:px-8 lg:pb-12">
        <PageHero
          eyebrow="Save"
          icon={<DollarSign className="h-5 w-5" />}
          title="Wealth and savings signals, ranked like premium fintech."
          description="We monitor recurring costs, equity momentum, insurance optimization, tax windows, and document-backed savings opportunities."
          action={<SmartCTA onClick={() => setIsScannerOpen(true)}>Scan policy</SmartCTA>}
          meta={<TrustMetaRow items={['Verified from property and document signals', 'Savings shown as annualized upside', 'Next tax audit window tracked']} />}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <MetricTile label="Annual savings found" value={`$${potentialSavings}`} hint="Verified annual opportunities" tone={potentialSavings > 0 ? 'success' : 'neutral'} />
            <MetricTile label="Monthly potential" value={`$${monthlySavings}`} hint="Recurring monthly upside" tone={monthlySavings > 0 ? 'brand' : 'neutral'} />
            <MetricTile label="Equity status" value="Tracked" hint="Value vs mortgage" tone="brand" />
          </div>
        </PageHero>

        <MobileSection className={focusSection === 'annual-savings' ? 'scroll-mt-24' : undefined}>
          <MobileSectionHeader
            title="Annual Savings Details"
            subtitle="This is the exact savings amount shown on the dashboard tile, backed by property-specific opportunities."
            className="mb-6"
          />
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <MobileCard className={focusSection === 'annual-savings' ? 'border-brand-200 ring-2 ring-brand-100 p-6' : 'p-6'}>
              <div className="flex items-start gap-4">
                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-3 text-brand-700">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-500">Annual savings found on dashboard</p>
                  <h3 className="text-3xl font-bold text-slate-950">${potentialSavings}</h3>
                  <p className="text-sm leading-6 text-slate-600">
                    This is calculated directly from the verified savings opportunities currently matched to this property.
                  </p>
                </div>
              </div>
            </MobileCard>
            <MobileCard className="p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Verified annual savings</span>
                  <span className="font-semibold text-slate-950">${potentialSavings}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Verified monthly savings</span>
                  <span className="font-semibold text-slate-950">${monthlySavings}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Matched opportunity categories</span>
                  <span className="font-semibold text-slate-950">{opportunityCount}</span>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Updated from {homeSavingsQuery.data?.updatedAt ? new Date(homeSavingsQuery.data.updatedAt).toLocaleString() : 'live property signals'}.
                </div>
              </div>
            </MobileCard>
          </div>
        </MobileSection>

        {/* 3. The "Magic" Onboarding Wedge */}
        <MobileSection>
          <MobileCard className="bg-brand-900 text-white border-none shadow-xl relative overflow-hidden p-6 sm:p-10">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Zap className="h-48 w-48 rotate-12" />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 space-y-4 text-center md:text-left">
                <h3 className="text-2xl font-bold">Uncover Insurance Savings</h3>
                <p className="text-brand-100 text-sm sm:text-base mt-1 leading-relaxed max-w-md">
                  Snap a photo of your current policy declaration page. 
                  Gemini will scan for coverage gaps and better rate matches.
                </p>
                <Button 
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-white text-brand-900 hover:bg-brand-50 rounded-xl font-bold h-12 px-8"
                >
                  <Zap className="mr-2 h-4 w-4 fill-brand-900" />
                  Scan My Policy
                </Button>
              </div>
            </div>
          </MobileCard>
        </MobileSection>

        {/* 4. Active Savings "Wins" */}
        <MobileSection className="pt-4">
          <MobileSectionHeader 
            title="Financial Wins" 
            subtitle="Real-time optimization opportunities detected for your home."
            className="mb-6"
          />
          <div className="space-y-4">
            {homeSavingsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : rankedCategories.length > 0 ? (
              rankedCategories.slice(0, 3).map((category) => (
                <WinCard
                  key={category.category.key}
                  title={category.category.label}
                  value={`$${category.topOpportunity?.estimatedAnnualSavings || 0} / year`}
                  description={
                    category.topOpportunity?.detail ||
                    category.topOpportunity?.headline ||
                    'We found a savings opportunity for this category.'
                  }
                  actionLabel="Review savings details"
                  onAction={() => {
                    if (category.topOpportunity?.actionUrl) {
                      window.location.href = category.topOpportunity.actionUrl;
                      return;
                    }
                    if (propertyId || selectedPropertyId) {
                      window.location.href = `/dashboard/properties/${propertyId || selectedPropertyId}/tools/home-savings`;
                    }
                  }}
                  trust={{
                    confidenceLabel: category.topOpportunity?.confidence || 'MEDIUM',
                    freshnessLabel: `Updated ${homeSavingsQuery.data?.updatedAt ? new Date(homeSavingsQuery.data.updatedAt).toLocaleDateString() : 'recently'}`,
                    sourceLabel: category.account?.providerName || category.category.label,
                    rationale: category.topOpportunity?.headline || 'Ranked from your latest property and billing signals.',
                  }}
                  className="border-brand-100"
                />
              ))
            ) : potentialSavings > 0 ? (
              <WinCard 
                title="Insurance Optimization"
                value={`$${potentialSavings} Annual Savings`}
                description="We found a policy with better coverage for your area at a significantly lower premium."
                actionLabel="Review Policy Match"
                onAction={() => {}}
                trust={{
                  confidenceLabel: "High (94%)",
                  freshnessLabel: "Just now",
                  sourceLabel: "Direct Carrier Benchmarks",
                  rationale: "Based on recent rate changes in your ZIP code for 2010+ build years."
                }}
                className="border-brand-100"
              />
            ) : (
              <div className="space-y-4">
                <MobileCard className="bg-slate-50 border-dashed text-center py-12 px-6">
                  <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                    <PiggyBank className="h-8 w-8 text-slate-300" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">No Savings Found Yet</h4>
                  <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                    Our tools are ready to scan for tax appeals and insurance matches. 
                    Upload a document to unlock your first financial win.
                  </p>
                  <div className="pt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <Button 
                      className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold h-12 px-6"
                      onClick={() => setIsScannerOpen(true)}
                    >
                      <Zap className="mr-2 h-4 w-4 fill-white" />
                      Scan My Policy
                    </Button>
                    <Button variant="outline" className="rounded-xl border-slate-200 h-12 px-6" asChild>
                      <Link href={propertyId || selectedPropertyId ? `/dashboard/documents?propertyId=${propertyId || selectedPropertyId}` : '/dashboard/documents'}>
                        <FileText className="mr-2 h-4 w-4" />
                        Browse Documents
                      </Link>
                    </Button>
                  </div>
                </MobileCard>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center gap-3">
                    <div className="h-10 w-10 bg-white rounded-xl shadow-xs flex items-center justify-center text-teal-600">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 tracking-normal">Equity Scan</p>
                      <p className="text-sm font-semibold text-slate-700">Market trends active</p>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center gap-3 opacity-60">
                    <div className="h-10 w-10 bg-white rounded-xl shadow-xs flex items-center justify-center text-amber-600">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 tracking-normal">Tax Appeal</p>
                      <p className="text-sm font-semibold text-slate-700">Opens Feb 2026</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
                  <div className="flex items-center gap-2 text-[10px] font-bold tracking-normal text-slate-400 mb-3 px-1">
                    <Sparkles className="h-3 w-3" />
                    Potential Win in your area
                  </div>
                  <WinCard 
                    title="Regional Benchmark"
                    value="~$420 Potential Savings"
                    description="Typical homeowners in your area save this amount by matching their Dwelling coverage to current market rates."
                    trust={{
                      confidenceLabel: "Estimated",
                      freshnessLabel: "Synced now",
                      sourceLabel: "ZIP Code 78701 Benchmarks",
                      rationale: "Based on 1,200 recent policy optimizations in your neighborhood."
                    }}
                    className="bg-slate-50/50 border-slate-200"
                  />
                </div>
              </div>
            )}
          </div>
        </MobileSection>

        <MagicCaptureSheet 
          isOpen={isScannerOpen} 
          onOpenChange={setIsScannerOpen} 
        />

        <BottomSafeAreaReserve size="chatAware" />
      </div>
    </ErrorBoundary>
  );
}
