'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Zap,
  ChevronRight,
  Wand2,
  Sparkles,
  FileText,
  Clock,
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
import { MobilePageContainer, MobileCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';

export default function CoverageOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const queryClient = useQueryClient();

  // 1. Data Fetching
  const { data: analysisData, isLoading: analysisLoading } = useQuery({
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

    const gaps = parseInt(gapCount);
    score -= gaps * 5;

    if (analysis.confidence === 'HIGH') score += 10;
    if (analysis.confidence === 'LOW') score -= 10;

    return Math.max(10, Math.min(100, score));
  }, [analysis, gapCount]);

  const shieldTone = shieldScore >= 80 ? 'emerald' : shieldScore >= 50 ? 'amber' : 'rose';

  if (analysisLoading || claimsLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm font-medium text-slate-500 font-inter">Analyzing your home protection layers...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <MobilePageContainer className="space-y-6 pb-24 pt-4 lg:max-w-[1400px] lg:px-10 lg:pt-8">
        
        {/* TOP LEVEL: Header & Compact Status */}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-0">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 lg:text-4xl">Home Coverage Overview</h1>
            <p className="text-slate-500 font-medium">Your unified property protection dashboard.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Status Pills */}
            <div className="hidden h-11 items-center gap-2 rounded-2xl bg-white px-4 py-2 shadow-sm lg:flex border border-slate-100">
              <div className="flex items-center gap-1.5 border-r border-slate-100 pr-3">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{gapCount} Gaps</span>
              </div>
              <div className="flex items-center gap-1.5 pl-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{claimsSummary?.counts.open || 0} Open Claims</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="h-11 gap-2 rounded-2xl bg-white font-bold shadow-sm hover:bg-slate-50 border-slate-100"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", runMutation.isPending && "animate-spin")} />
              Refresh Analysis
            </Button>
          </div>
        </header>

        {/* HERO SECTION: The Intelligence Row */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          
          {/* Main Intelligence Card (Home Warranty Economics) */}
          <Card className={cn(
            "overflow-hidden rounded-[32px] border-none shadow-xl xl:col-span-8",
            "bg-[#0F172A]" // Deep Navy
          )}>
            <div className="relative p-6 text-white lg:p-10">
              <div className="relative z-10 flex flex-col gap-8">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                       <ShieldCheck className="h-6 w-6 text-emerald-400" />
                       <h2 className="text-xl font-bold tracking-tight lg:text-2xl font-poppins">Home Warranty Economics</h2>
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Aggregated value analysis across all your home systems</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-widest backdrop-blur-xl border border-white/5 text-emerald-400">
                    {analysis?.warrantyVerdict || 'OPTIMAL'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-8 gap-x-4 lg:grid-cols-4 lg:gap-10">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-2">
                          <p className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                            Annual Home Risk <Info className="h-3 w-3" />
                          </p>
                          <p className="text-2xl font-bold lg:text-3xl text-white">
                            {formatCurrency(analysis?.warranty.expectedAnnualRepairRiskUsd || 0)}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200">
                        Statistical risk based on the age, failure probability, and repair costs of every tracked system in your home.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="space-y-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Protection Cost</p>
                    <p className="text-2xl font-bold lg:text-3xl text-white">
                      {formatCurrency(analysis?.warranty.inputsUsed.warrantyAnnualCostUsd || 0)}
                    </p>
                  </div>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-2">
                          <p className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                            {(analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? 'Projected Savings' : 'Cost of Protection'} <Info className="h-3 w-3" />
                          </p>
                          <p className={cn(
                            "text-2xl font-bold lg:text-3xl", 
                            (analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {formatCurrency(Math.abs(analysis?.warranty.expectedNetImpactUsd || 0))}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200">
                        {(analysis?.warranty.expectedNetImpactUsd || 0) >= 0 
                          ? 'The net amount a warranty saves you annually compared to direct out-of-pocket repair costs.'
                          : 'The extra cost of a warranty plan beyond your statistical repair risk.'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-2">
                          <p className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                            Break-even <Info className="h-3 w-3" />
                          </p>
                          <p className="text-2xl font-bold lg:text-3xl text-white">
                            {analysis?.warranty.breakEvenMonths || '—'} mo
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200">
                        The estimated number of months of coverage needed for probability-adjusted repair costs to equal the premium.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* Subtle background decoration */}
              <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-500/5 to-transparent pointer-events-none" />
              <Shield className="absolute -bottom-10 -right-10 h-64 w-64 text-white/5 pointer-events-none" />
            </div>

            <div className="border-t border-white/5 bg-slate-900/50 p-6 lg:px-10 lg:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 shrink-0 rounded-2xl bg-slate-800 flex items-center justify-center">
                    <Wand2 className="h-6 w-6 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Advanced Protection Audit</p>
                    <p className="text-xs text-slate-400 max-w-sm">Deterministic analysis uses actuarial curves to predict failure events.</p>
                  </div>
                </div>
                <Button className="h-12 rounded-[20px] bg-sky-600 px-8 font-bold text-white hover:bg-sky-500 shadow-lg shadow-sky-900/20" asChild>
                  <Link href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence`}>
                    View Detailed Audit <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </Card>

          {/* Shield Score Card (Compact Hero Sidebar) */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            <Card className="flex-1 overflow-hidden rounded-[32px] border-none bg-white shadow-xl p-8 flex flex-col items-center justify-center text-center">
               <div className="relative mb-6">
                  {/* Circular Progress (Simplified) */}
                  <div className={cn(
                    "flex h-36 w-36 items-center justify-center rounded-full border-[12px] bg-slate-50",
                    shieldTone === 'emerald' ? "border-emerald-500" : shieldTone === 'amber' ? "border-amber-500" : "border-rose-500"
                  )}>
                    <span className="text-4xl font-extrabold tracking-tighter text-slate-900 font-poppins">{shieldScore}%</span>
                  </div>
                  <ShieldCheck className={cn(
                    "absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-white p-2 shadow-md",
                    shieldTone === 'emerald' ? "text-emerald-500" : shieldTone === 'amber' ? "text-amber-500" : "text-rose-500"
                  )} />
               </div>
               <h3 className="text-xl font-bold text-slate-900 font-poppins">Home Shield Score</h3>
               <p className="mt-2 text-sm font-medium text-slate-500 px-4">
                  Overall property protection status based on active policies and detected gaps.
               </p>
               {parseInt(gapCount) > 0 && (
                 <Button variant="link" className="mt-4 text-amber-600 font-bold" asChild>
                    <Link href={`/dashboard/properties/${propertyId}/inventory?tab=coverage`}>
                      Fix {gapCount} Active Gaps <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                 </Button>
               )}
            </Card>
          </div>
        </div>

        {/* AI STRATEGIC TAKE (Elevated prominence) */}
        <AnimatePresence mode="wait">
          {analysis?.strategicAdvice ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-sky-600 to-sky-700 p-8 shadow-xl lg:p-10 text-white"
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-8 relative z-10">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-white/20 backdrop-blur-xl border border-white/10 shadow-inner">
                  <Wand2 className="h-8 w-8" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-sky-100">Strategic Protection Take</span>
                    <span className="flex h-2 w-2 rounded-full bg-sky-300 animate-pulse" />
                  </div>
                  <p className="text-xl font-bold leading-[1.4] lg:text-2xl font-poppins">
                    &ldquo;{analysis.strategicAdvice}&rdquo;
                  </p>
                </div>
                <div className="shrink-0 lg:ml-auto">
                   <div className="rounded-2xl bg-black/10 px-5 py-3 text-xs font-bold text-sky-50 border border-white/5">
                      Updated just now
                   </div>
                </div>
              </div>
              <Sparkles className="absolute -bottom-6 -right-6 h-48 w-48 text-white/10 pointer-events-none" />
              <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent" />
            </motion.div>
          ) : (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="rounded-[32px] border-2 border-dashed border-slate-200 bg-white/50 p-10 text-center flex flex-col items-center"
             >
                <div className="h-16 w-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
                   <Sparkles className="h-8 w-8 text-slate-400" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 font-poppins">Generate AI Protection Strategy</h4>
                <p className="text-sm text-slate-500 max-w-sm mt-2 font-medium">
                  Run a coverage analysis to receive personalized strategic advice for your home's unique risk profile.
                </p>
                <Button 
                  className="mt-6 h-12 px-10 rounded-2xl bg-slate-900 font-bold text-white hover:bg-slate-800"
                  onClick={() => runMutation.mutate()}
                >
                  Analyze Protection Now
                </Button>
             </motion.div>
          )}
        </AnimatePresence>

        {/* BOTTOM SECTION: Grid of Tasks & Claims */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* Active Claims (50%) */}
          <section className="lg:col-span-6 space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-teal-50 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-teal-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 font-poppins">Active Claims</h3>
              </div>
              <Link 
                href={`/dashboard/properties/${propertyId}/claims`}
                className="text-sm font-bold text-teal-600 hover:text-teal-700 transition-colors flex items-center gap-1"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {activeClaims.length > 0 ? (
              <div className="space-y-4">
                {activeClaims.map(claim => (
                  <Link key={claim.id} href={`/dashboard/properties/${propertyId}/claims/${claim.id}`}>
                    <Card className="group overflow-hidden rounded-[28px] border-none bg-white shadow-md hover:shadow-xl transition-all duration-300">
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-base font-bold text-slate-900 group-hover:text-teal-700 transition-colors font-poppins">{claim.title}</p>
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Updated {new Date(claim.updatedAt || '').toLocaleDateString()}</span>
                            </div>
                          </div>
                          <StatusChip tone="info">{claim.status}</StatusChip>
                        </div>
                        <div className="mt-6 space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <span>Checklist Progress</span>
                            <span>{claim.checklistCompletionPct}%</span>
                          </div>
                          <Progress value={claim.checklistCompletionPct} className="h-2 bg-slate-100 ring-4 ring-slate-50 rounded-full" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="rounded-[28px] border-none bg-white shadow-sm flex flex-col items-center py-16 text-center">
                <div className="rounded-3xl bg-slate-50 p-6 mb-4">
                  <ShieldCheck className="h-10 w-10 text-slate-200" />
                </div>
                <p className="text-base font-bold text-slate-900">No active claims</p>
                <p className="mt-1 text-sm text-slate-400 font-medium">Your property is currently incident-free.</p>
              </Card>
            )}
          </section>

          {/* Priority Protection Gaps (50%) */}
          <section className="lg:col-span-6 space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 font-poppins">Priority Coverage Gaps</h3>
              </div>
              <Link 
                href={`/dashboard/properties/${propertyId}/inventory?tab=coverage`}
                className="text-sm font-bold text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1"
              >
                Fix all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="space-y-4">
              {(analysis?.insurance.flags.length || 0) > 0 ? (
                analysis?.insurance.flags.map((flag, idx) => (
                  <Card key={idx} className="overflow-hidden rounded-[28px] border-none bg-white shadow-md">
                    <div className="flex items-center p-5 gap-5">
                      <div className="h-12 w-12 shrink-0 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                        <AlertTriangle className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-slate-900 truncate font-poppins">{flag.label}</p>
                        <p className="text-xs font-medium text-slate-400">Critical exposure detected</p>
                      </div>
                      <Button variant="ghost" className="rounded-xl font-bold text-teal-600 hover:bg-teal-50" asChild>
                        <Link href={`/dashboard/properties/${propertyId}/tools/coverage-options`}>
                          Fix <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="rounded-[28px] border-none bg-white shadow-sm flex flex-col items-center py-16 text-center">
                  <div className="rounded-3xl bg-slate-50 p-6 mb-4">
                    <ShieldCheck className="h-10 w-10 text-slate-200" />
                  </div>
                  <p className="text-base font-bold text-slate-900">Zero Coverage Gaps</p>
                  <p className="mt-1 text-sm text-slate-400 font-medium">All high-value systems are protected.</p>
                </Card>
              )}

              {/* Add-on Recommendations as lighter cards */}
              {analysis?.addOnRecommendations?.slice(0, 2).map((addon: { label: string; why: string }, idx: number) => (
                <Card key={`addon-${idx}`} className="overflow-hidden rounded-[28px] border border-slate-100 bg-white/40 p-5 group hover:bg-white transition-colors duration-300">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900 font-poppins">{addon.label}</p>
                      <p className="text-xs font-medium leading-relaxed text-slate-500">{addon.why}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>

      </MobilePageContainer>
    </div>
  );
}
