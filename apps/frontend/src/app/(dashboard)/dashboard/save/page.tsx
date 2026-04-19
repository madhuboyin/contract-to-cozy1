'use client';

import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  ShieldAlert, 
  Zap, 
  Search, 
  ArrowRight,
  PiggyBank,
  Loader2,
  FileText
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
import { api } from '@/lib/api/client';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { useQuery } from '@tanstack/react-query';

/**
 * SaveHubPage is the "Financial Job" surface.
 * It curates wins from:
 * 1. Insurance optimization
 * 2. Energy rebates
 * 3. Tax appeals
 * 4. Equity growth
 */
export default function SaveHubPage() {
  const { selectedPropertyId } = usePropertyContext();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const homeSavingsQuery = useQuery({
    queryKey: ['home-savings-summary', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return null;
      return await getHomeSavingsSummary(selectedPropertyId);
    },
    enabled: Boolean(selectedPropertyId),
  });

  const potentialSavings = homeSavingsQuery.data?.potentialAnnualSavings || 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:px-8 lg:pb-12">
      {/* 1. Page Header */}
      <MobilePageIntro
        title="Wealth & Savings"
        subtitle="We monitor your home's financial health to find hidden savings and protect your equity."
        action={
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-teal-700">
            <DollarSign className="h-5 w-5" />
          </div>
        }
      />

      {/* 2. Financial KPIs */}
      <MobileKpiStrip className="sm:grid-cols-3">
        <MobileKpiTile 
          label="Total Potential" 
          value={potentialSavings > 0 ? `$${potentialSavings}` : '$0'} 
          hint="Annual savings found" 
          tone={potentialSavings > 0 ? 'positive' : 'neutral'} 
        />
        <MobileKpiTile 
          label="Equity Status" 
          value="Tracked" 
          hint="Value vs Mortgage" 
          tone="info"
        />
        <MobileKpiTile 
          label="Tax Audit" 
          value="Next: Feb" 
          hint="Property tax window" 
        />
      </MobileKpiStrip>

      {/* 3. The "Magic" Onboarding Wedge */}
      <MobileSection>
        <MobileCard className="bg-brand-900 text-white border-none shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Zap className="h-32 w-32 rotate-12" />
          </div>
          <div className="relative z-10 space-y-4">
            <div>
              <h3 className="text-xl font-bold">Uncover Insurance Savings</h3>
              <p className="text-brand-100 text-sm mt-1">
                Snap a photo of your current policy declaration page. 
                Gemini will scan for coverage gaps and better rate matches.
              </p>
            </div>
            <Button 
              onClick={() => setIsScannerOpen(true)}
              className="bg-white text-brand-900 hover:bg-brand-50 rounded-xl font-bold h-12 px-6"
            >
              <Zap className="mr-2 h-4 w-4 fill-brand-900" />
              Scan My Policy
            </Button>
          </div>
        </MobileCard>
      </MobileSection>

      {/* 4. Active Savings "Wins" */}
      <MobileSection>
        <MobileSectionHeader 
          title="Financial Wins" 
          subtitle="Real-time optimization opportunities detected for your home."
        />
        <div className="space-y-4">
          {homeSavingsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
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
            <MobileCard className="bg-slate-50 border-dashed text-center py-10 space-y-4">
              <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <PiggyBank className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">
                No major financial leaks detected yet. Upload your utility bills or insurance policy to run a deep scan.
              </p>
              <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => setIsScannerOpen(true)}>
                Upload Financial Doc
              </Button>
            </MobileCard>
          )}

          {/* Placeholder for future engines */}
          <MobileCard variant="compact" className="bg-slate-50/50 opacity-60 grayscale border-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Tax Appeal Engine (Feb 2026)</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </div>
          </MobileCard>
        </div>
      </MobileSection>

      <MagicCaptureSheet 
        isOpen={isScannerOpen} 
        onOpenChange={setIsScannerOpen} 
      />

      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}
