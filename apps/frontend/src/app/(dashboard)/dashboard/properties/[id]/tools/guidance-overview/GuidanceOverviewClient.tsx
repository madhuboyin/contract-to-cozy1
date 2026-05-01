'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  Box,
  Check,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  ActionPriorityRow,
  CompactEntityRow,
  MobilePageContainer,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { useJourney } from '@/features/guidance/hooks/useJourney';
import { mapGuidanceJourneyToActionModel, type GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { formatIssueDomain, formatIssueTypeLabel, resolveGuidanceStepHref } from '@/features/guidance/utils/guidanceDisplay';
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
import GuidedJourneyTemplate from './components/GuidedJourneyTemplate';
import TrustStrip from '../../components/route-templates/TrustStrip';
import { guidanceEngineTrust } from '@/lib/trust/trustPresets';
import { track } from '@/lib/analytics/events';

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

function formatFreshnessLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Updated recently';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'Updated recently';
  const diffMs = Date.now() - parsed.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return `Updated ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  return `Updated ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function resolveConfidenceDots(label: GuidanceActionModel['confidenceLabel']): number {
  if (label === 'HIGH') return 5;
  if (label === 'MEDIUM') return 3;
  if (label === 'LOW') return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuidanceOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (propertyId) {
      track('workflow_started', { tool: 'guidance-overview', propertyId, entryPoint: 'direct' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // ---- URL param state ----
  const selectedInventoryItemId =
    searchParams.get('itemId') ?? searchParams.get('inventoryItemId');
  const selectedHomeAssetId = searchParams.get('homeAssetId');
  const selectedAssetName = searchParams.get('assetName')?.trim() ?? '';
  const selectedServiceKey = searchParams.get('serviceKey');
  const selectedIssueType = searchParams.get('issueType');
  // Phase 6c: direct journey resume — bypasses the wizard when present
  const pinnedJourneyId = searchParams.get('journeyId');
  const requestedStepKey =
    searchParams.get('stepKey') ?? searchParams.get('guidanceStepKey');

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
  const [showAllIssueTypes, setShowAllIssueTypes] = React.useState(false);
  const [selectedJourneyStepKey, setSelectedJourneyStepKey] = React.useState<string | null>(
    requestedStepKey
  );

  React.useEffect(() => {
    setShowAllIssueTypes(false);
  }, [selectedInventoryItemId, selectedHomeAssetId, selectedServiceKey, selectedAssetName, scopeCategory]);

  // ---- Phase 6c: pinned journey mode ----
  const pinnedAction = React.useMemo(
    () => {
      if (!pinnedJourneyId) return null;

      const existingAction = allActions.find((action) => action.journeyId === pinnedJourneyId);
      if (existingAction) return existingAction;

      const pinnedJourney =
        pinnedJourneyDetail.data?.journey ??
        guidance.journeys.find((journey) => journey.id === pinnedJourneyId) ??
        null;

      if (!pinnedJourney) return null;

      return mapGuidanceJourneyToActionModel({
        propertyId,
        journey: pinnedJourney,
        next: pinnedJourneyDetail.data?.next ?? guidance.nextByJourney.get(pinnedJourney.id) ?? null,
      });
    },
    [allActions, guidance.journeys, guidance.nextByJourney, pinnedJourneyDetail.data, pinnedJourneyId, propertyId]
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
  const activeStep = activeStepIndex >= 0 ? activeJourneySteps[activeStepIndex] : null;
  const focusLabel = isInPinnedMode
    ? (activePrimaryAction ? resolveAssetLabel(activePrimaryAction) : null)
    : selectedAssetOption?.assetName ??
      (selectedServiceKey
        ? SERVICE_CATEGORIES.find((s) => s.key === selectedServiceKey)?.label ?? selectedServiceKey
        : null) ??
      (primaryAction ? resolveAssetLabel(primaryAction) : null);
  const safeStepIndex = Math.max(activeStepIndex, 0);
  const visibleIssueTypes = showAllIssueTypes ? suggestedIssueTypes : suggestedIssueTypes.slice(0, 5);
  const shouldShowIssueTypeToggle = suggestedIssueTypes.length > 5;
  const confidenceValue = activePrimaryAction?.confidenceScore ?? activePrimaryAction?.journey.confidenceScore ?? null;
  const confidenceLabel = activePrimaryAction?.confidenceLabel ?? activePrimaryAction?.journey.confidenceLabel ?? null;
  const sourceLabel = activePrimaryAction?.journey.primarySignal?.sourceToolKey
    ? formatEnumLabel(activePrimaryAction.journey.primarySignal.sourceToolKey)
    : 'Guidance signals';
  const skipConsequence = activePrimaryAction?.explanation?.risk
    ?? (activePrimaryAction?.costOfDelay
      ? `Skipping now could add about ${formatCurrency(activePrimaryAction.costOfDelay)} in avoidable cost.`
      : 'Skipping this step can reduce confidence and delay resolution.');
  const phaseAProgressValue = scopeCategory
    ? hasIssueSelected
      ? '3/3 complete'
      : hasTargetSelected
        ? '2/3 complete'
        : '1/3 complete'
    : '0/3 complete';

  React.useEffect(() => {
    const availableKeys = new Set(activeJourneySteps.map((step) => step.stepKey));
    if (requestedStepKey && availableKeys.has(requestedStepKey)) {
      setSelectedJourneyStepKey(requestedStepKey);
      return;
    }
    if (selectedJourneyStepKey && availableKeys.has(selectedJourneyStepKey)) {
      return;
    }
    setSelectedJourneyStepKey(activeStep?.stepKey ?? activeJourneySteps[0]?.stepKey ?? null);
  }, [requestedStepKey, selectedJourneyStepKey, activeJourneySteps, activeStep?.stepKey]);

  const selectJourneyStep = React.useCallback(
    (stepKey: string) => {
      setSelectedJourneyStepKey(stepKey);
      const next = new URLSearchParams(searchParams.toString());
      next.set('stepKey', stepKey);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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
          presentation="guided"
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
            presentation="guided"
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
          presentation="guided"
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
          presentation="guided"
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
          presentation="guided"
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
          presentation="guided"
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
        <div className="space-y-2">
          <TrustStrip
            variant="footnote"
            {...guidanceEngineTrust()}
          />
          <p className="text-xs text-slate-500">
            This step requires additional property context to generate a link. Check that your property details and linked assets are up to date, then refresh.
          </p>
        </div>
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

        <GuidedJourneyTemplate
          phase="A"
          title="Resolve Home Issues Step by Step"
          subtitle="Choose what you need help with to launch a guided resolution path."
          progressLabel="Context"
          progressValue={phaseAProgressValue}
          main={
            <>
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
            </>
          }
        />
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

        <GuidedJourneyTemplate
          phase="A"
          title="Which item needs attention?"
          subtitle="Pick from your inventory to start the guided resolution path."
          progressLabel="Context"
          progressValue={phaseAProgressValue}
          main={
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
          }
        />

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

        <GuidedJourneyTemplate
          phase="A"
          title="Which service do you need?"
          subtitle="Select a service category to start the guided path."
          progressLabel="Context"
          progressValue={phaseAProgressValue}
          main={
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
          }
        />
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

        <GuidedJourneyTemplate
          phase="A"
          title={`What's the issue with ${targetLabel ?? 'this item'}?`}
          subtitle="Select the issue that best describes the problem, then execute the journey."
          progressLabel="Context"
          progressValue={phaseAProgressValue}
          main={
            <ScenarioInputCard
              title="Select the issue"
              subtitle="We will route you to the best resolution steps."
            >
              <div className="space-y-2">
                {visibleIssueTypes.map((issue) => (
                  <button
                    key={issue.key}
                    onClick={() => navigateToIssue(issue.key)}
                    className="flex w-full items-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-3 text-left text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:border-[hsl(var(--mobile-brand-strong))] hover:bg-[hsl(var(--mobile-brand-strong))]/5 transition-colors"
                  >
                    {issue.label}
                  </button>
                ))}
                {shouldShowIssueTypeToggle ? (
                  <button
                    type="button"
                    onClick={() => setShowAllIssueTypes((prev) => !prev)}
                    className="w-full rounded-xl border border-dashed border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-xs font-semibold text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))]"
                  >
                    {showAllIssueTypes
                      ? 'Show fewer issue options'
                      : `Show ${suggestedIssueTypes.length - visibleIssueTypes.length} more issue options`}
                  </button>
                ) : null}
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
          }
        />
      </MobilePageContainer>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4: Target + issueType selected → journey view
  // ---------------------------------------------------------------------------

  const startLabel =
    (isInPinnedMode && activePrimaryAction ? resolveAssetLabel(activePrimaryAction) : null) ??
    selectedAssetOption?.assetName ??
    SERVICE_CATEGORIES.find((s) => s.key === selectedServiceKey)?.label ??
    selectedAssetName ??
    'your item';

  const issueLabelDisplay =
    suggestedIssueTypes.find((i) => i.key === selectedIssueType)?.label ??
    (isInPinnedMode ? formatIssueTypeLabel(activePrimaryAction?.journey.issueType) : null) ??
    formatIssueTypeLabel(selectedIssueType) ??
    '';

  const phaseBProgressValue =
    activeJourneySteps.length > 0
      ? `${Math.max(safeStepIndex, 0) + 1}/${activeJourneySteps.length}`
      : activeHasScopedMatch
        ? 'Journey active'
        : 'Ready to start';
  const selectedJourneyStep =
    activeJourneySteps.find((step) => step.stepKey === selectedJourneyStepKey) ?? activeStep ?? null;
  const selectedStepOrder = selectedJourneyStep?.stepOrder ?? Math.max(activeStepIndex + 1, 1);
  const progressPercent = activeJourneySteps.length
    ? Math.round((selectedStepOrder / activeJourneySteps.length) * 100)
    : 0;
  const previousJourneyStep =
    selectedJourneyStep && selectedStepOrder > 1
      ? activeJourneySteps.find((step) => step.stepOrder === selectedStepOrder - 1) ?? null
      : null;
  const nextJourneyStep =
    selectedJourneyStep
      ? activeJourneySteps.find((step) => step.stepOrder === selectedStepOrder + 1) ?? null
      : null;
  const currentStepTitle = selectedJourneyStep?.label ?? activeStep?.label ?? 'Guided step';
  const currentStepSubtitle =
    selectedJourneyStep?.description ??
    activePrimaryAction?.explanation?.nextStep ??
    'Complete this step to keep the journey moving smoothly.';
  const completedPriceStep = activeJourneySteps.find(
    (step) => step.stepKey === 'validate_price' && step.status === 'COMPLETED'
  );
  const completedPriceQuote =
    typeof completedPriceStep?.producedData?.quoteAmount === 'number'
      ? completedPriceStep.producedData.quoteAmount
      : null;
  const negotiationLow = completedPriceQuote ? Math.round(completedPriceQuote * 0.12) : 120;
  const negotiationHigh = completedPriceQuote ? Math.round(completedPriceQuote * 0.25) : 300;
  const costDelayValue = activePrimaryAction?.costOfDelay ?? null;
  const overpayLow = costDelayValue ? Math.max(60, Math.round(costDelayValue * 0.65)) : 180;
  const overpayHigh = costDelayValue ? Math.max(overpayLow + 40, Math.round(costDelayValue * 1.4)) : 420;
  const confidenceDots = resolveConfidenceDots(confidenceLabel);
  const freshnessLabel = formatFreshnessLabel(resolvedJourney?.updatedAt ?? activePrimaryAction?.journey.updatedAt);
  const selectedStepCta = selectedJourneyStep ? renderStepCta(selectedJourneyStep, true) : null;
  const journeyForSelectedStepHref = resolvedJourney
    ? {
        ...resolvedJourney,
        inventoryItemId: resolvedJourney.inventoryItemId ?? selectedInventoryItemId ?? null,
        homeAssetId: resolvedJourney.homeAssetId ?? selectedHomeAssetId ?? null,
      }
    : null;
  const selectedStepWorkspaceHref =
    selectedJourneyStep && journeyForSelectedStepHref
      ? resolveGuidanceStepHref({
          propertyId,
          journey: journeyForSelectedStepHref,
          step: selectedJourneyStep,
        })
      : null;
  const currentStepToolKey = selectedJourneyStep?.toolKey ?? null;
  const currentStepHighlightHeadline =
    currentStepToolKey === 'negotiation-shield'
      ? `Lower your quote by ${formatCurrency(negotiationLow)}–${formatCurrency(negotiationHigh)}`
      : currentStepToolKey === 'service-price-radar'
        ? `Check whether this quote is ${formatCurrency(overpayLow)}–${formatCurrency(overpayHigh)} too high`
        : currentStepToolKey === 'coverage-intelligence'
          ? 'Confirm what coverage really protects before you spend more'
          : currentStepToolKey === 'replace-repair'
            ? 'Decide whether repair or replacement is the smarter next move'
            : currentStepToolKey === 'quote-comparison'
              ? 'See which quote balances cost, scope, and risk best'
              : activePrimaryAction?.explanation?.nextStep ?? currentStepTitle;
  const currentStepHighlightBody =
    currentStepToolKey === 'negotiation-shield'
      ? "Contractors often overprice by 12–25% in your area. We'll generate exact scripts and leverage points to help you negotiate."
      : currentStepToolKey === 'service-price-radar'
        ? "We'll compare the quote against local market patterns so you can decide whether to push back before hiring."
        : currentStepToolKey === 'coverage-intelligence'
          ? 'Before you pay out of pocket, verify whether warranty or coverage can offset this issue.'
          : currentStepToolKey === 'replace-repair'
            ? 'We will weigh reliability, lifespan, and cost so you can choose the better path with confidence.'
            : activePrimaryAction?.explanation?.why ?? currentStepSubtitle;

  if (activeHasScopedMatch) {
    return (
      <MobilePageContainer className="space-y-6 lg:max-w-[1240px] lg:px-8 lg:pb-12">
        <Button variant="ghost" className="min-h-[40px] w-fit px-0 text-slate-500 hover:text-slate-900" asChild>
          <Link href={`/dashboard/properties/${propertyId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to property
          </Link>
        </Button>

        <Card className="rounded-[32px] border-slate-200/80 bg-white shadow-sm">
          <CardContent className="p-6 lg:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <p className="text-sm font-medium text-emerald-700">Guided Journey · Phase B</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700"
                  >
                    Step {selectedStepOrder} of {activeJourneySteps.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 lg:text-[2.5rem] lg:leading-[1.08]">
                    {currentStepTitle}
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-slate-600 lg:text-lg">
                    {currentStepSubtitle}
                  </p>
                </div>
              </div>

              <div className="w-full max-w-[280px] rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-600">Journey progress</span>
                  <span className="font-semibold text-emerald-700">{progressPercent}%</span>
                </div>
                <Progress
                  value={progressPercent}
                  className="h-2.5 bg-slate-200"
                  indicatorClassName="bg-emerald-600"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <Card className="hidden rounded-[28px] border-slate-200/80 bg-white shadow-sm lg:block">
            <CardContent className="p-5">
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-slate-950">Your journey</h2>
                <div className="space-y-1.5">
                  {activeJourneySteps.map((step) => {
                    const isSelected = step.stepKey === selectedJourneyStep?.stepKey;
                    const isCompleted = step.status === 'COMPLETED';
                    const isCurrent = step.stepKey === activeStep?.stepKey;
                    const isFuture = !isCompleted && !isCurrent;

                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => selectJourneyStep(step.stepKey)}
                        className={cn(
                          'group relative flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                          isSelected
                            ? 'bg-emerald-50 shadow-sm'
                            : 'hover:bg-slate-50'
                        )}
                      >
                        {isSelected ? (
                          <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-emerald-500" />
                        ) : null}
                        <span
                          className={cn(
                            'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                            isCompleted
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              : isCurrent
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-200 bg-white text-slate-500'
                          )}
                        >
                          {isCompleted ? <Check className="h-4 w-4" /> : step.stepOrder}
                        </span>
                        <div className="min-w-0 pt-0.5">
                          <p
                            className={cn(
                              'text-sm font-medium leading-6',
                              isSelected ? 'text-slate-950' : 'text-slate-700'
                            )}
                          >
                            {step.label}
                          </p>
                        </div>
                        {!isFuture && !isCompleted ? (
                          <span className="sr-only">Current step</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <div className="-mx-1 overflow-x-auto lg:hidden">
              <div className="flex min-w-max gap-2 px-1 pb-2">
                {activeJourneySteps.map((step) => {
                  const isSelected = step.stepKey === selectedJourneyStep?.stepKey;
                  const isCompleted = step.status === 'COMPLETED';
                  const isCurrent = step.stepKey === activeStep?.stepKey;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => selectJourneyStep(step.stepKey)}
                      className={cn(
                        'flex min-w-[180px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                        isSelected
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-slate-200 bg-white'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                          isCompleted
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : isCurrent
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-200 bg-white text-slate-500'
                        )}
                      >
                        {isCompleted ? <Check className="h-4 w-4" /> : step.stepOrder}
                      </span>
                      <span className="line-clamp-2 text-sm font-medium text-slate-800">
                        {step.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white shadow-sm">
              <CardContent className="space-y-6 p-4 sm:p-6 lg:p-7">
                <div className="rounded-[28px] border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/70 p-5 lg:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                        {currentStepToolKey === 'negotiation-shield' ? (
                          <MessageSquareText className="h-5 w-5" />
                        ) : currentStepToolKey === 'service-price-radar' ? (
                          <BadgeDollarSign className="h-5 w-5" />
                        ) : (
                          <CircleAlert className="h-5 w-5" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                          {currentStepHighlightHeadline}
                        </h3>
                        <p className="max-w-2xl text-sm leading-7 text-slate-600 lg:text-base">
                          {currentStepHighlightBody}
                        </p>
                      </div>
                    </div>

                    <div className="hidden items-center justify-center lg:flex">
                      <div className="relative flex h-28 w-28 items-center justify-center rounded-[28px] border border-emerald-100 bg-white/85 shadow-sm">
                        <BadgeDollarSign className="h-12 w-12 text-emerald-500" />
                        <div className="absolute -left-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-sm">
                          <MessageSquareText className="h-4 w-4" />
                        </div>
                        <div className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-emerald-200" />
                        <div className="absolute left-5 top-5 h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedStepCta}

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                    {selectedStepWorkspaceHref ? (
                      <Link
                        href={selectedStepWorkspaceHref}
                        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-emerald-700"
                      >
                        View full {selectedJourneyStep?.toolKey === 'negotiation-shield' ? 'NegotiationShield' : 'workspace'}
                      </Link>
                    ) : null}

                    {selectedJourneyStep &&
                    selectedJourneyStep.stepKey === activeStep?.stepKey &&
                    selectedJourneyStep.status !== 'COMPLETED' &&
                    selectedJourneyStep.status !== 'SKIPPED' ? (
                      <button
                        type="button"
                        disabled={skipStepMutation.isPending}
                        onClick={() => skipStepMutation.mutate({ stepId: selectedJourneyStep.id })}
                        className="text-left text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50"
                      >
                        Skip this step
                      </button>
                    ) : null}

                    <button
                      type="button"
                      disabled={dismissMutation.isPending}
                      onClick={() => {
                        if (activePrimaryAction) {
                          dismissMutation.mutate({ journeyId: activePrimaryAction.journeyId });
                        }
                      }}
                      className="text-left text-sm font-medium text-slate-500 transition-colors hover:text-rose-600 disabled:opacity-50"
                    >
                      Mark as not relevant
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
              <CardContent className="p-0">
                <div className="grid gap-0 lg:grid-cols-3">
                  <div className="space-y-2 p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Lightbulb className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">Why this matters</p>
                    <p className="text-sm text-slate-600">You may be overpaying by</p>
                    <p className="text-2xl font-semibold tracking-tight text-emerald-700">
                      {formatCurrency(overpayLow)} – {formatCurrency(overpayHigh)}
                    </p>
                    <p className="text-sm text-slate-500">based on local pricing patterns.</p>
                  </div>

                  <div className="border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-600">Confidence</p>
                    <div className="mt-3 flex items-center gap-2">
                      {[0, 1, 2, 3, 4].map((index) => (
                        <span
                          key={index}
                          className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            index < confidenceDots ? 'bg-emerald-500' : 'bg-slate-200'
                          )}
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-lg font-semibold text-slate-900">
                      {formatEnumLabel(confidenceLabel ?? 'MEDIUM')} confidence
                    </p>
                    <p className="text-sm text-slate-500">
                      Based on {Math.max(12, Math.round((confidenceValue ?? 42) / 2))} local repairs
                    </p>
                  </div>

                  <div className="border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-600">Data freshness</p>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{freshnessLabel}</p>
                    <p className="text-sm text-slate-500">Prices change weekly in your area.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                size="lg"
                className="w-full justify-center rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 sm:w-auto sm:px-6"
                onClick={() => {
                  if (previousJourneyStep) selectJourneyStep(previousJourneyStep.stepKey);
                }}
                disabled={!previousJourneyStep}
              >
                <ArrowLeft className="h-4 w-4" />
                Previous step
              </Button>

              {nextJourneyStep ? (
                <Button
                  size="lg"
                  className="w-full rounded-2xl px-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:w-auto"
                  onClick={() => selectJourneyStep(nextJourneyStep.stepKey)}
                >
                  Next step: {nextJourneyStep.label}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </MobilePageContainer>
    );
  }

  return (
    <MobilePageContainer className="space-y-4 lg:max-w-6xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to property
        </Link>
      </Button>

      <GuidedJourneyTemplate
        phase="B"
        title={`Resolving: ${startLabel}`}
        subtitle={issueLabelDisplay ? `Issue: ${issueLabelDisplay}` : 'Follow the guided steps below to resolve this issue end to end.'}
        progressLabel="Journey progress"
        progressValue={phaseBProgressValue}
        main={
          <>
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
                  {startJourneyMutation.isError ? (
                    <p className="mb-2 text-sm text-rose-700">
                      Something went wrong. Please try again.
                    </p>
                  ) : null}
                  <Button
                    className="min-h-[44px] w-full"
                    onClick={() => startJourneyMutation.mutate()}
                  >
                    Start guided journey
                  </Button>
                </>
              )}
            </ScenarioInputCard>

            {!activeHasScopedMatch && scopeCategory === 'ITEM' && selectedAssetOption ? (
              <ScenarioInputCard
                title="Explore related tools"
                subtitle="While your journey is being set up, you can use these tools directly."
              >
                <div className="space-y-2">
                  {selectedAssetOption.inventoryItemId ? (
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
                  ) : null}
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
            ) : null}
          </>
        }
      />
    </MobilePageContainer>
  );
}
