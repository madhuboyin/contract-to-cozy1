'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  CompactEntityRow,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { ALL_SERVICE_CATEGORIES } from '@/lib/config/serviceCategoryMapping';
import type { ServiceCategory } from '@/types';
import {
  createPriceFinalizationDraft,
  finalizePriceFinalization,
  listPriceFinalizations,
  updatePriceFinalizationDraft,
  type PriceFinalizationDetail,
  type PriceFinalizationDraftInput,
} from '@/lib/api/priceFinalizationApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import CompareTemplate from '../../components/route-templates/CompareTemplate';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';

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
    homeAssetId?: string | null;
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
  if (params.homeAssetId) query.set('homeAssetId', params.homeAssetId);
  if (params.priceFinalizationId) query.set('priceFinalizationId', params.priceFinalizationId);
  if (params.finalPrice) query.set('finalPrice', params.finalPrice);
  if (params.vendorName) query.set('vendorName', params.vendorName);
  return `${basePath}?${query.toString()}`;
}

export default function PriceFinalizationToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();

  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const itemId = searchParams.get('itemId');
  const homeAssetId = searchParams.get('homeAssetId');
  const defaultCategory = searchParams.get('serviceCategory') || searchParams.get('category');
  const defaultVendorName = searchParams.get('vendorName');
  const defaultQuoteAmount = searchParams.get('quoteAmount');
  const quoteComparisonWorkspaceId = searchParams.get('quoteComparisonWorkspaceId');
  const serviceRadarCheckId = searchParams.get('serviceRadarCheckId');
  const negotiationShieldCaseId = searchParams.get('negotiationShieldCaseId');

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<PriceFinalizationDetail[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [finalizedId, setFinalizedId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>({
    ...EMPTY_FORM,
    serviceCategory: (defaultCategory as ServiceCategory) || '',
    vendorName: defaultVendorName || '',
    quotePrice: defaultQuoteAmount || '',
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
        const list = await listPriceFinalizations(propertyId, 20);
        if (cancelled) return;
        setItems(list);
        const defaultActive = list[0]?.id ?? null;
        setActiveId(defaultActive);
        if (defaultActive) {
          const selected = list.find((entry) => entry.id === defaultActive);
          if (selected) {
            setForm(buildFormFromDetail(selected));
          }
        }
      } catch (reloadError: any) {
        if (!cancelled) {
          setError(reloadError?.message || 'Failed to load price finalizations.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = React.useCallback((): PriceFinalizationDraftInput => {
    const acceptedPrice = toMoneyNumber(form.acceptedPrice);
    const quotePrice = toMoneyNumber(form.quotePrice);

    const terms: NonNullable<PriceFinalizationDraftInput['terms']> = [];
    if (form.scopeSummary) {
      terms.push({
        termType: 'SCOPE',
        label: 'Scope',
        value: form.scopeSummary,
        sortOrder: 0,
        isAccepted: true,
      });
    }
    if (form.paymentTerms) {
      terms.push({
        termType: 'PAYMENT',
        label: 'Payment',
        value: form.paymentTerms,
        sortOrder: 1,
        isAccepted: true,
      });
    }
    if (form.warrantyTerms) {
      terms.push({
        termType: 'WARRANTY',
        label: 'Warranty',
        value: form.warrantyTerms,
        sortOrder: 2,
        isAccepted: true,
      });
    }
    if (form.timelineTerms) {
      terms.push({
        termType: 'TIMELINE',
        label: 'Timeline',
        value: form.timelineTerms,
        sortOrder: 3,
        isAccepted: true,
      });
    }

    return {
      inventoryItemId: itemId || undefined,
      homeAssetId: homeAssetId || undefined,
      guidanceJourneyId: guidanceJourneyId || undefined,
      guidanceStepKey: guidanceStepKey || undefined,
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
      quoteComparisonWorkspaceId: quoteComparisonWorkspaceId || undefined,
      serviceRadarCheckId: serviceRadarCheckId || undefined,
      negotiationShieldCaseId: negotiationShieldCaseId || undefined,
    };
  }, [
    form.acceptedPrice,
    form.currency,
    form.notes,
    form.paymentTerms,
    form.quotePrice,
    form.scopeSummary,
    form.serviceCategory,
    form.timelineTerms,
    form.vendorName,
    form.warrantyTerms,
    guidanceJourneyId,
    guidanceSignalIntentFamily,
    guidanceStepKey,
    homeAssetId,
    itemId,
    negotiationShieldCaseId,
    quoteComparisonWorkspaceId,
    serviceRadarCheckId,
  ]);

  const handleSaveDraft = async () => {
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
    } catch (saveError: any) {
      setError(saveError?.message || 'Unable to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    const accepted = toMoneyNumber(form.acceptedPrice);
    if (!accepted || accepted <= 0) {
      setError('Accepted price is required to finalize.');
      return;
    }

    setFinalizing(true);
    setError(null);
    try {
      const payload = buildPayload();
      const baseDraft =
        activeDetail && activeDetail.status !== 'FINALIZED'
          ? await updatePriceFinalizationDraft(propertyId, activeDetail.id, payload)
          : await createPriceFinalizationDraft(propertyId, payload);
      const finalized = await finalizePriceFinalization(propertyId, baseDraft.id, {
        ...payload,
        acceptedPrice: accepted,
      });

      setItems((prev) => [finalized, ...prev.filter((entry) => entry.id !== finalized.id)]);
      setActiveId(finalized.id);
      setFinalizedId(finalized.id);
      setForm(buildFormFromDetail(finalized));
    } catch (finalizeError: any) {
      setError(finalizeError?.message || 'Unable to finalize price.');
    } finally {
      setFinalizing(false);
    }
  };

  const bookingHref = React.useMemo(() => {
    const selected = finalizedDetail ?? activeDetail;
    if (!selected || selected.status !== 'FINALIZED') return null;
    return withGuidanceQuery('/dashboard/providers', {
      propertyId,
      category: (selected.serviceCategory ?? form.serviceCategory) || null,
      guidanceJourneyId,
      guidanceStepKey: guidanceStepKey ?? 'finalize_price',
      guidanceSignalIntentFamily,
      itemId,
      homeAssetId,
      priceFinalizationId: selected.id,
      finalPrice:
        typeof selected.acceptedPrice === 'number' ? selected.acceptedPrice.toFixed(2) : null,
      vendorName: (selected.vendorName ?? form.vendorName) || null,
    });
  }, [
    finalizedDetail,
    activeDetail,
    propertyId,
    form.serviceCategory,
    form.vendorName,
    guidanceJourneyId,
    guidanceStepKey,
    guidanceSignalIntentFamily,
    itemId,
    homeAssetId,
  ]);
  const backHref = guidanceJourneyId
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;

  return (
    <CompareTemplate
      backHref={backHref}
      backLabel={guidanceJourneyId ? 'Back to guidance' : 'Back to property'}
      title="Price Finalization"
      subtitle="Capture accepted quote terms and final price before moving to booking."
      rail={<HomeToolsRail propertyId={propertyId} context="price-finalization" currentToolId="price-finalization" />}
      trust={{
        confidenceLabel: finalizedDetail ? 'High for finalized records; medium for draft entries' : 'Medium while drafting',
        freshnessLabel: 'Updates with every draft save and finalization action',
        sourceLabel: 'Quote context + selected vendor terms + guidance continuity metadata',
        rationale: 'Finalized pricing is used to reduce re-entry and keep booking decisions aligned with accepted terms.',
      }}
      priorityAction={!loading && items.length > 0 ? {
        title: finalizedDetail
          ? 'Price finalized — ready to continue to provider booking'
          : 'Finalize accepted price to unlock booking',
        description: finalizedDetail
          ? 'Contract terms are locked. Continue to booking with scope and accepted price prefilled — no re-entry needed.'
          : 'Lock the accepted amount and terms now so the booking step can reference them automatically.',
        impactLabel: finalizedDetail ? 'Booking-ready' : 'Avoids downstream re-entry',
        confidenceLabel: finalizedDetail ? 'High for finalized records' : 'Medium while drafting',
        primaryAction: bookingHref ? (
          <Link
            href={bookingHref}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black bg-black px-4 text-sm font-semibold text-white hover:bg-black/90"
          >
            Continue to Provider Booking
          </Link>
        ) : (
          <Button className="w-full sm:w-auto" onClick={handleFinalize} disabled={saving || finalizing || loading}>
            {finalizing ? 'Finalizing...' : 'Finalize price'}
          </Button>
        ),
        supportingAction: !finalizedDetail ? (
          <Button variant="outline" className="w-full sm:w-auto" onClick={handleSaveDraft} disabled={saving || finalizing || loading}>
            {saving ? 'Saving draft...' : 'Save draft'}
          </Button>
        ) : undefined,
      } : undefined}
      summary={
        <ResultHeroCard
          eyebrow="Workspace"
          title="Finalize Before You Book"
          value={items.length}
          status={<StatusChip tone={finalizedDetail ? 'good' : 'info'}>{finalizedDetail ? 'Finalized' : 'Draft mode'}</StatusChip>}
          summary="Persist accepted terms so booking can prefill scope and target price."
        />
      }
      compareContent={
        <>
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

          <ScenarioInputCard title="Accepted Price Details" subtitle="Capture the minimum contract details before booking.">
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

            <ActionPriorityRow
              primaryAction={
                <Button className="min-h-[40px] w-full" onClick={handleSaveDraft} disabled={saving || finalizing || loading}>
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
          </ScenarioInputCard>

          <ScenarioInputCard title="Saved Finalizations" subtitle="Recent records for this property.">
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
                    }}
                    className="w-full rounded-xl border border-black/10 bg-white p-2.5 text-left hover:bg-black/[0.02]"
                  >
                    <CompactEntityRow
                      title={entry.vendorName || 'Unnamed vendor'}
                      subtitle={entry.serviceCategory ? formatEnumLabel(entry.serviceCategory) : 'Service category not set'}
                      meta={entry.acceptedPrice ? `$${entry.acceptedPrice.toFixed(2)} ${entry.currency}` : 'No accepted price'}
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
        </>
      }
      footer={
        <>
          {bookingHref ? (
            <ScenarioInputCard title="Next Step" subtitle="Your accepted terms can now prefill booking.">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Price finalized and ready for booking.
              </div>
              <div className="pt-2">
                <Link
                  href={bookingHref}
                  className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-black bg-black px-4 text-sm font-semibold text-white hover:bg-black/90"
                >
                  Continue to Provider Booking
                </Link>
              </div>
            </ScenarioInputCard>
          ) : null}
          <GuidanceStepCompletionCard
            propertyId={propertyId}
            guidanceStepKey={guidanceStepKey}
            guidanceJourneyId={guidanceJourneyId}
            actionLabel="Mark price finalization reviewed"
            producedData={
              guidanceSignalIntentFamily
                ? { signalIntentFamily: guidanceSignalIntentFamily }
                : undefined
            }
          />
        </>
      }
    />
  );
}
