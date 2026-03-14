'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  Home,
  Loader2,
  Radar,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import { api } from '@/lib/api/client';
import type { Property } from '@/types';
import { listInventoryItems, listInventoryRooms, listPropertyDocuments } from '../../../../inventory/inventoryApi';
import { listIncidents } from '../../incidents/incidentsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  CompactEntityRow,
  EmptyStateCard,
  IconBadge,
  MobileCard,
  MobileFilterSurface,
  MobileHorizontalScroller,
  MobilePageIntro,
  MobileSectionHeader,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  createServicePriceRadarCheck,
  getServicePriceRadarCheck,
  listServicePriceRadarChecks,
  SERVICE_PRICE_RADAR_CATEGORY_OPTIONS,
  trackServicePriceRadarEvent,
  type CreateServicePriceRadarCheckPayload,
  type JsonValue,
  type ServicePriceRadarCheckDetail,
  type ServicePriceRadarCheckSummary,
  type ServicePriceRadarLaunchSurface,
  type ServiceRadarCategory,
  type ServiceRadarLinkedEntityType,
  type ServiceRadarVerdict,
} from './servicePriceRadarApi';
import {
  MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT,
  buildServicePriceRadarGuardrail,
  buildServicePriceRadarValidationErrors,
  getServicePriceRadarUserMessage,
} from './servicePriceRadarUi';

type FormState = {
  serviceCategory: ServiceRadarCategory | '';
  serviceSubcategory: string;
  quoteAmount: string;
  quoteVendorName: string;
  serviceLabelRaw: string;
  linkedEntityKey: string;
};

type LinkedEntityOption = {
  key: string;
  linkedEntityType: ServiceRadarLinkedEntityType;
  linkedEntityId: string;
  label: string;
  description: string;
};

type LinkedDocumentOption = {
  id: string;
  name: string;
  type?: string | null;
};

type ValidationErrors = Partial<Record<'serviceCategory' | 'quoteAmount', string>>;

const QUICK_CATEGORY_VALUES: ServiceRadarCategory[] = [
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'ROOFING',
  'WATER_HEATER',
  'APPLIANCE_REPAIR',
  'GENERAL_HANDYMAN',
  'LANDSCAPING_DRAINAGE',
];

const EMPTY_FORM: FormState = {
  serviceCategory: '',
  serviceSubcategory: '',
  quoteAmount: '',
  quoteVendorName: '',
  serviceLabelRaw: '',
  linkedEntityKey: '',
};

const INPUT_BASE_CLASS =
  'min-h-[48px] rounded-2xl border-[hsl(var(--mobile-border-subtle))] bg-white/90 px-3.5 text-sm shadow-none focus-visible:ring-[hsl(var(--mobile-brand-strong))]';

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as Record<string, JsonValue>;
}

function asArray(value: JsonValue): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function toCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function compactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function confidenceMeta(score: number | null): { label: string; tone: 'good' | 'info' | 'elevated' } {
  if (score === null || score === undefined) return { label: 'Confidence pending', tone: 'info' };
  if (score >= 0.72) return { label: 'High confidence', tone: 'good' };
  if (score >= 0.5) return { label: 'Moderate confidence', tone: 'info' };
  return { label: 'Limited confidence', tone: 'elevated' };
}

function verdictMeta(verdict: ServiceRadarVerdict | null): {
  label: string;
  tone: 'good' | 'info' | 'elevated' | 'danger';
  title: string;
} {
  if (verdict === 'FAIR') return { label: 'Fair', tone: 'good', title: 'Quote looks fair' };
  if (verdict === 'HIGH') return { label: 'Above range', tone: 'elevated', title: 'Quote looks above range' };
  if (verdict === 'VERY_HIGH') return { label: 'Well above range', tone: 'danger', title: 'Quote looks materially high' };
  if (verdict === 'UNDERPRICED') return { label: 'Below range', tone: 'info', title: 'Quote looks below range' };
  return { label: 'Need more context', tone: 'info', title: 'Estimate needs more context' };
}

function buildValidationErrors(form: FormState): ValidationErrors {
  return buildServicePriceRadarValidationErrors({
    serviceCategory: form.serviceCategory,
    quoteAmount: form.quoteAmount,
  });
}

function optionLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return formatEnumLabel(value);
}

function propertyLabel(property: Property | null): string {
  if (!property) return 'Property';
  return (
    property.name?.trim() ||
    [property.address, property.city].filter(Boolean).join(', ') ||
    'Property'
  );
}

function propertyContextLine(property: Property | null): string {
  if (!property) return 'Property context unavailable';

  const bits = [
    property.propertyType ? optionLabel(property.propertyType) : null,
    property.propertySize ? `${property.propertySize.toLocaleString()} sq ft` : null,
    property.yearBuilt ? `Built ${property.yearBuilt}` : null,
  ].filter(Boolean);

  return bits.length ? bits.join(' • ') : 'We will use the property details already on file.';
}

function resolveCategoryOption(value: ServiceRadarCategory | '') {
  return SERVICE_PRICE_RADAR_CATEGORY_OPTIONS.find((option) => option.value === value) ?? null;
}

function normalizeLaunchSurface(value: string | null): ServicePriceRadarLaunchSurface {
  if (
    value === 'home_tools' ||
    value === 'property_hub' ||
    value === 'system_detail' ||
    value === 'incident_card' ||
    value === 'maintenance_card'
  ) {
    return value;
  }
  return 'unknown';
}

function quoteAmountBand(value: number): string {
  if (value < 500) return 'under_500';
  if (value < 1500) return '500_1500';
  if (value < 5000) return '1500_5000';
  if (value < 10000) return '5000_10000';
  if (value < 20000) return '10000_20000';
  return 'over_20000';
}

function confidenceBand(score: number | null | undefined): 'low' | 'medium' | 'high' | 'unknown' {
  if (score === null || score === undefined) return 'unknown';
  if (score >= 0.72) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function deviceContext(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
}

function errorType(error: unknown): 'network' | 'validation' | 'unauthorized' | 'unknown' {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) return 'network';
  if (message.includes('validation') || message.includes('invalid') || message.includes('required')) return 'validation';
  if (message.includes('auth') || message.includes('unauthorized') || message.includes('access denied')) return 'unauthorized';
  return 'unknown';
}

