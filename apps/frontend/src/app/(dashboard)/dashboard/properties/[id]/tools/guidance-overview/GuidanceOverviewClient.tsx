'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Box,
  ChevronRight,
  CircleAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
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
import { GuidanceInventoryDrawer } from '@/components/guidance/GuidanceInventoryDrawer';
import { GuidanceJourneyStrip } from '@/components/guidance/GuidanceJourneyStrip';
import { VerifyHistoryStep } from '@/components/guidance/VerifyHistoryStep';
import { RepairReplaceGate } from '@/components/guidance/RepairReplaceGate';
import { NegotiationShieldInline } from '@/components/guidance/NegotiationShieldInline';
import { CoverageCheckInline } from '@/components/guidance/CoverageCheckInline';
import { PriceCheckInline } from '@/components/guidance/PriceCheckInline';
import { RecallCheckInline } from '@/components/guidance/RecallCheckInline';
import { getProviderCategoryForSystemType } from '@/lib/config/serviceCategoryMapping';
import { getGuidanceItemVisual } from '@/components/guidance/guidanceItemVisual';
import { cn } from '@/lib/utils';
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

// Generic fallback — used when no category-specific list matches
const SUGGESTED_ISSUE_TYPES_ITEM = [
  { key: 'not_working', label: 'Not working properly' },
  { key: 'past_life', label: 'Aging or past expected life' },
  { key: 'broken', label: 'Broken or damaged' },
  { key: 'inspection_needed', label: 'Needs inspection or maintenance' },
  { key: 'coverage_question', label: 'Coverage or warranty question' },
  { key: 'cost_estimate', label: 'Need a cost estimate' },
];

