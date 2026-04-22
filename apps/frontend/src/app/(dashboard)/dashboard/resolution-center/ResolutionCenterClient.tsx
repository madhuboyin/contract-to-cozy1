'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
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
  ArrowRight,
  BarChart3,
  ShieldCheck,
  CircleDollarSign,
  Sparkles,
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

const FILTER_META: Record<
  ResolutionFilter,
  {
    icon: React.ElementType;
    tintCls: string;
    activeCls: string;
  }
> = {
  all: {
    icon: CalendarClock,
    tintCls: 'text-slate-500',
    activeCls: 'border-slate-300 bg-slate-900 text-white shadow-sm shadow-slate-900/20',
  },
  urgent: {
    icon: ShieldAlert,
    tintCls: 'text-rose-600',
    activeCls: 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm shadow-rose-200/60',
  },
  'save-money': {
    icon: CircleDollarSign,
    tintCls: 'text-emerald-600',
    activeCls: 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-200/60',
  },
  preventive: {
    icon: Wrench,
    tintCls: 'text-amber-600',
    activeCls: 'border-amber-300 bg-amber-50 text-amber-700 shadow-sm shadow-amber-200/60',
  },
  coverage: {
    icon: ShieldCheck,
    tintCls: 'text-blue-600',
    activeCls: 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm shadow-blue-200/60',
  },
  completed: {
    icon: CheckCircle2,
    tintCls: 'text-slate-500',
    activeCls: 'border-slate-300 bg-slate-100 text-slate-700 shadow-sm shadow-slate-300/50',
  },
};

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

const SOURCE_LABEL_OVERRIDES: Record<string, string> = {
  riskassessmentreport: 'Risk Assessment Report',
  homesignaldata: 'Home Signal Data',
  providerbookingworkflow: 'Provider Booking Workflow',
  ctcintelligence: 'CtC Intelligence',
};

