'use client';

import React from 'react';
import { CheckCircle2, PackageCheck, Wallet, CalendarDays, Zap, Star, BadgeCheck, ShoppingCart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ScenarioInputCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import {
  recordGuidanceToolStatus,
  generateModelShortlist,
  generateVendorSuggestions,
  type AIModelRecommendation,
  type AIVendorSuggestion,
  type ReplacementPriorities,
} from '@/lib/api/guidanceApi';
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
  rebateAmount?: number;
  priorities?: ReplacementPriorities;
  selectedModelName?: string;
  onComplete: () => void;
};

type ModelEntry = { name: string; price: string; reason: string };
type VendorOverride = { unitPrice: string; deliveryCost: string; installationCost: string };

const DEFAULT_MODELS: ModelEntry[] = [
  { name: '', price: '', reason: '' },
  { name: '', price: '', reason: '' },
  { name: '', price: '', reason: '' },
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

function aiShortlistCacheKey(args: { propertyId: string; journeyId: string; priorities?: ReplacementPriorities }) {
  const prioritySlug = [
    args.priorities?.primaryPriority ?? 'default',
    args.priorities?.homeOwnershipYears ?? 'any',
    args.priorities?.budgetMax?.toString() ?? '0',
  ].join('-');
  return ['replacement-ai-shortlist', args.propertyId, args.journeyId, prioritySlug].join(':');
}

function aiVendorCacheKey(args: { propertyId: string; journeyId: string; modelName?: string }) {
  const modelSlug = (args.modelName ?? 'default').replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40);
  return ['replacement-ai-vendors', args.propertyId, args.journeyId, modelSlug].join(':');
}

function buildInitialOverrides(vendors: AIVendorSuggestion[]): Record<string, VendorOverride> {
  return Object.fromEntries(
    vendors.map((v) => [
      v.vendorName,
      {
        unitPrice: v.unitPrice > 0 ? String(v.unitPrice) : '',
        deliveryCost: String(v.deliveryCost),
        installationCost: v.installationCost != null ? String(v.installationCost) : '',
      },
    ])
  );
}

function computeVendorTotal(unitPrice: string, deliveryCost: string, installationCost: string): number {
  const unit = Number(unitPrice) || 0;
  const delivery = Number(deliveryCost) || 0;
  const install = installationCost === '' ? 0 : Number(installationCost) || 0;
  return unit + delivery + install;
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
    return `AI-recommended replacements for ${context}. Select the model that fits your situation.`;
  }
  if (stepKey === 'compare_purchase_options') {
    return `AI-suggested vendors for ${context}. Edit prices and select where to buy.`;
  }
  if (stepKey === 'finalize_purchase_selection') {
    return `Capture the final purchase decision for ${context}.`;
  }
  if (stepKey === 'set_budget_and_shortlist') {
    return `Plan a realistic replacement budget and shortlist for ${context}.`;
  }
  return `Save the follow-up plan for ${context}.`;
}

const TIER_LABELS: Record<string, string> = {
  budget: 'Budget-friendly',
  mid: 'Best balance',
  premium: 'Premium pick',
};

const VENDOR_TYPE_LABELS: Record<string, string> = {
  big_box: 'Big-box retailer',
  online: 'Online retailer',
  local_dealer: 'Local dealer',
  manufacturer: 'Manufacturer direct',
  wholesale: 'Wholesale / club',
};

const VENDOR_TYPE_COLORS: Record<string, string> = {
  big_box: 'bg-blue-100 text-blue-800',
  online: 'bg-violet-100 text-violet-800',
  local_dealer: 'bg-amber-100 text-amber-800',
  manufacturer: 'bg-emerald-100 text-emerald-800',
  wholesale: 'bg-orange-100 text-orange-800',
};

function ModelCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-black/10 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="h-3 w-16 rounded bg-slate-200" />
          <div className="h-4 w-36 rounded bg-slate-200" />
          <div className="h-3 w-28 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-20 rounded-full bg-slate-200" />
      </div>
      <div className="h-3 w-52 rounded bg-slate-100" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between gap-2">
            <div className="h-2.5 w-16 rounded bg-slate-100" />
            <div className="h-2.5 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function VendorCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-black/10 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-3 w-24 rounded-full bg-slate-100" />
        </div>
        <div className="h-5 w-20 rounded-full bg-slate-200" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-2.5 w-14 rounded bg-slate-100" />
            <div className="h-8 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <div className="h-3 w-16 rounded bg-slate-100" />
        <div className="h-4 w-16 rounded bg-slate-200" />
      </div>
      <div className="h-9 w-full rounded-xl bg-slate-200" />
    </div>
  );
}

