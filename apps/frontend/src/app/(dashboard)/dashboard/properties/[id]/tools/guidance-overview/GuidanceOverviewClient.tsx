'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Box, CircleAlert, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  CompactEntityRow,
  MobilePageContainer,
  MobilePageIntro,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { useJourney } from '@/features/guidance/hooks/useJourney';
import type { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { formatIssueDomain, resolveGuidanceStepHref } from '@/features/guidance/utils/guidanceDisplay';
import { listInventoryItems } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import {
  skipGuidanceStep,
  dismissGuidanceJourney,
  startGuidanceJourney,
  type GuidanceScopeCategory,
  type GuidanceStepDTO,
} from '@/lib/api/guidanceApi';
import { GuidanceJourneyStrip } from '@/components/guidance/GuidanceJourneyStrip';
import { getProviderCategoryForSystemType } from '@/lib/config/serviceCategoryMapping';
import { formatCurrency } from '@/lib/utils/format';
import { formatEnumLabel } from '@/lib/utils/formatters';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOMAIN_FOCUS_LABELS: Record<string, string> = {
  ASSET_LIFECYCLE: 'Aging home system',
  MAINTENANCE: 'Home maintenance issue',
  SAFETY: 'Home safety issue',
  INSURANCE: 'Coverage decision',
  FINANCIAL: 'Home expense planning',
  COMPLIANCE: 'Compliance issue',
  WEATHER: 'Weather readiness issue',
  ENERGY: 'Energy cost issue',
  OTHER: 'Home issue',
};

const SIGNAL_SUBTITLE_LABELS: Record<string, string> = {
  cost_of_inaction_risk: 'Delaying this issue could increase your total cost.',
  coverage_gap: 'Coverage may not protect this issue right now.',
  coverage_lapse_detected: 'Coverage may expire soon for this issue.',
  lifecycle_end_or_past_life: 'This asset is near or past expected life.',
  maintenance_failure_risk: 'This issue can worsen if maintenance is delayed.',
  inspection_followup_needed: 'Inspection follow-up is needed before execution.',
  recall_detected: 'A safety recall may require immediate action.',
  high_utility_cost: 'This issue may be increasing your ongoing utility costs.',
};

const SUGGESTED_ISSUE_TYPES_ITEM = [
  { key: 'not_working', label: 'Not working properly' },
  { key: 'not_cooling', label: 'Not cooling' },
  { key: 'not_heating', label: 'Not heating' },
  { key: 'leak', label: 'Leaking or water damage' },
  { key: 'past_life', label: 'Aging or past expected life' },
  { key: 'broken', label: 'Broken or damaged' },
  { key: 'inspection_needed', label: 'Needs inspection or maintenance' },
  { key: 'coverage_question', label: 'Coverage or warranty question' },
  { key: 'cost_estimate', label: 'Need a cost estimate' },
];

const SUGGESTED_ISSUE_TYPES_BY_SERVICE: Record<string, { key: string; label: string }[]> = {
  warranty_purchase: [
    { key: 'purchase_warranty', label: 'Find and purchase a home warranty' },
    { key: 'compare_warranty_plans', label: 'Compare home warranty plans' },
    { key: 'understand_coverage', label: 'Understand what is covered' },
    { key: 'warranty_renewal', label: 'Renew or extend an existing warranty' },
    { key: 'get_quotes', label: 'Get quotes and compare options' },
  ],
  insurance_purchase: [
    { key: 'purchase_insurance', label: 'Purchase or review home insurance' },
    { key: 'compare_rates', label: 'Compare insurance rates and providers' },
    { key: 'coverage_gap', label: 'Check for coverage gaps' },
    { key: 'policy_renewal', label: 'Renew or update an existing policy' },
    { key: 'get_quotes', label: 'Get quotes and compare options' },
  ],
  general_inspection: [
    { key: 'schedule_inspection', label: 'Schedule a home inspection' },
    { key: 'pre_purchase_inspection', label: 'Pre-purchase or due diligence inspection' },
    { key: 'annual_maintenance', label: 'Annual or seasonal maintenance inspection' },
    { key: 'post_repair_inspection', label: 'Post-repair or contractor inspection' },
    { key: 'get_quotes', label: 'Get quotes and compare inspectors' },
  ],
  cleaning_service: [
    { key: 'arrange_cleaning', label: 'Arrange a regular cleaning service' },
    { key: 'deep_clean', label: 'One-time deep clean' },
    { key: 'move_clean', label: 'Move-in or move-out clean' },
    { key: 'post_construction', label: 'Post-construction or renovation clean-up' },
    { key: 'get_quotes', label: 'Get quotes and compare cleaners' },
  ],
};

// Fallback for any service key not explicitly mapped
const SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT = [
  { key: 'get_quotes', label: 'Get quotes and compare options' },
  { key: 'schedule_service', label: 'Schedule the service' },
  { key: 'understand_options', label: 'Understand available options' },
];

const SERVICE_CATEGORIES = [
  { key: 'warranty_purchase', label: 'Home warranty', description: 'Find and purchase a home warranty plan.' },
  { key: 'insurance_purchase', label: 'Home insurance', description: 'Review or purchase home insurance coverage.' },
  { key: 'general_inspection', label: 'Home inspection', description: 'Schedule a professional home inspection.' },
  { key: 'cleaning_service', label: 'Cleaning service', description: 'Arrange a home cleaning or deep clean.' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AssetScopeOption = {
  key: string;
  assetName: string;
  systemType: string;
  category: string;
  actionCta: string | null;
  outOfPocketCost: number;
  inventoryItemId: string | null;
  homeAssetId: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendScopeParams(
  baseHref: string,
  option: Pick<AssetScopeOption, 'inventoryItemId' | 'homeAssetId' | 'assetName'>
): string {
  const params = new URLSearchParams();
  if (option.inventoryItemId) {
    params.set('itemId', option.inventoryItemId);
    params.set('inventoryItemId', option.inventoryItemId);
  }
  if (option.homeAssetId) params.set('homeAssetId', option.homeAssetId);
  params.set('assetName', option.assetName);
  const query = params.toString();
  return query ? `${baseHref}${baseHref.includes('?') ? '&' : '?'}${query}` : baseHref;
}

function buildProvidersHref(propertyId: string, option: AssetScopeOption): string {
  const params = new URLSearchParams();
  params.set('propertyId', propertyId);
  params.set('category', getProviderCategoryForSystemType(option.systemType));
  params.set('insightFactor', option.systemType || option.assetName);
  if (option.inventoryItemId) params.set('itemId', option.inventoryItemId);
  if (option.homeAssetId) params.set('homeAssetId', option.homeAssetId);
  params.set('assetName', option.assetName);
  return `/dashboard/providers?${params.toString()}`;
}

function resolveAssetLabel(action: GuidanceActionModel): string {
  const itemName = action.journey.inventoryItem?.name?.trim();
  if (itemName) return itemName;
  const assetType = action.journey.homeAsset?.assetType;
  if (assetType) return `${formatEnumLabel(assetType)} system`;
  return DOMAIN_FOCUS_LABELS[action.issueDomain] ?? formatIssueDomain(action.issueDomain);
}

function resolvePrimarySubtitle(action: GuidanceActionModel): string {
  const family = action.journey.primarySignal?.signalIntentFamily ?? '';
  if (SIGNAL_SUBTITLE_LABELS[family]) return SIGNAL_SUBTITLE_LABELS[family];
  if (action.explanation?.why) return action.explanation.why;
  if (action.subtitle) return action.subtitle;
  return 'This is the highest-priority issue to resolve now.';
}

function resolveNextStepLabel(action: GuidanceActionModel): string {
  const stepLabel = action.nextStep?.label?.trim();
  if (stepLabel) return stepLabel;
  const journeyLabel = action.journey.nextStepLabel?.trim();
  if (journeyLabel) return journeyLabel;
  const explanationLabel = action.explanation?.nextStep?.trim();
  if (explanationLabel) return explanationLabel;
  return 'Review next step';
}

function resolvePriorityTone(action: GuidanceActionModel): 'danger' | 'elevated' | 'info' {
  if (action.priorityGroup === 'IMMEDIATE') return 'danger';
  if (action.priorityGroup === 'UPCOMING') return 'elevated';
  return 'info';
}

function stepTone(
  step: GuidanceStepDTO
): 'danger' | 'elevated' | 'good' | 'info' {
  if (step.status === 'BLOCKED') return 'danger';
  if (step.status === 'IN_PROGRESS') return 'elevated';
  if (step.status === 'COMPLETED') return 'good';
  return 'info';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuidanceOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // ---- URL param state ----
  const selectedInventoryItemId =
    searchParams.get('itemId') ?? searchParams.get('inventoryItemId');
  const selectedHomeAssetId = searchParams.get('homeAssetId');
  const selectedAssetName = searchParams.get('assetName')?.trim() ?? '';
  const selectedServiceKey = searchParams.get('serviceKey');
  const selectedIssueType = searchParams.get('issueType');

  // Infer scopeCategory: if asset params present without explicit scopeCategory, treat as ITEM
  const rawScopeCategory = searchParams.get('scopeCategory') as GuidanceScopeCategory | null;
  const scopeCategory: GuidanceScopeCategory | null =
    rawScopeCategory ??
    (selectedInventoryItemId || selectedHomeAssetId || selectedAssetName ? 'ITEM' : null);

  const hasAssetSelected = Boolean(
    selectedInventoryItemId || selectedHomeAssetId || selectedAssetName
  );
  const hasServiceSelected = Boolean(selectedServiceKey);
  const hasTargetSelected =
    scopeCategory === 'ITEM' ? hasAssetSelected : hasServiceSelected;
  const hasIssueSelected = Boolean(selectedIssueType);

  const userSelectedScopeId =
    selectedInventoryItemId ?? selectedHomeAssetId ?? selectedServiceKey ?? undefined;

  // ---- URL navigation helpers ----
  const baseHref = `/dashboard/properties/${propertyId}/tools/guidance-overview`;

  function pushParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${baseHref}?${next.toString()}`);
  }

  function navigateToScopeCategory(cat: GuidanceScopeCategory) {
    // Clear everything and set scopeCategory
    router.push(`${baseHref}?scopeCategory=${cat}`);
  }

  function navigateToAsset(option: AssetScopeOption) {
    const next = new URLSearchParams();
    next.set('scopeCategory', 'ITEM');
    if (option.inventoryItemId) {
      next.set('itemId', option.inventoryItemId);
      next.set('inventoryItemId', option.inventoryItemId);
    }
    if (option.homeAssetId) next.set('homeAssetId', option.homeAssetId);
    next.set('assetName', option.assetName);
    router.push(`${baseHref}?${next.toString()}`);
  }

  function navigateToService(serviceKey: string) {
    router.push(`${baseHref}?scopeCategory=SERVICE&serviceKey=${serviceKey}`);
  }

  function navigateToIssue(issueType: string) {
    pushParams({ issueType });
  }

  function changeAsset() {
    // Keep scopeCategory, clear everything else
    router.push(`${baseHref}?scopeCategory=${scopeCategory ?? 'ITEM'}`);
  }

  function differentIssue() {
    // Clear issueType only, keep asset/service selection
    pushParams({ issueType: null });
  }

  // ---- Data fetching ----
  const guidance = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
    userSelectedScopeId,
  });

  const inventoryQuery = useQuery({
    queryKey: ['inventory-items', propertyId],
    queryFn: () => listInventoryItems(propertyId, {}),
    enabled: Boolean(propertyId) && scopeCategory === 'ITEM',
    staleTime: 60_000,
  });

  // ---- Asset scope options (full, unsliced) ----
  const [assetSearch, setAssetSearch] = React.useState('');

  const allAssetScopeOptions = React.useMemo<AssetScopeOption[]>(() => {
    const items = inventoryQuery.data ?? [];
    const deduped: AssetScopeOption[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const idKey = `${item.id}:${item.name.toLowerCase()}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      deduped.push({
        key: item.id,
        assetName: item.name,
        systemType: item.category ?? '',
        category: item.category ?? '',
        actionCta: null,
        outOfPocketCost: item.replacementCostCents ? item.replacementCostCents / 100 : 0,
        inventoryItemId: item.id,
        homeAssetId: item.homeAssetId ?? null,
      });
    }
    return deduped;
  }, [inventoryQuery.data]);

  const filteredAssetOptions = React.useMemo(() => {
    if (!assetSearch.trim()) return allAssetScopeOptions;
    const needle = assetSearch.toLowerCase();
    return allAssetScopeOptions.filter(
      (o) =>
        o.assetName.toLowerCase().includes(needle) ||
        o.category.toLowerCase().includes(needle)
    );
  }, [allAssetScopeOptions, assetSearch]);

  // Lookup selected asset from full list
  const selectedAssetOption = React.useMemo(() => {
    if (!hasAssetSelected) return null;
    return (
      allAssetScopeOptions.find((o) => {
        if (selectedInventoryItemId && o.inventoryItemId === selectedInventoryItemId) return true;
        if (selectedHomeAssetId && o.homeAssetId === selectedHomeAssetId) return true;
        if (selectedAssetName && o.assetName.toLowerCase() === selectedAssetName.toLowerCase())
          return true;
        return false;
      }) ?? null
    );
  }, [allAssetScopeOptions, hasAssetSelected, selectedAssetName, selectedHomeAssetId, selectedInventoryItemId]);

  // ---- Guidance actions (scoped) ----
  const allActions = React.useMemo(() => guidance.actions ?? [], [guidance.actions]);

  const filteredActions = React.useMemo(() => {
    if (!hasTargetSelected) return allActions;
    const assetNameNeedle = selectedAssetName.toLowerCase();
    return allActions.filter((action) => {
      if (scopeCategory === 'SERVICE' && selectedServiceKey) {
        return (
          action.journey.scopeCategory === 'SERVICE' &&
          action.journey.serviceKey === selectedServiceKey
        );
      }
      if (selectedInventoryItemId && action.journey.inventoryItemId === selectedInventoryItemId)
        return true;
      if (selectedHomeAssetId && action.journey.homeAssetId === selectedHomeAssetId) return true;
      if (assetNameNeedle) {
        const haystack = [
          resolveAssetLabel(action),
          action.title,
          action.subtitle,
          action.nextStep?.label ?? '',
          action.journey.primarySignal?.signalIntentFamily ?? '',
          action.explanation?.what ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (haystack.includes(assetNameNeedle)) return true;
      }
      return false;
    });
  }, [allActions, hasTargetSelected, scopeCategory, selectedAssetName, selectedHomeAssetId, selectedInventoryItemId, selectedServiceKey]);

  // Further filter by issueType if one is selected (match user-initiated journeys)
  const issueFilteredActions = React.useMemo(() => {
    if (!selectedIssueType) return filteredActions;
    // Prefer journeys matching the issueType; fall back to all scoped actions
    const withIssue = filteredActions.filter(
      (a) => a.journey.issueType === selectedIssueType
    );
    return withIssue.length > 0 ? withIssue : filteredActions;
  }, [filteredActions, selectedIssueType]);

  const primaryAction = issueFilteredActions[0] ?? null;
  const hasScopedMatch = issueFilteredActions.length > 0;

  // ---- Single-journey steps (4.4) ----
  const journeyDetail = useJourney(propertyId, primaryAction?.journeyId ?? null);
  const journeySteps: GuidanceStepDTO[] = journeyDetail.data?.journey.steps ?? primaryAction?.steps ?? [];
  const currentStepIndex = journeySteps.findIndex(
    (s) => s.status === 'IN_PROGRESS' || s.status === 'PENDING'
  );

  // ---- Mutations ----
  const skipStepMutation = useMutation({
    mutationFn: ({ stepId }: { stepId: string }) =>
      skipGuidanceStep(propertyId, stepId, { reasonCode: 'USER_SKIPPED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: ({ journeyId, reason }: { journeyId: string; reason?: string }) =>
      dismissGuidanceJourney(propertyId, journeyId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      // Return to overview without issueType
      differentIssue();
    },
  });

  const startJourneyMutation = useMutation({
    mutationFn: () => {
      const scopeId =
        selectedInventoryItemId ?? selectedHomeAssetId ?? selectedServiceKey ?? '';
      return startGuidanceJourney(propertyId, {
        scopeCategory: scopeCategory ?? 'ITEM',
        scopeId,
        issueType: selectedIssueType!,
        inventoryItemId: selectedInventoryItemId ?? undefined,
        homeAssetId: selectedHomeAssetId ?? undefined,
        serviceKey: selectedServiceKey ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
    },
  });

  // ---- Derived ----
  const immediateCount = issueFilteredActions.filter((a) => a.priorityGroup === 'IMMEDIATE').length;
  const focusLabel =
    selectedAssetOption?.assetName ??
    (selectedServiceKey
      ? SERVICE_CATEGORIES.find((s) => s.key === selectedServiceKey)?.label ?? selectedServiceKey
      : null) ??
    (primaryAction ? resolveAssetLabel(primaryAction) : null);

  const suggestedIssueTypes =
    scopeCategory === 'SERVICE'
      ? (selectedServiceKey
          ? (SUGGESTED_ISSUE_TYPES_BY_SERVICE[selectedServiceKey] ?? SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT)
          : SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT)
      : SUGGESTED_ISSUE_TYPES_ITEM;
  const [customIssue, setCustomIssue] = React.useState('');

  // ---- Render helpers ----
  // Resolve the step href via the shared helper that substitutes :propertyId, :itemId, etc.
  // Never use step.routePath directly — it may contain unresolved template params.
  const resolvedJourney = journeyDetail.data?.journey ?? primaryAction?.journey ?? null;

  function renderStepCta(step: GuidanceStepDTO, isActive: boolean) {
    if (!isActive) return null;
    // Patch: if the journey lacks inventoryItemId/homeAssetId but the user explicitly
    // selected one via URL params, inject it so resolveGuidanceStepHref can substitute
    // :itemId in the route template. This handles journeys originally linked via
    // homeAsset signals where inventoryItemId was not stored on the journey row.
    const journeyForHref = resolvedJourney
      ? {
          ...resolvedJourney,
          inventoryItemId: resolvedJourney.inventoryItemId ?? selectedInventoryItemId ?? null,
          homeAssetId: resolvedJourney.homeAssetId ?? selectedHomeAssetId ?? null,
        }
      : null;
    const href = journeyForHref
      ? resolveGuidanceStepHref({ propertyId, journey: journeyForHref, step })
      : null;

    if (!href) {
      return (
        <Button className="min-h-[44px] w-full" variant="secondary" disabled>
          Next step is being prepared
        </Button>
      );
    }
    return (
      <Link
        href={href}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[hsl(var(--mobile-brand-strong))]/90"
      >
        Continue: {step.label}
      </Link>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1: No scope category → show selector
  // ---------------------------------------------------------------------------
  if (!scopeCategory) {
    return (
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-8 lg:pb-10">
        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
          <Link href={`/dashboard/properties/${propertyId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to property
          </Link>
        </Button>

        <MobilePageIntro
          eyebrow="Guidance Engine"
          title="Resolve Home Issues Step by Step"
          subtitle="Choose what you need help with to launch a guided resolution path."
        />

        {/* 4.1: Scope Category Selector */}
        <ScenarioInputCard
          title="What do you need guidance for?"
          subtitle="Select a category to get started."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => navigateToScopeCategory('ITEM')}
              className="flex flex-col items-start gap-2 rounded-xl border-2 border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-left hover:border-[hsl(var(--mobile-brand-strong))] hover:bg-[hsl(var(--mobile-brand-strong))]/5 transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100">
                <Box className="h-5 w-5 text-sky-700" />
              </div>
              <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                Get guidance for a home item
              </p>
              <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                HVAC, water heater, appliances, roof, and other home assets
              </p>
            </button>

            <button
              onClick={() => navigateToScopeCategory('SERVICE')}
              className="flex flex-col items-start gap-2 rounded-xl border-2 border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-left hover:border-[hsl(var(--mobile-brand-strong))] hover:bg-[hsl(var(--mobile-brand-strong))]/5 transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                <Sparkles className="h-5 w-5 text-emerald-700" />
              </div>
              <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                Find a service
              </p>
              <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                Warranty, insurance, inspection, cleaning, and other home services
              </p>
            </button>
          </div>
        </ScenarioInputCard>

        <ScenarioInputCard
          title="How Guidance Engine Works"
          subtitle="A deterministic path from issue detection to resolution."
        >
          <div className="space-y-2">
            <CompactEntityRow
              title="1. Choose a scope"
              subtitle="Pick a home item or service category to focus on."
              leading={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
            />
            <CompactEntityRow
              title="2. Describe the issue"
              subtitle="Tell us what's wrong — we route you to the right tools."
              leading={<Wrench className="h-4 w-4 text-sky-600" />}
            />
            <CompactEntityRow
              title="3. Follow guided steps"
              subtitle="Coverage, repair vs replace, pricing, negotiation, and booking."
              leading={<CircleAlert className="h-4 w-4 text-amber-600" />}
            />
          </div>
        </ScenarioInputCard>
      </MobilePageContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2a: ITEM scope, no asset selected → inventory picker
  // ---------------------------------------------------------------------------
  if (scopeCategory === 'ITEM' && !hasAssetSelected) {
    return (
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-8 lg:pb-10">
        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
          <Link href={`${baseHref}?scopeCategory=ITEM`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>

        <MobilePageIntro
          eyebrow="Guidance Engine · Home Item"
          title="Which item needs attention?"
          subtitle="Pick from your inventory to start the guided resolution path."
        />

        <ScenarioInputCard title="Select a home item" subtitle="All items from your inventory are shown below.">
          <input
            type="text"
            placeholder="Search home items..."
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />

          {inventoryQuery.isLoading ? (
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Loading your home items...</p>
          ) : filteredAssetOptions.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                {assetSearch
                  ? 'No items match your search.'
                  : 'No home items found. Add items to your inventory to get guidance.'}
              </p>
              {!assetSearch && (
                <ActionPriorityRow
                  primaryAction={
                    <Button asChild className="min-h-[42px] w-full">
                      <Link href={`/dashboard/properties/${propertyId}/inventory`}>Open Inventory</Link>
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssetOptions.map((option) => (
                <div key={option.key} className="space-y-2">
                  <CompactEntityRow
                    title={option.assetName}
                    subtitle={
                      option.outOfPocketCost > 0
                        ? `Estimated replacement: ${formatCurrency(option.outOfPocketCost)}`
                        : formatEnumLabel(option.category)
                    }
                    meta={formatEnumLabel(option.category)}
                    status={<StatusChip tone="info">{formatEnumLabel(option.category)}</StatusChip>}
                  />
                  <ActionPriorityRow
                    primaryAction={
                      <button
                        onClick={() => navigateToAsset(option)}
                        className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                      >
                        Guide this item: {option.assetName}
                      </button>
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </ScenarioInputCard>
      </MobilePageContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2b: SERVICE scope, no service selected → service category picker (4.6)
  // ---------------------------------------------------------------------------
  if (scopeCategory === 'SERVICE' && !hasServiceSelected) {
    return (
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-8 lg:pb-10">
        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
          <Link href={baseHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>

        <MobilePageIntro
          eyebrow="Guidance Engine · Service"
          title="Which service do you need?"
          subtitle="Select a service category to start the guided path."
        />

        <ScenarioInputCard title="Select a service" subtitle="Choose from the available service categories.">
          <div className="space-y-3">
            {SERVICE_CATEGORIES.map((svc) => (
              <div key={svc.key} className="space-y-2">
                <CompactEntityRow title={svc.label} subtitle={svc.description} />
                <ActionPriorityRow
                  primaryAction={
                    <button
                      onClick={() => navigateToService(svc.key)}
                      className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                    >
                      Get guidance: {svc.label}
                    </button>
                  }
                />
              </div>
            ))}
          </div>
        </ScenarioInputCard>
      </MobilePageContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3: Target selected, no issueType → issue selector (4.2)
  // ---------------------------------------------------------------------------
  if (hasTargetSelected && !hasIssueSelected) {
    const targetLabel =
      selectedAssetOption?.assetName ??
      SERVICE_CATEGORIES.find((s) => s.key === selectedServiceKey)?.label ??
      selectedAssetName;

    return (
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-8 lg:pb-10">
        <button
          onClick={changeAsset}
          className="inline-flex min-h-[44px] w-fit items-center px-0 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {scopeCategory === 'SERVICE' ? 'Change service' : 'Change item'}
        </button>

        <MobilePageIntro
          eyebrow={`Guidance Engine · ${scopeCategory === 'SERVICE' ? 'Service' : 'Home Item'}`}
          title={`What's the issue with ${targetLabel ?? 'this item'}?`}
          subtitle="Select the issue that best describes the problem, or enter your own."
        />

        <ScenarioInputCard
          title="Select the issue"
          subtitle="We will route you to the best resolution steps."
        >
          <div className="space-y-2">
            {suggestedIssueTypes.map((issue) => (
              <button
                key={issue.key}
                onClick={() => navigateToIssue(issue.key)}
                className="flex w-full items-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-3 text-left text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:border-[hsl(var(--mobile-brand-strong))] hover:bg-[hsl(var(--mobile-brand-strong))]/5 transition-colors"
              >
                {issue.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-[hsl(var(--mobile-text-muted))]">
              Or describe it yourself
            </p>
            <input
              type="text"
              placeholder={scopeCategory === 'SERVICE' ? 'e.g. need urgent scheduling, looking for best price...' : 'e.g. making loud noises, keeps tripping breaker...'}
              value={customIssue}
              onChange={(e) => setCustomIssue(e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
            />
            {customIssue.trim() && (
              <Button
                className="min-h-[42px] w-full"
                onClick={() => navigateToIssue(customIssue.trim())}
              >
                Continue with: {customIssue.trim()}
              </Button>
            )}
          </div>
        </ScenarioInputCard>
      </MobilePageContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4: Target + issueType selected → journey view
  // ---------------------------------------------------------------------------

  const startLabel =
    selectedAssetOption?.assetName ??
    SERVICE_CATEGORIES.find((s) => s.key === selectedServiceKey)?.label ??
    selectedAssetName ??
    'your item';

  const issueLabelDisplay =
    suggestedIssueTypes.find((i) => i.key === selectedIssueType)?.label ??
    selectedIssueType ??
    '';

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Guidance Engine"
        title={`Resolving: ${startLabel}`}
        subtitle={issueLabelDisplay ? `Issue: ${issueLabelDisplay}` : 'Follow the guided steps below to resolve this issue end to end.'}
      />

      {/* Scope context bar with override controls */}
      <ScenarioInputCard
        title={`${startLabel} · ${issueLabelDisplay}`}
        subtitle="Your guided resolution path is active."
        actions={
          <div className="flex gap-2">
            {/* 4.5: Change asset control */}
            <Button
              variant="ghost"
              className="min-h-[36px] flex-1 text-xs"
              onClick={changeAsset}
            >
              Change {scopeCategory === 'SERVICE' ? 'service' : 'item'}
            </Button>
            {/* 4.5: Different issue control */}
            <Button
              variant="ghost"
              className="min-h-[36px] flex-1 text-xs"
              onClick={differentIssue}
            >
              Different issue
            </Button>
          </div>
        }
      >
        <p className="text-xs text-[hsl(var(--mobile-text-muted))]">
          {scopeCategory === 'SERVICE' ? 'Service guidance' : 'Item guidance'} ·{' '}
          {hasScopedMatch ? 'Active journey found' : 'Ready to start'}
        </p>
      </ScenarioInputCard>

      {/* Journey load states */}
      {guidance.isLoading ? (
        <ScenarioInputCard title="Loading guidance" subtitle="Fetching your active journeys.">
          <p className="text-sm text-slate-600">Please wait while we prepare your next best actions.</p>
        </ScenarioInputCard>
      ) : guidance.isError ? (
        <ScenarioInputCard title="Guidance unavailable" subtitle="Could not load journeys right now.">
          <p className="text-sm text-rose-700">Try refreshing the page or contact support.</p>
        </ScenarioInputCard>
      ) : !hasScopedMatch ? (
        // 4.3: No journey → start button
        <ScenarioInputCard
          title={`Start guided journey for ${startLabel}`}
          subtitle={`Issue: ${issueLabelDisplay}`}
          badge={<StatusChip tone="elevated">Ready to start</StatusChip>}
        >
          {startJourneyMutation.isSuccess ? (
            <p className="text-sm text-emerald-700">
              Journey created. Loading your steps…
            </p>
          ) : startJourneyMutation.isPending ? (
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
              Creating your guided journey…
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
                No existing guidance journey was found for this item and issue. We will create a personalised step-by-step plan for you now.
              </p>
              {startJourneyMutation.isError && (
                <p className="mb-2 text-sm text-rose-700">
                  Something went wrong. Please try again.
                </p>
              )}
              <Button
                className="min-h-[44px] w-full"
                onClick={() => startJourneyMutation.mutate()}
              >
                Start guided journey
              </Button>
            </>
          )}
        </ScenarioInputCard>
      ) : (
        <>
          {/* Primary action card with steps from the single journey (4.4) */}
          {primaryAction && (
            <ScenarioInputCard
              title={`${focusLabel ?? resolveAssetLabel(primaryAction)}`}
              subtitle={resolvePrimarySubtitle(primaryAction)}
              badge={
                <StatusChip tone={resolvePriorityTone(primaryAction)}>
                  {primaryAction.priorityGroup.toLowerCase()}
                </StatusChip>
              }
            >
              {/* 4.5: Not relevant control */}
              <div className="flex justify-end">
                <button
                  onClick={() =>
                    dismissMutation.mutate({ journeyId: primaryAction.journeyId })
                  }
                  disabled={dismissMutation.isPending}
                  className="text-xs text-[hsl(var(--mobile-text-muted))] hover:text-rose-600 disabled:opacity-50"
                >
                  Not relevant
                </button>
              </div>

              {/* Progress strip */}
              {journeySteps.length > 0 && (
                <div className="mb-2">
                  <GuidanceJourneyStrip steps={journeySteps} />
                  <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                    Step {Math.max(currentStepIndex, 0) + 1} of {journeySteps.length}
                  </p>
                </div>
              )}

              {/* Why now */}
              <div className="space-y-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3">
                <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                  Why now
                </p>
                <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
                  {primaryAction.explanation?.why ??
                    primaryAction.subtitle ??
                    'Following this journey now reduces cost and execution risk.'}
                </p>
                {primaryAction.costOfDelay ? (
                  <p className="mb-0 text-sm font-semibold text-amber-700">
                    Potential delay cost: ~{formatCurrency(primaryAction.costOfDelay)}
                  </p>
                ) : null}
              </div>

              {/* Active step CTA */}
              {currentStepIndex >= 0 && journeySteps[currentStepIndex] && (
                <ActionPriorityRow
                  primaryAction={renderStepCta(journeySteps[currentStepIndex], true)}
                />
              )}

              {/* 4.5: Skip button for active step */}
              {primaryAction.currentStep?.id && (
                <Button
                  variant="ghost"
                  className="mt-1 min-h-[40px] w-full text-sm text-[hsl(var(--mobile-text-muted))]"
                  disabled={skipStepMutation.isPending}
                  onClick={() => {
                    if (primaryAction.currentStep?.id) {
                      skipStepMutation.mutate({ stepId: primaryAction.currentStep.id });
                    }
                  }}
                >
                  Skip this step
                </Button>
              )}
            </ScenarioInputCard>
          )}

          {/* 4.4: Journey Steps — ordered steps of the single primary journey */}
          <ScenarioInputCard
            title="Journey Steps"
            subtitle="All steps for this guided resolution path, in order."
          >
            {journeySteps.length === 0 ? (
              <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                Steps are being prepared for this journey.
              </p>
            ) : (
              <div className="space-y-3">
                {journeySteps.map((step, idx) => {
                  const isActiveStep = idx === currentStepIndex;
                  const isFutureStep =
                    currentStepIndex >= 0 ? idx > currentStepIndex : step.status === 'PENDING';
                  const isCompletedStep = step.status === 'COMPLETED' || step.status === 'SKIPPED';

                  return (
                    <div
                      key={step.id}
                      className={
                        isFutureStep && !isActiveStep
                          ? 'opacity-50'
                          : ''
                      }
                    >
                      <CompactEntityRow
                        title={`Step ${step.stepOrder}: ${step.label}`}
                        subtitle={step.description ?? undefined}
                        meta={isCompletedStep ? 'Completed' : isActiveStep ? 'Current step' : 'Upcoming'}
                        status={
                          <StatusChip tone={stepTone(step)}>
                            {step.status.toLowerCase().replace('_', ' ')}
                          </StatusChip>
                        }
                      />
                      {isActiveStep && (
                        <>
                          <ActionPriorityRow
                            primaryAction={renderStepCta(step, true)}
                          />
                          {/* 4.5: Skip per step in list */}
                          <Button
                            variant="ghost"
                            className="min-h-[40px] w-full text-sm text-[hsl(var(--mobile-text-muted))]"
                            disabled={skipStepMutation.isPending}
                            onClick={() => skipStepMutation.mutate({ stepId: step.id })}
                          >
                            Skip this step
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScenarioInputCard>
        </>
      )}

      {/* Fallback tools when no journey exists for ITEM scope */}
      {!hasScopedMatch && scopeCategory === 'ITEM' && selectedAssetOption && (
        <ScenarioInputCard
          title="Explore related tools"
          subtitle="While your journey is being set up, you can use these tools directly."
        >
          <div className="space-y-2">
            {selectedAssetOption.inventoryItemId && (
              <ActionPriorityRow
                primaryAction={
                  <Link
                    href={appendScopeParams(
                      `/dashboard/properties/${propertyId}/inventory/items/${selectedAssetOption.inventoryItemId}/replace-repair`,
                      selectedAssetOption
                    )}
                    className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                  >
                    Repair vs Replace Analysis
                  </Link>
                }
              />
            )}
            <ActionPriorityRow
              primaryAction={
                <Link
                  href={appendScopeParams(
                    `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,
                    selectedAssetOption
                  )}
                  className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                >
                  Check Coverage
                </Link>
              }
            />
            <ActionPriorityRow
              primaryAction={
                <Link
                  href={buildProvidersHref(propertyId, selectedAssetOption)}
                  className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                >
                  Find Providers
                </Link>
              }
            />
          </div>
        </ScenarioInputCard>
      )}
    </MobilePageContainer>
  );
}
