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
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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

  // Deterministic fallback when Gemini can't produce strategicAdvice
  function getStaticAdvice(a: NonNullable<typeof analysis>): string {
    const hasInsurance = !a.insurance.flags.some(f => f.code === 'NO_PROPERTY_POLICY');
    const hasWarranty = (a.warranty.inputsUsed.warrantyAnnualCostUsd ?? 0) > 0;
    const highGaps = a.insurance.flags.filter(f => f.severity === 'HIGH' && f.code !== 'NO_PROPERTY_POLICY').length;

    if (!hasInsurance && !hasWarranty) {
      return 'No insurance policy or warranty plan is on record — you have full exposure to repair and liability costs. Adding at least one layer of protection is the single highest-impact action right now.';
    }
    if (!hasInsurance) {
      return 'No insurance policy is linked to this property. Even with a warranty in place, you\'re exposed to major liability and structural risks. Upload your policy to Vault to close this gap.';
    }
    if (a.overallVerdict === 'WORTH_IT') {
      if (highGaps > 0) {
        return `Your coverage is strong, but ${highGaps} high-priority gap${highGaps > 1 ? 's' : ''} need${highGaps === 1 ? 's' : ''} attention. Closing ${highGaps > 1 ? 'these' : 'it'} now will lock in the full value of your current protection profile.`;
      }
      return 'Your coverage profile looks healthy — insurance and warranty are aligned with your risk level. Run this check again after any major appliance purchase or new claim.';
    }
    if (a.overallVerdict === 'SITUATIONAL') {
      return 'Your coverage is adequate but has room to improve. Review your priority gaps and consider whether a home warranty closes your remaining exposure at a cost that makes sense.';
    }
    return 'Your coverage profile needs attention. Start with the highest-severity items in Priority Gaps to meaningfully reduce your out-of-pocket exposure.';
  }

  const displayAdvice = analysis?.strategicAdvice ?? (analysis ? getStaticAdvice(analysis) : null);
  const adviceIsAI = !!analysis?.strategicAdvice;

  // Maps each flag code to its most relevant remediation route and CTA label
  const GAP_ACTIONS: Record<string, { href: string; label: string }> = {
    NO_PROPERTY_POLICY:        { href: `/dashboard/properties/${propertyId}/vault`,                             label: 'Add Insurance Policy'      },
    DEDUCTIBLE_VS_BUFFER_HIGH: { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,      label: 'Review Deductible Strategy' },
    DEDUCTIBLE_VS_BUFFER_MEDIUM: { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,    label: 'Review Deductible Strategy' },
    PROPERTY_RISK_HIGH:        { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence?stage=questions`, label: 'Review Coverage Questions' },
    CLAIMS_FREQUENCY:          { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,      label: 'View Coverage Analysis'     },
    INVENTORY_COVERAGE_GAPS:   { href: `/dashboard/properties/${propertyId}/inventory`,                        label: 'Review Item Coverage'       },
    MAINTENANCE_BACKLOG:       { href: `/dashboard/properties/${propertyId}/fix`,                              label: 'View Pending Tasks'         },
    PREMIUM_PRESSURE:          { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,      label: 'Run Value Check'            },
  };
  const GAP_FALLBACK = { href: `/dashboard/properties/${propertyId}/tools/coverage-intelligence?stage=questions`, label: 'Review Coverage Questions' };

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
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-4xl font-poppins">Protect</h1>
            <p className="text-slate-500 font-medium">Track your warranties, insurance, and claims in one place.</p>
          </div>
          <div className="flex flex-col items-start gap-1 lg:items-end">
            <Button
              className="h-11 px-8 rounded-2xl bg-brand-600 font-black text-white hover:bg-brand-700 transition-all active:scale-95 shadow-xl shadow-brand-100"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Intelligence
            </Button>
            {analysis?.computedAt && (
              <p className="text-xs text-slate-400 font-medium">
                Last analyzed {formatDistanceToNow(new Date(analysis.computedAt), { addSuffix: true })}
              </p>
            )}
          </div>
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
             <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Shield Score</p>
          </Card>

          {/* AI Insights */}
          <div className="lg:col-span-9 flex flex-col gap-6">
             <AnimatePresence mode="wait">
              {runMutation.isPending ? (
                <motion.div
                  key="ai-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 relative overflow-hidden rounded-[32px] bg-brand-900 p-8 shadow-xl text-white flex flex-col justify-center"
                >
                  <div className="flex items-center gap-6 relative z-10">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xl border border-white/10 shadow-inner">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-100">Coverage Take</span>
                      <p className="text-lg font-bold leading-tight lg:text-xl font-poppins italic text-brand-100">
                        Analyzing your protection profile…
                      </p>
                    </div>
                  </div>
                  <Sparkles className="absolute -bottom-8 -right-8 h-40 w-48 text-white/10 pointer-events-none" />
                </motion.div>
              ) : displayAdvice ? (
                <motion.div
                  key="advice-ready"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex-1 relative overflow-hidden rounded-[32px] bg-brand-900 p-8 shadow-xl text-white flex flex-col justify-center"
                >
                  <div className="flex items-start gap-6 relative z-10">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xl border border-white/10 shadow-inner">
                      {adviceIsAI ? <Wand2 className="h-6 w-6 text-white" /> : <ShieldCheck className="h-6 w-6 text-white" />}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-100">
                        {adviceIsAI ? 'AI Intelligence Take' : 'Coverage Summary'}
                      </span>
                      <p className="text-lg font-bold leading-tight lg:text-xl font-poppins italic">
                        &ldquo;{displayAdvice}&rdquo;
                      </p>
                    </div>
                  </div>
                  <Sparkles className="absolute -bottom-8 -right-8 h-40 w-48 text-white/10 pointer-events-none" />
                </motion.div>
              ) : (
                <div className="flex-1 rounded-[32px] border-2 border-dashed border-slate-200 bg-white p-8 flex items-center justify-center text-center">
                  <p className="text-sm font-bold text-slate-400 font-poppins italic">Refresh intelligence to generate a coverage summary.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* SECTION 2: Warranty Economics */}
        <Card className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="p-6 lg:p-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-2xl border border-brand-200 bg-brand-50 p-3 text-brand-700">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Warranty Economics</h2>
                <p className="text-sm text-slate-500">Based on your home's appliance ages and repair history.</p>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4 mb-6 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-6">
              {/* Annual Risk — popover (tap-friendly on mobile) */}
              <Popover>
                <PopoverTrigger className="text-left space-y-1">
                  <p className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Annual Risk <Info className="h-3 w-3" />
                  </p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {formatCurrency(analysis?.warranty.expectedAnnualRepairRiskUsd || 0)}
                  </p>
                </PopoverTrigger>
                <PopoverContent className="max-w-[240px] text-xs p-3">
                  Aggregated statistical risk based on the age, condition, and repair costs of all your tracked home systems.
                </PopoverContent>
              </Popover>

              {/* Protection Cost */}
              <div className="space-y-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Protection Cost</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCurrency(analysis?.warranty.inputsUsed.warrantyAnnualCostUsd || 0)}
                </p>
              </div>

              {/* Net Impact — popover (tap-friendly on mobile) */}
              <Popover>
                <PopoverTrigger className="text-left space-y-1">
                  <p className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    {(analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? 'Projected Savings' : 'Net Cost'} <Info className="h-3 w-3" />
                  </p>
                  <p className={cn(
                    "text-2xl font-bold tabular-nums",
                    (analysis?.warranty.expectedNetImpactUsd || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {formatCurrency(Math.abs(analysis?.warranty.expectedNetImpactUsd || 0))}
                  </p>
                </PopoverTrigger>
                <PopoverContent className="max-w-[240px] text-xs p-3">
                  {(analysis?.warranty.expectedNetImpactUsd || 0) >= 0
                    ? 'How much a warranty is expected to save you compared to paying for repairs out-of-pocket.'
                    : 'The estimated extra cost of having a warranty vs. expected out-of-pocket repairs — consider whether the coverage risk is worth it.'}
                </PopoverContent>
              </Popover>

              {/* Break-even — popover (tap-friendly on mobile) */}
              <Popover>
                <PopoverTrigger className="text-left space-y-1">
                  <p className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Break-even <Info className="h-3 w-3" />
                  </p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {analysis?.warranty.breakEvenMonths || '—'} <span className="text-sm font-semibold text-slate-400">mo</span>
                  </p>
                </PopoverTrigger>
                <PopoverContent className="max-w-[240px] text-xs p-3">
                  Estimated months before probability-adjusted repair costs exceed the warranty premium — the sooner, the stronger the case for coverage.
                </PopoverContent>
              </Popover>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-brand-50 border border-brand-100 px-5 py-4">
              <p className="text-sm text-slate-600">
                Analysis indicates a <span className="font-bold text-slate-900">{analysis?.warrantyVerdict ?? '—'}</span> value outcome.
              </p>
              <Button className="h-10 px-6 rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 transition-all active:scale-95 shrink-0" asChild>
                <Link href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence?from=protect`}>
                  Full Audit Report <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>

        {/* SECTION 3: What's Covered */}
        {analysis && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-teal-600" /> What&apos;s Covered
            </h3>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Insurance */}
              {(() => {
                const premium = analysis.insurance.inputsUsed.annualPremiumUsd ?? 0;
                const active = premium > 0;
                return (
                  <Card className="p-6 rounded-[28px] border-none bg-white shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0",
                        active ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                      )}>
                        <Shield className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Homeowners Insurance</p>
                        {active ? (
                          <p className="text-base font-bold text-slate-900">{formatCurrency(premium)} / yr</p>
                        ) : (
                          <p className="text-base font-bold text-rose-500">Not Added</p>
                        )}
                      </div>
                    </div>
                    {active
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
                      : (
                        <Button size="sm" variant="ghost" className="rounded-2xl bg-slate-50 hover:bg-brand-600 hover:text-white transition-all shrink-0" asChild>
                          <Link href={`/dashboard/properties/${propertyId}/vault`}>Add <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                        </Button>
                      )
                    }
                  </Card>
                );
              })()}

              {/* Home Warranty */}
              {(() => {
                const cost = analysis.warranty.inputsUsed.warrantyAnnualCostUsd ?? 0;
                const active = cost > 0;
                return (
                  <Card className="p-6 rounded-[28px] border-none bg-white shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0",
                        active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                      )}>
                        <TrendingUp className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Home Warranty</p>
                        {active ? (
                          <p className="text-base font-bold text-slate-900">{formatCurrency(cost)} / yr</p>
                        ) : (
                          <p className="text-base font-bold text-slate-400">Not Added</p>
                        )}
                      </div>
                    </div>
                    {active
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
                      : (
                        <Button size="sm" variant="ghost" className="rounded-2xl bg-slate-50 hover:bg-brand-600 hover:text-white transition-all shrink-0" asChild>
                          <Link href={`/dashboard/properties/${propertyId}/tools/coverage-intelligence?stage=questions`}>Review <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                        </Button>
                      )
                    }
                  </Card>
                );
              })()}
            </div>
          </div>
        )}

        {/* SECTION 4: Operations */}
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
                      className="w-full h-12 rounded-2xl bg-brand-600 font-bold text-white hover:bg-brand-700 transition-all"
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
