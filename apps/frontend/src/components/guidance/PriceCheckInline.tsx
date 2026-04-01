'use client';

// Inline price check for the validate_price / estimate_improvement_cost guidance steps.
// Renders a focused price check form pre-filled from journey context.
// Shows the most recent check for the journey if one already exists (State C).
// Rendered by renderStepCta when step.toolKey === 'service-price-radar'.

import React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createServicePriceRadarCheck,
  listServicePriceRadarChecks,
  SERVICE_PRICE_RADAR_CATEGORY_OPTIONS,
  type ServicePriceRadarCheckDetail,
  type ServiceRadarCategory,
} from '@/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import { formatCurrency } from '@/lib/utils/format';

// ---------------------------------------------------------------------------
// Verdict display config
// ---------------------------------------------------------------------------

type Verdict = ServicePriceRadarCheckDetail['verdict'];

const VERDICT_CONFIG: Record<
  NonNullable<Verdict>,
  { label: string; tone: string; icon: React.ReactNode }
> = {
  UNDERPRICED: {
    label: 'Quote looks low',
    tone: 'text-sky-700 bg-sky-50 border-sky-200',
    icon: <TrendingDown className="h-4 w-4 text-sky-600" />,
  },
  FAIR: {
    label: 'Quote is fair',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: <CheckCircle className="h-4 w-4 text-emerald-600" />,
  },
  HIGH: {
    label: 'Quote is high',
    tone: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: <TrendingUp className="h-4 w-4 text-amber-600" />,
  },
  VERY_HIGH: {
    label: 'Quote is very high',
    tone: 'text-rose-700 bg-rose-50 border-rose-200',
    icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
  },
  INSUFFICIENT_DATA: {
    label: 'Not enough data to assess',
    tone: 'text-slate-600 bg-slate-50 border-slate-200',
    icon: <AlertTriangle className="h-4 w-4 text-slate-500" />,
  },
};

// ---------------------------------------------------------------------------
// Inventory category → service category mapping
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, ServiceRadarCategory> = {
  HVAC: 'HVAC',
  PLUMBING: 'PLUMBING',
  ELECTRICAL: 'ELECTRICAL',
  APPLIANCE: 'APPLIANCE_REPAIR',
  ROOF_EXTERIOR: 'ROOFING',
  SAFETY: 'SECURITY_SAFETY',
  SMART_HOME: 'HANDYMAN',
};