// Name-based overrides within APPLIANCE — matched by lowercase keyword in asset name.
// Checked before the category-level fallback so "Washer Dryer" gets washer issues,
// not oven/cooking issues.
const APPLIANCE_ISSUES_BY_NAME: Array<{
  keywords: string[];
  issues: { key: string; label: string }[];
}> = [
  {
    keywords: ['washer', 'dryer', 'washing machine', 'laundry'],
    issues: [
      { key: 'not_working', label: 'Not working properly' },
      { key: 'not_draining', label: 'Not draining or spinning' },
      { key: 'not_drying', label: 'Not drying clothes properly' },
      { key: 'leak', label: 'Leaking water' },
      { key: 'unusual_noise', label: 'Making unusual noise or vibration' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
    ],
  },
  {
    keywords: ['refrigerator', 'fridge', 'freezer'],
    issues: [
      { key: 'not_cooling', label: 'Not cooling or freezing properly' },
      { key: 'ice_maker', label: 'Ice maker or water dispenser not working' },
      { key: 'unusual_noise', label: 'Making unusual noise' },
      { key: 'leak', label: 'Leaking water' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
      { key: 'cost_estimate', label: 'Need a repair or replacement cost estimate' },
    ],
  },
  {
    keywords: ['dishwasher'],
    issues: [
      { key: 'not_cleaning', label: 'Not cleaning dishes properly' },
      { key: 'not_draining', label: 'Not draining' },
      { key: 'leak', label: 'Leaking water' },
      { key: 'door_issue', label: 'Door not latching or sealing' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'unusual_noise', label: 'Making unusual noise' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
    ],
  },
  {
    keywords: ['oven', 'range', 'stove', 'cooktop', 'microwave'],
    issues: [
      { key: 'not_working', label: 'Not working properly' },
      { key: 'not_heating', label: 'Not heating or cooking evenly' },
      { key: 'burner_issue', label: 'Burner or element not working' },
      { key: 'error_code', label: 'Showing an error code or warning light' },
      { key: 'unusual_noise', label: 'Making unusual noise' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
      { key: 'cost_estimate', label: 'Need a repair or replacement cost estimate' },
    ],
  },
  {
    keywords: ['water heater', 'water heater'],
    issues: [
      { key: 'no_hot_water', label: 'No hot water' },
      { key: 'leak', label: 'Leaking or dripping' },
      { key: 'unusual_noise', label: 'Rumbling or unusual noise' },
      { key: 'past_life', label: 'Aging or past expected life' },
      { key: 'high_utility_cost', label: 'Unusually high energy bills' },
      { key: 'coverage_question', label: 'Warranty or coverage question' },
      { key: 'cost_estimate', label: 'Need a replacement cost estimate' },
    ],
  },
];

function resolveApplianceIssues(assetName: string): { key: string; label: string }[] | null {
  const lower = assetName.toLowerCase();
  for (const entry of APPLIANCE_ISSUES_BY_NAME) {
    if (entry.keywords.some((kw) => lower.includes(kw))) return entry.issues;
  }
  return null;
}

// Per-category issue types — keys match InventoryItemCategory enum values
const SUGGESTED_ISSUE_TYPES_BY_CATEGORY: Record<string, { key: string; label: string }[]> = {
  APPLIANCE: [
    { key: 'not_working', label: 'Not working properly' },
    { key: 'error_code', label: 'Showing an error code or warning light' },
    { key: 'unusual_noise', label: 'Making unusual noise or vibration' },
    { key: 'broken', label: 'Broken, cracked, or physically damaged' },
    { key: 'past_life', label: 'Aging or past expected life' },
    { key: 'coverage_question', label: 'Warranty or coverage question' },
    { key: 'cost_estimate', label: 'Need a repair or replacement cost estimate' },
  ],
  HVAC: [
    { key: 'not_cooling', label: 'Not cooling' },
    { key: 'not_heating', label: 'Not heating' },
    { key: 'poor_airflow', label: 'Poor airflow or uneven temperatures' },
    { key: 'unusual_noise', label: 'Making unusual noise' },
    { key: 'high_utility_cost', label: 'Unusually high energy bills' },
    { key: 'past_life', label: 'Aging or past expected life' },
    { key: 'inspection_needed', label: 'Needs seasonal inspection or tune-up' },
    { key: 'coverage_question', label: 'Warranty or coverage question' },
  ],
  PLUMBING: [
    { key: 'leak', label: 'Leaking or dripping' },
    { key: 'low_pressure', label: 'Low water pressure' },
    { key: 'no_hot_water', label: 'No hot water' },
    { key: 'slow_drain', label: 'Slow drain or clog' },
    { key: 'unusual_noise', label: 'Banging or unusual pipe noise' },
    { key: 'past_life', label: 'Aging or past expected life' },
    { key: 'inspection_needed', label: 'Needs inspection or maintenance' },
    { key: 'cost_estimate', label: 'Need a cost estimate' },
  ],
  ELECTRICAL: [
    { key: 'not_working', label: 'Not working or no power' },
    { key: 'tripping_breaker', label: 'Tripping circuit breaker' },
    { key: 'flickering', label: 'Flickering lights or power fluctuations' },
    { key: 'outlet_issue', label: 'Outlet or switch not functioning' },
    { key: 'past_life', label: 'Panel or wiring aging or outdated' },
    { key: 'inspection_needed', label: 'Needs safety inspection' },
    { key: 'coverage_question', label: 'Coverage or warranty question' },
    { key: 'cost_estimate', label: 'Need a cost estimate' },
  ],
  ROOF_EXTERIOR: [
    { key: 'leak', label: 'Leaking or water intrusion' },
    { key: 'visible_damage', label: 'Visible damage (missing shingles, dents, cracks)' },
    { key: 'past_life', label: 'Aging or near end of life' },
    { key: 'inspection_needed', label: 'Needs inspection after storm or event' },
    { key: 'gutter_issue', label: 'Gutter or drainage issue' },
    { key: 'coverage_question', label: 'Insurance or warranty question' },
    { key: 'cost_estimate', label: 'Need a repair or replacement estimate' },
  ],
  SAFETY: [
    { key: 'not_working', label: 'Device not working or alarming unexpectedly' },
    { key: 'battery_low', label: 'Low battery or needs replacement' },
    { key: 'past_life', label: 'Past recommended replacement date' },
    { key: 'inspection_needed', label: 'Needs testing or professional inspection' },
    { key: 'coverage_question', label: 'Coverage or warranty question' },
  ],
  SMART_HOME: [
    { key: 'not_working', label: 'Device not responding or offline' },
    { key: 'connectivity_issue', label: 'Connectivity or pairing issue' },
    { key: 'error_code', label: 'Showing an error or fault code' },
    { key: 'past_life', label: 'Outdated or past expected life' },
    { key: 'cost_estimate', label: 'Need a replacement cost estimate' },
  ],
};

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

// FRD-FR-01: Category filter tabs for the ITEM inventory picker.
// Keys match InventoryItemCategory enum values from the Prisma schema.
const INVENTORY_CATEGORY_TABS: { key: string; label: string }[] = [
  { key: 'ALL',          label: 'All' },
  { key: 'APPLIANCE',    label: 'Appliances' },
  { key: 'HVAC',         label: 'HVAC' },
  { key: 'PLUMBING',     label: 'Plumbing' },
  { key: 'ELECTRICAL',   label: 'Electrical' },
  { key: 'ROOF_EXTERIOR',label: 'Roof & Exterior' },
  { key: 'SAFETY',       label: 'Safety' },
  { key: 'SMART_HOME',   label: 'Smart Home' },
  { key: 'OTHER',        label: 'Other' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Semantic icon + subtle tint per inventory category — used in the item picker list

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
  // Phase 6c: direct journey resume — bypasses the wizard when present
  const pinnedJourneyId = searchParams.get('journeyId');

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
  // FRD-FR-01: active category tab in the ITEM picker ('ALL' = no filter)
  const [selectedCategory, setSelectedCategory] = React.useState<string>('ALL');
  // Drawer: which item row is expanded in the detail panel
  const [selectedDrawerOption, setSelectedDrawerOption] = React.useState<AssetScopeOption | null>(null);

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
    let opts = allAssetScopeOptions;
    // FRD-FR-01: category tab filter
    if (selectedCategory !== 'ALL') {
      opts = opts.filter((o) => o.category === selectedCategory);
    }
    // text search
    if (assetSearch.trim()) {
      const needle = assetSearch.toLowerCase();
      opts = opts.filter(
        (o) =>
          o.assetName.toLowerCase().includes(needle) ||
          o.category.toLowerCase().includes(needle)
      );
    }
    return opts;
  }, [allAssetScopeOptions, assetSearch, selectedCategory]);

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

  // Full InventoryItem for the drawer — looked up from the already-fetched list
  const selectedDrawerItem = React.useMemo(() => {
    if (!selectedDrawerOption?.inventoryItemId) return null;
    return (inventoryQuery.data ?? []).find((i) => i.id === selectedDrawerOption.inventoryItemId) ?? null;
  }, [selectedDrawerOption, inventoryQuery.data]);

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
  // Phase 6c: fetch pinned journey detail when arriving via journeyId URL param
  const pinnedJourneyDetail = useJourney(propertyId, pinnedJourneyId ?? null);
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

  const suggestedIssueTypes = React.useMemo(() => {
    if (scopeCategory === 'SERVICE') {
      return selectedServiceKey
        ? (SUGGESTED_ISSUE_TYPES_BY_SERVICE[selectedServiceKey] ?? SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT)
        : SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT;
    }
    const category = selectedAssetOption?.category ?? null;
    const assetName = selectedAssetOption?.assetName ?? selectedAssetName;
    // For APPLIANCE, attempt a name-based sub-match first (washer ≠ oven ≠ fridge)
    if (category === 'APPLIANCE' && assetName) {
      const named = resolveApplianceIssues(assetName);
      if (named) return named;
    }
    return category
      ? (SUGGESTED_ISSUE_TYPES_BY_CATEGORY[category] ?? SUGGESTED_ISSUE_TYPES_ITEM)
      : SUGGESTED_ISSUE_TYPES_ITEM;
  }, [scopeCategory, selectedServiceKey, selectedAssetOption, selectedAssetName]);
  const [customIssue, setCustomIssue] = React.useState('');

  // ---- Phase 6c: pinned journey mode ----
  const pinnedAction = React.useMemo(
    () => (pinnedJourneyId ? (allActions.find((a) => a.journeyId === pinnedJourneyId) ?? null) : null),
    [pinnedJourneyId, allActions]
  );
  const isInPinnedMode = Boolean(pinnedJourneyId);
  // When pinned, use the pinned journey's action + detail so Step 4 renders directly.
  const activePrimaryAction = isInPinnedMode ? (pinnedAction ?? primaryAction) : primaryAction;
  const activeJourneyDetail = isInPinnedMode ? pinnedJourneyDetail : journeyDetail;
  const activeJourneySteps: GuidanceStepDTO[] =
    activeJourneyDetail.data?.journey.steps ?? activePrimaryAction?.steps ?? [];
  const activeStepIndex = activeJourneySteps.findIndex(
    (s) => s.status === 'IN_PROGRESS' || s.status === 'PENDING'
  );
  const activeHasScopedMatch = isInPinnedMode ? Boolean(activePrimaryAction) : hasScopedMatch;

  // ---- Render helpers ----
  // Resolve the step href via the shared helper that substitutes :propertyId, :itemId, etc.
  // Never use step.routePath directly — it may contain unresolved template params.
  const resolvedJourney = activeJourneyDetail.data?.journey ?? activePrimaryAction?.journey ?? null;

  function renderStepCta(step: GuidanceStepDTO, isActive: boolean) {
    if (!isActive) return null;

    // FRD-FR-03/04: Inline verify_history step — render the VerifyHistoryStep form
    // instead of navigating to a separate page (history-verify has no routePath).
    if (step.toolKey === 'history-verify' && activePrimaryAction) {
      const journeyInventoryItemId =
        resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
      const assetCategory =
        resolvedJourney?.inventoryItem?.category ?? selectedAssetOption?.category ?? null;
      const displayAssetName =
        resolvedJourney?.inventoryItem?.name?.trim() ||
        selectedAssetOption?.assetName ||
        'this item';
      return (
        <VerifyHistoryStep
          propertyId={propertyId}
          journeyId={activePrimaryAction.journeyId}
          stepId={step.id}
          stepKey={step.stepKey}
          inventoryItemId={journeyInventoryItemId}
          assetCategory={assetCategory}
          assetName={displayAssetName}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
          }}
        />
      );
    }

    // FRD-FR-07: Inline repair vs replace gate for high-value asset decisions.
    // Only renders inline when inventoryItemId is available; otherwise falls through
    // to the standard navigation link for the replace-repair page.
    if (step.toolKey === 'replace-repair' && activePrimaryAction) {
      const gateItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
      if (gateItemId) {
        const displayAssetName =
          resolvedJourney?.inventoryItem?.name?.trim() ||
          selectedAssetOption?.assetName ||
          'this item';
        return (
          <RepairReplaceGate
            propertyId={propertyId}
            inventoryItemId={gateItemId}
            journeyId={activePrimaryAction.journeyId}
            stepId={step.id}
            stepKey={step.stepKey}
            assetName={displayAssetName}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
              queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
            }}
          />
        );
      }
    }

    // Inline coverage check for check_coverage step — no page navigation.
    if (step.toolKey === 'coverage-intelligence' && activePrimaryAction) {
      const coverageItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
      const displayAssetName =
        resolvedJourney?.inventoryItem?.name?.trim() ||
        selectedAssetOption?.assetName ||
        'this item';
      return (
        <CoverageCheckInline
          propertyId={propertyId}
          journeyId={activePrimaryAction.journeyId}
          stepId={step.id}
          stepKey={step.stepKey}
          inventoryItemId={coverageItemId}
          assetName={displayAssetName}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
          }}
        />
      );
    }

    // Inline price check for validate_price / estimate_improvement_cost steps.
    if (step.toolKey === 'service-price-radar' && activePrimaryAction) {
      const priceItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
      const priceItemCategory =
        resolvedJourney?.inventoryItem?.category ?? selectedAssetOption?.category ?? null;
      const displayAssetName =
        resolvedJourney?.inventoryItem?.name?.trim() ||
        selectedAssetOption?.assetName ||
        'this item';
      return (
        <PriceCheckInline
          propertyId={propertyId}
          journeyId={activePrimaryAction.journeyId}
          stepId={step.id}
          stepKey={step.stepKey}
          inventoryItemId={priceItemId}
          inventoryItemCategory={priceItemCategory}
          assetName={displayAssetName}
          issueType={resolvedJourney?.issueType ?? selectedIssueType ?? null}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
          }}
        />
      );
    }

    // Inline recall check for safety_alert, check_recall_coverage,
    // review_remedy_instructions, recall_resolution steps.
    if (step.toolKey === 'recalls' && activePrimaryAction) {
      const recallItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
      const displayAssetName =
        resolvedJourney?.inventoryItem?.name?.trim() ||
        selectedAssetOption?.assetName ||
        'this item';
      return (
        <RecallCheckInline
          propertyId={propertyId}
          journeyId={activePrimaryAction.journeyId}
          stepId={step.id}
          stepKey={step.stepKey}
          inventoryItemId={recallItemId}
          assetName={displayAssetName}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
          }}
        />
      );
    }

    // FRD-FR-09: Inline NegotiationShield for prepare_negotiation step.
    if (step.toolKey === 'negotiation-shield' && activePrimaryAction) {
      const nsItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
      const displayAssetName =
        resolvedJourney?.inventoryItem?.name?.trim() ||
        selectedAssetOption?.assetName ||
        'this service';
      return (
        <NegotiationShieldInline
          propertyId={propertyId}
          journeyId={activePrimaryAction.journeyId}
          stepId={step.id}
          stepKey={step.stepKey}
          inventoryItemId={nsItemId}
          assetName={displayAssetName}
          issueType={resolvedJourney?.issueType ?? selectedIssueType ?? null}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
            queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
          }}
        />
      );
    }

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
  // Step 1: No scope category → show selector (skipped in pinned mode)
  // ---------------------------------------------------------------------------
  if (!scopeCategory && !isInPinnedMode) {
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
  // Step 2a: ITEM scope, no asset selected → inventory picker (skipped in pinned mode)
  // ---------------------------------------------------------------------------
  if (scopeCategory === 'ITEM' && !hasAssetSelected && !isInPinnedMode) {
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
          {/* FRD-FR-01: Category filter tabs — only render tabs whose category has ≥1 item */}
          {allAssetScopeOptions.length > 0 && (() => {
            const presentCategories = new Set(allAssetScopeOptions.map((o) => o.category));
            const visibleTabs = INVENTORY_CATEGORY_TABS.filter(
              (t) => t.key === 'ALL' || presentCategories.has(t.key)
            );
            if (visibleTabs.length <= 2) return null; // only "All" + 1 category → no tabs needed
            return (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setSelectedCategory(tab.key);
                      setAssetSearch('');
                    }}
                    className={[
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selectedCategory === tab.key
                        ? 'border-[hsl(var(--mobile-brand-strong))] bg-[hsl(var(--mobile-brand-strong))] text-white'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))] hover:border-[hsl(var(--mobile-brand-strong))]/60 hover:text-[hsl(var(--mobile-text-primary))]',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            );
          })()}
          <input
            type="text"
            placeholder={selectedCategory === 'ALL' ? 'Search home items...' : `Search ${INVENTORY_CATEGORY_TABS.find(t => t.key === selectedCategory)?.label ?? 'items'}...`}
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />

          {inventoryQuery.isLoading ? (
            // Skeleton rows while inventory loads
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3.5">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-slate-100" />
                  <div className="flex-1 space-y-1.5">
                    <span className="block h-4 w-32 animate-pulse rounded bg-slate-100" />
                    <span className="block h-3 w-20 animate-pulse rounded bg-slate-100" />
                  </div>
                  <span className="h-4 w-4 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredAssetOptions.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                {assetSearch
                  ? 'No items match your search.'
                  : selectedCategory !== 'ALL'
                  ? `No ${INVENTORY_CATEGORY_TABS.find(t => t.key === selectedCategory)?.label ?? 'items'} found in your inventory.`
                  : 'No home items found. Add items to your inventory to get guidance.'}
              </p>
              {!assetSearch && selectedCategory === 'ALL' && (
                <ActionPriorityRow
                  primaryAction={
                    <Button asChild className="min-h-[42px] w-full">
                      <Link href={`/dashboard/properties/${propertyId}/inventory`}>Open Inventory</Link>
                    </Button>
                  }
                />
              )}
              {!assetSearch && selectedCategory !== 'ALL' && (
                <button
                  onClick={() => setSelectedCategory('ALL')}
                  className="text-sm text-[hsl(var(--mobile-brand-strong))] underline-offset-2 hover:underline"
                >
                  Show all categories
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredAssetOptions.map((option) => {
                const isSelected = selectedDrawerOption?.key === option.key;
                const { icon: Icon, bg, color, selectedBg, selectedColor } = getGuidanceItemVisual({
                  name: option.assetName,
                  category: option.category,
                });
                return (
                  <button
                    key={option.key}
                    onClick={() => setSelectedDrawerOption(option)}
                    className={cn(
                      'group w-full text-left flex items-center gap-3 rounded-xl border px-4 py-3.5',
                      'transition-all active:scale-[0.99]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1',
                      isSelected
                        ? 'border-sky-200 bg-sky-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm'
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                        isSelected
                          ? cn(selectedBg, selectedColor)
                          : cn(bg, color)
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'truncate text-sm font-semibold',
                        isSelected ? 'text-sky-900' : 'text-slate-900'
                      )}>
                        {option.assetName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {formatEnumLabel(option.category)}
                        {option.outOfPocketCost > 0
                          ? ` · ~${formatCurrency(option.outOfPocketCost)}`
                          : ''}
                      </p>
                    </div>
                    <ChevronRight className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isSelected ? 'text-sky-500' : 'text-slate-400 group-hover:text-slate-600'
                    )} />
                  </button>
                );
              })}
            </div>
          )}
        </ScenarioInputCard>

        {/* Item detail drawer — opens when a row is tapped */}
        <GuidanceInventoryDrawer
          item={selectedDrawerItem}
          isOpen={selectedDrawerOption !== null}
          onClose={() => setSelectedDrawerOption(null)}
          onStartGuidance={() => {
            if (selectedDrawerOption) {
              navigateToAsset(selectedDrawerOption);
              setSelectedDrawerOption(null);
            }
          }}
        />
      </MobilePageContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2b: SERVICE scope, no service selected → service category picker (4.6) (skipped in pinned mode)
  // ---------------------------------------------------------------------------
  if (scopeCategory === 'SERVICE' && !hasServiceSelected && !isInPinnedMode) {
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
  // Step 3: Target selected, no issueType → issue selector (4.2) (skipped in pinned mode)
  // ---------------------------------------------------------------------------
  if (hasTargetSelected && !hasIssueSelected && !isInPinnedMode) {
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
    (isInPinnedMode && activePrimaryAction ? resolveAssetLabel(activePrimaryAction) : null) ??
    'your item';

  const issueLabelDisplay =
    suggestedIssueTypes.find((i) => i.key === selectedIssueType)?.label ??
    selectedIssueType ??
    (isInPinnedMode ? (activePrimaryAction?.journey.issueType ?? '') : '') ??
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
          {activeHasScopedMatch ? 'Active journey found' : 'Ready to start'}
        </p>
      </ScenarioInputCard>

      {/* Journey load states */}
      {guidance.isLoading || (isInPinnedMode && pinnedJourneyDetail.isLoading) ? (
        <ScenarioInputCard title="Loading guidance" subtitle="Fetching your active journeys.">
          <p className="text-sm text-slate-600">Please wait while we prepare your next best actions.</p>
        </ScenarioInputCard>
      ) : guidance.isError ? (
        <ScenarioInputCard title="Guidance unavailable" subtitle="Could not load journeys right now.">
          <p className="text-sm text-rose-700">Try refreshing the page or contact support.</p>
        </ScenarioInputCard>
      ) : !activeHasScopedMatch ? (
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
          {activePrimaryAction && (
            <ScenarioInputCard
              title={`${focusLabel ?? resolveAssetLabel(activePrimaryAction)}`}
              subtitle={resolvePrimarySubtitle(activePrimaryAction)}
              badge={
                <StatusChip tone={resolvePriorityTone(activePrimaryAction)}>
                  {activePrimaryAction.priorityGroup.toLowerCase()}
                </StatusChip>
              }
            >
              {/* 4.5: Not relevant control */}
              <div className="flex justify-end">
                <button
                  onClick={() =>
                    dismissMutation.mutate({ journeyId: activePrimaryAction.journeyId })
                  }
                  disabled={dismissMutation.isPending}
                  className="text-xs text-[hsl(var(--mobile-text-muted))] hover:text-rose-600 disabled:opacity-50"
                >
                  Not relevant
                </button>
              </div>

              {/* Progress strip */}
              {activeJourneySteps.length > 0 && (
                <div className="mb-2">
                  <GuidanceJourneyStrip steps={activeJourneySteps} />
                  <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                    Step {Math.max(activeStepIndex, 0) + 1} of {activeJourneySteps.length}
                  </p>
                </div>
              )}

              {/* Why now */}
              <div className="space-y-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3">
                <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                  Why now
                </p>
                <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
                  {activePrimaryAction.explanation?.why ??
                    activePrimaryAction.subtitle ??
                    'Following this journey now reduces cost and execution risk.'}
                </p>
                {activePrimaryAction.costOfDelay ? (
                  <p className="mb-0 text-sm font-semibold text-amber-700">
                    Potential delay cost: ~{formatCurrency(activePrimaryAction.costOfDelay)}
                  </p>
                ) : null}
              </div>

              {/* Active step CTA */}
              {activeStepIndex >= 0 && activeJourneySteps[activeStepIndex] && (
                <ActionPriorityRow
                  primaryAction={renderStepCta(activeJourneySteps[activeStepIndex], true)}
                />
              )}

              {/* 4.5: Skip button for active step */}
              {activePrimaryAction.currentStep?.id && (
                <Button
                  variant="ghost"
                  className="mt-1 min-h-[40px] w-full text-sm text-[hsl(var(--mobile-text-muted))]"
                  disabled={skipStepMutation.isPending}
                  onClick={() => {
                    if (activePrimaryAction.currentStep?.id) {
                      skipStepMutation.mutate({ stepId: activePrimaryAction.currentStep.id });
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
            {activeJourneySteps.length === 0 ? (
              <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                Steps are being prepared for this journey.
              </p>
            ) : (
              <div className="space-y-3">
                {activeJourneySteps.map((step, idx) => {
                  const isActiveStep = idx === activeStepIndex;
                  const isFutureStep =
                    activeStepIndex >= 0 ? idx > activeStepIndex : step.status === 'PENDING';
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
      {!activeHasScopedMatch && scopeCategory === 'ITEM' && selectedAssetOption && (
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