function selectedLinkedEntityType(
  form: FormState,
  linkedOptions: LinkedEntityOption[],
  prefilledLinkedOption?: LinkedEntityOption | null
): ServiceRadarLinkedEntityType | null {
  const selected =
    linkedOptions.find((option) => option.key === form.linkedEntityKey) ??
    (prefilledLinkedOption?.key === form.linkedEntityKey ? prefilledLinkedOption : null);
  return selected?.linkedEntityType ?? null;
}

function buildPayload(
  form: FormState,
  linkedOptions: LinkedEntityOption[],
  prefilledLinkedOption?: LinkedEntityOption | null
): CreateServicePriceRadarCheckPayload {
  const selectedLinked =
    linkedOptions.find((option) => option.key === form.linkedEntityKey) ??
    (prefilledLinkedOption?.key === form.linkedEntityKey ? prefilledLinkedOption : null);

  return {
    serviceCategory: form.serviceCategory as ServiceRadarCategory,
    serviceSubcategory: form.serviceSubcategory.trim() || undefined,
    quoteAmount: Number(form.quoteAmount),
    quoteVendorName: form.quoteVendorName.trim() || undefined,
    serviceLabelRaw: form.serviceLabelRaw.trim() || undefined,
    quoteCurrency: 'USD',
    linkedEntities: selectedLinked
      ? [
          {
            linkedEntityType: selectedLinked.linkedEntityType,
            linkedEntityId: selectedLinked.linkedEntityId,
            relevanceScore: 0.9,
          },
        ]
      : undefined,
  };
}

function buildFormFromCheck(check: ServicePriceRadarCheckDetail | ServicePriceRadarCheckSummary): FormState {
  return {
    serviceCategory: check.serviceCategory,
    serviceSubcategory: check.serviceSubcategory ?? '',
    quoteAmount: check.quoteAmount ? String(check.quoteAmount) : '',
    quoteVendorName: check.quoteVendorName ?? '',
    serviceLabelRaw: check.serviceLabelRaw ?? '',
    linkedEntityKey: '',
  };
}

function buildNegotiationShieldHref(propertyId: string, check: ServicePriceRadarCheckDetail): string {
  const params = new URLSearchParams({
    create: '1',
    scenario: 'contractor-quote-review',
  });

  if (check.quoteVendorName) {
    params.set('contractorName', check.quoteVendorName);
  }
  params.set('quoteAmount', String(check.quoteAmount));
  params.set('serviceCategory', check.serviceCategory);

  return `/dashboard/properties/${propertyId}/tools/negotiation-shield?${params.toString()}`;
}

function extractReasons(check: ServicePriceRadarCheckDetail): string[] {
  const explanation = asRecord(check.explanationJson);
  const reasonCodes = explanation?.reasonCodes;
  return asArray(reasonCodes ?? null).map((item) => optionLabel(typeof item === 'string' ? item : ''));
}

function extractAdjustmentRows(check: ServicePriceRadarCheckDetail) {
  const factors = asRecord(check.pricingFactorsJson);
  const adjustments = asArray(factors?.adjustments ?? null);
  return adjustments
    .map((entry) => asRecord(entry))
    .filter(Boolean)
    .map((entry) => ({
      code: optionLabel(typeof entry?.code === 'string' ? entry.code : ''),
      effect: typeof entry?.effect === 'string' ? entry.effect : 'neutral',
      note: typeof entry?.note === 'string' ? entry.note : '',
    }));
}

function extractFactorChips(check: ServicePriceRadarCheckDetail): string[] {
  const snapshot = asRecord(check.propertySnapshotJson);
  const systems = asRecord(snapshot?.systems ?? null);
  const chips: string[] = [];

  if (snapshot?.propertyType && typeof snapshot.propertyType === 'string') {
    chips.push(optionLabel(snapshot.propertyType));
  }
  if (typeof snapshot?.propertySize === 'number') {
    chips.push(`${snapshot.propertySize.toLocaleString()} sq ft`);
  }
  if (typeof snapshot?.yearBuilt === 'number') {
    chips.push(`Built ${snapshot.yearBuilt}`);
  }
  if (systems?.roofType && typeof systems.roofType === 'string') {
    chips.push(`Roof: ${optionLabel(systems.roofType)}`);
  }
  if (systems?.waterHeaterType && typeof systems.waterHeaterType === 'string') {
    chips.push(`Water heater: ${optionLabel(systems.waterHeaterType)}`);
  }
  if (systems?.heatingType && typeof systems.heatingType === 'string') {
    chips.push(`Heat: ${optionLabel(systems.heatingType)}`);
  }

  return chips;
}

function extractBenchmarkMeta(check: ServicePriceRadarCheckDetail): {
  benchmarkMatched: boolean;
  estimationMode: 'benchmark' | 'fallback';
} {
  const pricing = asRecord(check.pricingFactorsJson);
  const benchmark = asRecord(pricing?.benchmark ?? null);
  const benchmarkMatched = benchmark?.matched === true;
  return {
    benchmarkMatched,
    estimationMode: benchmarkMatched ? 'benchmark' : 'fallback',
  };
}

function QuoteComparisonMeter({
  quoteAmount,
  expectedLow,
  expectedHigh,
  quoteCurrency,
}: {
  quoteAmount: number;
  expectedLow: number | null;
  expectedHigh: number | null;
  quoteCurrency: string;
}) {
  if (!expectedLow || !expectedHigh || expectedHigh <= 0) return null;

  const min = Math.max(0, Math.min(expectedLow, quoteAmount) * 0.75);
  const max = Math.max(expectedHigh, quoteAmount) * 1.15;
  const span = Math.max(1, max - min);
  const expectedStart = ((expectedLow - min) / span) * 100;
  const expectedWidth = ((expectedHigh - expectedLow) / span) * 100;
  const quotePosition = ((quoteAmount - min) / span) * 100;

  return (
    <div className="space-y-2 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white/80 p-3">
      <div className="relative h-3 rounded-full bg-slate-100">
        <div
          className="absolute top-0 h-3 rounded-full bg-emerald-200"
          style={{ left: `${expectedStart}%`, width: `${expectedWidth}%` }}
        />
        <div
          className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full bg-slate-900 shadow-[0_0_0_3px_rgba(255,255,255,0.8)]"
          style={{ left: `calc(${Math.min(100, Math.max(0, quotePosition))}% - 3px)` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-[hsl(var(--mobile-text-secondary))]">
        <span>{toCurrency(expectedLow, quoteCurrency)}</span>
        <span>Expected range</span>
        <span>{toCurrency(expectedHigh, quoteCurrency)}</span>
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <ScenarioInputCard
      title="Checking quote"
      subtitle="Using your home details and available price context."
    >
      <div role="status" aria-live="polite" aria-label="Checking quote" className="space-y-3">
        <div className="h-6 w-28 animate-pulse rounded-full bg-slate-100" />
        <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </ScenarioInputCard>
  );
}

function LinkedEntityPicker({
  value,
  options,
  loading,
  onChange,
}: {
  value: string;
  options: LinkedEntityOption[];
  loading: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
      <span>Link home context</span>
      <select
        className={`${INPUT_BASE_CLASS} w-full`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{loading ? 'Loading linked context…' : 'No linked context'}</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label} - {option.description}
          </option>
        ))}
      </select>
    </label>
  );
}

