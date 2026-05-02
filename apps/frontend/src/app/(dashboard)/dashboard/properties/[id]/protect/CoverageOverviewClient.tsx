'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  ArrowRight,
  Activity,
  History,
  TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { 
  getCoverageAnalysis, 
  runCoverageAnalysis,
  type CoverageAnalysisDTO 
} from '@/lib/api/coverageAnalysisApi';
import { listClaims, type ClaimDTO, getClaimsSummary } from '../claims/claimsApi';
import { MobilePageContainer, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';

export default function CoverageOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      toast({
        title: "Analysis Complete",
        description: "Your home protection strategy has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze coverage. Please try again.",
        variant: "destructive",
      });
    }
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
      <MobilePageContainer className="space-y-6 pb-24 pt-4 lg:max-w-[1440px] lg:px-12 lg:pt-8">
        
        {/* HEADER: Clean & Strategic */}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 lg:text-4xl font-poppins">Home Coverage Overview</h1>
            <p className="text-slate-500 font-medium text-sm lg:text-base">Strategic command center for property-wide risk & protection.</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden h-11 items-center gap-3 rounded-2xl bg-white px-5 border border-slate-200 shadow-sm lg:flex">
              <div className="flex items-center gap-2 border-r border-slate-100 pr-4">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{gapCount} Active Gaps</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-500" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{claimsSummary?.counts.open || 0} Open Claims</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="h-11 gap-2 rounded-2xl bg-white font-bold shadow-sm hover:bg-slate-50 border-slate-200 text-slate-700"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", runMutation.isPending && "animate-spin")} />
              {runMutation.isPending ? "Analyzing..." : "Refresh Intelligence"}
            </Button>
          </div>
        </header>

        {/* HERO TIER: Consolidated Intelligence Hub */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          
          {/* Main Intelligence Card (Home Warranty Economics) */}
          <Card className={cn(
            "overflow-hidden rounded-[40px] border-none shadow-2xl xl:col-span-8",
            "bg-slate-950" // High-fidelity dark mode
          )}>
            <div className="relative p-6 lg:p-12">
              <div className="relative z-10 flex flex-col gap-10">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                       <div className="p-2 rounded-xl bg-emerald-500/10">
                         <ShieldCheck className="h-7 w-7 text-emerald-400" />
                       </div>
                       <h2 className="text-2xl font-bold tracking-tight lg:text-3xl text-white font-poppins">Home Warranty Economics</h2>
                    </div>
                    <p className="text-slate-400 text-sm lg:text-base font-medium pl-12">Property-wide actuarial value audit across all tracked systems.</p>
                  </div>
                  <div className="hidden lg:block rounded-2xl bg-white/5 px-5 py-2.5 text-xs font-black uppercase tracking-[0.2em] backdrop-blur-xl border border-white/10 text-emerald-400 shadow-inner">
                    {analysis?.warrantyVerdict || 'WORTH_IT'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-10 gap-x-6 lg:grid-cols-4">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Annual Home Risk <Info className="h-3 w-3" />
                          </p>
                          <p className="text-3xl font-bold lg:text-4xl text-white font-poppins tabular-nums">
                            {formatCurrency(analysis?.warranty.expectedAnnualRepairRiskUsd || 0)}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200">
                        Statistical repair cost expectation based on system age, failure probability, and local repair pricing.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Warranty Cost</p>
                    <p className="text-3xl font-bold lg:text-4xl text-white font-poppins tabular-nums">
                      {formatCurrency(analysis?.warranty.inputsUsed.warrantyAnnualCostUsd || 0)}
                    </p>
                  </div>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            {(analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? 'Projected Savings' : 'Protection Cost'} <Info className="h-3 w-3" />
                          </p>
                          <p className={cn(
                            "text-3xl font-bold lg:text-4xl font-poppins tabular-nums", 
                            (analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {formatCurrency(Math.abs(analysis?.warranty.expectedNetImpactUsd || 0))}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200">
                        {(analysis?.warranty.expectedNetImpactUsd || 0) >= 0 
                          ? 'Estimated annual savings compared to direct out-of-pocket repair costs.'
                          : 'Net premium paid for protection beyond statistical risk expectation.'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Break-even <Info className="h-3 w-3" />
                          </p>
                          <p className="text-3xl font-bold lg:text-4xl text-white font-poppins tabular-nums">
                            {analysis?.warranty.breakEvenMonths || '—'} mo
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200">
                        Estimated months before accumulated repair risk exceeds the annual protection premium.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* High-fidelity background elements */}
              <div className="absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_60%)] pointer-events-none" />
              <Shield className="absolute -bottom-16 -right-16 h-80 w-80 text-white/5 pointer-events-none stroke-[0.5]" />
            </div>

            <div className="border-t border-white/5 bg-slate-900/40 p-8 lg:px-12 lg:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-5">
                  <div className="h-14 w-14 shrink-0 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 shadow-inner">
                    <Wand2 className="h-7 w-7 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-white font-poppins">Deep Protection Audit</p>
                    <p className="text-sm text-slate-400 max-w-sm">Deterministic analysis uses property-specific risk signals to build failure models.</p>
                  </div>
                </div>
                <Button className="h-13 rounded-2xl bg-sky-600 px-10 font-bold text-white hover:bg-sky-500 shadow-lg shadow-sky-900/40 transition-all active:scale-95" asChild>
                  <Link href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence`}>
                    Detailed Intelligence Report <ChevronRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </Card>

          {/* Sidebar Stats (Shield Score & Insights) */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            <Card className="flex-1 overflow-hidden rounded-[40px] border-none bg-white shadow-xl p-10 flex flex-col items-center justify-center text-center">
               <div className="relative mb-8">
                  {/* Circular Progress Design */}
                  <div className={cn(
                    "flex h-44 w-44 items-center justify-center rounded-full border-[14px] bg-slate-50 relative",
                    shieldTone === 'emerald' ? "border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.15)]" : 
                    shieldTone === 'amber' ? "border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.15)]" : 
                    "border-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.15)]"
                  )}>
                    <div className="flex flex-col items-center">
                      <span className="text-5xl font-black tracking-tight text-slate-900 font-poppins tabular-nums">{shieldScore}%</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Shield</span>
                    </div>
                  </div>
                  <div className={cn(
                    "absolute -bottom-3 -right-3 h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-slate-100",
                    shieldTone === 'emerald' ? "text-emerald-500" : shieldTone === 'amber' ? "text-amber-500" : "text-rose-500"
                  )}>
                    <ShieldCheck className="h-6 w-6" />
                  </div>
               </div>
               <h3 className="text-2xl font-bold text-slate-900 font-poppins">Home Protection Score</h3>
               <p className="mt-3 text-sm lg:text-base font-medium text-slate-500 leading-relaxed px-2">
                  Aggregate safety rating based on your policy depth and high-value system coverage.
               </p>
               
               <div className="mt-8 w-full grid grid-cols-2 gap-4 border-t border-slate-100 pt-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Claims Health</p>
                    <p className="text-sm font-bold text-slate-800">Excellent</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Risk Level</p>
                    <p className="text-sm font-bold text-amber-600">Elevated</p>
                  </div>
               </div>
            </Card>
          </div>
        </div>

        {/* AI STRATEGIC TAKE (The USP Banner) */}
        <AnimatePresence mode="wait">
          {analysis?.strategicAdvice ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-[40px] bg-gradient-to-br from-sky-600 to-indigo-700 p-8 lg:p-12 shadow-2xl text-white"
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-10 relative z-10">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[32px] bg-white/20 backdrop-blur-2xl border border-white/20 shadow-inner">
                  <Wand2 className="h-10 w-10" />
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-sky-400/20 px-3 py-1 border border-sky-300/30">
                       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-100">AI Intelligence Take</span>
                    </div>
                    <span className="flex h-2 w-2 rounded-full bg-sky-300 animate-pulse shadow-[0_0_10px_#7dd3fc]" />
                  </div>
                  <p className="text-2xl font-bold leading-[1.4] lg:text-3xl font-poppins max-w-4xl">
                    &ldquo;{analysis.strategicAdvice}&rdquo;
                  </p>
                </div>
                <div className="shrink-0 lg:ml-auto flex flex-col items-center gap-2">
                   <div className="rounded-full bg-black/10 px-6 py-2.5 text-xs font-black text-sky-100 border border-white/10 uppercase tracking-widest">
                      Verified Strategy
                   </div>
                   <p className="text-[10px] font-bold text-sky-200/50 uppercase tracking-tighter">Updated real-time</p>
                </div>
              </div>
              <Sparkles className="absolute -bottom-10 -right-10 h-64 w-64 text-white/10 pointer-events-none" />
              <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-white/10 to-transparent" />
            </motion.div>
          ) : (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="rounded-[40px] border-2 border-dashed border-slate-200 bg-white p-8 lg:p-12 text-center flex flex-col items-center justify-center shadow-sm"
             >
                <div className="h-20 w-20 rounded-[28px] bg-slate-50 flex items-center justify-center mb-6 shadow-inner">
                   <Sparkles className="h-10 w-10 text-slate-300" />
                </div>
                <h4 className="text-2xl font-bold text-slate-900 font-poppins">Unlock Your AI Protection Strategy</h4>
                <p className="text-base text-slate-500 max-w-md mt-3 font-medium">
                  We use property-specific actuarial models to determine exactly where you're exposed. Refresh analysis to see your personalized strategy.
                </p>
                <Button 
                  className="mt-8 h-14 px-12 rounded-2xl bg-slate-900 font-black text-white hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all active:scale-95"
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                >
                  {runMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
                  Analyze Home Protection Now
                </Button>
             </motion.div>
          )}
        </AnimatePresence>

        {/* DATA GRID: Claims & Protection Tasks */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          
          {/* Section: Claims */}
          <section className="lg:col-span-6 space-y-8">
            <div className="flex items-center justify-between px-3">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-2xl bg-teal-50 flex items-center justify-center shadow-sm">
                  <Activity className="h-5 w-5 text-teal-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 font-poppins">Active Claims</h3>
              </div>
              <Link 
                href={`/dashboard/properties/${propertyId}/claims`}
                className="group flex items-center gap-1.5 text-sm font-black uppercase tracking-widest text-teal-600 hover:text-teal-700 transition-colors"
              >
                Full Ledger <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {activeClaims.length > 0 ? (
              <div className="grid grid-cols-1 gap-5">
                {activeClaims.map(claim => (
                  <Link key={claim.id} href={`/dashboard/properties/${propertyId}/claims/${claim.id}`}>
                    <Card className="group overflow-hidden rounded-[32px] border-none bg-white shadow-lg hover:shadow-2xl transition-all duration-500">
                      <div className="p-8">
                        <div className="flex items-start justify-between gap-6">
                          <div className="space-y-2">
                            <p className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors font-poppins">{claim.title}</p>
                            <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                              <div className="flex items-center gap-1">
                                <History className="h-3.5 w-3.5" />
                                <span>Updated {new Date(claim.updatedAt || '').toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <StatusChip tone="info">{claim.status}</StatusChip>
                        </div>
                        <div className="mt-8 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Workflow Completion</span>
                            <span className="text-xs font-black text-teal-600">{claim.checklistCompletionPct}%</span>
                          </div>
                          <Progress value={claim.checklistCompletionPct} className="h-3 bg-slate-100 ring-8 ring-slate-50/50 rounded-full" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="rounded-[40px] border-none bg-white shadow-xl flex flex-col items-center py-20 text-center">
                <div className="rounded-[32px] bg-slate-50 p-8 mb-6 border border-slate-100 shadow-inner">
                  <ShieldCheck className="h-12 w-12 text-slate-200" />
                </div>
                <p className="text-xl font-bold text-slate-900 font-poppins">No Active Incidents</p>
                <p className="mt-2 text-slate-400 font-medium max-w-[240px]">Your property protection layers are currently in monitoring mode.</p>
              </Card>
            )}
          </section>

          {/* Section: Coverage Gaps */}
          <section className="lg:col-span-6 space-y-8">
            <div className="flex items-center justify-between px-3">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center shadow-sm">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 font-poppins">Priority Coverage Gaps</h3>
              </div>
              <Link 
                href={`/dashboard/properties/${propertyId}/inventory?tab=coverage`}
                className="group flex items-center gap-1.5 text-sm font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 transition-colors"
              >
                Fix All Gaps <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {(analysis?.insurance.flags.length || 0) > 0 ? (
                analysis?.insurance.flags.map((flag, idx) => (
                  <Card key={idx} className="overflow-hidden rounded-[32px] border-none bg-white shadow-lg group hover:shadow-xl transition-all duration-300">
                    <div className="flex items-center p-6 lg:p-7 gap-6">
                      <div className="h-16 w-16 shrink-0 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner">
                        <AlertTriangle className="h-8 w-8" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-lg font-bold text-slate-900 font-poppins truncate">{flag.label}</p>
                        <div className="flex items-center gap-2">
                           <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                           <p className="text-xs font-bold text-rose-500 uppercase tracking-widest">Critical Exposure</p>
                        </div>
                      </div>
                      <Button variant="ghost" className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-900 hover:bg-slate-900 hover:text-white transition-all shadow-sm" asChild title="Fix Gap">
                        <Link href={`/dashboard/properties/${propertyId}/tools/coverage-options`}>
                          <ArrowRight className="h-5 w-5" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="rounded-[40px] border-none bg-white shadow-xl flex flex-col items-center py-20 text-center">
                  <div className="rounded-[32px] bg-slate-50 p-8 mb-6 border border-slate-100 shadow-inner">
                    <ShieldCheck className="h-12 w-12 text-slate-200" />
                  </div>
                  <p className="text-xl font-bold text-slate-900 font-poppins">Zero Protection Gaps</p>
                  <p className="mt-2 text-slate-400 font-medium max-w-[240px]">All high-risk home systems are currently within safety limits.</p>
                </Card>
              )}

              {/* Add-on Opportunities: Refined design */}
              {analysis?.addOnRecommendations?.slice(0, 2).map((addon: { label: string; why: string }, idx: number) => (
                <Card key={`addon-${idx}`} className="overflow-hidden rounded-[32px] border border-slate-100 bg-white/60 p-6 group hover:bg-white hover:shadow-lg transition-all duration-300">
                  <div className="flex items-start gap-5">
                    <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white group-hover:rotate-12 transition-all duration-500 shadow-inner">
                      <Zap className="h-6 w-6" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-bold text-slate-900 font-poppins">{addon.label}</p>
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-slate-500">{addon.why}</p>
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
