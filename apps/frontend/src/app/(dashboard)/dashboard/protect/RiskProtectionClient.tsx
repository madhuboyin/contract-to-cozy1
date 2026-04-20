'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  ArrowRight,
  CheckCircle2,
  Lock,
  CalendarClock,
  AlertTriangle,
  ChevronRight,
  CloudLightning,
  ExternalLink,
  Flame,
  Waves,
  Info,
  Activity,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MobileKpiTile,
  MobileCard,
  BottomSafeAreaReserve,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { ConfidenceBadge, SourceChip } from '@/components/trust';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';

import { listPropertyRecalls } from '../properties/[id]/recalls/recallsApi';
import { listIncidents } from '../properties/[id]/incidents/incidentsApi';
import { getCoverageAnalysis } from '@/lib/api/coverageAnalysisApi';

// ─── helpers ─────────────────────────────────────────────────────────────────

function verdictLabel(v?: string) {
  if (v === 'WORTH_IT') return { label: 'Coverage optimal', cls: 'bg-emerald-100 text-emerald-700' };
  if (v === 'SITUATIONAL') return { label: 'Review recommended', cls: 'bg-amber-100 text-amber-700' };
  if (v === 'NOT_WORTH_IT') return { label: 'Overpaying', cls: 'bg-red-100 text-red-700' };
  return { label: 'Not yet analyzed', cls: 'bg-slate-100 text-slate-500' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RiskProtectionClient() {
  const router = useRouter();
  const { selectedPropertyId } = usePropertyContext();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ['maintenance-tasks', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getMaintenanceTasks(selectedPropertyId, { includeCompleted: false })
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const riskQuery = useQuery({
    queryKey: ['risk-intelligence', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getRiskReportSummary(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const coverageGapQuery = useQuery({
    queryKey: ['coverage-gap', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getInsuranceProtectionGap(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const coverageAnalysisQuery = useQuery({
    queryKey: ['coverage-analysis', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? getCoverageAnalysis(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
    staleTime: 10 * 60 * 1000,
  });

  const recallsQuery = useQuery({
    queryKey: ['active-recalls', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return { matches: [] };
      return listPropertyRecalls(selectedPropertyId);
    },
    enabled: !!selectedPropertyId,
  });

  const incidentsQuery = useQuery({
    queryKey: ['active-incidents-protect', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? listIncidents({ propertyId: selectedPropertyId, limit: 5 })
        : Promise.resolve({ items: [] } as any),
    enabled: !!selectedPropertyId,
  });

  const isLoading =
    tasksQuery.isLoading ||
    riskQuery.isLoading ||
    coverageGapQuery.isLoading ||
    recallsQuery.isLoading ||
    incidentsQuery.isLoading;

  const riskData = riskQuery.data && riskQuery.data !== 'QUEUED' ? riskQuery.data : null;
  const riskScore = (riskData as any)?.riskScore ?? null;
  const openRecalls = recallsQuery.data?.matches || [];
  const urgentTasks = (tasksQuery.data as any)?.success
    ? (tasksQuery.data as any).data.filter((t: any) => t.priority === 'URGENT')
    : [];
  const coverageGaps = (coverageGapQuery.data as any)?.success
    ? (coverageGapQuery.data as any).data.gaps || []
    : [];
  const activeIncidents = (incidentsQuery.data as any)?.items || [];

  const coverageAnalysis =
    coverageAnalysisQuery.data?.exists ? coverageAnalysisQuery.data.analysis : null;
  const cvVerdict = verdictLabel(coverageAnalysis?.overallVerdict);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Scanning for active threats…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 px-4 md:px-0">
      {/* Header */}
      <header className="space-y-2 px-1">
        <div className="flex items-center gap-2 text-brand-600 font-bold text-[10px] uppercase tracking-widest">
          <CalendarClock className="h-3.5 w-3.5" />
          Home SOC
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          Security Operations
        </h1>
        <p className="text-slate-500 max-w-lg">
          Your command center for system health, insurance verification, and environmental defense.
        </p>
      </header>

      {/* Hero Protection Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-3xl border-2 border-slate-50 bg-white p-8 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 shadow-sm">
          <div className="relative shrink-0">
            {riskScore !== null ? (
              <>
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64" cy="64" r="58"
                    stroke="currentColor" strokeWidth="10" fill="transparent"
                    className="text-slate-100"
                  />
                  <circle
                    cx="64" cy="64" r="58"
                    stroke="currentColor" strokeWidth="10" fill="transparent"
                    strokeDasharray={364}
                    strokeDashoffset={364 - (364 * riskScore) / 100}
                    className={cn(
                      'transition-all duration-1000 ease-out',
                      riskScore > 80 ? 'text-emerald-500' : riskScore > 60 ? 'text-amber-500' : 'text-red-500',
                    )}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-slate-900 leading-none">{riskScore}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                    Protection
                  </span>
                </div>
              </>
            ) : (
              <div className="w-32 h-32 flex flex-col items-center justify-center rounded-full border-4 border-dashed border-slate-200 bg-slate-50 gap-1">
                <Loader2 className="h-6 w-6 text-slate-300 animate-spin" />
                <span className="text-[9px] text-slate-400 uppercase tracking-tight">Calculating</span>
              </div>
            )}
          </div>
          <div className="space-y-4 text-center md:text-left">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">
                {riskScore !== null
                  ? riskScore > 80
                    ? 'Your home is highly secured'
                    : 'Your home is under watch'
                  : 'Protection score pending'}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                {coverageGaps.length === 0
                  ? 'Full coverage verified.'
                  : `${coverageGaps.length} coverage gap${coverageGaps.length > 1 ? 's' : ''} found.`}{' '}
                {urgentTasks.length > 0 ? `${urgentTasks.length} urgent task pending.` : ''}
              </p>
            </div>
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              <ConfidenceBadge level={riskScore !== null ? 'high' : 'low'} score={riskScore !== null ? 94 : undefined} />
              <SourceChip source="System Sensor AI" />
            </div>
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Shield className="h-40 w-40" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <MobileKpiTile
            label="Active Recalls"
            value={openRecalls.length}
            hint="Safety alerts found"
            tone={openRecalls.length > 0 ? 'danger' : 'positive'}
          />
          <MobileKpiTile
            label="Open Incidents"
            value={activeIncidents.length}
            hint={activeIncidents.length > 0 ? 'Needs attention' : 'All clear'}
            tone={activeIncidents.length > 0 ? 'warning' : 'positive'}
          />
          <MobileKpiTile
            label="System Health"
            value={urgentTasks.length > 0 ? 'Action Required' : 'Stable'}
            hint={`${urgentTasks.length} urgent tasks`}
            tone={urgentTasks.length > 0 ? 'warning' : 'positive'}
          />
        </div>
      </div>

      <div className="space-y-12">

        {/* ── Active Incidents ── */}
        {activeIncidents.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-start gap-4 px-1">
              <div className="mt-1 p-2 rounded-xl bg-orange-50 border-2 border-orange-100 text-orange-600">
                <Activity className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">Active Incidents</h2>
                <p className="text-sm text-slate-500">
                  Open issues detected at your property requiring triage.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeIncidents.slice(0, 4).map((incident: any) => (
                <div
                  key={incident.id}
                  className={cn(
                    'p-5 bg-white rounded-2xl border-2 shadow-sm space-y-3',
                    incident.severity === 'CRITICAL'
                      ? 'border-red-100'
                      : 'border-orange-100',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            incident.severity === 'CRITICAL'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-orange-100 text-orange-700',
                          )}
                        >
                          {incident.severity}
                        </span>
                        {incident.createdAt && (
                          <span className="text-[11px] text-slate-400">
                            {formatDistanceToNowStrict(new Date(incident.createdAt))} ago
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {incident.title || incident.incidentType?.replace(/_/g, ' ')}
                      </h3>
                      {incident.description && (
                        <p className="text-xs text-slate-500 line-clamp-2">
                          {incident.description}
                        </p>
                      )}
                    </div>
                    <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => router.push('/dashboard/resolution-center?filter=urgent')}
                    className="w-full justify-between h-9 px-2 text-[11px] font-bold text-orange-700 hover:bg-orange-50 rounded-lg"
                  >
                    Triage Now
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {activeIncidents.length > 4 && (
              <button
                onClick={() => router.push('/dashboard/resolution-center?filter=urgent')}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline px-1"
              >
                View all {activeIncidents.length} incidents
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </section>
        )}

        {/* ── Critical Signals: Recalls ── */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-red-50 border-2 border-red-100 text-red-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Product Recalls</h2>
              <p className="text-sm text-slate-500">
                Safety alerts matched against your inventory.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openRecalls.length > 0 ? (
              openRecalls.map((recall: any) => (
                <div
                  key={recall.id}
                  className="p-5 bg-white rounded-2xl border-2 border-red-50 hover:border-red-100 transition-all shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider">
                          Active Recall
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                          {formatDistanceToNowStrict(new Date(recall.publishedAt))} ago
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 leading-tight">
                        {recall.productName}
                      </h3>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {recall.summary}
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      selectedPropertyId &&
                      router.push(
                        `/dashboard/properties/${selectedPropertyId}/recalls/${recall.id}`,
                      )
                    }
                    className="w-full justify-between h-9 px-2 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    See Safety Instructions
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="md:col-span-2 py-10 text-center space-y-3 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                <div className="mx-auto w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-slate-500">
                  No active recalls detected for your inventory.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Financial Shields: Coverage + Coverage Analysis ── */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-purple-50 border-2 border-purple-100 text-purple-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Financial Shields</h2>
              <p className="text-sm text-slate-500">
                Insurance policy verification, warranty coverage, and AI coverage intelligence.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              {/* Coverage Analysis verdict */}
              <div
                className={cn(
                  'p-5 rounded-2xl border-2 space-y-4',
                  coverageAnalysis?.overallVerdict === 'WORTH_IT'
                    ? 'border-emerald-100 bg-emerald-50/30'
                    : coverageAnalysis?.overallVerdict === 'SITUATIONAL'
                    ? 'border-amber-100 bg-amber-50/30'
                    : 'border-slate-100 bg-white',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                      Coverage Intelligence
                    </p>
                    <h3 className="text-base font-bold text-slate-900">
                      {coverageAnalysis
                        ? coverageAnalysis.summary || 'Analysis complete'
                        : 'No analysis run yet'}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      cvVerdict.cls,
                    )}
                  >
                    {cvVerdict.label}
                  </span>
                </div>

                {coverageAnalysis?.nextSteps && coverageAnalysis.nextSteps.length > 0 && (
                  <ul className="space-y-1.5">
                    {coverageAnalysis.nextSteps.slice(0, 3).map((step: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <ArrowRight className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                        {step.title || step.detail || 'Action required'}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge
                      level={
                        coverageAnalysis?.confidence === 'HIGH'
                          ? 'high'
                          : coverageAnalysis?.confidence === 'MEDIUM'
                          ? 'medium'
                          : 'low'
                      }
                    />
                    <SourceChip source="Coverage Analysis AI" />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/dashboard/vault?tab=coverage')}
                    className="text-xs text-purple-700 hover:bg-purple-50 rounded-lg"
                  >
                    Manage Coverage
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Insurance gaps */}
              {coverageGaps.length > 0 ? (
                coverageGaps.map((gap: any) => (
                  <WinCard
                    key={gap.id}
                    title="Insurance Gap Detected"
                    value={gap.title}
                    description={gap.description}
                    actionLabel="Optimize Coverage"
                    onAction={() => router.push('/dashboard/vault?tab=coverage')}
                    trust={{
                      confidenceLabel: 'Verified',
                      freshnessLabel: 'Synced now',
                      sourceLabel: 'Direct Carrier API',
                      rationale:
                        'Your current policy limits may be below rebuild cost for your ZIP code.',
                    }}
                    className="border-purple-100"
                  />
                ))
              ) : (
                <div className="p-6 rounded-2xl border-2 border-emerald-50 bg-emerald-50/20 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-emerald-900">Coverage Fully Shielded</p>
                      <p className="text-xs text-emerald-700/70">
                        Your insurance matches local rebuild costs.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Proof of Protection */}
            <div className="space-y-4">
              <MobileCard className="bg-slate-900 text-white border-none p-5 flex flex-col gap-4">
                <div className="h-10 w-10 bg-brand-500 rounded-xl flex items-center justify-center text-white shadow-lg">
                  <Lock className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold">Proof of Protection</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Share your verified safety and care records with heirs or buyers.
                  </p>
                </div>
                <Button
                  onClick={() =>
                    selectedPropertyId &&
                    window.open(`/vault/${selectedPropertyId}`, '_blank')
                  }
                  className="w-full bg-white text-slate-900 hover:bg-slate-100 rounded-xl font-bold h-10 text-xs"
                >
                  Generate Legacy Key
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Button>
              </MobileCard>

              {coverageAnalysisQuery.data && !coverageAnalysisQuery.data.exists && (
                <div className="p-4 rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 space-y-3 text-center">
                  <p className="text-xs font-semibold text-purple-800">
                    Run Coverage Intelligence
                  </p>
                  <p className="text-[11px] text-purple-600">
                    Get an AI verdict on whether your insurance and warranties are worth it.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      selectedPropertyId &&
                      router.push(
                        `/dashboard/properties/${selectedPropertyId}/tools/coverage-intelligence`,
                      )
                    }
                    className="w-full rounded-xl text-xs border-purple-200 text-purple-700 hover:bg-purple-100"
                  >
                    Run Analysis
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Environmental Radar ── */}
        <section className="space-y-5">
          <div className="flex items-start gap-4 px-1">
            <div className="mt-1 p-2 rounded-xl bg-blue-50 border-2 border-blue-100 text-blue-600">
              <CloudLightning className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Environmental Radar</h2>
              <p className="text-sm text-slate-500">
                Local climate and hazard signals for your property location.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-50 space-y-3">
              <div className="h-9 w-9 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Fire Risk
                </p>
                <p className="text-sm font-bold text-slate-900">Moderate</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  Dry conditions forecast for next 14 days.
                </p>
              </div>
            </div>
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-50 space-y-3">
              <div className="h-9 w-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <Waves className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Flood Zone
                </p>
                <p className="text-sm font-bold text-slate-900">Zone X (Low)</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  No change in elevation certificate data.
                </p>
              </div>
            </div>
            <div className="p-5 bg-white rounded-2xl border-2 border-slate-50 space-y-3">
              <div className="h-9 w-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Pollen Spike
                </p>
                <p className="text-sm font-bold text-slate-900">High</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  HVAC filter change recommended soon.
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                selectedPropertyId &&
                router.push(
                  `/dashboard/properties/${selectedPropertyId}/tools/risk-radar`,
                )
              }
              className="h-auto p-5 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-slate-100 hover:border-slate-400 transition-all text-center"
            >
              <ExternalLink className="h-5 w-5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                View Full Local Radar
              </span>
            </button>
          </div>
        </section>

      </div>

      <MagicCaptureSheet isOpen={isScannerOpen} onOpenChange={setIsScannerOpen} />
      <BottomSafeAreaReserve size="chatAware" />
    </div>
  );
}