function AIModelCard({
  model,
  isSelected,
  onSelect,
}: {
  model: AIModelRecommendation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-all ${
        isSelected
          ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
          : 'border-black/10 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{model.brand}</p>
          <p className="text-base font-bold text-slate-900">{model.modelNumber}</p>
          <p className="text-sm text-slate-500">{model.displayName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold text-slate-900">{formatCurrency(model.estimatedPrice)}</p>
          {model.rebateAdjustedPrice !== null && (
            <p className="text-xs font-medium text-emerald-700">
              {formatCurrency(model.rebateAdjustedPrice)} after rebate
            </p>
          )}
        </div>
      </div>

      <div className="mt-2">
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
          model.tier === 'budget'
            ? 'bg-blue-100 text-blue-800'
            : model.tier === 'mid'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
        }`}>
          {TIER_LABELS[model.tier] ?? model.tier}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-600 italic">{model.whyThisForYou}</p>

      {Object.keys(model.keySpecs).length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-slate-50 p-3">
          {Object.entries(model.keySpecs).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-1 text-xs">
              <span className="text-slate-500 shrink-0">{key}</span>
              <span className="font-medium text-slate-800 text-right">{value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {model.energyStarCertified && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
            <Zap className="h-3 w-3" />
            Energy Star
          </span>
        )}
        <span className="flex items-center gap-1 rounded-full border border-black/10 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
          <BadgeCheck className="h-3 w-3 text-slate-400" />
          {model.warrantyYears}yr warranty
        </span>
        <span className="rounded-full border border-black/10 bg-slate-50 px-2.5 py-1 text-xs text-slate-400">
          AI estimated · verify specs before purchase
        </span>
      </div>
    </button>
  );
}

function AIVendorCard({
  vendor,
  override,
  isSelected,
  isLowestCost,
  onChange,
  onSelect,
}: {
  vendor: AIVendorSuggestion;
  override: VendorOverride;
  isSelected: boolean;
  isLowestCost: boolean;
  onChange: (field: keyof VendorOverride, value: string) => void;
  onSelect: () => void;
}) {
  const total = computeVendorTotal(override.unitPrice, override.deliveryCost, override.installationCost);

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      isSelected
        ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
        : 'border-black/10 bg-white'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-slate-900">{vendor.vendorName}</p>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${VENDOR_TYPE_COLORS[vendor.vendorType] ?? 'bg-slate-100 text-slate-700'}`}>
            {VENDOR_TYPE_LABELS[vendor.vendorType] ?? vendor.vendorType}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {isLowestCost && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
              Best total
            </span>
          )}
          {isSelected && (
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-medium text-white">
              ✓ Selected
            </span>
          )}
        </div>
      </div>

      {/* Editable price fields */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-slate-500">Unit price</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">$</span>
            <input
              value={override.unitPrice}
              onChange={(e) => onChange('unitPrice', e.target.value)}
              inputMode="decimal"
              placeholder="—"
              className="h-8 w-full rounded-lg border border-black/10 bg-white pl-5 pr-2 text-xs font-medium focus:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-200"
            />
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-slate-500">Delivery</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">$</span>
            <input
              value={override.deliveryCost}
              onChange={(e) => onChange('deliveryCost', e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="h-8 w-full rounded-lg border border-black/10 bg-white pl-5 pr-2 text-xs font-medium focus:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-200"
            />
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-slate-500">Install</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">$</span>
            <input
              value={override.installationCost}
              onChange={(e) => onChange('installationCost', e.target.value)}
              inputMode="decimal"
              placeholder="N/A"
              className="h-8 w-full rounded-lg border border-black/10 bg-white pl-5 pr-2 text-xs font-medium focus:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-200"
            />
          </div>
        </label>
      </div>

      {/* Total cost bar */}
      <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 ${isLowestCost ? 'bg-emerald-50' : 'bg-slate-50'}`}>
        <span className="text-xs text-slate-500">Total cost</span>
        <span className={`text-sm font-bold ${isLowestCost ? 'text-emerald-700' : 'text-slate-900'}`}>
          {total > 0 ? formatCurrency(total) : '—'}
        </span>
      </div>

      {/* Why buy here */}
      <p className="mt-2 text-xs italic text-slate-500">{vendor.whyBuyHere}</p>

      {/* Return window + badges */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-slate-600">
          {vendor.returnWindowDays}-day returns
        </span>
        {vendor.badges.map((badge) => (
          <span key={badge} className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-slate-600">
            {badge}
          </span>
        ))}
        <span className="rounded-full border border-black/10 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">
          AI estimated · verify before purchase
        </span>
      </div>

      {/* Select button */}
      <button
        type="button"
        onClick={onSelect}
        className={`mt-3 w-full rounded-xl py-2 text-sm font-medium transition-all ${
          isSelected
            ? 'bg-emerald-600 text-white'
            : 'border border-black/10 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
        }`}
      >
        {isSelected ? '✓ Selected' : 'Select this vendor'}
      </button>
    </div>
  );
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
  rebateAmount = 0,
  priorities,
  selectedModelName,
  onComplete,
}: ReplacementJourneyInlineProps) {
  const queryClient = useQueryClient();
  const issueLabel = formatIssueTypeLabel(issueType);
  const draftKey = React.useMemo(() => storageKey({ propertyId, journeyId, stepKey }), [propertyId, journeyId, stepKey]);
  const shortlistCacheKey = React.useMemo(
    () => aiShortlistCacheKey({ propertyId, journeyId, priorities }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propertyId, journeyId, priorities?.primaryPriority, priorities?.homeOwnershipYears, priorities?.budgetMax]
  );
  const vendorCacheKey = React.useMemo(
    () => aiVendorCacheKey({ propertyId, journeyId, modelName: selectedModelName }),
    [propertyId, journeyId, selectedModelName]
  );

  // AI shortlist state (compare_replacement_models)
  const [aiModels, setAiModels] = React.useState<AIModelRecommendation[] | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

  // AI vendor suggestions state (compare_purchase_options)
  const [aiVendors, setAiVendors] = React.useState<AIVendorSuggestion[] | null>(null);
  const [aiVendorsLoading, setAiVendorsLoading] = React.useState(false);
  const [aiVendorsError, setAiVendorsError] = React.useState<string | null>(null);
  const [vendorOverrides, setVendorOverrides] = React.useState<Record<string, VendorOverride>>({});
  const [showManualVendor, setShowManualVendor] = React.useState(false);
  const [manualVendorName, setManualVendorName] = React.useState('');
  const [manualVendorPrice, setManualVendorPrice] = React.useState('');
  const [manualVendorDelivery, setManualVendorDelivery] = React.useState('0');
  const [manualVendorInstall, setManualVendorInstall] = React.useState('');

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
        selectedModel?: string;
        selectedVendor?: string;
        budget?: string;
        timeline?: string;
        followUpDate?: string;
        notes?: string;
      };
      if (parsed.models?.length) setModels(parsed.models);
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
      JSON.stringify({ models, selectedModel, selectedVendor, budget, timeline, followUpDate, notes })
    );
  }, [budget, draftKey, followUpDate, models, notes, selectedModel, selectedVendor, timeline]);

  // Fetch AI model shortlist for compare_replacement_models
  React.useEffect(() => {
    if (stepKey !== 'compare_replacement_models') return;

    if (typeof window !== 'undefined') {
      const cached = window.sessionStorage.getItem(shortlistCacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as AIModelRecommendation[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAiModels(parsed);
            return;
          }
        } catch { /* ignore */ }
      }
    }

    setAiLoading(true);
    setAiError(null);
    generateModelShortlist(propertyId, {
      assetName,
      rebateAmount: rebateAmount > 0 ? rebateAmount : undefined,
      budgetMax: priorities?.budgetMax,
      primaryPriority: priorities?.primaryPriority,
      homeOwnershipYears: priorities?.homeOwnershipYears,
      mustHaves: priorities?.mustHaves,
    })
      .then((result) => {
        setAiModels(result.models);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(shortlistCacheKey, JSON.stringify(result.models));
        }
      })
      .catch(() => {
        setAiError('Could not load AI recommendations. You can still enter a model manually below.');
      })
      .finally(() => setAiLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, propertyId, assetName, shortlistCacheKey, priorities?.primaryPriority, priorities?.homeOwnershipYears, priorities?.budgetMax]);

  // Fetch AI vendor suggestions for compare_purchase_options
  React.useEffect(() => {
    if (stepKey !== 'compare_purchase_options') return;

    if (typeof window !== 'undefined') {
      const cached = window.sessionStorage.getItem(vendorCacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as AIVendorSuggestion[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAiVendors(parsed);
            setVendorOverrides((prev) => Object.keys(prev).length === 0 ? buildInitialOverrides(parsed) : prev);
            return;
          }
        } catch { /* ignore */ }
      }
    }

    setAiVendorsLoading(true);
    setAiVendorsError(null);
    generateVendorSuggestions(propertyId, {
      assetName,
      modelName: selectedModelName ?? assetName,
      budgetMax: priorities?.budgetMax,
    })
      .then((result) => {
        setAiVendors(result.vendors);
        setVendorOverrides(buildInitialOverrides(result.vendors));
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(vendorCacheKey, JSON.stringify(result.vendors));
        }
      })
      .catch(() => {
        setAiVendorsError('Could not load vendor suggestions. Enter details manually below.');
      })
      .finally(() => setAiVendorsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, propertyId, assetName, vendorCacheKey, selectedModelName, priorities?.budgetMax]);

  const activeModels = models.filter((entry) => entry.name.trim());

  const lowestCostVendorName = React.useMemo(() => {
    if (!aiVendors?.length) return null;
    let bestName: string | null = null;
    let bestTotal = Infinity;
    for (const v of aiVendors) {
      const ovr = vendorOverrides[v.vendorName];
      if (!ovr) continue;
      const total = computeVendorTotal(ovr.unitPrice, ovr.deliveryCost, ovr.installationCost);
      if (total > 0 && total < bestTotal) {
        bestTotal = total;
        bestName = v.vendorName;
      }
    }
    return bestName;
  }, [aiVendors, vendorOverrides]);

  function updateModel(index: number, patch: Partial<ModelEntry>) {
    setModels((prev) => prev.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function updateVendorOverride(vendorName: string, field: keyof VendorOverride, value: string) {
    setVendorOverrides((prev) => ({
      ...prev,
      [vendorName]: { ...(prev[vendorName] ?? { unitPrice: '', deliveryCost: '0', installationCost: '' }), [field]: value },
    }));
  }

  function buildProducedData() {
    if (stepKey === 'compare_replacement_models') {
      const selected = aiModels?.find((m) => m.displayName === selectedModel) ?? null;
      return {
        proofType: 'replacement_model_shortlist',
        proofId: `${journeyId}:${stepKey}`,
        aiShortlist: aiModels ?? [],
        shortlistedModels: (aiModels ?? []).map((m) => ({
          name: m.displayName,
          brand: m.brand,
          modelNumber: m.modelNumber,
          price: m.estimatedPrice,
          rebateAdjustedPrice: m.rebateAdjustedPrice,
          reason: m.whyThisForYou,
          specs: Object.entries(m.keySpecs).map(([k, v]) => `${k}: ${v}`),
          energyStarCertified: m.energyStarCertified,
          warrantyYears: m.warrantyYears,
        })),
        selectedModelName: selectedModel || null,
        selectedModelBrand: selected?.brand ?? null,
        selectedModelNumber: selected?.modelNumber ?? null,
        notes: notes.trim() || null,
      };
    }

    if (stepKey === 'compare_purchase_options') {
      const vendorOptions = (aiVendors ?? []).map((v) => {
        const ovr = vendorOverrides[v.vendorName] ?? { unitPrice: '', deliveryCost: '0', installationCost: '' };
        const price = Number(ovr.unitPrice) || null;
        const delivery = Number(ovr.deliveryCost) || 0;
        const install = ovr.installationCost === '' ? null : Number(ovr.installationCost) || null;
        return {
          vendor: v.vendorName,
          vendorType: v.vendorType,
          price,
          deliveryCost: delivery,
          installationCost: install,
          totalCost: (price ?? 0) + delivery + (install ?? 0),
          returnWindowDays: v.returnWindowDays,
          badges: v.badges,
        };
      });

      if (showManualVendor && manualVendorName.trim()) {
        const price = Number(manualVendorPrice) || null;
        const delivery = Number(manualVendorDelivery) || 0;
        const install = manualVendorInstall === '' ? null : Number(manualVendorInstall) || null;
        vendorOptions.push({
          vendor: manualVendorName.trim(),
          vendorType: 'local_dealer',
          price,
          deliveryCost: delivery,
          installationCost: install,
          totalCost: (price ?? 0) + delivery + (install ?? 0),
          returnWindowDays: 30,
          badges: [],
        });
      }

      const selectedVendorData = vendorOptions.find((v) => v.vendor === selectedVendor);
      return {
        proofType: 'replacement_purchase_options',
        proofId: `${journeyId}:${stepKey}`,
        purchaseOptions: vendorOptions,
        selectedVendorName: selectedVendor || vendorOptions[0]?.vendor || null,
        selectedVendorTotalCost: selectedVendorData?.totalCost ?? null,
        selectedModelName: selectedModelName || null,
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
      return 'Select a model from the recommendations above, or enter one manually to continue.';
    }
    if (stepKey === 'compare_purchase_options') {
      if (!selectedVendor) return 'Select a vendor to continue.';
      const isAiVendor = aiVendors?.some((v) => v.vendorName === selectedVendor);
      const isManual = selectedVendor === manualVendorName.trim() && manualVendorName.trim() !== '';
      if (isAiVendor) {
        const ovr = vendorOverrides[selectedVendor];
        if (!ovr?.unitPrice || Number(ovr.unitPrice) <= 0) return 'Enter the unit price for the selected vendor.';
      } else if (!isManual) {
        return 'Select a vendor to continue.';
      }
      return null;
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
            {/* Priorities context strip */}
            {priorities && (priorities.primaryPriority || priorities.homeOwnershipYears || priorities.budgetMax) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-medium text-slate-500">Tailored for:</span>
                {priorities.budgetMax && (
                  <span className="rounded-full bg-white border border-black/10 px-2.5 py-0.5 text-xs text-slate-700">
                    Budget ≤ ${priorities.budgetMax.toLocaleString()}
                  </span>
                )}
                {priorities.primaryPriority && (
                  <span className="rounded-full bg-white border border-black/10 px-2.5 py-0.5 text-xs text-slate-700">
                    {{
                      lowest_cost: 'Lowest cost',
                      energy_savings: 'Energy savings',
                      quiet_operation: 'Quiet operation',
                      long_term_reliability: 'Best reliability',
                      fast_availability: 'Fast availability',
                    }[priorities.primaryPriority]}
                  </span>
                )}
                {priorities.homeOwnershipYears && (
                  <span className="rounded-full bg-white border border-black/10 px-2.5 py-0.5 text-xs text-slate-700">
                    {{
                      under_3: 'Staying < 3 yrs',
                      '3_to_7': 'Staying 3–7 yrs',
                      '7_plus': 'Staying 7+ yrs',
                    }[priorities.homeOwnershipYears]}
                  </span>
                )}
                {priorities.mustHaves?.includes('energy_star') && (
                  <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-xs text-emerald-800">
                    Energy Star required
                  </span>
                )}
              </div>
            )}

            {/* Rebate context strip */}
            {rebateAmount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <Star className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <span className="font-semibold">{formatCurrency(rebateAmount)} rebate</span> may apply — reflected in adjusted prices below.
                </span>
              </div>
            )}

            {aiLoading && (
              <>
                <ModelCardSkeleton />
                <ModelCardSkeleton />
                <ModelCardSkeleton />
                <p className="text-center text-xs text-slate-400 animate-pulse">
                  Researching the best options for your {assetName}…
                </p>
              </>
            )}

            {aiError && !aiLoading && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {aiError}
              </div>
            )}

            {!aiLoading && aiModels && aiModels.map((model) => (
              <AIModelCard
                key={model.modelNumber}
                model={model}
                isSelected={selectedModel === model.displayName}
                onSelect={() => setSelectedModel(model.displayName)}
              />
            ))}

            {!aiLoading && (aiModels || aiError) && (
              <div className="pt-1">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-slate-700">Or enter a different model</span>
                  <input
                    value={aiModels?.some((m) => m.displayName === selectedModel) ? '' : selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    placeholder="e.g. Bosch SHPM88Z75N"
                    className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                  />
                </label>
              </div>
            )}

            {selectedModel && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
                <span className="font-medium">Selected: </span>{selectedModel}
              </div>
            )}
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
            {/* Selected model context strip */}
            {selectedModelName && (
              <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm">
                <ShoppingCart className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="text-blue-900">
                  Shopping for: <span className="font-semibold">{selectedModelName}</span>
                </span>
              </div>
            )}

            {/* AI loading skeletons */}
            {aiVendorsLoading && (
              <>
                <VendorCardSkeleton />
                <VendorCardSkeleton />
                <VendorCardSkeleton />
                <p className="text-center text-xs text-slate-400 animate-pulse">
                  Finding the best places to buy your {assetName}…
                </p>
              </>
            )}

            {/* AI error */}
            {aiVendorsError && !aiVendorsLoading && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {aiVendorsError}
              </div>
            )}

            {/* AI vendor cards */}
            {!aiVendorsLoading && aiVendors && aiVendors.map((vendor) => {
              const override = vendorOverrides[vendor.vendorName] ?? { unitPrice: '', deliveryCost: '0', installationCost: '' };
              return (
                <AIVendorCard
                  key={vendor.vendorName}
                  vendor={vendor}
                  override={override}
                  isSelected={selectedVendor === vendor.vendorName}
                  isLowestCost={lowestCostVendorName === vendor.vendorName}
                  onChange={(field, value) => updateVendorOverride(vendor.vendorName, field, value)}
                  onSelect={() => setSelectedVendor(selectedVendor === vendor.vendorName ? '' : vendor.vendorName)}
                />
              );
            })}

            {/* Add vendor manually */}
            {!aiVendorsLoading && (
              <div className="pt-1">
                <button
                  type="button"
                  className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                  onClick={() => setShowManualVendor((prev) => !prev)}
                >
                  {showManualVendor ? 'Hide manual entry' : '+ Add vendor manually'}
                </button>
                {showManualVendor && (
                  <div className="mt-2 space-y-2 rounded-xl border border-black/10 bg-white p-3">
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-slate-700">Vendor name</span>
                      <input
                        value={manualVendorName}
                        onChange={(e) => setManualVendorName(e.target.value)}
                        placeholder="e.g. Ferguson Bath & Kitchen"
                        className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Unit price</span>
                        <input
                          value={manualVendorPrice}
                          onChange={(e) => setManualVendorPrice(e.target.value)}
                          inputMode="decimal"
                          placeholder="1299"
                          className="h-8 w-full rounded-lg border border-black/10 bg-white px-2 text-xs"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Delivery</span>
                        <input
                          value={manualVendorDelivery}
                          onChange={(e) => setManualVendorDelivery(e.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                          className="h-8 w-full rounded-lg border border-black/10 bg-white px-2 text-xs"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Install</span>
                        <input
                          value={manualVendorInstall}
                          onChange={(e) => setManualVendorInstall(e.target.value)}
                          inputMode="decimal"
                          placeholder="N/A"
                          className="h-8 w-full rounded-lg border border-black/10 bg-white px-2 text-xs"
                        />
                      </label>
                    </div>
                    {manualVendorName.trim() && (
                      <button
                        type="button"
                        onClick={() => setSelectedVendor(selectedVendor === manualVendorName.trim() ? '' : manualVendorName.trim())}
                        className={`w-full rounded-xl py-2 text-sm font-medium transition-all ${
                          selectedVendor === manualVendorName.trim()
                            ? 'bg-emerald-600 text-white'
                            : 'border border-black/10 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        {selectedVendor === manualVendorName.trim() ? '✓ Selected' : 'Select this vendor'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Selection confirmation */}
            {selectedVendor && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
                <span className="font-medium">Selected: </span>{selectedVendor}
                {(() => {
                  const ovr = vendorOverrides[selectedVendor];
                  if (!ovr) return null;
                  const total = computeVendorTotal(ovr.unitPrice, ovr.deliveryCost, ovr.installationCost);
                  return total > 0
                    ? <span className="ml-2 font-medium text-emerald-700">{formatCurrency(total)} total</span>
                    : null;
                })()}
              </div>
            )}
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