function RecentCheckRow({
  item,
  active,
  loading,
  onOpen,
}: {
  item: ServicePriceRadarCheckSummary;
  active: boolean;
  loading: boolean;
  onOpen: () => void;
}) {
  const verdict = verdictMeta(item.verdict);
  const rangeLabel =
    item.expectedLow !== null && item.expectedHigh !== null
      ? `${toCurrency(item.expectedLow, item.quoteCurrency)} to ${toCurrency(item.expectedHigh, item.quoteCurrency)}`
      : 'Broad range only';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border p-3 text-left transition-colors ${
        active
          ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]'
          : 'border-[hsl(var(--mobile-border-subtle))] bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0 line-clamp-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
            {resolveCategoryOption(item.serviceCategory)?.label ?? optionLabel(item.serviceCategory)}
          </p>
          <p className="mb-0 mt-0.5 line-clamp-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
            {[item.serviceSubcategory ? optionLabel(item.serviceSubcategory) : null, compactDate(item.createdAt)]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </div>
        <div className="shrink-0">
          <StatusChip tone={verdict.tone}>{verdict.label}</StatusChip>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="mb-0 text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
            Quote
          </p>
          <p className="mb-0 text-sm font-semibold tabular-nums text-[hsl(var(--mobile-text-primary))]">
            {toCurrency(item.quoteAmount, item.quoteCurrency)}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-0 text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
            Expected
          </p>
          <p className="mb-0 text-sm tabular-nums text-[hsl(var(--mobile-text-primary))]">{rangeLabel}</p>
        </div>
      </div>
      {item.explanationShort ? (
        <p className="mb-0 mt-2 line-clamp-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
          {item.explanationShort}
        </p>
      ) : null}
      {loading ? (
        <p className="mb-0 mt-2 text-xs font-medium text-[hsl(var(--mobile-brand-strong))]">Opening details…</p>
      ) : null}
    </button>
  );
}

