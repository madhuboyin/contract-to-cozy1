'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Zap,
  ArrowRight,
  ChevronRight,
  Wand2,
  Sparkles,
  DollarSign,
  FileText,
  Clock,
  Plus,
  RefreshCw,
  Loader2,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { 
  getCoverageAnalysis, 
  runCoverageAnalysis,
  type CoverageAnalysisDTO 
} from '@/lib/api/coverageAnalysisApi';
import { listClaims, type ClaimDTO, getClaimsSummary } from '../claims/claimsApi';
import { detectCoverageGaps, type CoverageGapResult } from '../../../inventory/inventoryApi'; 
import { MobilePageContainer, MobileCard, MobileKpiStrip, MobileKpiTile, StatusChip, ActionPriorityRow, ResultHeroCard } from '@/components/mobile/dashboard/MobilePrimitives';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';

export default function CoverageOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  // 1. Data Fetching
  const { data: analysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery({
    queryKey: ['coverage-analysis', propertyId],
    queryFn: () => getCoverageAnalysis(propertyId),
    enabled: !!propertyId,
  });

  const { data: claimsData, isLoading: claimsLoading } = useQuery({
    queryKey: ['claims', propertyId],
    queryFn: () => listClaims(propertyId),
    enabled: !!propertyId,
  });

  const { data: claimsSummary } = useQuery({
    queryKey: ['claims-summary', propertyId],
    queryFn: () => getClaimsSummary(propertyId),
    enabled: !!propertyId,
  });

  const runMutation = useMutation({
    mutationFn: () => runCoverageAnalysis(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-analysis', propertyId] });
    },
  });

  const analysis = analysisData?.exists ? analysisData.analysis : null;
  const activeClaims = (claimsData ?? []).filter((c: ClaimDTO) => c.status !== 'CLOSED');
  const gapCount = analysis?.insurance?.flags?.find(f => f.code === 'INVENTORY_COVERAGE_GAPS')?.label?.split(' ')[0] || '0';

  // 2. Computed State
  const shieldScore = useMemo(() => {
    if (!analysis) return 0;
    let score = 0;
    if (analysis.overallVerdict === 'WORTH_IT') score = 90;
    else if (analysis.overallVerdict === 'SITUATIONAL') score = 65;
    else score = 40;

    // Adjust for gaps
    const gaps = parseInt(gapCount);
    score -= gaps * 5;

    // Adjust for confidence
    if (analysis.confidence === 'HIGH') score += 10;
    if (analysis.confidence === 'LOW') score -= 10;

    return Math.max(10, Math.min(100, score));
  }, [analysis, gapCount]);

  const shieldTone = shieldScore >= 80 ? 'positive' : shieldScore >= 50 ? 'warning' : 'danger';

  // 3. Render Helpers
  if (analysisLoading || claimsLoading) {
    return (
      <MobilePageContainer className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm font-medium text-slate-500">Evaluating protection layers...</p>
        </div>
      </MobilePageContainer>
    );
  }

  return (
    <MobilePageContainer className="space-y-6 pb-20 lg:max-w-6xl lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">Coverage Overview</h1>
          <p className="mt-1 text-sm text-slate-500">Your unified home protection dashboard.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 gap-2 rounded-xl"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          <RefreshCw className={cn("h-4 w-4", runMutation.isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI Strip */}
      <MobileKpiStrip>
        <MobileKpiTile 
          label="Shield Score" 
          value={`${shieldScore}%`} 
          tone={shieldTone}
        />
        <MobileKpiTile 
          label="Active Gaps" 
          value={gapCount} 
          tone={parseInt(gapCount) > 0 ? 'warning' : 'neutral'} 
        />
        <MobileKpiTile 
          label="Open Claims" 
          value={claimsSummary?.counts.open || 0} 
          tone={(claimsSummary?.counts.open || 0) > 0 ? 'warning' : 'neutral'} 
        />
        <MobileKpiTile 
          label="Expected Risk" 
          value={formatCurrency(analysis?.warranty.expectedAnnualRepairRiskUsd || 0)} 
          tone="neutral" 
        />
      </MobileKpiStrip>

      {/* AI Strategic Take (USP) */}
      <AnimatePresence mode="wait">
        {analysis?.strategicAdvice ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-sky-50/40 p-6 shadow-sm lg:p-8"
          >
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-md">
                <Wand2 className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-sky-700">Strategic Protection Take</span>
                  <span className="flex h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                </div>
                <p className="text-base font-semibold leading-relaxed text-slate-800 lg:text-lg">
                  &ldquo;{analysis.strategicAdvice}&rdquo;
                </p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 opacity-[0.03]">
              <Shield className="h-32 w-32 text-sky-900" />
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center"
          >
            <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Run analysis to generate your AI Protection Take.</p>
            <Button 
              variant="link" 
              className="mt-1 text-sky-600"
              onClick={() => runMutation.mutate()}
            >
              Analyze Coverage Now
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Claims Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold text-slate-900">Active Claims</h3>
            <Link 
              href={`/dashboard/properties/${propertyId}/claims`}
              className="text-xs font-semibold text-teal-600 hover:underline"
            >
              View all
            </Link>
          </div>

          {activeClaims.length > 0 ? (
            <div className="space-y-3">
              {activeClaims.map(claim => (
                <Link key={claim.id} href={`/dashboard/properties/${propertyId}/claims/${claim.id}`}>
                  <MobileCard variant="compact" className="group border-slate-200/80 transition-all hover:border-teal-200 hover:bg-slate-50/50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-teal-700">{claim.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <Clock className="h-3 w-3" />
                          <span>Updated {new Date(claim.updatedAt || '').toLocaleDateString()}</span>
                        </div>
                      </div>
                      <StatusChip tone="info">{claim.status}</StatusChip>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Checklist Progress</span>
                        <span>{claim.checklistCompletionPct}%</span>
                      </div>
                      <Progress value={claim.checklistCompletionPct} className="h-1.5 bg-slate-100" />
                    </div>
                  </MobileCard>
                </Link>
              ))}
            </div>
          ) : (
            <MobileCard className="flex flex-col items-center py-10 text-center">
              <div className="rounded-full bg-slate-50 p-4">
                <FileText className="h-6 w-6 text-slate-300" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-800">No active claims</p>
              <p className="mt-1 text-xs text-slate-500">Property is currently incident-free.</p>
            </MobileCard>
          )}
        </section>

        {/* Coverage Gaps & Expirations */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold text-slate-900">Priority Protection Gaps</h3>
            <Link 
              href={`/dashboard/properties/${propertyId}/inventory?tab=coverage`}
              className="text-xs font-semibold text-teal-600 hover:underline"
            >
              Review all
            </Link>
          </div>

          <div className="space-y-3">
            {analysis?.insurance.flags.map((flag, idx) => (
              <MobileCard key={idx} variant="compact" className="border-l-4 border-l-amber-400 bg-white">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-amber-50 p-1.5 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-800">{flag.label}</p>
                    <p className="text-[11px] text-slate-500">Detected in latest coverage audit</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-teal-600 hover:bg-teal-50" asChild>
                    <Link href={`/dashboard/properties/${propertyId}/tools/coverage-options`}>
                      Fix Gap <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </MobileCard>
            ))}

            {analysis?.addOnRecommendations?.slice(0, 2).map((addon: { label: string; why: string }, idx: number) => (
              <MobileCard key={idx} variant="compact" className="bg-gradient-to-br from-white to-teal-50/20">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-teal-50 p-1.5 text-teal-600">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-800">{addon.label}</p>
                    <p className="text-[11px] leading-relaxed text-slate-600">{addon.why}</p>
                  </div>
                </div>
              </MobileCard>
            ))}
          </div>
        </section>
      </div>

      {/* Warranty Economics Card */}
      {analysis && (
        <Card className="overflow-hidden rounded-[32px] border-slate-200/60 bg-white shadow-md">
          <CardContent className="p-0">
            <div className="bg-slate-900 p-6 text-white lg:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Warranty Economics</h3>
                  <p className="text-sm text-slate-400">Deterministic value analysis</p>
                </div>
                <div className="rounded-xl bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-md text-white">
                  {analysis.warrantyVerdict}
                </div>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-8 lg:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Annual Risk</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(analysis.warranty.expectedAnnualRepairRiskUsd || 0)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Warranty Cost</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(analysis.warranty.inputsUsed.warrantyAnnualCostUsd || 0)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Net Impact</p>
                  <p className={cn("text-2xl font-bold", (analysis.warranty.expectedNetImpactUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {formatCurrency(analysis.warranty.expectedNetImpactUsd || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Break-even</p>
                  <p className="text-2xl font-bold text-white">{analysis.warranty.breakEvenMonths || '—'} mo</p>
                </div>
              </div>
            </div>
            <div className="p-6 lg:p-8">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                    <Info className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 max-w-md">
                    Based on system age, failure probability, and current property risk signals. 
                    Positive impact means warranty saves you money vs. expected out-of-pocket repairs.
                  </p>
                </div>
                <Button className="h-11 rounded-2xl bg-slate-900 px-6 font-bold text-white hover:bg-slate-800" asChild>
                  <Link href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence`}>
                    View Detailed Audit <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </MobilePageContainer>
  );
}
