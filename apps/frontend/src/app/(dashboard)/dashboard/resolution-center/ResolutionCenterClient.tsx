'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShieldAlert,
  Wrench,
  CalendarClock,
  ChevronRight,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowRight,
  BarChart3,
  ShieldCheck,
  X,
} from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { listIncidents } from '../properties/[id]/incidents/incidentsApi';
import { Booking, OrchestratedActionDTO } from '@/types';
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
import { normalizeProviderCategoryForSearch } from '@/lib/config/serviceCategoryMapping';

// ─── Journey system ───────────────────────────────────────────────────────────

type JourneyType =
  | 'urgent-issue'
  | 'repair-vs-replace'
  | 'coverage'
  | 'preventive'
  | 'cost-savings'
  | 'provider-execution'
  | 'completed';

type ResolutionFilter =
  | 'all'
  | 'urgent'
  | 'save-money'
  | 'preventive'
  | 'coverage'
  | 'completed';

const FILTER_OPTIONS: Array<{ key: ResolutionFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'save-money', label: 'Save Money' },
  { key: 'preventive', label: 'Preventive' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'completed', label: 'Completed' },
];

const ACTIVE_BOOKING_STATUSES = new Set(['DRAFT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS']);
const COMPLETED_BOOKING_STATUSES = new Set(['COMPLETED', 'CANCELLED']);
const HIGH_RISK_LEVELS = new Set(['CRITICAL', 'HIGH']);
const COVERAGE_CATEGORY_KEYWORDS = ['COVERAGE', 'INSURANCE', 'WARRANTY', 'POLICY'];
const SAVINGS_CATEGORY_KEYWORDS = [
  'RISK_PREMIUM',
  'DO_NOTHING',
  'REFINANCE',
  'MORTGAGE',
  'TAX',
  'ENERGY',
  'BUDGET',
  'FINANCE',
  'HIDDEN_ASSET',
];

