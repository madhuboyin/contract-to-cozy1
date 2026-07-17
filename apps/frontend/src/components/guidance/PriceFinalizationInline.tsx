'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  CompactEntityRow,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import {
  createPriceFinalizationDraft,
  finalizePriceFinalization,
  listPriceFinalizations,
  updatePriceFinalizationDraft,
  type PriceFinalizationDetail,
  type PriceFinalizationDraftInput,
} from '@/lib/api/priceFinalizationApi';
import { ALL_SERVICE_CATEGORIES } from '@/lib/config/serviceCategoryMapping';
import { formatIssueTypeLabel } from '@/features/guidance/utils/guidanceDisplay';
import { formatEnumLabel } from '@/lib/utils/formatters';
import type { ServiceCategory } from '@/types';

type FormState = {
  serviceCategory: ServiceCategory | '';
  vendorName: string;
  acceptedPrice: string;
  quotePrice: string;
  currency: string;
  scopeSummary: string;
  paymentTerms: string;
  warrantyTerms: string;
  timelineTerms: string;
  notes: string;
};

type PriceFinalizationInlineProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId: string | null;
  inventoryItemCategory: string | null;
  guidanceSignalIntentFamily?: string | null;
  assetName?: string;
  issueType?: string | null;
  onComplete: () => void;
};

const EMPTY_FORM: FormState = {
  serviceCategory: '',
  vendorName: '',
  acceptedPrice: '',
  quotePrice: '',
  currency: 'USD',
  scopeSummary: '',
  paymentTerms: '',
  warrantyTerms: '',
  timelineTerms: '',
  notes: '',
};

const INVENTORY_CATEGORY_TO_SERVICE_CATEGORY: Partial<Record<string, ServiceCategory>> = {
  HVAC: 'HVAC',
  PLUMBING: 'PLUMBING',
  ELECTRICAL: 'ELECTRICAL',
  APPLIANCE: 'HANDYMAN',
  ROOF_EXTERIOR: 'INSPECTION',
  SAFETY: 'HANDYMAN',
  SMART_HOME: 'HANDYMAN',
};

function inferDefaultServiceCategory(category: string | null | undefined): ServiceCategory | '' {
  const normalized = String(category ?? '').trim().toUpperCase();
  return INVENTORY_CATEGORY_TO_SERVICE_CATEGORY[normalized] ?? '';
}

function toMoneyNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed * 100) / 100;
}

function asInputValue(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toFixed(2);
}

function buildFormFromDetail(detail: PriceFinalizationDetail): FormState {
  return {
    serviceCategory: (detail.serviceCategory ?? '') as ServiceCategory | '',
    vendorName: detail.vendorName ?? '',
    acceptedPrice: asInputValue(detail.acceptedPrice),
    quotePrice: asInputValue(detail.quotePrice),
    currency: detail.currency || 'USD',
    scopeSummary: detail.scopeSummary ?? '',
    paymentTerms: detail.paymentTerms ?? '',
    warrantyTerms: detail.warrantyTerms ?? '',
    timelineTerms: detail.timelineTerms ?? '',
    notes: detail.notes ?? '',
  };
}

function withGuidanceQuery(
  basePath: string,
  params: {
    propertyId: string;
    category?: string | null;
    guidanceJourneyId?: string | null;
    guidanceStepKey?: string | null;
    guidanceSignalIntentFamily?: string | null;
    itemId?: string | null;
    priceFinalizationId?: string | null;
    finalPrice?: string | null;
    vendorName?: string | null;
  }
): string {
  const query = new URLSearchParams();
  query.set('propertyId', params.propertyId);
  if (params.category) query.set('category', params.category);
  if (params.guidanceJourneyId) query.set('guidanceJourneyId', params.guidanceJourneyId);
  if (params.guidanceStepKey) query.set('guidanceStepKey', params.guidanceStepKey);
  if (params.guidanceSignalIntentFamily) {
    query.set('guidanceSignalIntentFamily', params.guidanceSignalIntentFamily);
  }
  if (params.itemId) query.set('itemId', params.itemId);
  if (params.priceFinalizationId) query.set('priceFinalizationId', params.priceFinalizationId);
  if (params.finalPrice) query.set('finalPrice', params.finalPrice);
  if (params.vendorName) query.set('vendorName', params.vendorName);
  return `${basePath}?${query.toString()}`;
}