function inferCategory(inventoryCategory: string | null | undefined): ServiceRadarCategory {
  if (!inventoryCategory) return 'OTHER';
  return CATEGORY_MAP[inventoryCategory] ?? 'OTHER';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'loading' | 'prior' | 'form' | 'submitting' | 'result' | 'done';

type PriceCheckInlineProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId: string | null;
  inventoryItemCategory: string | null;
  assetName?: string;
  issueType?: string | null;
  onComplete: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PriceCheckInline({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  inventoryItemId,
  inventoryItemCategory,
  assetName = 'this item',
  issueType,
  onComplete,
}: PriceCheckInlineProps) {
  const queryClient = useQueryClient();

  const defaultCategory = inferCategory(inventoryItemCategory);
  const defaultDescription = [assetName, issueType].filter(Boolean).join(' — ');

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [category, setCategory] = React.useState<ServiceRadarCategory>(defaultCategory);
  const [description, setDescription] = React.useState(defaultDescription);
  const [quoteAmount, setQuoteAmount] = React.useState('');
  const [vendorName, setVendorName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ServicePriceRadarCheckDetail | null>(null);
  const [completing, setCompleting] = React.useState(false);

  // ---- Fetch recent checks to detect State C ----
  const recentChecksQuery = useQuery({
    queryKey: ['price-radar-checks', propertyId, 'recent-for-guidance'],
    queryFn: () => listServicePriceRadarChecks(propertyId, 3),
    staleTime: 2 * 60_000,
  });

  // Transition out of loading once the query settles
  React.useEffect(() => {
    if (recentChecksQuery.isLoading) return;
    if (phase !== 'loading') return;
    const checks = recentChecksQuery.data ?? [];
    setPhase(checks.length > 0 ? 'prior' : 'form');
  }, [recentChecksQuery.isLoading, recentChecksQuery.data, phase]);

  const priorCheck = (recentChecksQuery.data ?? [])[0] ?? null;

  const isValidForm = Boolean(quoteAmount.trim()) && Number(quoteAmount) > 0;

  // ---- Submit a new check ----
  async function handleSubmit() {
    if (!quoteAmount || Number(quoteAmount) <= 0) return;
    setError(null);
    setPhase('submitting');
    try {
      const check = await createServicePriceRadarCheck(propertyId, {
        serviceCategory: category,
        serviceLabelRaw: description.trim() || undefined,
        quoteAmount: Number(quoteAmount),
        quoteVendorName: vendorName.trim() || undefined,
        quoteSource: 'MANUAL',
        guidanceJourneyId: journeyId,
        guidanceStepKey: stepKey,
        ...(inventoryItemId
          ? {
              linkedEntities: [
                {
                  linkedEntityType: 'APPLIANCE',
                  linkedEntityId: inventoryItemId,
                },
              ],
            }
          : {}),
      });
      setResult(check);
      queryClient.invalidateQueries({
        queryKey: ['price-radar-checks', propertyId, 'recent-for-guidance'],
      });
      setPhase('result');
    } catch (err) {
      console.error('[PriceCheckInline] submit failed', err);
      setError('Price check failed. Please try again.');
      setPhase('form');
    }
  }

  // ---- Complete step using either the new or prior result ----
  async function handleComplete(check: ServicePriceRadarCheckDetail) {
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        checkId: check.id,
        verdict: check.verdict,
        quoteAmount: check.quoteAmount,
        expectedLow: check.expectedLow,
        expectedHigh: check.expectedHigh,
        sourceToolKey: 'service-price-radar',
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setPhase('done');
      onComplete();
    } catch (err) {
      console.error('[PriceCheckInline] complete failed', err);
    } finally {
      setCompleting(false);
    }
  }

  const fullToolHref = `/dashboard/properties/${propertyId}/tools/service-price-radar?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}${inventoryItemId ? `&linkedEntityType=APPLIANCE&linkedEntityId=${inventoryItemId}&label=${encodeURIComponent(assetName)}` : ''}`;

  // ---- Done ----
  if (phase === 'done') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle className="h-4 w-4 shrink-0" />
        Price validated. Moving to next step.
      </div>
    );
  }

  // ---- Loading ----
  if (phase === 'loading') {
    return (
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
        Loading price check…
      </div>
    );
  }

  // ---- Submitting ----
  if (phase === 'submitting') {
    return (
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
        Checking quote against market rates…
      </div>
    );
  }

  // ---- State B: Result from new check ----
  if (phase === 'result' && result) {
    return <ResultView check={result} completing={completing} onComplete={handleComplete} onRecheck={() => setPhase('form')} fullToolHref={fullToolHref} />;
  }

  // ---- State C: Prior check exists ----
  if (phase === 'prior' && priorCheck) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
          <p className="text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
            Recent price check found
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))]">
            {priorCheck.serviceLabelRaw ?? priorCheck.serviceCategory} ·{' '}
            {formatCurrency(priorCheck.quoteAmount)}
            {priorCheck.verdict ? ` · ${VERDICT_CONFIG[priorCheck.verdict]?.label ?? priorCheck.verdict}` : ''}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            className="min-h-[44px] w-full"
            disabled={completing}
            onClick={() => handleComplete(priorCheck as unknown as ServicePriceRadarCheckDetail)}
          >
            {completing ? 'Saving…' : 'Use this result & continue'}
          </Button>
          <button
            type="button"
            onClick={() => setPhase('form')}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
          >
            Run a new check instead
          </button>
        </div>
      </div>
    );
  }

  // ---- State A: Form ----
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
        <p className="text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
          Validate the service quote
        </p>
        <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))]">
          Enter the quote you received. We&apos;ll compare it against market rates for your area.
        </p>
      </div>

      <div className="space-y-2">
        {/* Category */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
            Service type
          </label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ServiceRadarCategory)}
              className="w-full appearance-none rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
            >
              {SERVICE_PRICE_RADAR_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[hsl(var(--mobile-text-muted))]" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
            What does the quote cover? (optional)
          </label>
          <input
            type="text"
            placeholder={`e.g. ${assetName} repair, parts and labour`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
        </div>

        {/* Quote amount */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
            Quote amount ($) *
          </label>
          <input
            type="number"
            placeholder="e.g. 850"
            min={0}
            value={quoteAmount}
            onChange={(e) => setQuoteAmount(e.target.value)}
            className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
        </div>

        {/* Vendor name */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
            Contractor / vendor name (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. ABC Plumbing"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-700">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button
          className="min-h-[44px] w-full"
          disabled={!isValidForm}
          onClick={handleSubmit}
        >
          Check this quote
        </Button>
        <Link
          href={fullToolHref}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          Open full price radar
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultView sub-component
// ---------------------------------------------------------------------------

function ResultView({
  check,
  completing,
  onComplete,
  onRecheck,
  fullToolHref,
}: {
  check: ServicePriceRadarCheckDetail;
  completing: boolean;
  onComplete: (c: ServicePriceRadarCheckDetail) => void;
  onRecheck: () => void;
  fullToolHref: string;
}) {
  const verdictCfg = check.verdict ? VERDICT_CONFIG[check.verdict] : null;
  const hasRange = check.expectedLow != null && check.expectedHigh != null;

  return (
    <div className="space-y-3">
      {/* Verdict badge */}
      {verdictCfg && (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${verdictCfg.tone}`}>
          {verdictCfg.icon}
          <div className="flex-1">
            <p className="text-sm font-semibold">{verdictCfg.label}</p>
            {check.explanationShort && (
              <p className="mt-0.5 text-xs opacity-90">{check.explanationShort}</p>
            )}
          </div>
        </div>
      )}

      {/* Quote vs expected range */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white p-2 text-center">
          <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Your quote</p>
          <p className="text-sm font-semibold">{formatCurrency(check.quoteAmount)}</p>
        </div>
        {hasRange && (
          <>
            <div className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white p-2 text-center">
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Market low</p>
              <p className="text-sm font-semibold">{formatCurrency(check.expectedLow!)}</p>
            </div>
            <div className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white p-2 text-center">
              <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Market high</p>
              <p className="text-sm font-semibold">{formatCurrency(check.expectedHigh!)}</p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <Button
          className="min-h-[44px] w-full"
          disabled={completing}
          onClick={() => onComplete(check)}
        >
          {completing ? 'Saving…' : 'Mark price validated & continue'}
        </Button>
        <button
          type="button"
          onClick={onRecheck}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          Check a different quote
        </button>
        <Link
          href={fullToolHref}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          Open full price radar
        </Link>
      </div>
    </div>
  );
}