function normalizeUpperText(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeFilterParam(rawFilter: string | null): ResolutionFilter {
  const normalized = String(rawFilter ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'all') return 'all';
  if (normalized === 'urgent' || normalized === 'repair') return 'urgent';
  if (normalized === 'save-money' || normalized === 'save' || normalized === 'savings') return 'save-money';
  if (normalized === 'preventive') return 'preventive';
  if (normalized === 'coverage') return 'coverage';
  if (normalized === 'completed' || normalized === 'history') return 'completed';
  return 'all';
}

function detectJourneyType(item: any, groupId?: string): JourneyType {
  if (groupId === 'urgent') return 'urgent-issue';
  if (groupId === 'cost-savings') return 'cost-savings';
  if (groupId === 'coverage') return 'coverage';
  if (groupId === 'replace-repair') return 'repair-vs-replace';
  if (groupId === 'provider-execution') return 'provider-execution';
  if (groupId === 'completed') return 'completed';
  if (item?.resolutionJourney) return item.resolutionJourney as JourneyType;
  if (item?.__kind === 'booking') return 'provider-execution';
  if (item?.__kind === 'completed-booking' || item?.__kind === 'completed-incident') return 'completed';

  if (
    item.riskLevel === 'CRITICAL' ||
    item.riskLevel === 'HIGH' ||
    item.severity === 'CRITICAL' ||
    item.severity === 'WARNING' ||
    item.overdue
  ) {
    return 'urgent-issue';
  }

  if (
    item.systemType &&
    item.age &&
    item.expectedLife &&
    item.age / item.expectedLife >= 0.75
  ) {
    return 'repair-vs-replace';
  }

  if (
    item.coverage &&
    item.coverage.hasCoverage === false
  ) {
    return 'coverage';
  }

  if (isCostSavingsAction(item)) {
    return 'cost-savings';
  }

  return 'preventive';
}

function isOrchestrationAction(item: any): item is OrchestratedActionDTO {
  return typeof item?.actionKey === 'string' && (item?.source === 'RISK' || item?.source === 'CHECKLIST');
}

function hasKeyword(value: string | null | undefined, keywords: string[]): boolean {
  const upper = normalizeUpperText(value);
  return keywords.some((keyword) => upper.includes(keyword));
}

function isCoverageAction(action: OrchestratedActionDTO): boolean {
  return (
    action.coverage?.hasCoverage === false ||
    normalizeUpperText(action.actionKey).startsWith('COVERAGE_GAP::') ||
    hasKeyword(action.category, COVERAGE_CATEGORY_KEYWORDS) ||
    hasKeyword(action.title, ['COVERAGE', 'WARRANTY', 'INSURANCE', 'POLICY', 'GAP']) ||
    hasKeyword(action.description ?? null, ['COVERAGE', 'WARRANTY', 'INSURANCE', 'POLICY', 'GAP'])
  );
}

function isCostSavingsAction(action: OrchestratedActionDTO): boolean {
  return (
    hasKeyword(action.category, SAVINGS_CATEGORY_KEYWORDS) ||
    hasKeyword(action.actionKey, ['RISK_PREMIUM', 'DO_NOTHING', 'REFINANCE', 'HIDDEN_ASSET']) ||
    hasKeyword(action.title, ['SAVE', 'SAVINGS', 'LOWER', 'REDUCE', 'PREMIUM', 'REFINANCE', 'RATE', 'BUDGET', 'ENERGY', 'TAX']) ||
    hasKeyword(action.description ?? null, ['SAVE', 'SAVINGS', 'LOWER', 'REDUCE', 'PREMIUM', 'REFINANCE', 'RATE', 'BUDGET', 'ENERGY', 'TAX'])
  );
}

function isReplaceRepairAction(action: any): boolean {
  return Boolean(
    action?.replaceRepairAnalysis ||
      (action?.systemType &&
        action?.age &&
        action?.expectedLife &&
        action.age / action.expectedLife >= 0.75)
  );
}

function isProviderExecutionAction(action: OrchestratedActionDTO): boolean {
  return Boolean(
    action.serviceCategory ||
      hasKeyword(action.title, ['BOOK', 'PROVIDER', 'QUOTE', 'SCHEDULE']) ||
      hasKeyword(action.description ?? null, ['BOOK', 'PROVIDER', 'QUOTE', 'SCHEDULE'])
  );
}

function isUrgentAction(action: OrchestratedActionDTO): boolean {
  return (
    HIGH_RISK_LEVELS.has(normalizeUpperText(action.riskLevel ?? null)) ||
    action.overdue === true
  );
}

function isActiveIncident(item: IncidentDTO): boolean {
  return item.status !== 'RESOLVED' && item.status !== 'SUPPRESSED' && item.status !== 'EXPIRED';
}

function isUrgentIncident(item: IncidentDTO): boolean {
  return isActiveIncident(item) && (item.severity === 'CRITICAL' || item.severity === 'WARNING');
}

function isCompletedSuppressedAction(action: OrchestratedActionDTO): boolean {
  const hasCompletedReason = action.suppression?.reasons?.some(
    (reason) => reason.reason === 'USER_MARKED_COMPLETE'
  );
  const completedBySource =
    action.suppression?.suppressionSource?.type === 'USER_EVENT' &&
    action.suppression?.suppressionSource?.eventType === 'USER_MARKED_COMPLETE';
  return Boolean(hasCompletedReason || completedBySource || action.status === 'COMPLETED');
}

function toProviderExecutionBookingItem(booking: Booking) {
  return {
    id: `booking:${booking.id}`,
    bookingId: booking.id,
    providerId: booking.provider?.id,
    __kind: 'booking',
    source: 'BOOKING',
    title: `${booking.service?.name || booking.category} booking`,
    description: `${booking.provider?.businessName || 'Provider'} · ${booking.status.replace('_', ' ')}`,
    status: booking.status,
    nextDueDate: booking.scheduledDate,
    serviceCategory: booking.category,
    confidence: { level: 'HIGH', score: 95 },
    primarySignalSource: { sourceSystem: 'Provider booking workflow' },
    exposure: Number.parseFloat(booking.estimatedPrice || '0') || 0,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

function toCompletedBookingItem(booking: Booking) {
  return {
    ...toProviderExecutionBookingItem(booking),
    __kind: 'completed-booking',
    resolutionJourney: 'completed',
    title: `${booking.service?.name || booking.category} completed`,
    description: `${booking.provider?.businessName || 'Provider'} · Completed booking record`,
    nextDueDate: booking.completedAt || booking.updatedAt,
  };
}

function toCompletedIncidentItem(incident: IncidentDTO) {
  return {
    ...incident,
    __kind: 'completed-incident',
    resolutionJourney: 'completed',
    nextDueDate: incident.updatedAt || incident.createdAt,
  };
}

type ReplaceRepairResolution = {
  id: string;
  inventoryItemId: string;
  verdict?: 'REPLACE_NOW' | 'REPLACE_SOON' | 'REPAIR_AND_MONITOR' | 'REPAIR_ONLY';
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  summary?: string | null;
  computedAt?: string;
  inventoryItem?: { id: string; name?: string | null } | null;
};

function resolveInventoryItemId(item: any): string | null {
  if (typeof item?.inventoryItemId === 'string' && item.inventoryItemId.length > 0) {
    return item.inventoryItemId;
  }
  if (item?.relatedEntity?.type === 'INVENTORY_ITEM' && typeof item?.relatedEntity?.id === 'string') {
    return item.relatedEntity.id;
  }
  return null;
}

function verdictLabel(verdict?: ReplaceRepairResolution['verdict']): string {
  switch (verdict) {
    case 'REPLACE_NOW':
      return 'Replace now';
    case 'REPLACE_SOON':
      return 'Plan replacement';
    case 'REPAIR_AND_MONITOR':
      return 'Repair and monitor';
    case 'REPAIR_ONLY':
      return 'Repair only';
    default:
      return 'Analysis ready';
  }
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
  'urgent-issue': {
    label: 'Urgent Issue',
    badgeCls: 'bg-red-100 text-red-700',
    borderCls: 'border-red-100 hover:border-red-200',
    icon: ShieldAlert,
    primaryCta: 'Get Emergency Help',
    secondaryCta: 'Find Provider',
  },
  'repair-vs-replace': {
    label: 'Replace or Repair',
    badgeCls: 'bg-orange-100 text-orange-700',
    borderCls: 'border-orange-100 hover:border-orange-200',
    icon: BarChart3,
    primaryCta: 'Run Analysis',
    secondaryCta: 'Mark Fixed',
  },
  coverage: {
    label: 'Coverage',
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
  'cost-savings': {
    label: 'Cost Savings',
    badgeCls: 'bg-emerald-100 text-emerald-700',
    borderCls: 'border-emerald-100 hover:border-emerald-200',
    icon: TrendingUp,
    primaryCta: 'See Savings',
    secondaryCta: 'Act Later',
  },
  'provider-execution': {
    label: 'Provider Execution',
    badgeCls: 'bg-sky-100 text-sky-700',
    borderCls: 'border-sky-100 hover:border-sky-200',
    icon: CalendarClock,
    primaryCta: 'Track Booking',
    secondaryCta: 'View Provider',
  },
  completed: {
    label: 'Completed',
    badgeCls: 'bg-slate-100 text-slate-700',
    borderCls: 'border-slate-100 hover:border-slate-200',
    icon: CheckCircle2,
    primaryCta: 'View Details',
    secondaryCta: 'Back to Active',
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
  groupId,
  propertyId,
  onComplete,
  onOpenService,
  onOpenIncident,
  onReplaceRepair,
  onAddCoverage,
  onOpenSavings,
  onOpenBooking,
  onViewProvider,
  onOpenHistoryItem,
  onSwitchToActive,
}: {
  item: any;
  groupId: string;
  propertyId: string;
  onComplete: () => void;
  onOpenService: () => void;
  onOpenIncident: (item: any) => void;
  onReplaceRepair: (item: any) => void;
  onAddCoverage: () => void;
  onOpenSavings: () => void;
  onOpenBooking: (item: any) => void;
  onViewProvider: (item: any) => void;
  onOpenHistoryItem: (item: any) => void;
  onSwitchToActive: () => void;
}) {
  const journey = detectJourneyType(item, groupId);
  const meta = JOURNEY_META[journey];
  const JourneyIcon = meta.icon;

  const exposure: number = item.exposure ?? 0;
  const showRiskBadge = exposure > 200 && journey !== 'coverage' && journey !== 'completed';
  const showSavingsBadge = (journey === 'preventive' || journey === 'cost-savings') && exposure > 0;

  const handlePrimary = () => {
    if (journey === 'repair-vs-replace') return onReplaceRepair(item);
    if (journey === 'coverage') return onAddCoverage();
    if (journey === 'cost-savings') return onOpenSavings();
    if (journey === 'provider-execution') return onOpenBooking(item);
    if (journey === 'completed') return onOpenHistoryItem(item);
    if (journey === 'urgent-issue' && item?.__kind === 'incident') return onOpenIncident(item);
    if (journey === 'urgent-issue') return onOpenService();
    if (journey === 'preventive') return onOpenService();
    if (!isOrchestrationAction(item)) return;
    onComplete();
  };

  const handleSecondary = () => {
    if (journey === 'completed') return onSwitchToActive();
    if (journey === 'urgent-issue' && item?.__kind === 'incident') return onOpenService();
    if (journey === 'provider-execution') return onViewProvider(item);
    if (!isOrchestrationAction(item)) return;
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

          {journey === 'repair-vs-replace' && item.replaceRepairAnalysis && (
            <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                Latest Replace vs Repair Signal
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-900">
                {verdictLabel(item.replaceRepairAnalysis.verdict)}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {item.replaceRepairAnalysis.summary || 'Prior analysis exists for this asset. Open to view full trace and next steps.'}
              </p>
            </div>
          )}
        </div>

        {/* Right: CTAs */}
        <div className="flex flex-col gap-2 shrink-0 md:w-48">
          <Button
            onClick={handlePrimary}
            className={cn(
              'w-full h-11 rounded-xl font-bold text-white',
              journey === 'urgent-issue'
                ? 'bg-red-600 hover:bg-red-700'
                : journey === 'repair-vs-replace'
                ? 'bg-orange-600 hover:bg-orange-700'
                : journey === 'coverage'
                ? 'bg-purple-600 hover:bg-purple-700'
                : journey === 'cost-savings'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : journey === 'provider-execution'
                ? 'bg-sky-600 hover:bg-sky-700'
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
          {(journey === 'urgent-issue' || journey === 'preventive') && (
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
  urgent: ShieldAlert,
  'cost-savings': TrendingUp,
  'replace-repair': BarChart3,
  coverage: ShieldCheck,
  'provider-execution': CalendarClock,
  preventive: Wrench,
  completed: CheckCircle2,
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

  const normalizedFilter = normalizeFilterParam(searchParams.get('filter'));
  const shouldLoadCompletedIncidents = normalizedFilter === 'completed';

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isServiceSheetOpen, setIsServiceSheetOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<any>(null);
  const [celebratingItem, setCelebratingItem] = useState<any>(null);

  const {
    data: orchestrationData,
    isLoading: orchestrationLoading,
    isError: orchestrationError,
    error: orchestrationErrorObj,
    refetch: refetchOrchestration,
  } = useQuery({
    queryKey: ['orchestration-summary', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getOrchestrationSummary(selectedPropertyId)
        : Promise.resolve(null as any),
    enabled: !!selectedPropertyId,
  });

  const {
    data: incidentsData,
    isLoading: incidentsLoading,
    isError: incidentsError,
    error: incidentsErrorObj,
    refetch: refetchIncidents,
  } = useQuery({
    queryKey: ['active-incidents', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? listIncidents({ propertyId: selectedPropertyId, limit: 10 })
        : Promise.resolve({ items: [] } as any),
    enabled: !!selectedPropertyId,
  });

  const {
    data: resolutionsData,
    isLoading: resolutionsLoading,
    isError: resolutionsError,
    error: resolutionsErrorObj,
    refetch: refetchResolutions,
  } = useQuery({
    queryKey: ['replace-repair-resolutions', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.getPropertyResolutions(selectedPropertyId)
        : Promise.resolve({ success: true, data: [] } as any),
    enabled: !!selectedPropertyId,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: bookingsData,
    isLoading: bookingsLoading,
    isError: bookingsError,
    error: bookingsErrorObj,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ['resolution-bookings', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? api.listBookings({
            propertyId: selectedPropertyId,
            limit: 50,
            sortBy: 'scheduledDate',
            sortOrder: 'desc',
          })
        : Promise.resolve({ success: true, data: { bookings: [], pagination: {} } } as any),
    enabled: !!selectedPropertyId,
    staleTime: 3 * 60 * 1000,
  });

  const {
    data: completedIncidentsData,
    isLoading: completedIncidentsLoading,
    isError: completedIncidentsError,
    error: completedIncidentsErrorObj,
    refetch: refetchCompletedIncidents,
  } = useQuery({
    queryKey: ['completed-incidents', selectedPropertyId],
    queryFn: () =>
      selectedPropertyId
        ? listIncidents({ propertyId: selectedPropertyId, status: 'RESOLVED', limit: 20 })
        : Promise.resolve({ items: [] } as any),
    enabled: !!selectedPropertyId && shouldLoadCompletedIncidents,
    staleTime: 3 * 60 * 1000,
  });

  const isLoading =
    orchestrationLoading ||
    incidentsLoading ||
    resolutionsLoading ||
    bookingsLoading ||
    (shouldLoadCompletedIncidents && completedIncidentsLoading);

  const hasLoadError =
    orchestrationError ||
    incidentsError ||
    resolutionsError ||
    bookingsError ||
    (shouldLoadCompletedIncidents && completedIncidentsError);

  const loadErrorMessage =
    (orchestrationErrorObj as Error | undefined)?.message ||
    (incidentsErrorObj as Error | undefined)?.message ||
    (resolutionsErrorObj as Error | undefined)?.message ||
    (bookingsErrorObj as Error | undefined)?.message ||
    (completedIncidentsErrorObj as Error | undefined)?.message ||
    'Unable to load one or more Resolution Center data sources.';

  // Build triage groups, then apply URL filter
  const triageGroups = useMemo((): TriageGroup[] => {
    if (!selectedPropertyId) return [];

    const actions: OrchestratedActionDTO[] = (orchestrationData as any)?.actions || [];
    const suppressedActions: OrchestratedActionDTO[] = (orchestrationData as any)?.suppressedActions || [];
    const incidents: IncidentDTO[] = (incidentsData as any)?.items || [];
    const bookings: Booking[] =
      bookingsData && 'success' in bookingsData && bookingsData.success
        ? bookingsData.data?.bookings ?? []
        : [];
    const completedIncidents: IncidentDTO[] = (completedIncidentsData as any)?.items || [];
    const analyses: ReplaceRepairResolution[] = (resolutionsData as any)?.data || [];
    const analysisByInventoryId = new Map<string, ReplaceRepairResolution>();
    analyses.forEach((analysis) => {
      if (analysis.inventoryItemId && !analysisByInventoryId.has(analysis.inventoryItemId)) {
        analysisByInventoryId.set(analysis.inventoryItemId, analysis);
      }
    });

    const enrichWithReplaceRepair = (action: OrchestratedActionDTO) => {
      const inventoryItemId = resolveInventoryItemId(action);
      const byInventory = inventoryItemId ? analysisByInventoryId.get(inventoryItemId) : null;
      const byName = analyses.find((analysis) => {
        const lhs = (analysis.inventoryItem?.name || '').trim().toLowerCase();
        const rhs = (action.title || action.systemType || '').trim().toLowerCase();
        return lhs.length > 0 && rhs.length > 0 && lhs === rhs;
      });
      return {
        ...action,
        replaceRepairAnalysis: byInventory || byName || null,
      };
    };

    const activeActions = actions
      .filter((action) => action.status !== 'SUPPRESSED')
      .map(enrichWithReplaceRepair);

    const claimedActionKeys = new Set<string>();
    const takeActions = (predicate: (action: any) => boolean) => {
      const selected: any[] = [];
      for (const action of activeActions) {
        if (claimedActionKeys.has(action.actionKey)) continue;
        if (!predicate(action)) continue;
        claimedActionKeys.add(action.actionKey);
        selected.push(action);
      }
      return selected;
    };

    const groups: TriageGroup[] = [];

    const urgentItems = [
      ...incidents.filter(isUrgentIncident).map((incident) => ({ ...incident, __kind: 'incident' })),
      ...takeActions((action) => isUrgentAction(action)),
    ];

    if (urgentItems.length > 0) {
      groups.push({
        id: 'urgent',
        title: 'Urgent Issues',
        subtitle: 'Time-sensitive incidents and overdue work that need immediate attention.',
        items: urgentItems,
        tone: 'danger',
      });
    }

    const savingsItems = takeActions((action) => isCostSavingsAction(action) && !isCoverageAction(action));
    if (savingsItems.length > 0) {
      groups.push({
        id: 'cost-savings',
        title: 'Save Money',
        subtitle: 'High-confidence opportunities to reduce recurring and one-time costs.',
        items: savingsItems,
        tone: 'success',
      });
    }

    const coverageItems = takeActions((action) => isCoverageAction(action));
    if (coverageItems.length > 0) {
      groups.push({
        id: 'coverage',
        title: 'Coverage',
        subtitle: 'Protection and warranty gaps that can expose your home to avoidable loss.',
        items: coverageItems,
        tone: 'warning',
      });
    }

    const replaceRepairItems = takeActions((action) => isReplaceRepairAction(action));
    if (replaceRepairItems.length > 0) {
      groups.push({
        id: 'replace-repair',
        title: 'Replace or Repair',
        subtitle: 'Deterministic repair-vs-replace guidance for aging systems and major assets.',
        items: replaceRepairItems,
        tone: 'warning',
      });
    }

    const providerExecutionItems = [
      ...bookings
        .filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status))
        .map(toProviderExecutionBookingItem),
      ...takeActions((action) => isProviderExecutionAction(action)),
    ];
    if (providerExecutionItems.length > 0) {
      groups.push({
        id: 'provider-execution',
        title: 'Provider Execution',
        subtitle: 'Book, track, and complete real-world service work with provider context.',
        items: providerExecutionItems,
        tone: 'info',
      });
    }

    const preventiveItems = takeActions(() => true);
    if (preventiveItems.length > 0) {
      groups.push({
        id: 'preventive',
        title: 'Preventive Maintenance',
        subtitle: 'Planned maintenance journeys that keep systems reliable and reduce emergency risk.',
        items: preventiveItems,
        tone: 'info',
      });
    }

    const completedItems = [
      ...suppressedActions
        .filter((action) => isCompletedSuppressedAction(action))
        .map((action) => ({ ...action, resolutionJourney: 'completed' })),
      ...bookings
        .filter((booking) => COMPLETED_BOOKING_STATUSES.has(booking.status))
        .map(toCompletedBookingItem),
      ...completedIncidents.map(toCompletedIncidentItem),
    ].sort((a: any, b: any) => {
      const left = Date.parse(String(a.nextDueDate || a.updatedAt || a.createdAt || 0));
      const right = Date.parse(String(b.nextDueDate || b.updatedAt || b.createdAt || 0));
      return right - left;
    });

    if (completedItems.length > 0) {
      groups.push({
        id: 'completed',
        title: 'Completed History',
        subtitle: 'Verified outcomes and finished actions for your home record.',
        items: completedItems,
        tone: 'success',
      });
    }

    return groups;
  }, [
    orchestrationData,
    incidentsData,
    completedIncidentsData,
    bookingsData,
    resolutionsData,
    selectedPropertyId,
  ]);

  const visibleGroups = useMemo(() => {
    if (normalizedFilter === 'all') {
      return triageGroups.filter((group) => group.id !== 'completed');
    }
    if (normalizedFilter === 'urgent') {
      return triageGroups.filter((group) => group.id === 'urgent');
    }
    if (normalizedFilter === 'save-money') {
      return triageGroups.filter((group) => group.id === 'cost-savings');
    }
    if (normalizedFilter === 'preventive') {
      return triageGroups.filter((group) => group.id === 'preventive');
    }
    if (normalizedFilter === 'coverage') {
      return triageGroups.filter((group) => group.id === 'coverage');
    }
    return triageGroups.filter((group) => group.id === 'completed');
  }, [triageGroups, normalizedFilter]);

  const filterCounts = useMemo(() => {
    const byId = new Map(triageGroups.map((group) => [group.id, group.items.length]));
    const allCount = triageGroups
      .filter((group) => group.id !== 'completed')
      .reduce((sum, group) => sum + group.items.length, 0);
    return {
      all: allCount,
      urgent: byId.get('urgent') ?? 0,
      'save-money': byId.get('cost-savings') ?? 0,
      preventive: byId.get('preventive') ?? 0,
      coverage: byId.get('coverage') ?? 0,
      completed: byId.get('completed') ?? 0,
    } as Record<ResolutionFilter, number>;
  }, [triageGroups]);

  const handleOpenComplete = (item: any) => {
    if (!isOrchestrationAction(item)) return;
    setActiveItem(item);
    setIsCompletionModalOpen(true);
  };

  const handleOpenService = (item: any) => {
    setActiveItem(item);
    setIsServiceSheetOpen(true);
  };

  const handleOpenIncident = (item: any) => {
    if (!selectedPropertyId || !item?.id) return;
    router.push(`/dashboard/properties/${selectedPropertyId}/incidents/${encodeURIComponent(item.id)}`);
  };

  const handleReplaceRepair = (item: any) => {
    if (!selectedPropertyId) return;
    const inventoryItemId =
      resolveInventoryItemId(item) ||
      item?.replaceRepairAnalysis?.inventoryItemId ||
      null;

    if (inventoryItemId) {
      router.push(
        `/dashboard/properties/${selectedPropertyId}/inventory/items/${encodeURIComponent(
          inventoryItemId
        )}/replace-repair?from=resolution-center`
      );
      return;
    }

    router.push(`/dashboard/replace-repair?propertyId=${selectedPropertyId}&from=resolution-center`);
  };

  const handleAddCoverage = (item: any) => {
    router.push('/dashboard/vault?tab=coverage');
  };

  const handleOpenSavings = () => {
    router.push('/dashboard/save');
  };

  const handleOpenBooking = (item: any) => {
    const bookingId = item?.bookingId || item?.id;
    if (!bookingId) return;
    router.push(`/dashboard/bookings/${encodeURIComponent(bookingId)}`);
  };

  const handleViewProvider = (item: any) => {
    const providerId = item?.providerId;
    if (!providerId) return;
    router.push(`/dashboard/providers/${encodeURIComponent(providerId)}`);
  };

  const handleOpenHistoryItem = (item: any) => {
    if (item?.bookingId) {
      handleOpenBooking(item);
      return;
    }

    if (item?.__kind === 'completed-incident' || item?.__kind === 'incident') {
      handleOpenIncident(item);
      return;
    }

    if (selectedPropertyId && item?.relatedEntity?.type === 'INVENTORY_ITEM' && item?.relatedEntity?.id) {
      router.push(
        `/dashboard/properties/${selectedPropertyId}/inventory/items/${encodeURIComponent(
          item.relatedEntity.id
        )}/replace-repair?from=resolution-center`
      );
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('filter', 'completed');
    router.replace(`/dashboard/resolution-center?${params.toString()}`);
  };

  const handleSwitchToActiveFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('filter');
    const query = params.toString();
    router.replace(query ? `/dashboard/resolution-center?${query}` : '/dashboard/resolution-center');
  };

  const handleFilterChange = (nextFilter: ResolutionFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFilter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', nextFilter);
    }
    const query = params.toString();
    router.replace(query ? `/dashboard/resolution-center?${query}` : '/dashboard/resolution-center');
  };

  const handleFindProviders = () => {
    if (!selectedPropertyId) return;
    const params = new URLSearchParams({
      propertyId: selectedPropertyId,
      from: 'resolution-center',
      intent: 'next-task',
      returnTo: '/dashboard/resolution-center',
    });
    const maybeCategory = normalizeProviderCategoryForSearch(
      celebratingItem?.serviceCategory || celebratingItem?.category || celebratingItem?.systemType
    );
    if (maybeCategory) {
      params.set('category', maybeCategory);
    }
    if (celebratingItem?.title) {
      params.set('serviceLabel', celebratingItem.title);
    }
    if (celebratingItem?.actionKey) {
      params.set('actionKey', celebratingItem.actionKey);
    }

    setCelebratingItem(null);
    router.push(`/dashboard/providers?${params.toString()}`);
  };

  const handleCompletionSubmit = async (data: any) => {
    if (!activeItem || !selectedPropertyId || !isOrchestrationAction(activeItem)) return;

    try {
      await api.markOrchestrationActionCompleted(
        selectedPropertyId,
        activeItem.actionKey || activeItem.id,
        data,
      );
      track('task_completed', {
        priority: activeItem.riskLevel || 'MEDIUM',
        category: String(activeItem.category || activeItem.systemType || activeItem.serviceCategory || 'GENERAL'),
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
          <div className="pt-3">
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((filterOption) => {
                const active = normalizedFilter === filterOption.key;
                return (
                  <button
                    key={filterOption.key}
                    onClick={() => handleFilterChange(filterOption.key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      active
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    <span>{filterOption.label}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                        active ? 'bg-white/80 text-brand-700' : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {filterCounts[filterOption.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {hasLoadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">Some data could not be loaded.</p>
            <p className="mt-1 text-red-700/90">{loadErrorMessage}</p>
            <Button
              variant="outline"
              className="mt-3 border-red-200 bg-white text-red-700 hover:bg-red-50"
              onClick={() => {
                void refetchOrchestration();
                void refetchIncidents();
                void refetchResolutions();
                void refetchBookings();
                if (shouldLoadCompletedIncidents) {
                  void refetchCompletedIncidents();
                }
              }}
            >
              Retry loading
            </Button>
          </div>
        )}

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
                          : group.tone === 'success'
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
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
                        groupId={group.id}
                        propertyId={selectedPropertyId || ''}
                        onComplete={() => handleOpenComplete(item)}
                        onOpenService={() => handleOpenService(item)}
                        onOpenIncident={handleOpenIncident}
                        onReplaceRepair={handleReplaceRepair}
                        onAddCoverage={() => handleAddCoverage(item)}
                        onOpenSavings={handleOpenSavings}
                        onOpenBooking={handleOpenBooking}
                        onViewProvider={handleViewProvider}
                        onOpenHistoryItem={handleOpenHistoryItem}
                        onSwitchToActive={handleSwitchToActiveFilter}
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
              <h3 className="text-xl font-bold text-slate-900">
                {normalizedFilter === 'completed' ? 'No completed history yet' : 'Your Home is All Set'}
              </h3>
              <p className="text-slate-500">
                {normalizedFilter === 'completed'
                  ? 'Completed actions and finished bookings will appear here once logged.'
                  : 'No active items in this filter right now.'}
              </p>
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