export function PriceFinalizationInline({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  inventoryItemId,
  inventoryItemCategory,
  guidanceSignalIntentFamily,
  assetName = 'this item',
  issueType,
  onComplete,
}: PriceFinalizationInlineProps) {
  const queryClient = useQueryClient();
  const defaultServiceCategory = React.useMemo(
    () => inferDefaultServiceCategory(inventoryItemCategory),
    [inventoryItemCategory]
  );
  const issueLabel = formatIssueTypeLabel(issueType);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<PriceFinalizationDetail[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [finalizedId, setFinalizedId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>({
    ...EMPTY_FORM,
    serviceCategory: defaultServiceCategory,
  });

  const activeDetail = React.useMemo(
    () => items.find((entry) => entry.id === activeId) ?? null,
    [items, activeId]
  );
  const finalizedDetail = React.useMemo(
    () => items.find((entry) => entry.id === finalizedId) ?? null,
    [items, finalizedId]
  );

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const scopedItems = await listPriceFinalizations(propertyId, 10, {
          guidanceJourneyId: journeyId,
          inventoryItemId,
        });
        if (cancelled) return;

        setItems(scopedItems);
        const preferredActive =
          scopedItems.find((entry) => entry.status !== 'FINALIZED') ??
          scopedItems[0] ??
          null;
        const preferredFinalized =
          scopedItems.find((entry) => entry.status === 'FINALIZED') ?? null;

        setActiveId(preferredActive?.id ?? null);
        setFinalizedId(preferredFinalized?.id ?? null);
        setForm(
          preferredActive
            ? buildFormFromDetail(preferredActive)
            : {
                ...EMPTY_FORM,
                serviceCategory: defaultServiceCategory,
              }
        );
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load price finalization records.');
          setItems([]);
          setActiveId(null);
          setFinalizedId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultServiceCategory, inventoryItemId, journeyId, propertyId]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = React.useCallback((): PriceFinalizationDraftInput => {
    const acceptedPrice = toMoneyNumber(form.acceptedPrice);
    const quotePrice = toMoneyNumber(form.quotePrice);

    const terms: NonNullable<PriceFinalizationDraftInput['terms']> = [];
    if (form.scopeSummary.trim()) {
      terms.push({
        termType: 'SCOPE',
        label: 'Scope',
        value: form.scopeSummary.trim(),
        sortOrder: 0,
        isAccepted: true,
      });
    }
    if (form.paymentTerms.trim()) {
      terms.push({
        termType: 'PAYMENT',
        label: 'Payment',
        value: form.paymentTerms.trim(),
        sortOrder: 1,
        isAccepted: true,
      });
    }
    if (form.warrantyTerms.trim()) {
      terms.push({
        termType: 'WARRANTY',
        label: 'Warranty',
        value: form.warrantyTerms.trim(),
        sortOrder: 2,
        isAccepted: true,
      });
    }
    if (form.timelineTerms.trim()) {
      terms.push({
        termType: 'TIMELINE',
        label: 'Timeline',
        value: form.timelineTerms.trim(),
        sortOrder: 3,
        isAccepted: true,
      });
    }

    return {
      inventoryItemId: inventoryItemId || undefined,
      guidanceJourneyId: journeyId,
      guidanceStepKey: stepKey,
      guidanceSignalIntentFamily: guidanceSignalIntentFamily || undefined,
      sourceType: 'MANUAL',
      serviceCategory: form.serviceCategory || undefined,
      vendorName: form.vendorName.trim() || undefined,
      acceptedPrice,
      quotePrice,
      currency: (form.currency || 'USD').toUpperCase(),
      scopeSummary: form.scopeSummary.trim() || undefined,
      paymentTerms: form.paymentTerms.trim() || undefined,
      warrantyTerms: form.warrantyTerms.trim() || undefined,
      timelineTerms: form.timelineTerms.trim() || undefined,
      notes: form.notes.trim() || undefined,
      terms: terms.length > 0 ? terms : undefined,
    };
  }, [form, guidanceSignalIntentFamily, inventoryItemId, journeyId, stepKey]);

  const bookingHref = React.useMemo(() => {
    const selected = finalizedDetail ?? activeDetail;
    if (!selected || selected.status !== 'FINALIZED') return null;
    return withGuidanceQuery('/dashboard/providers', {
      propertyId,
      category: (selected.serviceCategory ?? form.serviceCategory) || null,
      guidanceJourneyId: journeyId,
      guidanceStepKey: stepKey,
      guidanceSignalIntentFamily,
      itemId: inventoryItemId,
      priceFinalizationId: selected.id,
      finalPrice:
        typeof selected.acceptedPrice === 'number' ? selected.acceptedPrice.toFixed(2) : null,
      vendorName: (selected.vendorName ?? form.vendorName) || null,
    });
  }, [
    activeDetail,
    finalizedDetail,
    form.serviceCategory,
    form.vendorName,
    inventoryItemId,
    journeyId,
    propertyId,
    stepKey,
    guidanceSignalIntentFamily,
  ]);

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      const detail =
        activeDetail && activeDetail.status !== 'FINALIZED'
          ? await updatePriceFinalizationDraft(propertyId, activeDetail.id, payload)
          : await createPriceFinalizationDraft(propertyId, payload);

      setItems((prev) => [detail, ...prev.filter((entry) => entry.id !== detail.id)]);
      setActiveId(detail.id);
      setForm(buildFormFromDetail(detail));
      if (detail.status === 'FINALIZED') {
        setFinalizedId(detail.id);
      }
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save draft.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    const accepted = toMoneyNumber(form.acceptedPrice);
    if (!accepted || accepted <= 0) {
      setError('Accepted price is required to finalize.');
      return;
    }

    setFinalizing(true);
    setError(null);
    try {
      const payload = buildPayload();
      const draft =
        activeDetail && activeDetail.status !== 'FINALIZED'
          ? await updatePriceFinalizationDraft(propertyId, activeDetail.id, payload)
          : await createPriceFinalizationDraft(propertyId, payload);
      const finalized = await finalizePriceFinalization(propertyId, draft.id, {
        ...payload,
        acceptedPrice: accepted,
      });

      await completeGuidanceStep(propertyId, stepId, {
        sourceToolKey: 'price-finalization',
        finalizationId: finalized.id,
        acceptedPrice: finalized.acceptedPrice,
        quotePrice: finalized.quotePrice,
        currency: finalized.currency,
        vendorName: finalized.vendorName,
        serviceCategory: finalized.serviceCategory,
      });

      setItems((prev) => [finalized, ...prev.filter((entry) => entry.id !== finalized.id)]);
      setActiveId(finalized.id);
      setFinalizedId(finalized.id);
      setForm(buildFormFromDetail(finalized));

      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      onComplete();
    } catch (finalizeError: any) {
      setError(finalizeError?.message || 'Unable to finalize price.');
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="space-y-4">
      <ScenarioInputCard
        title="Finalize Price and Terms"
        subtitle={
          issueLabel
            ? `${assetName} · ${issueLabel}`
            : `Capture the final agreed terms for ${assetName} before booking.`
        }
      >
        {error ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Service category</span>
            <select
              value={form.serviceCategory}
              onChange={(event) => setField('serviceCategory', event.target.value as ServiceCategory)}
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
            >
              <option value="">Select category</option>
              {ALL_SERVICE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {formatEnumLabel(category)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Vendor name</span>
            <input
              value={form.vendorName}
              onChange={(event) => setField('vendorName', event.target.value)}
              placeholder="Acme HVAC"
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Accepted price</span>
            <input
              value={form.acceptedPrice}
              onChange={(event) => setField('acceptedPrice', event.target.value)}
              placeholder="2500.00"
              inputMode="decimal"
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Original quote</span>
            <input
              value={form.quotePrice}
              onChange={(event) => setField('quotePrice', event.target.value)}
              placeholder="3200.00"
              inputMode="decimal"
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Currency</span>
            <input
              value={form.currency}
              onChange={(event) => setField('currency', event.target.value.toUpperCase())}
              placeholder="USD"
              maxLength={3}
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Scope summary</span>
            <textarea
              value={form.scopeSummary}
              onChange={(event) => setField('scopeSummary', event.target.value)}
              rows={3}
              placeholder="What exactly is included?"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Payment terms</span>
            <textarea
              value={form.paymentTerms}
              onChange={(event) => setField('paymentTerms', event.target.value)}
              rows={2}
              placeholder="Deposit, milestones, due dates"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Warranty terms</span>
            <textarea
              value={form.warrantyTerms}
              onChange={(event) => setField('warrantyTerms', event.target.value)}
              rows={2}
              placeholder="Labor / parts warranty summary"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Timeline terms</span>
            <textarea
              value={form.timelineTerms}
              onChange={(event) => setField('timelineTerms', event.target.value)}
              rows={2}
              placeholder="Start date, completion date, delay terms"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => setField('notes', event.target.value)}
              rows={2}
              placeholder="Additional contract notes"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4">
          <ActionPriorityRow
            primaryAction={
              <Button
                className="min-h-[40px] w-full"
                onClick={handleSaveDraft}
                disabled={saving || finalizing || loading}
              >
                {saving ? 'Saving draft...' : 'Save Draft'}
              </Button>
            }
            secondaryActions={
              <Button
                variant="outline"
                className="min-h-[40px] w-full"
                onClick={handleFinalize}
                disabled={saving || finalizing || loading}
              >
                {finalizing ? 'Finalizing...' : 'Finalize Price'}
              </Button>
            }
          />
        </div>
      </ScenarioInputCard>

      <ScenarioInputCard title="Scoped records" subtitle="Recent finalizations for this journey and item.">
        {loading ? (
          <p className="mb-0 text-sm text-slate-500">Loading records...</p>
        ) : items.length === 0 ? (
          <p className="mb-0 text-sm text-slate-500">No saved records yet. Save a draft to start.</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 5).map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => {
                  setActiveId(entry.id);
                  setForm(buildFormFromDetail(entry));
                  if (entry.status === 'FINALIZED') {
                    setFinalizedId(entry.id);
                  }
                }}
                className="w-full rounded-xl border border-black/10 bg-white p-2.5 text-left hover:bg-black/[0.02]"
              >
                <CompactEntityRow
                  title={entry.vendorName || 'Unnamed vendor'}
                  subtitle={
                    entry.serviceCategory
                      ? formatEnumLabel(entry.serviceCategory)
                      : 'Service category not set'
                  }
                  meta={
                    entry.acceptedPrice
                      ? `$${entry.acceptedPrice.toFixed(2)} ${entry.currency}`
                      : 'No accepted price'
                  }
                  status={
                    <StatusChip tone={entry.status === 'FINALIZED' ? 'good' : 'info'}>
                      {entry.status === 'FINALIZED' ? 'Finalized' : 'Draft'}
                    </StatusChip>
                  }
                />
              </button>
            ))}
          </div>
        )}
      </ScenarioInputCard>

      {bookingHref ? (
        <ScenarioInputCard title="Next Step" subtitle="Your accepted terms are ready for booking.">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Price finalized and ready to carry into provider booking.
          </div>
          <div className="pt-2">
            <Link
              href={bookingHref}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-black bg-black px-4 text-sm font-semibold text-white hover:bg-black/90"
            >
              Continue to Book Service When Ready
            </Link>
          </div>
        </ScenarioInputCard>
      ) : null}
    </div>
  );
}
