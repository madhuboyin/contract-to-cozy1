'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
          tone="neutral"
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
            <div className="space-y-4">
              <MobileCard className="bg-slate-50 border-dashed text-center py-12 px-6">
                <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <PiggyBank className="h-8 w-8 text-slate-300" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">No Savings Found Yet</h4>
                <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                  Our engines are ready to scan for tax appeals and insurance matches. 
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
                    <Link href="/dashboard/documents">
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
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Equity Scan</p>
                    <p className="text-sm font-semibold text-slate-700">Market trends active</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center gap-3 opacity-60">
                  <div className="h-10 w-10 bg-white rounded-xl shadow-xs flex items-center justify-center text-amber-600">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tax Appeal</p>
                    <p className="text-sm font-semibold text-slate-700">Opens Feb 2026</p>
                  </div>
                </div>
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
  );
}