export default function ServicePriceRadarClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const resultRef = useRef<HTMLDivElement | null>(null);
  const loadRef = useRef(0);
  const appliedPrefillSignatureRef = useRef<string | null>(null);
  const openedSessionRef = useRef<string | null>(null);
  const startedSessionRef = useRef<string | null>(null);
  const viewedResultIdsRef = useRef<Set<string>>(new Set());
  const explanationExpandedIdsRef = useRef<Set<string>>(new Set());

  const [property, setProperty] = useState<Property | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);

  const [currentCheck, setCurrentCheck] = useState<ServicePriceRadarCheckDetail | null>(null);
  const [recentChecks, setRecentChecks] = useState<ServicePriceRadarCheckSummary[]>([]);
  const [checksLoading, setChecksLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCheckId, setLoadingCheckId] = useState<string | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);

  const [linkedOptions, setLinkedOptions] = useState<LinkedEntityOption[]>([]);
  const [linkedOptionsLoading, setLinkedOptionsLoading] = useState(false);
  const [linkedOptionsLoaded, setLinkedOptionsLoaded] = useState(false);

  const launchSurface = normalizeLaunchSurface(searchParams.get('launchSurface'));
  const prefilledCategoryValue = searchParams.get('category');
  const prefilledQuoteAmount = searchParams.get('quoteAmount');
  const prefilledLinkedEntityType = searchParams.get('linkedEntityType');
  const prefilledLinkedEntityId = searchParams.get('linkedEntityId');
  const prefilledLinkedKey =
    prefilledLinkedEntityType && prefilledLinkedEntityId
      ? `${prefilledLinkedEntityType}:${prefilledLinkedEntityId}`
      : '';
  const prefilledLinkedOption =
    prefilledLinkedKey &&
    ['SYSTEM', 'APPLIANCE', 'DOCUMENT', 'INCIDENT', 'ROOM', 'OTHER'].includes(prefilledLinkedEntityType || '')
      ? {
          key: prefilledLinkedKey,
          linkedEntityType: prefilledLinkedEntityType as ServiceRadarLinkedEntityType,
          linkedEntityId: prefilledLinkedEntityId as string,
          label: searchParams.get('label')?.trim() || 'Linked context',
          description: 'Prefilled from your current workflow',
        }
      : null;
  const prefillSignature = [
    launchSurface,
    prefilledCategoryValue || '',
    searchParams.get('subcategory') || '',
    searchParams.get('label') || '',
    prefilledQuoteAmount || '',
    searchParams.get('vendor') || '',
    prefilledLinkedEntityType || '',
    prefilledLinkedEntityId || '',
  ].join('|');

  const hasResult = Boolean(currentCheck);
  const currentVerdict = verdictMeta(currentCheck?.verdict ?? null);
  const currentConfidence = confidenceMeta(currentCheck?.confidenceScore ?? null);
  const currentReasons = currentCheck ? extractReasons(currentCheck) : [];
  const adjustmentRows = currentCheck ? extractAdjustmentRows(currentCheck) : [];
  const factorChips = currentCheck ? extractFactorChips(currentCheck) : [];
  const currentLinkedEntities = currentCheck?.linkedEntities ?? [];
  const currentBenchmarkMeta = currentCheck
    ? extractBenchmarkMeta(currentCheck)
    : { benchmarkMatched: false, estimationMode: 'fallback' as const };
  const currentGuardrail = currentCheck
    ? buildServicePriceRadarGuardrail({
        verdict: currentCheck.verdict,
        confidenceScore: currentCheck.confidenceScore,
        benchmarkMatched: currentBenchmarkMeta.benchmarkMatched,
        expectedLow: currentCheck.expectedLow,
        expectedHigh: currentCheck.expectedHigh,
      })
    : null;
  const hadPrefill = Boolean(
    prefilledCategoryValue ||
      searchParams.get('subcategory') ||
      searchParams.get('label') ||
      prefilledQuoteAmount ||
      searchParams.get('vendor') ||
      prefilledLinkedEntityType ||
      prefilledLinkedEntityId
  );

  // Tracking map:
  // OPENED -> tool screen entered
  // STARTED -> first meaningful form interaction
  // SUBMITTED / RESULT_VIEWED / ERROR -> core funnel
  // EXPLANATION_EXPANDED / HISTORY_ITEM_OPENED / NEGOTIATION_HANDOFF_CLICKED -> engagement
  function trackRadarEvent(event: string, section?: string, metadata?: Record<string, unknown>) {
    if (!propertyId) return;

    void trackServicePriceRadarEvent(propertyId, {
      event,
      section,
      metadata: {
        tool_name: 'service_price_radar',
        property_id: propertyId,
        property_has_context: Boolean(propertyId),
        launch_surface: launchSurface,
        ...metadata,
      },
    }).catch(() => undefined);
  }

  function trackRadarError(
    stage: 'submit' | 'list' | 'detail',
    error: unknown,
    extra?: Record<string, unknown>
  ) {
    trackRadarEvent('ERROR', stage, {
      stage,
      error_type: errorType(error),
      service_category: form.serviceCategory || undefined,
      ...extra,
    });
  }

  function ensureStarted(source: 'edit' | 'submit') {
    if (!propertyId || startedSessionRef.current === prefillSignature) return;
    startedSessionRef.current = prefillSignature;
    trackRadarEvent('STARTED', 'form', {
      source,
      had_prefill: hadPrefill,
      service_category_initial: form.serviceCategory || prefilledCategoryValue || undefined,
    });
  }

  useEffect(() => {
    if (!propertyId || openedSessionRef.current === prefillSignature) return;
    openedSessionRef.current = prefillSignature;
    startedSessionRef.current = null;
    viewedResultIdsRef.current = new Set();
    explanationExpandedIdsRef.current = new Set();

    trackRadarEvent('OPENED', 'page', {
      prefilled_category: prefilledCategoryValue || undefined,
      prefilled_linked_entity_type: prefilledLinkedEntityType || undefined,
      device_context: deviceContext(),
      has_property_context: true,
    });
  }, [launchSurface, prefillSignature, prefilledCategoryValue, prefilledLinkedEntityType, propertyId]);

  useEffect(() => {
    setExplanationOpen(false);
  }, [currentCheck?.id]);

  useEffect(() => {
    if (!currentCheck || viewedResultIdsRef.current.has(currentCheck.id)) return;
    viewedResultIdsRef.current.add(currentCheck.id);

    const benchmarkMeta = extractBenchmarkMeta(currentCheck);
    trackRadarEvent('RESULT_VIEWED', 'result', {
      service_category: currentCheck.serviceCategory,
      verdict: currentCheck.verdict || undefined,
      confidence_band: confidenceBand(currentCheck.confidenceScore),
      benchmark_matched: benchmarkMeta.benchmarkMatched,
      estimation_mode: benchmarkMeta.estimationMode,
    });
  }, [currentCheck]);

  useEffect(() => {
    if (appliedPrefillSignatureRef.current === prefillSignature) return;

    const nextCategory = SERVICE_PRICE_RADAR_CATEGORY_OPTIONS.some(
      (option) => option.value === prefilledCategoryValue
    )
      ? (prefilledCategoryValue as ServiceRadarCategory)
      : '';
    const nextQuoteAmount =
      prefilledQuoteAmount && Number.isFinite(Number(prefilledQuoteAmount)) && Number(prefilledQuoteAmount) > 0
        ? prefilledQuoteAmount
        : '';
    const nextForm: FormState = {
      serviceCategory: nextCategory,
      serviceSubcategory: searchParams.get('subcategory')?.trim() || '',
      quoteAmount: nextQuoteAmount,
      quoteVendorName: searchParams.get('vendor')?.trim() || '',
      serviceLabelRaw: searchParams.get('label')?.trim() || '',
      linkedEntityKey: prefilledLinkedKey,
    };

    const hasPrefill = Object.values(nextForm).some((value) => value);
    appliedPrefillSignatureRef.current = prefillSignature;
    if (!hasPrefill) return;

    setForm((current) => ({
      ...current,
      ...nextForm,
    }));
    if (nextForm.quoteVendorName || nextForm.serviceLabelRaw || nextForm.linkedEntityKey) {
      setAdvancedOpen(true);
    }
    if (prefilledLinkedOption) {
      setLinkedOptions((current) =>
        current.some((option) => option.key === prefilledLinkedOption.key)
          ? current
          : [prefilledLinkedOption, ...current]
      );
    }
  }, [
    prefilledCategoryValue,
    prefilledLinkedKey,
    prefilledLinkedOption,
    prefilledQuoteAmount,
    prefillSignature,
    searchParams,
  ]);

  async function loadPropertyAndChecks() {
    if (!propertyId) return;
    const requestId = ++loadRef.current;
    setPropertyLoading(true);
    setChecksLoading(true);
    setPropertyError(null);
    setToolError(null);

    const [propertyResult, checksResult] = await Promise.allSettled([
      api.getProperty(propertyId),
      listServicePriceRadarChecks(propertyId, 12),
    ]);

    if (requestId !== loadRef.current) return;

    if (propertyResult.status === 'fulfilled') {
      if (propertyResult.value.success && propertyResult.value.data) {
        setProperty(propertyResult.value.data);
        setPropertyError(null);
      } else {
        setProperty(null);
        setPropertyError(
          getServicePriceRadarUserMessage(
            new Error(propertyResult.value.message || 'Unable to load property context.'),
            'property'
          ).message
        );
      }
    } else {
      setProperty(null);
      setPropertyError(getServicePriceRadarUserMessage(propertyResult.reason, 'property').message);
    }
    setPropertyLoading(false);

    if (checksResult.status === 'fulfilled') {
      const items = checksResult.value;
      setRecentChecks(items);
      setChecksLoading(false);
      if (items[0]) {
        try {
          const latest = await getServicePriceRadarCheck(propertyId, items[0].id);
          if (requestId !== loadRef.current) return;
          setCurrentCheck(latest);
          setForm((current) =>
            current.serviceCategory || current.quoteAmount || current.serviceSubcategory || current.quoteVendorName || current.serviceLabelRaw
              ? current
              : buildFormFromCheck(latest)
          );
        } catch (error) {
          if (requestId !== loadRef.current) return;
          trackRadarError('detail', error, { source: 'initial_latest_check' });
          setToolError(getServicePriceRadarUserMessage(error, 'detail').message);
        }
      } else {
        setCurrentCheck(null);
      }
    } else {
      trackRadarError('list', checksResult.reason);
      setRecentChecks([]);
      setChecksLoading(false);
      setToolError(getServicePriceRadarUserMessage(checksResult.reason, 'list').message);
    }
  }

  useEffect(() => {
    loadPropertyAndChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (!advancedOpen || linkedOptionsLoaded || !propertyId) return;

    let active = true;

    async function loadLinkedOptions() {
      setLinkedOptionsLoading(true);

      const [itemsResult, roomsResult, docsResult, incidentsResult] = await Promise.allSettled([
        listInventoryItems(propertyId, {}),
        listInventoryRooms(propertyId),
        listPropertyDocuments(propertyId),
        listIncidents({ propertyId, limit: 8 }),
      ]);

      if (!active) return;

      const nextOptions: LinkedEntityOption[] = [];

      if (itemsResult.status === 'fulfilled') {
        nextOptions.push(
          ...itemsResult.value.slice(0, 10).map((item) => ({
            key: `SYSTEM:${item.id}`,
            linkedEntityType: 'SYSTEM' as const,
            linkedEntityId: item.id,
            label: item.name,
            description: [item.room?.name, item.brand, item.model].filter(Boolean).join(' • ') || 'Inventory item',
          }))
        );
      }

      if (roomsResult.status === 'fulfilled') {
        nextOptions.push(
          ...roomsResult.value.slice(0, 6).map((room) => ({
            key: `ROOM:${room.id}`,
            linkedEntityType: 'ROOM' as const,
            linkedEntityId: room.id,
            label: room.name,
            description: room.floorLevel != null ? `Floor ${room.floorLevel}` : 'Room context',
          }))
        );
      }

      if (docsResult.status === 'fulfilled') {
        nextOptions.push(
          ...docsResult.value.slice(0, 6).map((doc: LinkedDocumentOption) => ({
            key: `DOCUMENT:${doc.id}`,
            linkedEntityType: 'DOCUMENT' as const,
            linkedEntityId: doc.id,
            label: doc.name,
            description: optionLabel(doc.type || 'DOCUMENT'),
          }))
        );
      }

      if (incidentsResult.status === 'fulfilled') {
        nextOptions.push(
          ...incidentsResult.value.items.slice(0, 6).map((incident) => ({
            key: `INCIDENT:${incident.id}`,
            linkedEntityType: 'INCIDENT' as const,
            linkedEntityId: incident.id,
            label: incident.title,
            description: [optionLabel(incident.severity), optionLabel(incident.status)]
              .filter(Boolean)
              .join(' • '),
          }))
        );
      }

      if (
        prefilledLinkedOption &&
        !nextOptions.some((option) => option.key === prefilledLinkedOption.key)
      ) {
        nextOptions.unshift(prefilledLinkedOption);
      }

      setLinkedOptions(nextOptions);
      setLinkedOptionsLoaded(true);
      setLinkedOptionsLoading(false);
    }

    loadLinkedOptions();

    return () => {
      active = false;
    };
  }, [advancedOpen, linkedOptionsLoaded, prefilledLinkedOption, propertyId]);

  function syncValidation(nextForm: FormState) {
    setValidationErrors(buildValidationErrors(nextForm));
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    const previousValue = form[key];
    const nextForm = { ...form, [key]: value };
    setForm(nextForm);
    if (previousValue !== value) {
      ensureStarted('edit');
    }
    if (submitAttempted) {
      syncValidation(nextForm);
    }
  }

  function revealResultSoon() {
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function openCheck(checkId: string) {
    if (!propertyId || loadingCheckId === checkId || submitting) return;
    setLoadingCheckId(checkId);
    setToolError(null);

    try {
      const detail = await getServicePriceRadarCheck(propertyId, checkId);
      setCurrentCheck(detail);
      setForm((current) => ({
        ...current,
        ...buildFormFromCheck(detail),
      }));
      const openedIndex = recentChecks.findIndex((item) => item.id === checkId);
      trackRadarEvent('HISTORY_ITEM_OPENED', 'history', {
        service_category: detail.serviceCategory,
        verdict: detail.verdict || undefined,
        source_list_position: openedIndex >= 0 ? openedIndex + 1 : undefined,
      });
      revealResultSoon();
    } catch (error) {
      trackRadarError('detail', error, { source: 'history_open' });
      setToolError(getServicePriceRadarUserMessage(error, 'detail').message);
    } finally {
      setLoadingCheckId(null);
    }
  }

  async function refreshRecentChecks(options?: { afterSubmit?: boolean }) {
    if (!propertyId) return;
    try {
      const items = await listServicePriceRadarChecks(propertyId, 12);
      setRecentChecks(items);
      return true;
    } catch (error) {
      trackRadarError('list', error, { source: 'refresh_recent_checks' });
      setToolError((current) => {
        if (current) return current;
        if (options?.afterSubmit) {
          return 'Quote checked. Recent history may take a moment to refresh.';
        }
        return getServicePriceRadarUserMessage(error, 'list').message;
      });
      return false;
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitAttempted(true);
    ensureStarted('submit');
    const errors = buildValidationErrors(form);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0 || !propertyId) return;

    setSubmitting(true);
    setToolError(null);

    try {
      const linkedEntityType = selectedLinkedEntityType(form, linkedOptions, prefilledLinkedOption);
      trackRadarEvent('SUBMITTED', 'form', {
        service_category: form.serviceCategory || undefined,
        service_subcategory_present: Boolean(form.serviceSubcategory.trim()),
        quote_amount_band: quoteAmountBand(Number(form.quoteAmount)),
        quote_source: 'MANUAL',
        linked_entity_present: Boolean(linkedEntityType),
        linked_entity_type: linkedEntityType || undefined,
        had_vendor_name: Boolean(form.quoteVendorName.trim()),
      });
      const payload = buildPayload(form, linkedOptions, prefilledLinkedOption);
      const detail = await createServicePriceRadarCheck(propertyId, payload);
      setCurrentCheck(detail);
      await refreshRecentChecks({ afterSubmit: true });
      revealResultSoon();
    } catch (error) {
      trackRadarError('submit', error);
      const nextError = getServicePriceRadarUserMessage(error, 'submit');
      if (nextError.clearLinkedEntity) {
        setAdvancedOpen(true);
        setForm((current) => ({
          ...current,
          linkedEntityKey: '',
        }));
      }
      setToolError(nextError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!propertyId) {
    return (
      <MobileToolWorkspace
        className="lg:max-w-7xl lg:px-8 lg:pb-10"
        intro={<MobilePageIntro eyebrow="Home Tool" title="Service Price Radar" subtitle="Choose a property first." />}
      >
        <EmptyStateCard
          title="Property context required"
          description="Open Service Price Radar from a property so we can compare the quote against the right home context."
          action={
            <Button asChild>
              <Link href="/dashboard/properties">Go to properties</Link>
            </Button>
          }
        />
      </MobileToolWorkspace>
    );
  }

  return (
    <MobileToolWorkspace
      className="space-y-5 lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <div className="space-y-3">
          <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
            <Link href={`/dashboard/properties/${propertyId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to property
            </Link>
          </Button>
          <MobilePageIntro
            eyebrow="Home Tool"
            title="Service Price Radar"
            subtitle="Know if a quote is fair for your home before you book the work."
            action={<Radar className="h-5 w-5 text-[hsl(var(--mobile-brand-strong))]" />}
          />
          <MobileCard variant="compact" className="border-[hsl(var(--mobile-brand-border))] bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))]">
            <div className="flex items-start gap-3">
              <IconBadge tone="brand">
                <Activity className="h-4 w-4" />
              </IconBadge>
              <div className="min-w-0 space-y-1">
                <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                  Use your property context to compare a service quote against an expected range.
                </p>
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                  Fast, explainable, and built for quick homeowner decisions on mobile.
                </p>
              </div>
            </div>
          </MobileCard>
        </div>
      }
      filters={
        <MobileFilterSurface>
          <HomeToolsRail propertyId={propertyId} />
        </MobileFilterSurface>
      }
      footer={<BottomSafeAreaReserve size="chatAware" />}
    >
      {toolError ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          {toolError}
        </div>
      ) : null}

      {propertyError ? (
        <EmptyStateCard
          title="Unable to load property context"
          description={propertyError}
          action={
            <Button variant="outline" onClick={() => loadPropertyAndChecks()}>
              Try again
            </Button>
          }
        />
      ) : null}

      <div
        className={
          hasResult
            ? 'grid gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(340px,0.88fr)] xl:items-start'
            : 'space-y-4'
        }
      >
        <div className="space-y-4 xl:col-start-1 xl:row-start-1">
          <ScenarioInputCard
            title="Check a quote"
            subtitle="Start with the essentials. Add more context only if you want a tighter estimate."
            badge={<StatusChip tone="info">USD</StatusChip>}
            actions={
              <ActionPriorityRow
                primaryAction={
                  <Button onClick={handleSubmit} disabled={submitting || propertyLoading} className="min-h-[48px] rounded-2xl text-sm font-semibold">
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking quote…
                      </>
                    ) : (
                      'Check Quote'
                    )}
                  </Button>
                }
                secondaryActions={
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setForm(EMPTY_FORM);
                      setValidationErrors({});
                      setSubmitAttempted(false);
                      setToolError(null);
                    }}
                    disabled={submitting}
                  >
                    Reset
                  </Button>
                }
              />
            }
          >
            <ReadOnlySummaryBlock
              items={[
                { label: 'Property', value: propertyLoading ? 'Loading…' : propertyLabel(property), emphasize: true },
                {
                  label: 'Context',
                  value: propertyLoading ? 'Loading…' : propertyContextLine(property),
                },
                {
                  label: 'Location',
                  value: property
                    ? [property.city, property.state, property.zipCode].filter(Boolean).join(' ') || 'On file'
                    : 'Loading…',
                },
              ]}
            />

            <div className="space-y-2">
              <label className="space-y-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
                <span>Service category</span>
                <select
                  aria-invalid={Boolean(validationErrors.serviceCategory)}
                  aria-describedby={
                    validationErrors.serviceCategory ? 'service-price-radar-category-error' : undefined
                  }
                  className={`${INPUT_BASE_CLASS} w-full`}
                  value={form.serviceCategory}
                  onChange={(event) => updateForm('serviceCategory', event.target.value as ServiceRadarCategory | '')}
                >
                  <option value="">Choose a service type</option>
                  {SERVICE_PRICE_RADAR_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {validationErrors.serviceCategory ? (
                <p id="service-price-radar-category-error" className="mb-0 text-xs text-rose-600">
                  {validationErrors.serviceCategory}
                </p>
              ) : null}

              <MobileHorizontalScroller className="-mx-1 px-1">
                {QUICK_CATEGORY_VALUES.map((value) => {
                  const option = resolveCategoryOption(value);
                  const active = form.serviceCategory === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateForm('serviceCategory', value)}
                      className={`snap-start rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
                          : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]'
                      }`}
                    >
                      {option?.shortLabel ?? optionLabel(value)}
                    </button>
                  );
                })}
              </MobileHorizontalScroller>
              {resolveCategoryOption(form.serviceCategory)?.helper ? (
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                  {resolveCategoryOption(form.serviceCategory)?.helper}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_148px]">
              <label className="space-y-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
                <span>Service detail</span>
                <Input
                  className={INPUT_BASE_CLASS}
                  maxLength={120}
                  value={form.serviceSubcategory}
                  onChange={(event) => updateForm('serviceSubcategory', event.target.value)}
                  placeholder="Repair, replacement, leak fix, panel upgrade…"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
                <span>Quote amount</span>
                <Input
                  type="number"
                  min={0}
                  max={MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT}
                  step="0.01"
                  inputMode="decimal"
                  aria-invalid={Boolean(validationErrors.quoteAmount)}
                  aria-describedby={
                    validationErrors.quoteAmount
                      ? 'service-price-radar-amount-error'
                      : 'service-price-radar-amount-help'
                  }
                  className={`${INPUT_BASE_CLASS} text-lg font-semibold`}
                  value={form.quoteAmount}
                  onChange={(event) => updateForm('quoteAmount', event.target.value)}
                  placeholder="2450"
                />
              </label>
            </div>
            <p id="service-price-radar-amount-help" className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
              Enter the full quoted amount in USD. For unusually large projects, use the closest phase or line item.
            </p>
            {validationErrors.quoteAmount ? (
              <p id="service-price-radar-amount-error" className="mb-0 text-xs text-rose-600">
                {validationErrors.quoteAmount}
              </p>
            ) : null}

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 text-left">
                <div>
                  <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                    Add more context
                  </p>
                  <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                    Vendor, description, or a linked home item can tighten the estimate.
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-[hsl(var(--mobile-text-muted))] transition-transform ${
                    advancedOpen ? 'rotate-180' : ''
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <label className="space-y-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
                  <span>Vendor name</span>
                  <Input
                    className={INPUT_BASE_CLASS}
                    maxLength={120}
                    value={form.quoteVendorName}
                    onChange={(event) => updateForm('quoteVendorName', event.target.value)}
                    placeholder="ABC Mechanical"
                  />
                </label>

                <label className="space-y-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]">
                  <span>Raw quote label or description</span>
                  <Textarea
                    className="min-h-[108px] rounded-2xl border-[hsl(var(--mobile-border-subtle))] bg-white/90 text-sm shadow-none focus-visible:ring-[hsl(var(--mobile-brand-strong))]"
                    maxLength={200}
                    value={form.serviceLabelRaw}
                    onChange={(event) => updateForm('serviceLabelRaw', event.target.value)}
                    placeholder="Example: Replace 50-gallon gas water heater with permit, haul-away, and expansion tank."
                  />
                </label>

                <LinkedEntityPicker
                  value={form.linkedEntityKey}
                  options={linkedOptions}
                  loading={linkedOptionsLoading}
                  onChange={(value) => updateForm('linkedEntityKey', value)}
                />
              </CollapsibleContent>
            </Collapsible>
          </ScenarioInputCard>
        </div>

        {hasResult || submitting || loadingCheckId ? (
          <div
            ref={resultRef}
            className="space-y-4 scroll-mt-24 xl:sticky xl:top-6 xl:col-start-2 xl:row-span-2"
            aria-live="polite"
          >
            {submitting || loadingCheckId ? (
              <ResultSkeleton />
            ) : currentCheck ? (
              <>
                <ResultHeroCard
                  eyebrow="Latest result"
                  title={currentVerdict.title}
                  value={toCurrency(currentCheck.quoteAmount, currentCheck.quoteCurrency)}
                  status={<StatusChip tone={currentVerdict.tone}>{currentVerdict.label}</StatusChip>}
                  summary={
                    currentCheck.explanationShort ??
                    'We compared your quote against an expected range for this home.'
                  }
                  highlights={[
                    currentCheck.expectedLow !== null && currentCheck.expectedHigh !== null
                      ? `Expected range: ${toCurrency(currentCheck.expectedLow, currentCheck.quoteCurrency)} to ${toCurrency(currentCheck.expectedHigh, currentCheck.quoteCurrency)}`
                      : 'Expected range still needs more context',
                    `Confidence: ${currentConfidence.label}`,
                    `Checked ${formatDate(currentCheck.createdAt)}`,
                  ]}
                />

                {currentGuardrail ? (
                  <MobileCard
                    variant="compact"
                    className={`border ${
                      currentGuardrail.tone === 'elevated'
                        ? 'border-amber-200 bg-amber-50/80'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-white/90'
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                        {currentGuardrail.title}
                      </p>
                      <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                        {currentGuardrail.description}
                      </p>
                    </div>
                  </MobileCard>
                ) : null}

                <ScenarioInputCard
                  title="Quote result"
                  subtitle="Your quote and the expected range are shown separately so the result stays easy to scan."
                  badge={<StatusChip tone={currentConfidence.tone}>{currentConfidence.label}</StatusChip>}
                >
                  <QuoteComparisonMeter
                    quoteAmount={currentCheck.quoteAmount}
                    expectedLow={currentCheck.expectedLow}
                    expectedHigh={currentCheck.expectedHigh}
                    quoteCurrency={currentCheck.quoteCurrency}
                  />
                  <ReadOnlySummaryBlock
                    items={[
                      {
                        label: 'Entered quote',
                        value: toCurrency(currentCheck.quoteAmount, currentCheck.quoteCurrency),
                        emphasize: true,
                      },
                      {
                        label: 'Expected range',
                        value:
                          currentCheck.expectedLow !== null && currentCheck.expectedHigh !== null
                            ? `${toCurrency(currentCheck.expectedLow, currentCheck.quoteCurrency)} to ${toCurrency(currentCheck.expectedHigh, currentCheck.quoteCurrency)}`
                            : 'Broad estimate only',
                        emphasize: true,
                      },
                      {
                        label: 'Expected median',
                        value:
                          currentCheck.expectedMedian !== null
                            ? toCurrency(currentCheck.expectedMedian, currentCheck.quoteCurrency)
                            : 'Not enough context',
                      },
                      {
                        label: 'Service',
                        value: [
                          resolveCategoryOption(currentCheck.serviceCategory)?.label ??
                            optionLabel(currentCheck.serviceCategory),
                          currentCheck.serviceSubcategory ? optionLabel(currentCheck.serviceSubcategory) : null,
                        ]
                          .filter(Boolean)
                          .join(' • '),
                      },
                    ]}
                    columns={2}
                  />
                  <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                    {currentGuardrail?.tone === 'elevated'
                      ? 'Consider this a directional read, then compare it with another quote or more system detail.'
                      : currentCheck.verdict === 'VERY_HIGH'
                        ? 'If this quote still feels high after a second opinion, you can use Negotiation Shield for a calm response draft.'
                        : currentCheck.verdict === 'INSUFFICIENT_DATA'
                          ? 'Adding a linked system, room, or clearer service scope can improve the next estimate.'
                          : 'This range is a homeowner guide, not a guaranteed market price.'}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild variant="outline" className="min-h-[40px] rounded-xl">
                      <Link
                        href={buildNegotiationShieldHref(propertyId, currentCheck)}
                        onClick={() =>
                          trackRadarEvent('NEGOTIATION_HANDOFF_CLICKED', 'handoff', {
                            service_category: currentCheck.serviceCategory,
                            verdict: currentCheck.verdict || undefined,
                          })
                        }
                      >
                        Need help responding?
                      </Link>
                    </Button>
                  </div>
                </ScenarioInputCard>

                <Collapsible
                  open={explanationOpen}
                  onOpenChange={(open) => {
                    setExplanationOpen(open);
                    if (open && currentCheck && !explanationExpandedIdsRef.current.has(currentCheck.id)) {
                      explanationExpandedIdsRef.current.add(currentCheck.id);
                      trackRadarEvent('EXPLANATION_EXPANDED', 'explanation', {
                        service_category: currentCheck.serviceCategory,
                        verdict: currentCheck.verdict || undefined,
                      });
                    }
                  }}
                >
                  <ScenarioInputCard
                    title="Why we think this"
                    subtitle="A compact view of the property, region, and pricing context used."
                    badge={
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="h-9 rounded-full px-3 text-xs">
                          {explanationOpen ? 'Hide details' : 'Expand details'}
                        </Button>
                      </CollapsibleTrigger>
                    }
                  >
                    {currentReasons.length > 0 ? (
                      <div className="space-y-2">
                        <p className="mb-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
                          Signals used
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {currentReasons.map((reason) => (
                            <StatusChip key={reason} tone="info">
                              {reason}
                            </StatusChip>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                        We used the available property details, service type, and pricing context for this estimate.
                      </p>
                    )}

                    <CollapsibleContent className="space-y-4 pt-1">
                      {factorChips.length > 0 ? (
                        <div className="space-y-2">
                          <p className="mb-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
                            Property factors
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {factorChips.map((chip) => (
                              <StatusChip key={chip} tone="info">
                                {chip}
                              </StatusChip>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                          Property details on file were limited, so this estimate leaned more on service and region assumptions.
                        </p>
                      )}

                      <ReadOnlySummaryBlock
                        title="Pricing context"
                        items={[
                          {
                            label: 'Region',
                            value: (() => {
                              const pricing = asRecord(currentCheck.pricingFactorsJson);
                              const region = asRecord(pricing?.region ?? null);
                              const parts = [
                                typeof region?.city === 'string' ? region.city : null,
                                typeof region?.state === 'string' ? region.state : null,
                                typeof region?.zipPrefix === 'string' ? `ZIP ${region.zipPrefix}` : null,
                              ].filter(Boolean);
                              return parts.length ? parts.join(' • ') : 'Fallback regional context';
                            })(),
                          },
                          {
                            label: 'Benchmark',
                            value: (() => {
                              const pricing = asRecord(currentCheck.pricingFactorsJson);
                              const benchmark = asRecord(pricing?.benchmark ?? null);
                              const matched = benchmark?.matched === true;
                              return matched ? 'Matched benchmark' : 'Fallback assumptions';
                            })(),
                          },
                          {
                            label: 'Confidence',
                            value: currentConfidence.label,
                          },
                          {
                            label: 'Engine version',
                            value: currentCheck.engineVersion ?? 'MVP',
                          },
                        ]}
                        columns={2}
                      />

                      {currentLinkedEntities.length > 0 ? (
                        <div className="space-y-2">
                          <p className="mb-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
                            Linked context
                          </p>
                          <div className="space-y-2">
                            {currentLinkedEntities.map((entity) => (
                              <CompactEntityRow
                                key={`${entity.linkedEntityType}:${entity.linkedEntityId}`}
                                title={entity.label}
                                subtitle={entity.summary ?? optionLabel(entity.linkedEntityType)}
                                meta={entity.relevanceScore ? `${Math.round(entity.relevanceScore * 100)}% relevance` : undefined}
                                leading={
                                  <IconBadge tone="neutral">
                                    {entity.linkedEntityType === 'ROOM' ? (
                                      <Home className="h-4 w-4" />
                                    ) : entity.linkedEntityType === 'DOCUMENT' ? (
                                      <Sparkles className="h-4 w-4" />
                                    ) : (
                                      <Wrench className="h-4 w-4" />
                                    )}
                                  </IconBadge>
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                          No linked systems, rooms, or documents were used for this estimate.
                        </p>
                      )}

                      {adjustmentRows.length > 0 ? (
                        <div className="space-y-2">
                          <p className="mb-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
                            Estimate adjustments
                          </p>
                          <div className="space-y-2">
                            {adjustmentRows.map((row) => (
                              <CompactEntityRow
                                key={`${row.code}-${row.note}`}
                                title={optionLabel(row.code)}
                                subtitle={row.note}
                                status={
                                  <StatusChip
                                    tone={
                                      row.effect === 'up'
                                        ? 'elevated'
                                        : row.effect === 'down'
                                          ? 'info'
                                          : 'good'
                                    }
                                  >
                                    {row.effect === 'up'
                                      ? 'Raised estimate'
                                      : row.effect === 'down'
                                        ? 'Lowered estimate'
                                        : 'Neutral'}
                                  </StatusChip>
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="mb-0 text-xs text-[hsl(var(--mobile-text-secondary))]">
                          No additional estimate adjustments were applied beyond the base service and region logic.
                        </p>
                      )}
                    </CollapsibleContent>
                  </ScenarioInputCard>
                </Collapsible>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4 xl:col-start-1 xl:row-start-2">
          <div className="space-y-3">
            <MobileSectionHeader
              title="Recent checks"
              subtitle="Open a prior quote to compare new bids or review the details again."
              action={
                <Button variant="ghost" size="sm" onClick={() => loadPropertyAndChecks()} disabled={checksLoading}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${checksLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            />

            {checksLoading ? (
              <ScenarioInputCard title="Loading recent checks" subtitle="Pulling your latest quote history.">
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 text-sm text-[hsl(var(--mobile-text-secondary))]"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--mobile-brand-strong))]" />
                  Loading history…
                </div>
              </ScenarioInputCard>
            ) : recentChecks.length === 0 ? (
              <EmptyStateCard
                title="No quote checks yet"
                description="Run your first quote check above and we’ll keep the recent history here."
              />
            ) : (
              <div className="space-y-3">
                {recentChecks.map((item) => (
                  <RecentCheckRow
                    key={item.id}
                    item={item}
                    active={currentCheck?.id === item.id}
                    loading={loadingCheckId === item.id}
                    onOpen={() => openCheck(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MobileToolWorkspace>
  );
}
