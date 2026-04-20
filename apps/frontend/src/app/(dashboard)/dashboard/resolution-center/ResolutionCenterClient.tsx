'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ShieldAlert,
  Wrench,
  CalendarClock,
  ChevronRight,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  Zap,
  ArrowRight,
  BarChart3,
  ShieldCheck,
  Leaf,
  X,
} from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { listIncidents } from '../properties/[id]/incidents/incidentsApi';
import { OrchestratedActionDTO } from '@/types';
import { IncidentDTO } from '@/types/incidents.types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ConfidenceBadge,
  SourceChip,
  WhyThisMattersCard,
  RiskOfDelayBadge,
  EstimatedSavingsBadge,
} from '@/components/trust';
import { CompletionModal } from '@/components/orchestration/CompletionModal';
import { toast } from '@/components/ui/use-toast';
import { track } from '@/lib/analytics/events';
import { ServiceSelectionSheet } from './ServiceSelectionSheet';

// ─── Journey system ───────────────────────────────────────────────────────────

type JourneyType =
  | 'urgent-repair'
  | 'replace-repair'
  | 'coverage-gap'
  | 'preventive'
  | 'seasonal';

function detectJourneyType(item: any): JourneyType {
  const isIncident = 'severity' in item && !('actionKey' in item);

  if (
    item.riskLevel === 'CRITICAL' ||
    item.riskLevel === 'HIGH' ||
    item.severity === 'CRITICAL' ||
    item.severity === 'WARNING' ||
    item.overdue
  ) {
    return 'urgent-repair';
  }

  if (
    item.systemType &&
    item.age &&
    item.expectedLife &&
    item.age / item.expectedLife >= 0.75
  ) {
    return 'replace-repair';
  }

  if (
    item.systemType &&
    !isIncident &&
    item.coverage &&
    !item.coverage.hasWarranty &&
    !item.coverage.hasInsurance
  ) {
    return 'coverage-gap';
  }

  if (
    (item.source === 'CHECKLIST' || item.source === 'SEASONAL') &&
    item.isRecurring
  ) {
    return 'seasonal';
  }

  return 'preventive';
}

const JOURNEY_META: Record<
  JourneyType,
  {
    label: string;
    badgeCls: string;
    borderCls: string;
    icon: React.ElementType;
    primaryCta: string;
    secondaryCta: string;
  }
> = {
  'urgent-repair': {
    label: 'Urgent Repair',
    badgeCls: 'bg-red-100 text-red-700',
    borderCls: 'border-red-100 hover:border-red-200',
    icon: ShieldAlert,
    primaryCta: 'Get Emergency Help',
    secondaryCta: 'Mark Fixed',
  },
  'replace-repair': {
    label: 'Replace or Repair',
    badgeCls: 'bg-orange-100 text-orange-700',
    borderCls: 'border-orange-100 hover:border-orange-200',
    icon: BarChart3,
    primaryCta: 'Run Analysis',
    secondaryCta: 'Mark Fixed',
  },
  'coverage-gap': {
    label: 'Coverage Gap',
    badgeCls: 'bg-purple-100 text-purple-700',
    borderCls: 'border-purple-100 hover:border-purple-200',
    icon: ShieldCheck,
    primaryCta: 'Add Coverage',
    secondaryCta: 'Mark Covered',
  },
  preventive: {
    label: 'Maintenance',
    badgeCls: 'bg-blue-100 text-blue-700',
    borderCls: 'border-blue-100 hover:border-blue-200',
    icon: Wrench,
    primaryCta: 'Schedule Service',
    secondaryCta: 'Mark Done',
  },
  seasonal: {
    label: 'Seasonal',
    badgeCls: 'bg-teal-100 text-teal-700',
    borderCls: 'border-teal-100 hover:border-teal-200',
    icon: Leaf,
    primaryCta: 'Mark Complete',
    secondaryCta: 'Schedule Later',
  },
};

// ─── Completion Celebration ───────────────────────────────────────────────────

