'use client';

import React, { useMemo, useEffect, useState } from 'react';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';

export default function CoverageOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      toast({ title: "Analysis Complete", description: "Intelligence updated." });
    },
    onError: (error: any) => {
      toast({ title: "Analysis Failed", description: error.message, variant: "destructive" });
    }
  });

  const [activeGap, setActiveGap] = useState<{ label: string; code: string } | null>(null);

  // Auto-run analysis on first load if none exists yet
  useEffect(() => {
    if (analysisData && !analysisData.exists && !runMutation.isPending) {
      runMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisData?.exists]);

  const analysis = analysisData?.exists ? analysisData.analysis : null;
  const activeClaims = (claimsData ?? []).filter((c: ClaimDTO) => c.status !== 'CLOSED');

  const shieldScore = useMemo(() => {
    if (!analysis) return 0;
    let score = analysis.overallVerdict === 'WORTH_IT' ? 85
      : analysis.overallVerdict === 'SITUATIONAL' ? 60
      : 35;
    // Missing insurance is the highest-impact gap
    if (analysis.insurance.flags.some(f => f.code === 'NO_PROPERTY_POLICY')) score -= 25;
    // No active warranty plan
    if (!((analysis.warranty.inputsUsed.warrantyAnnualCostUsd ?? 0) > 0)) score -= 10;
    // Remaining flags weighted by severity
    analysis.insurance.flags.forEach(f => {
      if (f.code === 'NO_PROPERTY_POLICY') return;
      score -= f.severity === 'HIGH' ? 8 : f.severity === 'MEDIUM' ? 4 : 2;
    });
    if (analysis.confidence === 'HIGH') score += 5;
    if (analysis.confidence === 'LOW') score -= 10;
    return Math.max(10, Math.min(100, score));
  }, [analysis]);

  const shieldTone = shieldScore >= 75 ? 'emerald' : shieldScore >= 45 ? 'amber' : 'rose';

  // Maps each flag code to its most relevant remediation route and CTA label
  const GAP_ACTIONS: Record<string, { href: string; label: string }> = {
    NO_PROPERTY_POLICY:        { href: `/dashboard/properties/${propertyId}/vault`,                             label: 'Add Insurance Policy'      },
    DEDUCTIBLE_VS_BUFFER_HIGH: { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,      label: 'Review Deductible Strategy' },
    DEDUCTIBLE_VS_BUFFER_MEDIUM: { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,    label: 'Review Deductible Strategy' },
    PROPERTY_RISK_HIGH:        { href: `/dashboard/properties/${propertyId}/tools/coverage-options`,            label: 'Review Coverage Limits'     },
    CLAIMS_FREQUENCY:          { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,      label: 'View Coverage Analysis'     },
    INVENTORY_COVERAGE_GAPS:   { href: `/dashboard/properties/${propertyId}/inventory`,                        label: 'Review Item Coverage'       },
    MAINTENANCE_BACKLOG:       { href: `/dashboard/properties/${propertyId}/fix`,                              label: 'View Pending Tasks'         },
    PREMIUM_PRESSURE:          { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,      label: 'Run Value Check'            },
  };
  const GAP_FALLBACK = { href: `/dashboard/properties/${propertyId}/tools/coverage-options`, label: 'View Coverage Options' };

  if (analysisLoading || claimsLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm font-medium text-slate-500 font-inter">Syncing Protection Hub...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <MobilePageContainer className="space-y-8 pb-24 pt-6 lg:max-w-[1400px] lg:px-12 lg:pt-10">
        
        {/* HEADER */}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-4xl font-poppins">Home Coverage</h1>
            <p className="text-slate-500 font-medium">Unified strategic protection dashboard.</p>
          </div>
          <Button 
            className="h-11 px-8 rounded-2xl bg-slate-900 font-black text-white hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh Intelligence
          </Button>
        </header>

        {/* TOP TIER: Bento Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          
          {/* Shield Score */}
          <Card className="lg:col-span-3 rounded-[32px] border-none bg-white shadow-sm flex flex-col items-center justify-center p-8 text-center border border-slate-100">
             <div className="relative mb-4">
                <div className={cn(
                  "flex h-32 w-32 items-center justify-center rounded-full border-[12px] bg-slate-50",
                  shieldTone === 'emerald' ? "border-emerald-500" : shieldTone === 'amber' ? "border-amber-500" : "border-rose-500"
                )}>
                  <span className="text-4xl font-black text-slate-900 font-poppins">{shieldScore}%</span>
                </div>
                <ShieldCheck className={cn(
                  "absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-white p-1.5 shadow-md",
                  shieldTone === 'emerald' ? "text-emerald-500" : "text-rose-500"
                )} />
             </div>
             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shield Score</p>
          </Card>

          {/* AI Insights */}
          <div className="lg:col-span-9 flex flex-col gap-6">
             <AnimatePresence mode="wait">
              {analysis?.strategicAdvice ? (
                <motion.div
                  key="ai-ready"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex-1 relative overflow-hidden rounded-[32px] bg-gradient-to-br from-sky-600 to-indigo-700 p-8 shadow-xl text-white flex flex-col justify-center"
                >
                  <div className="flex items-start gap-6 relative z-10">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xl border border-white/10 shadow-inner">
                      <Wand2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-100">AI Intelligence Take</span>
                      <p className="text-lg font-bold leading-tight lg:text-xl font-poppins italic">
                        &ldquo;{analysis.strategicAdvice}&rdquo;
                      </p>
                    </div>
                  </div>
                  <Sparkles className="absolute -bottom-8 -right-8 h-40 w-48 text-white/10 pointer-events-none" />
                </motion.div>
              ) : runMutation.isPending ? (
                <motion.div
                  key="ai-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 relative overflow-hidden rounded-[32px] bg-gradient-to-br from-sky-600 to-indigo-700 p-8 shadow-xl text-white flex flex-col justify-center"
                >
                  <div className="flex items-center gap-6 relative z-10">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xl border border-white/10 shadow-inner">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-100">AI Intelligence Take</span>
                      <p className="text-lg font-bold leading-tight lg:text-xl font-poppins italic text-sky-100">
                        Analyzing your protection profile…
                      </p>
                    </div>
                  </div>
                  <Sparkles className="absolute -bottom-8 -right-8 h-40 w-48 text-white/10 pointer-events-none" />
                </motion.div>
              ) : (
                <div className="flex-1 rounded-[32px] border-2 border-dashed border-slate-200 bg-white p-8 flex items-center justify-center text-center">
                   <p className="text-sm font-bold text-slate-400 font-poppins italic">Refresh intelligence to generate AI strategy.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* SECTION 2: Warranty Economics (Fixed Grid) */}
        <Card className="overflow-hidden rounded-[40px] border-none shadow-xl bg-slate-900 text-white">
          <div className="p-8 lg:p-12">
            <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2 lg:w-1/3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20">
                    <TrendingUp className="h-6 w-6 text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-bold font-poppins">Warranty Economics</h2>
                </div>
                <p className="text-slate-400 font-medium text-sm leading-relaxed">
                   Deterministic value analysis derived from your home's unique system profile.
                </p>
              </div>

              <div className="lg:w-2/3">
                {/* FAILSAFE FLEX GRID */}
                <div className="flex flex-wrap gap-x-12 gap-y-8 lg:justify-between">
                   <div className="space-y-1 min-w-[140px]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Annual Risk</p>
                      <p className="text-3xl font-black text-white font-poppins tabular-nums">
                        {formatCurrency(analysis?.warranty.expectedAnnualRepairRiskUsd || 0)}
                      </p>
                   </div>
                   <div className="space-y-1 min-w-[140px]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Protection Cost</p>
                      <p className="text-3xl font-black text-white font-poppins tabular-nums">
                        {formatCurrency(analysis?.warranty.inputsUsed.warrantyAnnualCostUsd || 0)}
                      </p>
                   </div>
                   <div className="space-y-1 min-w-[140px]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Net Impact</p>
                      <p className={cn(
                        "text-3xl font-black font-poppins tabular-nums", 
                        (analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {formatCurrency(Math.abs(analysis?.warranty.expectedNetImpactUsd || 0))}
                      </p>
                   </div>
                   <div className="space-y-1 min-w-[100px]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Break-even</p>
                      <p className="text-3xl font-black text-white font-poppins tabular-nums">
                        {analysis?.warranty.breakEvenMonths || '—'} <span className="text-sm font-bold text-slate-500">mo</span>
                      </p>
                   </div>
                </div>
              </div>
            </div>

            <div className="mt-12 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-white/5 rounded-3xl p-6 border border-white/5">
                <p className="text-xs font-bold text-sky-100 italic">
                  Analysis indicates a <span className="text-white underline decoration-sky-400">{analysis?.warrantyVerdict || 'POSITIVE'}</span> value outcome.
                </p>
                <Button className="h-11 px-8 rounded-2xl bg-sky-600 font-bold text-white hover:bg-sky-500 shadow-xl shadow-sky-900/40 transition-all active:scale-95" asChild>
                  <Link href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence`}>
                    Full Audit Report <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
            </div>
          </div>
        </Card>

        {/* SECTION 3: Operations */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          
          {/* Claims */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <Activity className="h-5 w-5 text-teal-600" /> Active Claims
            </h3>
            {activeClaims.length > 0 ? (
               <div className="space-y-4">
                  {activeClaims.map(claim => (
                    <Link key={claim.id} href={`/dashboard/properties/${propertyId}/claims/${claim.id}`}>
                      <Card className="p-6 rounded-[28px] border-none bg-white shadow-sm hover:shadow-md transition-all">
                         <div className="flex items-start justify-between mb-6">
                            <p className="text-lg font-bold text-slate-800 font-poppins">{claim.title}</p>
                            <StatusChip tone="info">{claim.status}</StatusChip>
                         </div>
                         <Progress value={claim.checklistCompletionPct} className="h-2 bg-slate-50" />
                      </Card>
                    </Link>
                  ))}
               </div>
            ) : (
              <div className="rounded-[32px] bg-white border border-slate-100 py-12 flex flex-col items-center text-center">
                 <ShieldCheck className="h-10 w-10 text-slate-200 mb-2" />
                 <p className="text-sm font-bold text-slate-400">No active incidents.</p>
              </div>
            )}
          </div>

          {/* Gaps */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600" /> Priority Gaps
            </h3>
            <div className="space-y-4">
               {(analysis?.insurance.flags.length || 0) > 0 ? (
                 analysis?.insurance.flags.map((flag, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left"
                      onClick={() => setActiveGap({ label: flag.label, code: flag.code })}
                    >
                      <Card className="p-5 rounded-[28px] border-none bg-white shadow-sm hover:shadow-md transition-all flex items-start justify-between gap-5">
                         <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 shadow-inner mt-0.5">
                              <AlertTriangle className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-bold text-slate-900 font-poppins leading-snug">{flag.label}</p>
                         </div>
                         <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0 text-slate-400">
                            <ChevronRight className="h-5 w-5" />
                         </div>
                      </Card>
                    </button>
                 ))
               ) : (
                <div className="rounded-[32px] bg-white border border-slate-100 py-12 flex flex-col items-center text-center">
                   <ShieldCheck className="h-10 w-10 text-emerald-100 mb-2" />
                   <p className="text-sm font-bold text-slate-400">All systems protected.</p>
                </div>
               )}
            </div>

            {/* Gap detail sheet */}
            <Sheet open={!!activeGap} onOpenChange={(open) => !open && setActiveGap(null)}>
              <SheetContent side="bottom" className="rounded-t-[32px] pb-10">
                <SheetHeader className="mb-6 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <SheetTitle className="text-base font-bold text-slate-900 font-poppins leading-snug">
                      Priority Gap
                    </SheetTitle>
                  </div>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed">
                    {activeGap?.label}
                  </p>
                </SheetHeader>
                {(() => {
                  const action = activeGap ? (GAP_ACTIONS[activeGap.code] ?? GAP_FALLBACK) : GAP_FALLBACK;
                  return (
                    <Button
                      className="w-full h-12 rounded-2xl bg-slate-900 font-bold text-white hover:bg-slate-800 transition-all"
                      asChild
                      onClick={() => setActiveGap(null)}
                    >
                      <Link href={action.href}>
                        {action.label} <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  );
                })()}
              </SheetContent>
            </Sheet>
          </div>

        </div>
      </MobilePageContainer>
    </div>
  );
}