function normalizeUpperText(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeDateLabel(dateLike: string | null | undefined): string | null {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const dayDelta = Math.round(diffMs / dayMs);

  if (Math.abs(dayDelta) <= 1) {
    if (dayDelta === 0) return 'Today';
    if (dayDelta > 0) return 'Tomorrow';
    return 'Yesterday';
  }
  if (dayDelta > 1) return `In ${dayDelta} days`;
  return `${Math.abs(dayDelta)} days ago`;
}

function formatLastUpdated(items: any[]): string {
  const mostRecentTs = items.reduce((latest, item) => {
    const candidate = Date.parse(String(item.updatedAt || item.nextDueDate || item.createdAt || 0));
    return Number.isFinite(candidate) && candidate > latest ? candidate : latest;
  }, 0);

  if (!mostRecentTs) return 'No recent updates';

  const minutes = Math.max(1, Math.round((Date.now() - mostRecentTs) / 60000));
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days}d ago`;
}

function humanizeSourceLabel(source: string | null | undefined): string {
  const raw = String(source ?? '').trim();
  if (!raw) return 'CtC Intelligence';
  const normalizedKey = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SOURCE_LABEL_OVERRIDES[normalizedKey]) return SOURCE_LABEL_OVERRIDES[normalizedKey];

  const withSpaces = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return withSpaces
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeConfidence(item: any): { level: 'high' | 'medium' | 'low'; score?: number } {
  const levelRaw = normalizeUpperText(item?.confidence?.level ?? null);
  const scoreRaw =
    typeof item?.confidence?.score === 'number'
      ? item.confidence.score
      : typeof item?.confidence === 'number'
      ? item.confidence * 100
      : undefined;

  if (levelRaw === 'HIGH') return { level: 'high', score: scoreRaw ? Math.round(scoreRaw) : undefined };
  if (levelRaw === 'LOW') return { level: 'low', score: scoreRaw ? Math.round(scoreRaw) : undefined };
  if (levelRaw === 'MEDIUM') return { level: 'medium', score: scoreRaw ? Math.round(scoreRaw) : undefined };

  if (typeof scoreRaw === 'number') {
    if (scoreRaw >= 80) return { level: 'high', score: Math.round(scoreRaw) };
    if (scoreRaw < 55) return { level: 'low', score: Math.round(scoreRaw) };
    return { level: 'medium', score: Math.round(scoreRaw) };
  }

  return { level: 'medium' };
}

function resolveItemSubtitle(item: any): string {
  if (item?.__kind === 'booking') return item.status ? String(item.status).replaceAll('_', ' ') : 'Provider workflow';
  if (item?.__kind === 'completed-booking') return 'Completed booking';
  if (item?.__kind === 'incident') return item.category || item.typeKey || 'Incident';
  if (item?.__kind === 'completed-incident') return item.category || item.typeKey || 'Resolved incident';
  return (
    item.serviceCategory ||
    item.systemType ||
    item.category ||
    item.relatedChecklistItem?.title ||
    'Home workflow'
  );
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
    panelCls: string;
    primaryButtonCls: string;
    icon: React.ElementType;
    primaryCta: string;
    secondaryCta: string;
  }
> = {
  'urgent-issue': {
    label: 'Urgent Issue',
    badgeCls: 'border border-rose-200 bg-rose-50 text-rose-700',
    borderCls: 'border-rose-200/80 hover:border-rose-300',
    panelCls: 'border-rose-100 bg-rose-50/50',
    primaryButtonCls: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700',
    icon: ShieldAlert,
    primaryCta: 'Get Emergency Help',
    secondaryCta: 'Find Provider',
  },
  'repair-vs-replace': {
    label: 'Replace or Repair',
    badgeCls: 'border border-orange-200 bg-orange-50 text-orange-700',
    borderCls: 'border-orange-200/80 hover:border-orange-300',
    panelCls: 'border-orange-100 bg-orange-50/50',
    primaryButtonCls: 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700',
    icon: BarChart3,
    primaryCta: 'Run Analysis',
    secondaryCta: 'Mark Fixed',
  },
  coverage: {
    label: 'Coverage',
    badgeCls: 'border border-blue-200 bg-blue-50 text-blue-700',
    borderCls: 'border-blue-200/80 hover:border-blue-300',
    panelCls: 'border-blue-100 bg-blue-50/50',
    primaryButtonCls: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700',
    icon: ShieldCheck,
    primaryCta: 'Add Coverage',
    secondaryCta: 'Mark Covered',
  },
  preventive: {
    label: 'Maintenance',
    badgeCls: 'border border-amber-200 bg-amber-50 text-amber-700',
    borderCls: 'border-amber-200/80 hover:border-amber-300',
    panelCls: 'border-amber-100 bg-amber-50/50',
    primaryButtonCls: 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700',
    icon: Wrench,
    primaryCta: 'Schedule Service',
    secondaryCta: 'Mark Done',
  },
  'cost-savings': {
    label: 'Cost Savings',
    badgeCls: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    borderCls: 'border-emerald-200/80 hover:border-emerald-300',
    panelCls: 'border-emerald-100 bg-emerald-50/50',
    primaryButtonCls: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700',
    icon: TrendingUp,
    primaryCta: 'See Savings',
    secondaryCta: 'Act Later',
  },
  'provider-execution': {
    label: 'Provider Execution',
    badgeCls: 'border border-sky-200 bg-sky-50 text-sky-700',
    borderCls: 'border-sky-200/80 hover:border-sky-300',
    panelCls: 'border-sky-100 bg-sky-50/50',
    primaryButtonCls: 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700',
    icon: CalendarClock,
    primaryCta: 'Track Booking',
    secondaryCta: 'View Provider',
  },
  completed: {
    label: 'Completed',
    badgeCls: 'border border-slate-200 bg-slate-100 text-slate-700',
    borderCls: 'border-slate-200/80 hover:border-slate-300',
    panelCls: 'border-slate-200 bg-slate-50',
    primaryButtonCls: 'bg-slate-800 hover:bg-slate-900',
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
  const subtitle = resolveItemSubtitle(item);
  const confidence = normalizeConfidence(item);
  const dueLabel = formatRelativeDateLabel(item.nextDueDate);
  const sourceLabels = [
    item.primarySignalSource?.sourceSystem,
    ...(Array.isArray(item.signalSources)
      ? item.signalSources.map((source: any) => source?.sourceSystem || source?.summary)
      : []),
    item.__kind === 'incident' ? item.sourceType : null,
  ]
    .map((value) => humanizeSourceLabel(value))
    .filter((value, index, arr) => value && arr.indexOf(value) === index)
    .slice(0, 2);

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

  const handleDetails = () => {
    if (journey === 'completed') return onOpenHistoryItem(item);
    if (journey === 'provider-execution') return onOpenBooking(item);
    if (journey === 'repair-vs-replace') return onReplaceRepair(item);
    if (journey === 'coverage') return onAddCoverage();
    if (journey === 'cost-savings') return onOpenSavings();
    if (item?.__kind === 'incident') return onOpenIncident(item);
    return onOpenService();
  };

  const insightPills = [
    exposure > 0
      ? {
          icon: DollarSign,
          label: 'At Risk',
          value: formatCompactUsd(Math.round(exposure)),
          tone: 'text-rose-700',
        }
      : null,
    exposure > 0 && journey !== 'completed'
      ? {
          icon: AlertTriangle,
          label: 'If Delayed',
          value: formatCompactUsd(Math.round(exposure * 1.4)),
          tone: 'text-amber-700',
        }
      : null,
    dueLabel
      ? {
          icon: Clock,
          label: 'Action Window',
          value: dueLabel,
          tone: item.overdue ? 'text-rose-700' : 'text-slate-700',
        }
      : null,
  ].filter(Boolean) as Array<{ icon: React.ElementType; label: string; value: string; tone: string }>;

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[24px] border bg-white/90 p-4 shadow-[0_6px_30px_rgba(15,23,42,0.06)] transition-all duration-300 motion-reduce:transition-none md:p-5 lg:p-6 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(15,23,42,0.10)]',
        meta.borderCls,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_240px]">
        <div className={cn('space-y-4 rounded-2xl border p-4', meta.panelCls)}>
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
                meta.badgeCls,
              )}
            >
              <JourneyIcon className="h-3 w-3" />
              {meta.label}
            </span>
            {item.overdue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-700">
                Overdue
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/80 shadow-sm">
              <JourneyIcon className="h-5 w-5 text-slate-700" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="truncate text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ConfidenceBadge level={confidence.level} score={confidence.score} />
            {dueLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                <Clock className="h-3 w-3" />
                {dueLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(sourceLabels.length > 0 ? sourceLabels : ['CtC Intelligence']).map((source) => (
              <SourceChip key={source} source={source} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm leading-6 text-slate-600">{item.description || item.summary || 'No additional summary available yet.'}</p>
          </div>

          {insightPills.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {insightPills.map((metric) => {
                const MetricIcon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2"
                  >
                    <div className={cn('flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]', metric.tone)}>
                      <MetricIcon className="h-3.5 w-3.5" />
                      {metric.label}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{metric.value}</p>
                  </div>
                );
              })}
            </div>
          )}

          {showRiskBadge && (
            <RiskOfDelayBadge
              className="w-full border-amber-200/80 bg-amber-50/70"
              riskText={
                item.riskLevel === 'CRITICAL'
                  ? 'Delaying this can escalate into emergency repair costs and property damage.'
                  : `Postponing this can increase total cost to ${formatCompactUsd(Math.round(exposure * 1.4))}.`
              }
            />
          )}

          {showSavingsBadge && (
            <EstimatedSavingsBadge
              upside={{
                amount: Math.round(exposure * 0.6),
                period: 'one-time',
                basis: 'proactive vs reactive repair cost difference',
              }}
            />
          )}

          {(item.riskLevel === 'CRITICAL' || item.severity === 'CRITICAL') && (
            <WhyThisMattersCard
              explanation="Immediate action is required to prevent property damage or high-cost emergency repairs. Delaying this item increases financial risk significantly."
              className="border-rose-100 bg-rose-50/50"
              defaultExpanded={true}
            />
          )}

          {journey === 'repair-vs-replace' && item.replaceRepairAnalysis && (
            <div className="rounded-xl border border-orange-200/70 bg-orange-50/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-orange-700">Latest Replace vs Repair Signal</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{verdictLabel(item.replaceRepairAnalysis.verdict)}</p>
              <p className="mt-1 text-xs text-slate-600">
                {item.replaceRepairAnalysis.summary ||
                  'Prior analysis exists for this asset. Open to view the full reasoning and recommended next step.'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white/80 p-3.5">
          <Button
            onClick={handlePrimary}
            className={cn(
              'h-11 w-full rounded-xl text-sm font-semibold text-white shadow-sm',
              meta.primaryButtonCls,
            )}
          >
            {meta.primaryCta}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            onClick={handleSecondary}
            className="h-10 w-full rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
          >
            {meta.secondaryCta}
          </Button>

          {(journey === 'urgent-issue' || journey === 'preventive') && (
            <Button
              variant="ghost"
              onClick={onOpenService}
              className="h-10 w-full justify-between rounded-xl border border-transparent px-3 text-slate-600 hover:border-brand-100 hover:bg-brand-50 hover:text-brand-700"
            >
              Compare Prices
              <TrendingUp className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={handleDetails}
            className="h-10 w-full justify-between rounded-xl border border-transparent px-3 text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700"
          >
            View Details
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function EmptyQueueState({ isCompletedFilter }: { isCompletedFilter: boolean }) {
  return (
    <div className="rounded-[24px] border border-dashed border-emerald-200 bg-emerald-50/40 p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-white">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" />
      </div>
      <h3 className="text-xl font-semibold text-slate-900">
        {isCompletedFilter ? 'No completed history yet' : 'No active items in this view'}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        {isCompletedFilter
          ? 'Completed actions and finished bookings will appear here once they are logged.'
          : 'You are caught up for this filter. Continue monitoring your home signals for new recommendations.'}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="outline" className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50">
          <Link href="/dashboard/oracle">Run Full Scan</Link>
        </Button>
        <Button asChild variant="ghost" className="text-slate-600 hover:bg-white">
          <Link href="/dashboard/actions">Open Task List</Link>
        </Button>
      </div>
    </div>
  );
}

function ResolutionLoadingState() {
  return (
    <div className="space-y-6 pb-20">
      <div className="h-56 animate-pulse rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50" />
      <div className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-[24px] border border-slate-200 bg-slate-100/70" />
          <div className="h-64 animate-pulse rounded-[24px] border border-slate-200 bg-slate-100/70" />
        </div>
        <div className="hidden space-y-4 xl:block">
          <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
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

  const activeItems = useMemo(
    () => triageGroups.filter((group) => group.id !== 'completed').flatMap((group) => group.items),
    [triageGroups]
  );

  const totalAtRisk = useMemo(
    () => activeItems.reduce((sum, item) => sum + (typeof item.exposure === 'number' ? item.exposure : 0), 0),
    [activeItems]
  );

  const highConfidenceCount = useMemo(
    () =>
      activeItems.filter((item) => {
        const confidence = normalizeConfidence(item);
        return confidence.level === 'high';
      }).length,
    [activeItems]
  );

  const latestUpdateLabel = useMemo(() => formatLastUpdated(activeItems), [activeItems]);

  const applyPropertyId = (href: string) => {
    if (!selectedPropertyId) return href;
    const divider = href.includes('?') ? '&' : '?';
    return `${href}${divider}propertyId=${encodeURIComponent(selectedPropertyId)}`;
  };

  const quickActions = [
    {
      label: 'Run Full Scan',
      description: 'Refresh home signals',
      href: applyPropertyId('/dashboard/oracle'),
      icon: BarChart3,
    },
    {
      label: 'Add Appliance',
      description: 'Track a new home item',
      href: applyPropertyId('/dashboard/inventory'),
      icon: Wrench,
    },
    {
      label: 'Schedule Maintenance',
      description: 'Stay ahead of issues',
      href: applyPropertyId('/dashboard/maintenance'),
      icon: CalendarClock,
    },
    {
      label: 'View All Tasks',
      description: 'See your full queue',
      href: applyPropertyId('/dashboard/actions'),
      icon: CheckCircle2,
    },
  ];

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

  const handleAddCoverage = () => {
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
    return <ResolutionLoadingState />;
  }

  return (
    <>
      <div className="space-y-6 pb-20">
        <header className="relative overflow-hidden rounded-[28px] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-sky-50 to-white p-6 shadow-[0_10px_40px_rgba(14,116,144,0.08)] md:p-8">
          <div className="pointer-events-none absolute -left-16 top-1/2 h-52 w-52 -translate-y-1/2 rounded-full bg-cyan-200/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-8 top-6 h-40 w-40 rounded-full bg-sky-200/25 blur-3xl" />

          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/70 bg-white/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700">
                <CalendarClock className="h-3.5 w-3.5" />
                Resolution Center
              </div>

              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Home Triage</h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                  We analyzed your home signals and ranked what needs attention now, what protects your budget, and what can wait.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-rose-200/70 bg-white/80 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
                    <ShieldAlert className="h-4 w-4" />
                    Urgent Issues
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{filterCounts.urgent}</p>
                </div>
                <div className="rounded-2xl border border-amber-200/70 bg-white/80 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                    <DollarSign className="h-4 w-4" />
                    Total At Risk
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCompactUsd(Math.round(totalAtRisk))}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/70 bg-white/80 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                    High Confidence
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{highConfidenceCount}</p>
                </div>
                <div className="rounded-2xl border border-blue-200/70 bg-white/80 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                    <ShieldCheck className="h-4 w-4" />
                    Coverage Gaps
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{filterCounts.coverage}</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="hidden md:block">
                <Image
                  src="/images/Home_Illustration.png"
                  alt="Home triage illustration"
                  width={580}
                  height={420}
                  className="pointer-events-none mx-auto w-full max-w-[280px] select-none object-contain"
                  priority
                />
              </div>
              <div className="rounded-2xl border border-white/90 bg-white/90 p-4 shadow-lg shadow-sky-100/50 md:mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Triage Pulse</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                    <p className="text-[11px] text-slate-500">Open items</p>
                    <p className="text-lg font-semibold text-slate-900">{filterCounts.all}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                    <p className="text-[11px] text-slate-500">Completed</p>
                    <p className="text-lg font-semibold text-slate-900">{filterCounts.completed}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">{latestUpdateLabel}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm">
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                role="tablist"
                aria-label="Resolution filters"
              >
                {FILTER_OPTIONS.map((filterOption) => {
                  const active = normalizedFilter === filterOption.key;
                  const filterMeta = FILTER_META[filterOption.key];
                  const FilterIcon = filterMeta.icon;
                  return (
                    <button
                      key={filterOption.key}
                      onClick={() => handleFilterChange(filterOption.key)}
                      className={cn(
                        'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none',
                        active
                          ? filterMeta.activeCls
                          : 'border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50'
                      )}
                      aria-pressed={active}
                    >
                      <FilterIcon className={cn('h-4 w-4', active ? 'text-current' : filterMeta.tintCls)} />
                      <span>{filterOption.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] leading-none',
                          active ? 'bg-white/80 text-slate-700' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {filterCounts[filterOption.key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {hasLoadError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-800">
                <p className="font-semibold">Some data sources are temporarily unavailable.</p>
                <p className="mt-1 text-rose-700/90">{loadErrorMessage}</p>
                <Button
                  variant="outline"
                  className="mt-3 border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
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
              <div className="space-y-8">
                {visibleGroups.map((group) => {
                  const GroupIcon = GROUP_ICON[group.id] || Wrench;
                  return (
                    <section key={group.id} className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'mt-1 rounded-xl border p-2.5',
                              group.tone === 'danger'
                                ? 'border-rose-200 bg-rose-50 text-rose-600'
                                : group.tone === 'warning'
                                ? 'border-amber-200 bg-amber-50 text-amber-600'
                                : group.tone === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : 'border-blue-200 bg-blue-50 text-blue-600',
                            )}
                          >
                            <GroupIcon className="h-5 w-5" />
                          </div>
                          <div className="space-y-1">
                            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{group.title}</h2>
                            <p className="max-w-3xl text-sm text-slate-600">{group.subtitle}</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {group.items.map((item: any) => (
                          <TriageActionCard
                            key={item.id || item.actionKey}
                            item={item}
                            groupId={group.id}
                            onComplete={() => handleOpenComplete(item)}
                            onOpenService={() => handleOpenService(item)}
                            onOpenIncident={handleOpenIncident}
                            onReplaceRepair={handleReplaceRepair}
                            onAddCoverage={handleAddCoverage}
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
              <EmptyQueueState isCompletedFilter={normalizedFilter === 'completed'} />
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24">
            <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Today&apos;s Snapshot</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Total at risk</span>
                  <span className="font-semibold text-rose-600">{formatCompactUsd(Math.round(totalAtRisk))}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Urgent issues</span>
                  <span className="font-semibold text-rose-600">{filterCounts.urgent}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">High confidence</span>
                  <span className="font-semibold text-emerald-600">{highConfidenceCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Coverage gaps</span>
                  <span className="font-semibold text-blue-600">{filterCounts.coverage}</span>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">{latestUpdateLabel}</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Quick Actions</h3>
              <div className="mt-4 space-y-2.5">
                {quickActions.map((action) => {
                  const ActionIcon = action.icon;
                  return (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-slate-100 p-2">
                          <ActionIcon className="h-4 w-4 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                          <p className="text-xs text-slate-500">{action.description}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-5 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">Need Help Now?</h3>
              <p className="mt-2 text-sm text-slate-600">
                Connect with trusted local pros available in your area.
              </p>
              <Button asChild className="mt-4 h-11 w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700">
                <Link href={applyPropertyId('/dashboard/emergency')}>Get Emergency Help</Link>
              </Button>
            </section>
          </aside>
        </div>

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