function CompletionCelebration({
  item,
  onClose,
  onFindProviders,
}: {
  item: any;
  onClose: () => void;
  onFindProviders: () => void;
}) {
  const exposure = item?.exposure ? Math.round(item.exposure) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1 text-slate-400 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Proof of care logged</h2>
          <p className="mt-1.5 text-slate-500 text-sm">
            This action has been saved to your verified home record.
          </p>
        </div>

        <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            What this means
          </p>
          <p className="text-sm text-slate-700 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            Vault updated with completion record
          </p>
          <p className="text-sm text-slate-700 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            Home health score will improve
          </p>
          {exposure > 0 && (
            <p className="text-sm text-emerald-700 font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ${exposure.toLocaleString()} financial risk addressed
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <Button
            onClick={onFindProviders}
            className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold"
          >
            Find Providers for Next Task
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full h-12 rounded-xl text-slate-500 font-medium"
          >
            Back to Resolution Center
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Triage action card ───────────────────────────────────────────────────────

function TriageActionCard({
  item,
  propertyId,
  onComplete,
  onOpenService,
  onReplaceRepair,
  onAddCoverage,
}: {
  item: any;
  propertyId: string;
  onComplete: () => void;
  onOpenService: () => void;
  onReplaceRepair: () => void;
  onAddCoverage: () => void;
}) {
  const journey = detectJourneyType(item);
  const meta = JOURNEY_META[journey];
  const JourneyIcon = meta.icon;

  const exposure: number = item.exposure ?? 0;
  const showRiskBadge = exposure > 200 && journey !== 'coverage-gap';
  const showSavingsBadge =
    journey === 'preventive' && exposure > 0;

  const handlePrimary = () => {
    if (journey === 'replace-repair') return onReplaceRepair();
    if (journey === 'coverage-gap') return onAddCoverage();
    if (journey === 'urgent-repair') return onOpenService();
    if (journey === 'preventive') return onOpenService();
    if (journey === 'seasonal') return onComplete();
    onComplete();
  };

  const handleSecondary = () => {
    if (journey === 'replace-repair') return onComplete();
    if (journey === 'coverage-gap') return onComplete();
    onComplete();
  };

  return (
    <div
      className={cn(
        'group relative bg-white rounded-2xl border-2 p-5 transition-all hover:shadow-lg shadow-sm',
        meta.borderCls,
      )}
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        {/* Left: info */}
        <div className="flex-1 space-y-4">
          <div className="space-y-1.5">
            {/* Journey badge + due date */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  meta.badgeCls,
                )}
              >
                <JourneyIcon className="h-3 w-3" />
                {meta.label}
              </span>
              {item.nextDueDate && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <Clock className="h-3 w-3" />
                  Due {new Date(item.nextDueDate).toLocaleDateString()}
                </span>
              )}
              {item.overdue && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600">
                  Overdue
                </span>
              )}
            </div>

            <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
              {item.description || item.summary}
            </p>
          </div>

          {/* Trust strip */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <ConfidenceBadge
              level={item.confidence?.level?.toLowerCase() || 'medium'}
              score={
                item.confidence?.score ? Math.round(item.confidence.score) : undefined
              }
            />
            <SourceChip
              source={
                item.primarySignalSource?.sourceSystem || 'CtC Intelligence'
              }
            />
            {exposure > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-700">
                <DollarSign className="h-3 w-3" />
                ${Math.round(exposure).toLocaleString()} at risk
              </div>
            )}
          </div>

          {/* Risk of delay badge */}
          {showRiskBadge && (
            <RiskOfDelayBadge
              riskText={
                item.riskLevel === 'CRITICAL'
                  ? 'Delaying risks emergency repair costs and property damage.'
                  : `Postponing this item could increase total cost to $${Math.round(exposure * 1.4).toLocaleString()}.`
              }
            />
          )}

          {/* Estimated savings badge */}
          {showSavingsBadge && (
            <EstimatedSavingsBadge
              upside={{
                amount: Math.round(exposure * 0.6),
                period: 'one-time',
                basis: 'proactive vs reactive repair cost difference',
              }}
            />
          )}

          {/* Why this matters — CRITICAL only */}
          {(item.riskLevel === 'CRITICAL' || item.severity === 'CRITICAL') && (
            <div className="mt-2">
              <WhyThisMattersCard
                explanation="Immediate action is required to prevent property damage or high-cost emergency repairs. Delaying this item increases financial risk significantly."
                className="bg-red-50/50 border-red-100"
                defaultExpanded={true}
              />
            </div>
          )}
        </div>

        {/* Right: CTAs */}
        <div className="flex flex-col gap-2 shrink-0 md:w-48">
          <Button
            onClick={handlePrimary}
            className={cn(
              'w-full h-11 rounded-xl font-bold text-white',
              journey === 'urgent-repair'
                ? 'bg-red-600 hover:bg-red-700'
                : journey === 'replace-repair'
                ? 'bg-orange-600 hover:bg-orange-700'
                : journey === 'coverage-gap'
                ? 'bg-purple-600 hover:bg-purple-700'
                : journey === 'seasonal'
                ? 'bg-teal-600 hover:bg-teal-700'
                : 'bg-slate-900 hover:bg-slate-800',
            )}
          >
            {meta.primaryCta}
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            onClick={handleSecondary}
            className="w-full h-11 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl text-xs font-bold border border-slate-100"
          >
            {meta.secondaryCta}
            <CheckCircle2 className="ml-1.5 h-3.5 w-3.5" />
          </Button>

          {/* Compare prices — available for repair journeys */}
          {(journey === 'urgent-repair' || journey === 'preventive') && (
            <button
              onClick={onOpenService}
              className="w-full h-9 text-[11px] font-bold text-slate-400 hover:text-brand-600 flex items-center justify-center gap-1.5 rounded-xl hover:bg-brand-50 transition-colors"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Compare Prices
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Triage group header ──────────────────────────────────────────────────────

const GROUP_ICON: Record<string, React.ElementType> = {
  immediate: ShieldAlert,
  'replace-repair': BarChart3,
  'coverage-gaps': ShieldCheck,
  maintenance: Wrench,
  seasonal: Leaf,
};

// ─── Main component ───────────────────────────────────────────────────────────

interface TriageGroup {
  id: string;
  title: string;
  subtitle: string;
  items: any[];
  tone: 'danger' | 'warning' | 'info' | 'success';
}

export default function ResolutionCenterClient() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();

  const filterParam = searchParams.get('filter'); // 'urgent' | 'repair' | 'preventive' | null

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isServiceSheetOpen, setIsServiceSheetOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<any>(null);
  const [celebratingItem, setCelebratingItem] = useState<any>(null);

  const { data: orchestrationData, isLoading: orchestrationLoading } = useQuery({
    queryKey: ['orchestration-summary', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getOrchestrationSummary(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const { data: incidentsData, isLoading: incidentsLoading } = useQuery({
    queryKey: ['active-incidents', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? listIncidents({ propertyId: selectedPropertyId, limit: 10 })
        : Promise.resolve({ items: [] } as any),
    enabled: !!selectedPropertyId,
  });

  const isLoading = orchestrationLoading || incidentsLoading;

  // Build triage groups, then apply URL filter
  const triageGroups = useMemo((): TriageGroup[] => {
    if (!selectedPropertyId) return [];

    const actions: OrchestratedActionDTO[] = (orchestrationData as any)?.actions || [];
    const incidents: IncidentDTO[] = (incidentsData as any)?.items || [];

    const groups: TriageGroup[] = [];

    const immediate = [
      ...incidents.filter(
        (inc) => inc.severity === 'CRITICAL' || inc.severity === 'WARNING',
      ),
      ...actions.filter((a) => a.riskLevel === 'CRITICAL' || a.overdue),
    ];

    if (immediate.length > 0) {
      groups.push({
        id: 'immediate',
        title: 'Urgent Needs',
        subtitle: 'Critical safety issues and overdue actions requiring immediate triage.',
        items: immediate,
        tone: 'danger',
      });
    }

    const replaceRepairItems = actions.filter(
      (a) =>
        !immediate.some((i) => i.id === (a.id || a.actionKey)) &&
        a.systemType &&
        a.age &&
        a.expectedLife &&
        a.age / a.expectedLife >= 0.75 &&
        a.status !== 'SUPPRESSED',
    );

    if (replaceRepairItems.length > 0) {
      groups.push({
        id: 'replace-repair',
        title: 'Replace or Repair',
        subtitle: 'Aging systems approaching end-of-life — run the analysis to decide.',
        items: replaceRepairItems,
        tone: 'warning',
      });
    }

    const coverageGaps = actions.filter(
      (a) =>
        !immediate.some((i) => i.id === (a.id || a.actionKey)) &&
        !replaceRepairItems.some((r) => r.id === (a.id || a.actionKey)) &&
        a.systemType &&
        a.coverage &&
        !a.coverage.hasWarranty &&
        !a.coverage.hasInsurance &&
        a.status !== 'SUPPRESSED',
    );

    if (coverageGaps.length > 0) {
      groups.push({
        id: 'coverage-gaps',
        title: 'Coverage Gaps',
        subtitle: 'Assets with no warranty or insurance — protect your investment.',
        items: coverageGaps,
        tone: 'warning',
      });
    }

    const maintenance = actions.filter(
      (a) =>
        !immediate.some((i) => i.id === (a.id || a.actionKey)) &&
        !replaceRepairItems.some((r) => r.id === (a.id || a.actionKey)) &&
        !coverageGaps.some((c) => c.id === (a.id || a.actionKey)) &&
        a.status !== 'SUPPRESSED',
    );

    if (maintenance.length > 0) {
      groups.push({
        id: 'maintenance',
        title: 'Preventive Maintenance',
        subtitle: 'Proactive tasks to extend the life of your home systems.',
        items: maintenance,
        tone: 'info',
      });
    }

    return groups;
  }, [orchestrationData, incidentsData, selectedPropertyId]);

  // Apply URL filter
  const visibleGroups = useMemo(() => {
    if (!filterParam) return triageGroups;
    return triageGroups.filter((g) => {
      if (filterParam === 'urgent') return g.id === 'immediate';
      if (filterParam === 'repair') return g.id === 'replace-repair' || g.id === 'immediate';
      if (filterParam === 'preventive') return g.id === 'maintenance' || g.id === 'seasonal';
      return true;
    });
  }, [triageGroups, filterParam]);

  const handleOpenComplete = (item: any) => {
    setActiveItem(item);
    setIsCompletionModalOpen(true);
  };

  const handleOpenService = (item: any) => {
    setActiveItem(item);
    setIsServiceSheetOpen(true);
  };

  const handleReplaceRepair = (item: any) => {
    if (!selectedPropertyId) return;
    router.push(`/dashboard/replace-repair?propertyId=${selectedPropertyId}`);
  };

  const handleAddCoverage = (item: any) => {
    router.push('/dashboard/vault?tab=coverage');
  };

  const handleFindProviders = () => {
    if (!selectedPropertyId) return;
    setCelebratingItem(null);
    router.push(`/dashboard/providers?propertyId=${selectedPropertyId}&from=resolution-center`);
  };

  const handleCompletionSubmit = async (data: any) => {
    if (!activeItem || !selectedPropertyId) return;

    try {
      await api.markOrchestrationActionCompleted(
        selectedPropertyId,
        activeItem.actionKey || activeItem.id,
        data,
      );
      track('task_completed', {
        priority: activeItem.riskLevel || activeItem.severity,
        category: activeItem.category || activeItem.systemType,
        propertyId: selectedPropertyId,
        journeyType: detectJourneyType(activeItem),
      });
      setIsCompletionModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orchestration-summary', selectedPropertyId] });
      queryClient.invalidateQueries({ queryKey: ['active-incidents', selectedPropertyId] });
      setCelebratingItem(activeItem);
      setActiveItem(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Triaging your home needs…</p>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-10 pb-20 px-4 md:px-0">
        <header className="space-y-2 px-1">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-[10px] uppercase tracking-widest">
            <CalendarClock className="h-3.5 w-3.5" />
            Resolution Center
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Home Triage</h1>
          <p className="text-slate-500 max-w-lg">
            We&apos;ve analyzed your home signals to rank exactly what needs your attention today.
          </p>
          {filterParam && (
            <button
              onClick={() => router.replace('/dashboard/resolution-center')}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Filter: {filterParam}
              <X className="h-3 w-3" />
            </button>
          )}
        </header>

        {visibleGroups.length > 0 ? (
          <div className="space-y-12">
            {visibleGroups.map((group) => {
              const GroupIcon = GROUP_ICON[group.id] || Wrench;
              return (
                <section key={group.id} className="space-y-5">
                  <div className="flex items-start gap-4 px-1">
                    <div
                      className={cn(
                        'mt-1 p-2 rounded-xl border-2',
                        group.tone === 'danger'
                          ? 'bg-red-50 border-red-100 text-red-600'
                          : group.tone === 'warning'
                          ? 'bg-orange-50 border-orange-100 text-orange-600'
                          : 'bg-blue-50 border-blue-100 text-blue-600',
                      )}
                    >
                      <GroupIcon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-slate-900">{group.title}</h2>
                      <p className="text-sm text-slate-500">{group.subtitle}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {group.items.map((item: any) => (
                      <TriageActionCard
                        key={item.id || item.actionKey}
                        item={item}
                        propertyId={selectedPropertyId || ''}
                        onComplete={() => handleOpenComplete(item)}
                        onOpenService={() => handleOpenService(item)}
                        onReplaceRepair={() => handleReplaceRepair(item)}
                        onAddCoverage={() => handleAddCoverage(item)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4 bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-900">Your Home is All Set</h3>
              <p className="text-slate-500">No active incidents or urgent maintenance required.</p>
            </div>
          </div>
        )}

        {selectedPropertyId && activeItem && (
          <>
            <CompletionModal
              open={isCompletionModalOpen}
              onClose={() => setIsCompletionModalOpen(false)}
              onSubmit={handleCompletionSubmit}
              actionTitle={activeItem.title}
              propertyId={selectedPropertyId}
              actionKey={activeItem.actionKey || activeItem.id}
              onPhotoUpload={async (file: File, idx: number) => {
                const res = await api.uploadCompletionPhoto(
                  selectedPropertyId,
                  activeItem.actionKey || activeItem.id,
                  file,
                  idx,
                );
                if (res.success) return res.data.photo;
                throw new Error(res.message || 'Photo upload failed');
              }}
            />
            <ServiceSelectionSheet
              item={activeItem}
              propertyId={selectedPropertyId}
              isOpen={isServiceSheetOpen}
              onOpenChange={setIsServiceSheetOpen}
            />
          </>
        )}
      </div>

      {celebratingItem && (
        <CompletionCelebration
          item={celebratingItem}
          onClose={() => setCelebratingItem(null)}
          onFindProviders={handleFindProviders}
        />
      )}
    </>
  );
}
