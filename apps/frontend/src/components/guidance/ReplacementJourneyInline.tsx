'use client';

import React from 'react';
import { CheckCircle2, PackageCheck, ShoppingCart, Wallet, CalendarDays } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ScenarioInputCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { formatCurrency } from '@/lib/utils/format';
import { formatIssueTypeLabel } from '@/features/guidance/utils/guidanceDisplay';

type ReplacementJourneyInlineProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  toolKey: string;
  assetName?: string;
  issueType?: string | null;
  producedData?: Record<string, unknown> | null;
  onComplete: () => void;
};

type ModelEntry = { name: string; price: string; reason: string };
type VendorEntry = { vendor: string; price: string; warranty: string; timeline: string };
type SuggestedModel = {
  id: string;
  label: string;
  estimatedPrice: number;
  fit: string;
  specs: string[];
};

const DEFAULT_MODELS: ModelEntry[] = [
  { name: '', price: '', reason: '' },
  { name: '', price: '', reason: '' },
  { name: '', price: '', reason: '' },
];

const DEFAULT_VENDORS: VendorEntry[] = [
  { vendor: '', price: '', warranty: '', timeline: '' },
  { vendor: '', price: '', warranty: '', timeline: '' },
  { vendor: '', price: '', warranty: '', timeline: '' },
];

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toMoney(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function storageKey(args: { propertyId: string; journeyId: string; stepKey: string }) {
  return ['replacement-journey-inline', args.propertyId, args.journeyId, args.stepKey].join(':');
}

function buildTitle(stepKey: string) {
  if (stepKey === 'compare_replacement_models') return 'Compare Models and Specs';
  if (stepKey === 'compare_purchase_options') return 'Compare Purchase Options';
  if (stepKey === 'finalize_purchase_selection') return 'Finalize Purchase Selection';
  if (stepKey === 'set_budget_and_shortlist') return 'Set Budget and Shortlist';
  return 'Save Plan and Follow-up';
}

function buildSubtitle(stepKey: string, assetName: string, issueLabel: string | null) {
  const context = issueLabel ? `${assetName} · ${issueLabel}` : assetName;
  if (stepKey === 'compare_replacement_models') {
    return `Shortlist the replacement models that best fit ${context}.`;
  }
  if (stepKey === 'compare_purchase_options') {
    return `Compare seller and purchase options before you commit for ${context}.`;
  }
  if (stepKey === 'finalize_purchase_selection') {
    return `Capture the final purchase decision for ${context}.`;
  }
  if (stepKey === 'set_budget_and_shortlist') {
    return `Plan a realistic replacement budget and shortlist for ${context}.`;
  }
  return `Save the follow-up plan for ${context}.`;
}

function inferReplacementFamily(assetName: string): {
  noun: string;
  priceBand: [number, number, number];
  specsByTier: string[][];
} {
  const normalized = assetName.toLowerCase();
  if (normalized.includes('dishwasher')) {
    return {
      noun: 'dishwasher',
      priceBand: [700, 1000, 1400],
      specsByTier: [
        ['Standard capacity', 'Basic drying', 'Entry energy efficiency'],
        ['Quiet cycle', 'Better drying', 'Stronger energy efficiency'],
        ['Very quiet', 'Flexible racks', 'Best efficiency + warranty'],
      ],
    };
  }
  if (normalized.includes('refrigerator') || normalized.includes('fridge')) {
    return {
      noun: 'refrigerator',
      priceBand: [1200, 1800, 2600],
      specsByTier: [
        ['Reliable cooling', 'Standard storage', 'Entry efficiency'],
        ['Better organization', 'Stronger efficiency', 'Lower noise'],
        ['Premium storage', 'Best efficiency', 'Longest warranty'],
      ],
    };
  }
  if (normalized.includes('washer') || normalized.includes('dryer')) {
    return {
      noun: normalized.includes('dryer') ? 'dryer' : 'washer',
      priceBand: [800, 1100, 1500],
      specsByTier: [
        ['Core cycles', 'Standard capacity', 'Entry efficiency'],
        ['Quieter operation', 'Better fabric care', 'Improved efficiency'],
        ['Largest capacity', 'Smart controls', 'Best efficiency + warranty'],
      ],
    };
  }
  if (normalized.includes('water heater')) {
    return {
      noun: 'water heater',
      priceBand: [1200, 2200, 3200],
      specsByTier: [
        ['Like-for-like replacement', 'Standard recovery', 'Lower upfront cost'],
        ['Higher efficiency', 'Improved warranty', 'Balanced operating cost'],
        ['Heat-pump or premium tier', 'Best efficiency', 'Highest long-term savings'],
      ],
    };
  }
  if (normalized.includes('hvac') || normalized.includes('furnace') || normalized.includes('ac')) {
    return {
      noun: 'HVAC system',
      priceBand: [6500, 9000, 13000],
      specsByTier: [
        ['Reliable replacement', 'Entry efficiency tier', 'Lower upfront cost'],
        ['Balanced efficiency', 'Quieter operation', 'Better warranty'],
        ['High-efficiency tier', 'Variable performance', 'Best comfort + savings'],
      ],
    };
  }
  return {
    noun: assetName.toLowerCase(),
    priceBand: [900, 1400, 2200],
    specsByTier: [
      ['Reliable core performance', 'Lower upfront cost', 'Standard warranty'],
      ['Better efficiency', 'Balanced feature set', 'Improved warranty'],
      ['Best efficiency', 'Premium features', 'Longest warranty coverage'],
    ],
  };
}

function buildSuggestedModels(assetName: string): SuggestedModel[] {
  const family = inferReplacementFamily(assetName);
  const tiers = ['Good fit', 'Better fit', 'Best long-term fit'] as const;
  return family.priceBand.map((price, index) => ({
    id: `suggested-model-${index + 1}`,
    label: `${tiers[index]} ${family.noun}`,
    estimatedPrice: price,
    fit:
      index === 0
        ? 'Best if you want the lowest upfront replacement cost.'
        : index === 1
          ? 'Best balance of price, efficiency, and day-to-day comfort.'
          : 'Best if you plan to stay longer and want the strongest long-term value.',
    specs: family.specsByTier[index] ?? [],
  }));
}

export function ReplacementJourneyInline({
  propertyId,
  journeyId,
  stepId: _stepId,
  stepKey,
  toolKey,
  assetName = 'this item',
  issueType,
  producedData,
  onComplete,
}: ReplacementJourneyInlineProps) {
  const queryClient = useQueryClient();
  const issueLabel = formatIssueTypeLabel(issueType);
  const draftKey = React.useMemo(() => storageKey({ propertyId, journeyId, stepKey }), [propertyId, journeyId, stepKey]);
  const suggestedModels = React.useMemo(() => buildSuggestedModels(assetName), [assetName]);

  const [completed, setCompleted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [models, setModels] = React.useState<ModelEntry[]>(
    asArray<Record<string, unknown>>(producedData?.shortlistedModels).length > 0
      ? asArray<Record<string, unknown>>(producedData?.shortlistedModels).map((entry) => ({
          name: typeof entry.name === 'string' ? entry.name : '',
          price: typeof entry.price === 'number' ? entry.price.toString() : '',
          reason: typeof entry.reason === 'string' ? entry.reason : '',
        }))
      : DEFAULT_MODELS
  );
  const [vendors, setVendors] = React.useState<VendorEntry[]>(
    asArray<Record<string, unknown>>(producedData?.purchaseOptions).length > 0
      ? asArray<Record<string, unknown>>(producedData?.purchaseOptions).map((entry) => ({
          vendor: typeof entry.vendor === 'string' ? entry.vendor : '',
          price: typeof entry.price === 'number' ? entry.price.toString() : '',
          warranty: typeof entry.warranty === 'string' ? entry.warranty : '',
          timeline: typeof entry.timeline === 'string' ? entry.timeline : '',
        }))
      : DEFAULT_VENDORS
  );
  const [selectedModel, setSelectedModel] = React.useState<string>(typeof producedData?.selectedModelName === 'string' ? producedData.selectedModelName : '');
  const [selectedVendor, setSelectedVendor] = React.useState<string>(typeof producedData?.selectedVendorName === 'string' ? producedData.selectedVendorName : '');
  const [budget, setBudget] = React.useState<string>(typeof producedData?.budgetTarget === 'number' ? producedData.budgetTarget.toString() : '');
  const [timeline, setTimeline] = React.useState<string>(typeof producedData?.purchaseWindow === 'string' ? producedData.purchaseWindow : '');
  const [followUpDate, setFollowUpDate] = React.useState<string>(typeof producedData?.followUpDate === 'string' ? producedData.followUpDate : '');
  const [notes, setNotes] = React.useState<string>(typeof producedData?.notes === 'string' ? producedData.notes : '');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        models?: ModelEntry[];
        vendors?: VendorEntry[];
        selectedModel?: string;
        selectedVendor?: string;
        budget?: string;
        timeline?: string;
        followUpDate?: string;
        notes?: string;
      };
      if (parsed.models?.length) setModels(parsed.models);
      if (parsed.vendors?.length) setVendors(parsed.vendors);
      if (typeof parsed.selectedModel === 'string') setSelectedModel(parsed.selectedModel);
      if (typeof parsed.selectedVendor === 'string') setSelectedVendor(parsed.selectedVendor);
      if (typeof parsed.budget === 'string') setBudget(parsed.budget);
      if (typeof parsed.timeline === 'string') setTimeline(parsed.timeline);
      if (typeof parsed.followUpDate === 'string') setFollowUpDate(parsed.followUpDate);
      if (typeof parsed.notes === 'string') setNotes(parsed.notes);
    } catch {
      // Ignore corrupted session draft.
    }
  }, [draftKey]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      draftKey,
      JSON.stringify({
        models,
        vendors,
        selectedModel,
        selectedVendor,
        budget,
        timeline,
        followUpDate,
        notes,
      })
    );
  }, [budget, draftKey, followUpDate, models, notes, selectedModel, selectedVendor, timeline, vendors]);

  const activeModels = models.filter((entry) => entry.name.trim());
  const activeVendors = vendors.filter((entry) => entry.vendor.trim());

  function updateModel(index: number, patch: Partial<ModelEntry>) {
    setModels((prev) => prev.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function updateVendor(index: number, patch: Partial<VendorEntry>) {
    setVendors((prev) => prev.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function buildProducedData() {
    if (stepKey === 'compare_replacement_models') {
      return {
        proofType: 'replacement_model_shortlist',
        proofId: `${journeyId}:${stepKey}`,
        shortlistedModels: suggestedModels.map((entry) => ({
          name: entry.label,
          price: entry.estimatedPrice,
          reason: entry.fit,
          specs: entry.specs,
        })),
        selectedModelName: selectedModel || suggestedModels[0]?.label || null,
        notes: notes.trim() || null,
      };
    }

    if (stepKey === 'compare_purchase_options') {
      return {
        proofType: 'replacement_purchase_options',
        proofId: `${journeyId}:${stepKey}`,
        purchaseOptions: activeVendors.map((entry) => ({
          vendor: entry.vendor.trim(),
          price: toMoney(entry.price),
          warranty: entry.warranty.trim() || null,
          timeline: entry.timeline.trim() || null,
        })),
        selectedVendorName: selectedVendor || activeVendors[0]?.vendor || null,
        selectedModelName: selectedModel || null,
        notes: notes.trim() || null,
      };
    }

    if (stepKey === 'finalize_purchase_selection') {
      return {
        proofType: 'replacement_purchase_selection',
        proofId: `${journeyId}:${stepKey}`,
        selectedModelName: selectedModel || null,
        selectedVendorName: selectedVendor || null,
        finalBudget: toMoney(budget),
        purchaseWindow: timeline.trim() || null,
        notes: notes.trim() || null,
      };
    }

    if (stepKey === 'set_budget_and_shortlist') {
      return {
        proofType: 'replacement_plan_shortlist',
        proofId: `${journeyId}:${stepKey}`,
        budgetTarget: toMoney(budget),
        purchaseWindow: timeline.trim() || null,
        shortlistedModels: activeModels.map((entry) => ({
          name: entry.name.trim(),
          price: toMoney(entry.price),
          reason: entry.reason.trim(),
        })),
        notes: notes.trim() || null,
      };
    }

    return {
      proofType: 'replacement_plan_followup',
      proofId: `${journeyId}:${stepKey}`,
      followUpDate: followUpDate || null,
      selectedModelName: selectedModel || null,
      budgetTarget: toMoney(budget),
      notes: notes.trim() || null,
    };
  }

  function validateStep(): string | null {
    if (stepKey === 'compare_replacement_models' && !selectedModel.trim()) {
      return 'Choose one of the suggested replacement options to continue.';
    }
    if (stepKey === 'compare_purchase_options' && activeVendors.length === 0) {
      return 'Add at least one purchase option to continue.';
    }
    if (stepKey === 'finalize_purchase_selection' && (!selectedModel.trim() || !selectedVendor.trim())) {
      return 'Select both a model and a vendor to finalize purchase selection.';
    }
    if (stepKey === 'set_budget_and_shortlist' && (!budget.trim() || activeModels.length === 0)) {
      return 'Set a budget and shortlist at least one model to continue.';
    }
    if (stepKey === 'save_plan_and_follow_up' && !followUpDate.trim()) {
      return 'Choose a follow-up date to save this plan.';
    }
    return null;
  }

  async function handleComplete() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await recordGuidanceToolStatus(propertyId, {
        journeyId,
        stepKey,
        sourceToolKey: toolKey,
        status: 'COMPLETED',
        producedData: buildProducedData(),
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setCompleted(true);
      onComplete();
    } catch (completionError) {
      console.error('[ReplacementJourneyInline] complete failed', completionError);
      setError('Unable to save this replacement step. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (completed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Replacement step saved. Moving to the next part of the journey.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScenarioInputCard
        title={buildTitle(stepKey)}
        subtitle={buildSubtitle(stepKey, assetName, issueLabel)}
      >
        {error ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {stepKey === 'compare_replacement_models' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <PackageCheck className="h-4 w-4 text-emerald-600" />
              We generated a starter shortlist so the user can review options instead of typing model details manually.
            </div>
            {suggestedModels.map((entry) => {
              const isSelected = selectedModel === entry.label;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedModel(entry.label)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-black/10 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{entry.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{entry.fit}</p>
                    </div>
                    <StatusChip tone={isSelected ? 'good' : 'info'}>
                      {formatCurrency(entry.estimatedPrice)}
                    </StatusChip>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.specs.map((spec) => (
                      <span
                        key={spec}
                        className="rounded-full border border-black/10 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
              <span className="font-medium">Selected option: </span>
              {selectedModel || 'Pick the shortlist option that feels like the best fit.'}
            </div>
          </div>
        )}

        {stepKey === 'set_budget_and_shortlist' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <PackageCheck className="h-4 w-4 text-emerald-600" />
              Focus on reliability, energy use, and replacement cost fit.
            </div>
            {models.map((entry, index) => (
              <div key={`model-${index}`} className="rounded-xl border border-black/10 bg-white p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Model {index + 1}</span>
                    <input
                      value={entry.name}
                      onChange={(event) => updateModel(index, { name: event.target.value })}
                      placeholder="Brand + model"
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Estimated price</span>
                    <input
                      value={entry.price}
                      onChange={(event) => updateModel(index, { price: event.target.value })}
                      inputMode="decimal"
                      placeholder="1200"
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>
                </div>
                <label className="mt-3 block space-y-1 text-sm">
                  <span className="font-medium">Why it made the shortlist</span>
                  <textarea
                    value={entry.reason}
                    onChange={(event) => updateModel(index, { reason: event.target.value })}
                    rows={2}
                    placeholder="Quieter, more efficient, better warranty..."
                    className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ))}
            {activeModels.length > 0 ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-emerald-900">Current shortlist</span>
                  <StatusChip tone="good">{activeModels.length} models</StatusChip>
                </div>
                <div className="space-y-2 text-slate-700">
                  {activeModels.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between gap-3">
                      <span>{entry.name}</span>
                      <span className="font-medium">
                        {toMoney(entry.price) ? formatCurrency(toMoney(entry.price)) : 'Needs price'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="space-y-1 text-sm">
              <span className="font-medium">Preferred model</span>
              <input
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                placeholder="Which model feels strongest right now?"
                className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
              />
            </label>
          </div>
        )}

        {stepKey === 'compare_purchase_options' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <ShoppingCart className="h-4 w-4 text-emerald-600" />
              Compare where to buy, not just what to buy.
            </div>
            {vendors.map((entry, index) => (
              <div key={`vendor-${index}`} className="rounded-xl border border-black/10 bg-white p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Vendor {index + 1}</span>
                    <input
                      value={entry.vendor}
                      onChange={(event) => updateVendor(index, { vendor: event.target.value })}
                      placeholder="Retailer or installer"
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Price</span>
                    <input
                      value={entry.price}
                      onChange={(event) => updateVendor(index, { price: event.target.value })}
                      inputMode="decimal"
                      placeholder="1499"
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Warranty / return notes</span>
                    <input
                      value={entry.warranty}
                      onChange={(event) => updateVendor(index, { warranty: event.target.value })}
                      placeholder="2-year parts coverage"
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Delivery / availability</span>
                    <input
                      value={entry.timeline}
                      onChange={(event) => updateVendor(index, { timeline: event.target.value })}
                      placeholder="In stock this week"
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>
                </div>
              </div>
            ))}
            <label className="space-y-1 text-sm">
              <span className="font-medium">Preferred vendor</span>
              <input
                value={selectedVendor}
                onChange={(event) => setSelectedVendor(event.target.value)}
                placeholder="Which vendor would you choose today?"
                className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
              />
            </label>
          </div>
        )}

        {stepKey === 'finalize_purchase_selection' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Wallet className="h-4 w-4 text-emerald-600" />
              Save the exact model, seller, and purchase timing you want to move forward with.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Chosen model</span>
                <input
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  placeholder="Selected model"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Chosen vendor</span>
                <input
                  value={selectedVendor}
                  onChange={(event) => setSelectedVendor(event.target.value)}
                  placeholder="Chosen seller"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Final budget</span>
                <input
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  inputMode="decimal"
                  placeholder="1800"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Purchase timing</span>
                <input
                  value={timeline}
                  onChange={(event) => setTimeline(event.target.value)}
                  placeholder="This week / this month"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
            </div>
          </div>
        )}

        {stepKey === 'save_plan_and_follow_up' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              Capture when you want to revisit this purchase plan.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Follow-up date</span>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Budget target</span>
                <input
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  inputMode="decimal"
                  placeholder="1800"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Preferred model to revisit</span>
              <input
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                placeholder="Top model to revisit later"
                className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
              />
            </label>
          </div>
        )}

        <label className="mt-3 block space-y-1 text-sm">
          <span className="font-medium">Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Capture tradeoffs, timing, or anything worth remembering."
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-4 flex flex-col gap-2">
          <Button className="min-h-[48px] w-full rounded-2xl" disabled={saving} onClick={handleComplete}>
            {saving ? 'Saving…' : 'Save and continue'}
          </Button>
        </div>
      </ScenarioInputCard>
    </div>
  );
}
