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
        description: error.message || "Failed to analyze coverage.",
        variant: "destructive",
      });
    }
  });

  const analysis = analysisData?.exists ? analysisData.analysis : null;
  const activeClaims = (claimsData ?? []).filter((c: ClaimDTO) => c.status !== 'CLOSED');
  const gapCount = analysis?.insurance?.flags?.find(f => f.code === 'INVENTORY_COVERAGE_GAPS')?.label?.split(' ')[0] || '0';

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
        <p className="text-sm font-medium text-slate-500 font-inter">Syncing protection data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9]/50">
      <MobilePageContainer className="space-y-8 pb-24 pt-6 lg:max-w-[1440px] lg:px-12 lg:pt-10">
        
        {/* SECTION 1: HEADER & SCORE TIER */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          
          <div className="lg:col-span-8 space-y-6">
            <header className="space-y-1">
              <div className="flex items-center gap-3 text-teal-600 mb-1">
                 <ShieldCheck className="h-5 w-5" />
                 <span className="text-[10px] font-black uppercase tracking-[0.2em]">Strategic Protection Hub</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 lg:text-5xl font-poppins">Home Coverage</h1>
              <p className="text-slate-500 font-medium text-base lg:text-lg">Aggregated risk and value analysis for your entire property.</p>
            </header>

            {/* AI STRATEGIC TAKE (Integrated Nudge) */}
            <AnimatePresence mode="wait">
              {analysis?.strategicAdvice ? (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="group relative overflow-hidden rounded-[32px] bg-white p-8 shadow-sm border border-slate-100 hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-start gap-6 relative z-10">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100">
                      <Wand2 className="h-7 w-7" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-600">AI Protection Strategy</span>
                        <div className="h-1 w-1 rounded-full bg-sky-400 animate-pulse" />
                      </div>
                      <p className="text-xl font-bold leading-relaxed text-slate-800 font-poppins italic">
                        &ldquo;{analysis.strategicAdvice}&rdquo;
                      </p>
                    </div>
                  </div>
                  <Sparkles className="absolute -bottom-6 -right-6 h-32 w-32 text-slate-50 opacity-50 group-hover:text-sky-50 transition-colors duration-500" />
                </motion.div>
              ) : (
                <div className="rounded-[32px] bg-white p-8 border border-dashed border-slate-200 flex items-center justify-between gap-6 shadow-sm">
                   <div className="flex items-center gap-5">
                      <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                         <Sparkles className="h-6 w-6 text-slate-300" />
                      </div>
                      <div>
                         <p className="text-lg font-bold text-slate-800">Unlock AI Strategy</p>
                         <p className="text-sm text-slate-500 font-medium">Refresh analysis to generate personalized protection advice.</p>
                      </div>
                   </div>
                   <Button 
                      className="h-12 px-8 rounded-2xl bg-slate-900 font-bold text-white hover:bg-slate-800 transition-all active:scale-95"
                      onClick={() => runMutation.mutate()}
                      disabled={runMutation.isPending}
                    >
                      {runMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                      Analyze Now
                    </Button>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Shield Score Gauge Card */}
          <div className="lg:col-span-4">
            <Card className="overflow-hidden rounded-[40px] border-none bg-white shadow-xl p-8 lg:p-10 text-center relative">
               <div className="relative mb-6 inline-flex">
                  <div className={cn(
                    "flex h-40 w-44 items-center justify-center rounded-full border-[14px] bg-white relative transition-all duration-700",
                    shieldTone === 'emerald' ? "border-emerald-500" : 
                    shieldTone === 'amber' ? "border-amber-500" : "border-rose-500"
                  )}>
                    <div className="flex flex-col items-center">
                      <span className="text-5xl font-black tracking-tight text-slate-900 font-poppins">{shieldScore}%</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Protection</span>
                    </div>
                  </div>
                  <div className={cn(
                    "absolute -bottom-1 -right-1 h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-slate-100",
                    shieldTone === 'emerald' ? "text-emerald-500" : shieldTone === 'amber' ? "text-amber-500" : "text-rose-500"
                  )}>
                    <ShieldCheck className="h-6 w-6" />
                  </div>
               </div>
               <h3 className="text-2xl font-bold text-slate-900 font-poppins mb-2">Shield Score</h3>
               <p className="text-sm font-medium text-slate-500 leading-relaxed">
                  Overall safety rating for your property systems and policies.
               </p>
               
               <div className="mt-8 pt-8 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Gaps</p>
                    <p className={cn("text-lg font-bold", parseInt(gapCount) > 0 ? "text-amber-600" : "text-emerald-600")}>{gapCount}</p>
                  </div>
                  <div className="text-center border-l border-slate-50 pl-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Claims</p>
                    <p className="text-lg font-bold text-slate-800">{claimsSummary?.counts.open || 0}</p>
                  </div>
               </div>
               <Button 
                  variant="ghost" 
                  size="sm" 
                  className="mt-6 w-full h-11 rounded-2xl bg-slate-50 font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all"
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                >
                  <RefreshCw className={cn("mr-2 h-3.5 w-3.5", runMutation.isPending && "animate-spin")} />
                  Refresh Intelligence
                </Button>
            </Card>
          </div>
        </div>

        {/* SECTION 2: THE MEAT (Warranty Economics Card) */}
        <Card className="overflow-hidden rounded-[40px] border-none shadow-2xl bg-[#0F172A] text-white">
          <div className="p-8 lg:p-12">
            <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2 lg:max-w-md">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20">
                    <TrendingUp className="h-6 w-6 text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-bold font-poppins lg:text-3xl">Warranty Economics</h2>
                </div>
                <p className="text-slate-400 font-medium text-sm lg:text-base leading-relaxed">
                   Deterministic value analysis derived from your home's unique system ages and failure probabilities.
                </p>
              </div>

              <div className="flex-1 lg:max-w-3xl">
                <div className="grid grid-cols-2 gap-y-10 gap-x-12 lg:grid-cols-4 lg:gap-x-16">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                             Annual Risk <Info className="h-3 w-3" />
                          </p>
                          <p className="text-3xl font-black text-white font-poppins tabular-nums lg:text-4xl">
                            {formatCurrency(analysis?.warranty.expectedAnnualRepairRiskUsd || 0)}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs text-slate-200">
                        Statistical cost of repairs you should expect to pay this year without a warranty.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Protection Cost</p>
                    <p className="text-3xl font-black text-white font-poppins tabular-nums lg:text-4xl">
                      {formatCurrency(analysis?.warranty.inputsUsed.warrantyAnnualCostUsd || 0)}
                    </p>
                  </div>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="text-left outline-none">
                        <div className="space-y-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                             {(analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? 'Savings' : 'Extra Cost'} <Info className="h-3 w-3" />
                          </p>
                          <p className={cn(
                            "text-3xl font-black font-poppins tabular-nums lg:text-4xl", 
                            (analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {formatCurrency(Math.abs(analysis?.warranty.expectedNetImpactUsd || 0))}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px] border-slate-700 bg-slate-800 p-3 text-xs text-slate-200">
                        Estimated profit or loss from buying a warranty vs paying for expected repairs out-of-pocket.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Break-even</p>
                    <p className="text-3xl font-black text-white font-poppins tabular-nums lg:text-4xl">
                      {analysis?.warranty.breakEvenMonths || '—'}<span className="text-sm font-bold text-slate-500 ml-1">mo</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-12 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-white/5 rounded-3xl p-6 border border-white/5">
                <div className="flex items-center gap-4">
                   <div className="h-12 w-12 rounded-2xl bg-sky-500/20 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-sky-400" />
                   </div>
                   <p className="text-sm font-bold text-sky-100 max-w-sm">Actuarial failure models indicate a <span className="text-white underline decoration-sky-400 underline-offset-4">{analysis?.warrantyVerdict || 'POSITIVE'}</span> value outcome for this property.</p>
                </div>
                <Button className="h-12 px-10 rounded-2xl bg-sky-600 font-bold text-white hover:bg-sky-500 shadow-xl shadow-sky-900/50 transition-all active:scale-95" asChild>
                  <Link href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence`}>
                    View Detailed Report <ChevronRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
            </div>
          </div>
          <Shield className="absolute -bottom-20 -right-20 h-96 w-96 text-white/5 pointer-events-none stroke-[0.3]" />
        </Card>

        {/* SECTION 3: OPERATIONAL GRID (Claims & Gaps) */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start">
          
          {/* Claims Panel */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-3 text-slate-900">
                  <Activity className="h-5 w-5 text-teal-600" />
                  <h3 className="text-2xl font-bold font-poppins">Active Claims</h3>
               </div>
               <Link href={`/dashboard/properties/${propertyId}/claims`} className="text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                  View full ledger <ArrowRight className="h-4 w-4" />
               </Link>
            </div>

            {activeClaims.length > 0 ? (
              <div className="space-y-4">
                {activeClaims.map(claim => (
                  <Link key={claim.id} href={`/dashboard/properties/${propertyId}/claims/${claim.id}`}>
                    <Card className="group rounded-[32px] border-none bg-white shadow-lg hover:shadow-2xl transition-all duration-500">
                      <div className="p-8">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="text-xl font-bold text-slate-900 font-poppins group-hover:text-teal-700 transition-colors">{claim.title}</p>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Last update {new Date(claim.updatedAt || '').toLocaleDateString()}</span>
                            </div>
                          </div>
                          <StatusChip tone="info">{claim.status}</StatusChip>
                        </div>
                        <div className="mt-8 space-y-3">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <span>Workflow Progress</span>
                            <span className="text-teal-600">{claim.checklistCompletionPct}%</span>
                          </div>
                          <Progress value={claim.checklistCompletionPct} className="h-2.5 bg-slate-100 ring-8 ring-slate-50/50 rounded-full" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[40px] bg-white border border-slate-100 shadow-sm py-20 flex flex-col items-center text-center">
                 <div className="h-20 w-20 rounded-[32px] bg-slate-50 flex items-center justify-center mb-6 shadow-inner">
                    <ShieldCheck className="h-10 w-10 text-slate-200" />
                 </div>
                 <h4 className="text-xl font-bold text-slate-900 font-poppins">No Active Incidents</h4>
                 <p className="text-sm text-slate-400 font-medium mt-1">Property protection is currently in monitoring mode.</p>
              </div>
            )}
          </div>

          {/* Coverage Gaps Panel */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-3 text-slate-900">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  <h3 className="text-2xl font-bold font-poppins">Priority Gaps</h3>
               </div>
               <Link href={`/dashboard/properties/${propertyId}/inventory?tab=coverage`} className="text-sm font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1">
                  Fix all exposures <ArrowRight className="h-4 w-4" />
               </Link>
            </div>

            <div className="space-y-4">
              {(analysis?.insurance.flags.length || 0) > 0 ? (
                analysis?.insurance.flags.map((flag, idx) => (
                  <Card key={idx} className="rounded-[32px] border-none bg-white shadow-lg overflow-hidden group">
                    <div className="p-6 flex items-center gap-6">
                      <div className="h-16 w-16 shrink-0 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner">
                        <AlertTriangle className="h-8 w-8" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-900 font-poppins truncate">{flag.label}</p>
                        <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mt-0.5">Critical Exposure</p>
                      </div>
                      <Button variant="ghost" className="h-14 w-14 rounded-2xl bg-slate-50 hover:bg-slate-900 hover:text-white transition-all shadow-sm" asChild>
                        <Link href={`/dashboard/properties/${propertyId}/tools/coverage-options`}>
                           <ArrowRight className="h-6 w-6" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="rounded-[40px] bg-white border border-slate-100 shadow-sm py-20 flex flex-col items-center text-center">
                   <div className="h-20 w-20 rounded-[32px] bg-slate-50 flex items-center justify-center mb-6 shadow-inner">
                      <ShieldCheck className="h-10 w-10 text-emerald-200" />
                   </div>
                   <h4 className="text-xl font-bold text-slate-900 font-poppins">Zero Gaps Detected</h4>
                   <p className="text-sm text-slate-400 font-medium mt-1">All high-value home systems are currently protected.</p>
                </div>
              )}

              {/* Recommended Add-ons (Refined Nudges) */}
              {analysis?.addOnRecommendations?.slice(0, 2).map((addon: any, idx: number) => (
                <div key={idx} className="rounded-[32px] bg-white/40 border border-white p-6 shadow-sm flex items-start gap-5 hover:bg-white transition-all duration-300">
                   <div className="h-12 w-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                      <Zap className="h-6 w-6" />
                   </div>
                   <div className="space-y-1">
                      <p className="text-base font-bold text-slate-900 font-poppins">{addon.label}</p>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed">{addon.why}</p>
                   </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </MobilePageContainer>
    </div>
  );
}
