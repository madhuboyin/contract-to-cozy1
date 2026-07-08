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
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  MessageSquareText,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Wrench,
  AlertCircle,
  Info,
  Snowflake,
  Flame,
  Droplets,
  History,
  Hammer,
  ClipboardCheck,
  ShieldQuestion,
  Calculator,
  ShieldPlus,
  FileText,
  Calendar,
  HandCoins,
  Wand2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { getGuidanceItemVisual } from '@/components/guidance/guidanceItemVisual';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { formatEnumLabel } from '@/lib/utils/formatters';
import GuidedJourneyTemplate from './components/GuidedJourneyTemplate';
import TrustStrip from '../../components/route-templates/TrustStrip';
import { guidanceEngineTrust } from '@/lib/trust/trustPresets';
import { track } from '@/lib/analytics/events';
import {
  type AssetScopeOption,
  SERVICE_CATEGORIES,
  INVENTORY_CATEGORY_TABS,
} from './constants';
import {
  appendScopeParams,
  buildProvidersHref,
  resolveAssetLabel,
  resolvePrimarySubtitle,
  resolveNextStepLabel,
  resolvePriorityTone,
  stepTone,
  formatFreshnessLabel,
  getFreshnessCopy,
  resolveConfidenceDots,
  normalizeIssueTypeKey,
  getIssueTypesForScope,
} from './displayUtils';
import { DismissConfirmPanel } from './components/DismissConfirmPanel';
import { GuidanceStepCta } from './components/GuidanceStepCta';

// ---------------------------------------------------------------------------
// Constants & Utils
// ---------------------------------------------------------------------------

const ISSUE_ICON_MAP: Record<string, any> = {
  not_working: AlertCircle,
  not_cooling: Snowflake,
  not_heating: Flame,
  leak: Droplets,
  past_life: History,
  broken: Hammer,
  inspection_needed: ClipboardCheck,
  coverage_question: ShieldQuestion,
  cost_estimate: Calculator,
  purchase_warranty: ShieldPlus,
  purchase_insurance: FileText,
  schedule_inspection: Calendar,
  arrange_cleaning: Sparkles,
  get_quotes: HandCoins,
};

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
  const selectedCustomIssueLabel = searchParams.get('customIssueLabel')?.trim() ?? '';
  // Phase 6c: direct journey resume — bypasses the wizard when present
  const pinnedJourneyId =
    searchParams.get('journeyId') ?? searchParams.get('guidanceJourneyId');
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
    const query = next.toString();
    router.push(query ? `${baseHref}?${query}` : baseHref);
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
    }
    if (option.homeAssetId) next.set('homeAssetId', option.homeAssetId);
    next.set('assetName', option.assetName);
    router.push(`${baseHref}?${next.toString()}`);
  }

  function navigateToService(serviceKey: string) {
    router.push(`${baseHref}?scopeCategory=SERVICE&serviceKey=${serviceKey}`);
  }

  function navigateToIssue(issueType: string, customIssueLabel?: string | null) {
    pushParams({
      issueType,
      customIssueLabel: customIssueLabel?.trim() ? customIssueLabel.trim() : null,
    });
  }

  function changeAsset() {
    // Keep scopeCategory, clear everything else
    router.push(`${baseHref}?scopeCategory=${scopeCategory ?? 'ITEM'}`);
  }

  function differentIssue() {
    // Clear issueType only, keep asset/service selection
    pushParams({ issueType: null, customIssueLabel: null });
  }

  function resetJourneyContext() {
    pushParams({
      issueType: null,
      customIssueLabel: null,
      journeyId: null,
      stepKey: null,
      guidanceStepKey: null,
    });
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

  // Further filter by issueType if one is selected (match user-initiated journeys).
  // No fallback to all scoped actions — an unmatched issueType must surface the
  // "Start Journey" path, not resume a journey of a different type.
  const issueFilteredActions = React.useMemo(() => {
    if (!selectedIssueType) return filteredActions;
    return filteredActions.filter(
      (a) => a.journey.issueType === selectedIssueType
    );
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
    mutationFn: ({ stepId, reasonCode }: { stepId: string; reasonCode?: string }) =>
      skipGuidanceStep(propertyId, stepId, { reasonCode: reasonCode ?? 'USER_SKIPPED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setShowSkipConfirm(false);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: ({ journeyId, reason }: { journeyId: string; reason?: string }) =>
      dismissGuidanceJourney(propertyId, journeyId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      // Clear journey-specific URL state so pinned resume links do not keep rendering
      // a dismissed journey after the mutation succeeds.
      resetJourneyContext();
      setShowDismissConfirm(false);
    },
  });

  const startJourneyMutation = useMutation({
    mutationFn: () => {
      const effectiveInventoryItemId =
        selectedInventoryItemId ?? selectedAssetOption?.inventoryItemId ?? undefined;
      const scopeId =
        scopeCategory === 'ITEM'
          ? effectiveInventoryItemId ?? selectedHomeAssetId ?? ''
          : selectedServiceKey ?? '';
      return startGuidanceJourney(propertyId, {
        scopeCategory: scopeCategory ?? 'ITEM',
        scopeId,
        issueType: selectedIssueType!,
        inventoryItemId: effectiveInventoryItemId,
        homeAssetId: selectedHomeAssetId ?? undefined,
        serviceKey: selectedServiceKey ?? undefined,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      // Pin the new journey so Phase B renders immediately without waiting for
      // the scoped filter to match — the journey may not be in filteredActions
      // until the invalidated query resolves.
      pushParams({ journeyId: data.journey.id });
      track('action_completed', { tool: 'guidance-overview', actionType: 'start_journey', propertyId });
    },
  });

  // ---- Derived ----
  const suggestedIssueTypes = React.useMemo(() => {
    const category = selectedAssetOption?.category ?? null;
    const assetName = selectedAssetOption?.assetName ?? selectedAssetName;
    return getIssueTypesForScope(
      scopeCategory ?? 'ITEM',
      category,
      selectedServiceKey,
      assetName || null
    );
  }, [scopeCategory, selectedServiceKey, selectedAssetOption, selectedAssetName]);
  const [customIssue, setCustomIssue] = React.useState('');
  const [showAllIssueTypes, setShowAllIssueTypes] = React.useState(false);
  const [selectedJourneyStepKey, setSelectedJourneyStepKey] = React.useState<string | null>(
    requestedStepKey
  );
  const [showDismissConfirm, setShowDismissConfirm] = React.useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = React.useState(false);

  React.useEffect(() => {
    setShowAllIssueTypes(false);
  }, [selectedInventoryItemId, selectedHomeAssetId, selectedServiceKey, selectedAssetName, scopeCategory]);

  React.useEffect(() => {
    setShowSkipConfirm(false);
  }, [selectedJourneyStepKey]);

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
    // Don't override step selection while the journey is still loading — an empty
    // steps array would clear the selected key, then reload it to step 1, losing
    // any requestedStepKey that arrived via URL.
    if (activeJourneySteps.length === 0) return;
    const availableKeys = new Set(activeJourneySteps.map((step) => step.stepKey));
    if (requestedStepKey && availableKeys.has(requestedStepKey)) {
      setSelectedJourneyStepKey(requestedStepKey);
      return;
    }
    const selectedStepInJourney = activeJourneySteps.find((s) => s.stepKey === selectedJourneyStepKey);
    if (selectedJourneyStepKey && availableKeys.has(selectedJourneyStepKey) && selectedStepInJourney?.status !== 'SKIPPED') {
      return;
    }
    setSelectedJourneyStepKey(activeStep?.stepKey ?? activeJourneySteps[0]?.stepKey ?? null);
  }, [requestedStepKey, selectedJourneyStepKey, activeJourneySteps, activeStep?.stepKey]);

  // Auto-skip step 1 (confirm_replacement_path) for existing near_end_of_life journeys
  // that were created before the backend auto-skip was deployed.
  const autoSkippedStepIds = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (
      !activeStep?.id ||
      autoSkippedStepIds.current.has(activeStep.id) ||
      selectedIssueType !== 'near_end_of_life' ||
      !activeHasScopedMatch ||
      activeStep.stepKey !== 'confirm_replacement_path' ||
      (activeStep.status !== 'PENDING' && activeStep.status !== 'IN_PROGRESS')
    ) {
      return;
    }
    autoSkippedStepIds.current.add(activeStep.id);
    skipStepMutation.mutate({ stepId: activeStep.id, reasonCode: 'DECISION_PRE_CONFIRMED' });
  // skipStepMutation is stable — omitting it avoids an eslint exhaustive-deps warning on a mutable ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueType, activeHasScopedMatch, activeStep]);

  const currentJourneyId =
    activeJourneyDetail.data?.journey?.id ??
    activePrimaryAction?.journeyId ??
    pinnedJourneyId ??
    null;

  const selectJourneyStep = React.useCallback(
    (stepKey: string) => {
      setSelectedJourneyStepKey(stepKey);
      const next = new URLSearchParams(searchParams.toString());
      if (currentJourneyId) next.set('journeyId', currentJourneyId);
      next.set('stepKey', stepKey);
      next.delete('guidanceJourneyId');
      next.delete('guidanceStepKey');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [currentJourneyId, pathname, router, searchParams]
  );

  const handleStepComplete = React.useCallback(
    (nextStepKey: string | null) => {
      if (nextStepKey) selectJourneyStep(nextStepKey);
    },
    [selectJourneyStep]
  );

  // ---- Render helpers ----
  // Resolve the step href via the shared helper that substitutes :propertyId, :itemId, etc.
  // Never use step.routePath directly — it may contain unresolved template params.
  const resolvedJourney = activeJourneyDetail.data?.journey ?? activePrimaryAction?.journey ?? null;

  // ---------------------------------------------------------------------------
  // Step 1: No scope category → show selector (skipped in pinned mode)
  // ---------------------------------------------------------------------------
  if (!scopeCategory && !isInPinnedMode) {
    const inProgressActions = allActions
      .filter((a) => a.journey.status === 'ACTIVE')
      .slice(0, 3);

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
              {inProgressActions.length > 0 ? (
                <ScenarioInputCard
                  title={`${inProgressActions.length} active ${inProgressActions.length === 1 ? 'journey' : 'journeys'} in progress`}
                  subtitle="Pick up where you left off."
                >
                  <div className="space-y-1.5">
                    {inProgressActions.map((action) => {
                      const assetLabel = resolveAssetLabel(action);
                      const itemCategory =
                        action.journey.inventoryItem?.category ??
                        action.journey.homeAsset?.assetType ??
                        '';
                      const { icon: ItemIcon, bg, color } = getGuidanceItemVisual({
                        name: action.journey.inventoryItem?.name?.trim() ?? assetLabel,
                        category: itemCategory,
                      });
                      return (
                        <Link
                          key={action.journeyId}
                          href={`${baseHref}?journeyId=${action.journeyId}`}
                          className="flex items-center gap-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2.5 transition-colors hover:border-[hsl(var(--mobile-brand-strong))] hover:bg-[hsl(var(--mobile-brand-strong))]/5"
                        >
                          <span
                            className={cn(
                              'shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg',
                              bg,
                              color
                            )}
                          >
                            <ItemIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                              {assetLabel}
                            </p>
                            <p className="truncate text-xs text-[hsl(var(--mobile-text-secondary))]">
                              {action.title} · {action.progress.completedCount} of {action.progress.totalCount} steps done
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </Link>
                      );
                    })}
                  </div>
                </ScenarioInputCard>
              ) : null}

              <ScenarioInputCard
                title="What do you need guidance for?"
                subtitle="Select a category to get started."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => navigateToScopeCategory('ITEM')}
                    aria-label="Get guidance for a home item"
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
                    aria-label="Find a home service"
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
              ) : inventoryQuery.isError ? (
                <div className="space-y-3">
                  <p className="text-sm text-rose-700">
                    We couldn&apos;t load your inventory right now. Please retry to pick the right item for this journey.
                  </p>
                  <ActionPriorityRow
                    primaryAction={
                      <Button
                        className="min-h-[42px] w-full"
                        onClick={() => {
                          void inventoryQuery.refetch();
                        }}
                      >
                        Retry inventory
                      </Button>
                    }
                  />
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
                        aria-label={`${option.assetName} — ${formatEnumLabel(option.category)}`}
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
                {visibleIssueTypes.map((issue) => {
                  const Icon = ISSUE_ICON_MAP[issue.key] ?? Info;
                  return (
                    <button
                      key={issue.key}
                      onClick={() => navigateToIssue(issue.key)}
                      aria-pressed={selectedIssueType === issue.key}
                      aria-label={issue.label}
                      className="flex w-full items-center gap-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-3 text-left text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:border-[hsl(var(--mobile-brand-strong))] hover:bg-[hsl(var(--mobile-brand-strong))]/5 transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 group-hover:bg-white group-hover:text-[hsl(var(--mobile-brand-strong))]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="flex-1">{issue.label}</span>
                    </button>
                  );
                })}
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
                    onClick={() =>
                      navigateToIssue(normalizeIssueTypeKey(customIssue), customIssue.trim())
                    }
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
    selectedCustomIssueLabel ||
    (suggestedIssueTypes.find((i) => i.key === selectedIssueType)?.label ??
      (isInPinnedMode ? formatIssueTypeLabel(activePrimaryAction?.journey.issueType) : null) ??
      formatIssueTypeLabel(selectedIssueType) ??
      '');

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
  const isJourneyComplete =
    activePrimaryAction?.journey.status === 'COMPLETED' ||
    (activeJourneySteps.length > 0 &&
      activeJourneySteps.every((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED'));
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
  const currentItemName =
    resolvedJourney?.inventoryItem?.name?.trim() ||
    selectedAssetOption?.assetName ||
    selectedAssetName ||
    null;
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
  const overpayLow = costDelayValue ? Math.max(60, Math.round(costDelayValue * 0.7)) : 180;
  const overpayHigh = costDelayValue ? Math.max(overpayLow + 40, costDelayValue) : 420;
  const confidenceDots = resolveConfidenceDots(confidenceLabel);
  const freshnessLabel = formatFreshnessLabel(resolvedJourney?.updatedAt ?? activePrimaryAction?.journey.updatedAt);
  const freshnessCategory = activePrimaryAction?.journey.inventoryItem?.category ?? null;
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

  function getStepHighlight(
    toolKey: string | null,
    negLow: number,
    negHigh: number,
    ovLow: number,
    ovHigh: number,
    journeyTypeKey: string | null = null
  ): { headline: string | null; body: string | null } {
    const STEP_COPY: Record<string, { headline: string; body: string | null }> = {
      'coverage-intelligence':
        journeyTypeKey === 'replacement_purchase_now'
          ? {
              headline: 'Check for coverage and rebates before buying a replacement',
              body: 'See if your home warranty covers the replacement cost and look for rebates on energy-efficient models.',
            }
          : {
              headline: 'Confirm what coverage really protects before you spend more',
              body: 'Before you pay out of pocket, verify whether warranty or coverage can offset this issue.',
            },
      'replace-repair': {
        headline: 'Decide whether repair or replacement is the smarter next move',
        body: 'We will weigh reliability, lifespan, and cost so you can choose the better path with confidence.',
      },
      'replacement-model-comparison': {
        headline: 'Shortlist the replacement models worth buying',
        body: 'Capture the model options that best fit your budget, efficiency goals, and timing.',
      },
      'replacement-purchase-options': {
        headline: 'Compare sellers, pricing, and purchase terms side by side',
        body: 'Compare the seller, price, warranty, and availability details before choosing where to buy.',
      },
      'replacement-purchase-finalization': {
        headline: 'Lock in the model and seller you want to move forward with',
        body: 'Save the exact purchase choice for this phase so the replacement path is clear and resumable.',
      },
      'replacement-planning': {
        headline: 'Set a budget and shortlist for the replacement plan',
        body: 'Set the replacement budget and shortlist now so you can shop later without starting over.',
      },
      'replacement-plan-followup': {
        headline: 'Save the follow-up date for this replacement plan',
        body: 'Store the follow-up timing and top option so this plan is easy to resume later.',
      },
      'quote-comparison': {
        headline: 'See which quote balances cost, scope, and risk best',
        body: null,
      },
    };
    if (toolKey === 'negotiation-shield') {
      return {
        headline: `Lower your quote by ${formatCurrency(negLow)}–${formatCurrency(negHigh)}`,
        body: "Contractors often overprice by 12–25% in your area. We'll generate exact scripts and leverage points to help you negotiate.",
      };
    }
    if (toolKey === 'service-price-radar') {
      return {
        headline: `Check whether this quote is ${formatCurrency(ovLow)}–${formatCurrency(ovHigh)} too high`,
        body: "We'll compare the quote against local market patterns so you can decide whether to push back before hiring.",
      };
    }
    return toolKey ? (STEP_COPY[toolKey] ?? { headline: null, body: null }) : { headline: null, body: null };
  }

  const stepHighlight = getStepHighlight(
    currentStepToolKey,
    negotiationLow,
    negotiationHigh,
    overpayLow,
    overpayHigh,
    activePrimaryAction?.journey.journeyTypeKey ?? null
  );
  const currentStepHighlightHeadline =
    stepHighlight.headline ?? activePrimaryAction?.explanation?.nextStep ?? currentStepTitle;
  const currentStepHighlightBody =
    stepHighlight.body ?? activePrimaryAction?.explanation?.why ?? currentStepSubtitle;

  if (activeHasScopedMatch) {
    // Show a skeleton while the journey detail (and its steps) are loading so the
    // user doesn't see "Step 1 of 0" or a 100% progress bar during the fetch.
    if (activeJourneyDetail.isLoading && activeJourneySteps.length === 0) {
      return (
        <MobilePageContainer className="space-y-6 lg:max-w-[1240px] lg:px-8 lg:pb-12">
          <div className="h-9 w-32 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-40 w-full animate-pulse rounded-[32px] bg-slate-100" />
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="hidden h-64 animate-pulse rounded-[28px] bg-slate-100 lg:block" />
            <div className="space-y-4">
              <div className="h-48 animate-pulse rounded-[30px] bg-slate-100" />
              <div className="h-32 animate-pulse rounded-[28px] bg-slate-100" />
            </div>
          </div>
        </MobilePageContainer>
      );
    }

    if (isJourneyComplete) {
      const completedCount = activeJourneySteps.filter((s) => s.status === 'COMPLETED').length;
      const skippedCount = activeJourneySteps.filter((s) => s.status === 'SKIPPED').length;
      return (
        <MobilePageContainer className="space-y-6 lg:max-w-[1240px] lg:px-8 lg:pb-12">
          <Button variant="ghost" className="min-h-[40px] w-fit px-0 text-slate-500 hover:text-slate-900" asChild>
            <Link href={`/dashboard/properties/${propertyId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to property
            </Link>
          </Button>

          <Card className="overflow-hidden rounded-[32px] border-emerald-200/80 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-8 text-white lg:p-10">
              <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-sm">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-100">Guided Journey · Complete</p>
                  <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
                    Journey complete
                  </h1>
                  <p className="text-sm text-emerald-100">
                    {startLabel}
                    {issueLabelDisplay ? ` · ${issueLabelDisplay}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="p-6 lg:p-8">
              <div className="space-y-5">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="font-semibold text-emerald-700">{completedCount}</span>
                  {completedCount === 1 ? 'step completed' : 'steps completed'}
                  {skippedCount > 0 && (
                    <span className="text-slate-400">
                      · {skippedCount} {skippedCount === 1 ? 'step skipped' : 'steps skipped'}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {activeJourneySteps.map((step) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                    >
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          step.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        )}
                      >
                        {step.status === 'COMPLETED' ? <Check className="h-3.5 w-3.5" /> : step.stepOrder}
                      </span>
                      <span
                        className={cn(
                          'text-sm',
                          step.status === 'COMPLETED'
                            ? 'font-medium text-slate-800'
                            : 'text-slate-400 line-through'
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <Button asChild size="lg" className="w-full rounded-2xl sm:w-auto sm:px-8">
                    <Link href={`/dashboard/properties/${propertyId}`}>
                      Back to property
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full rounded-2xl border-slate-200 sm:w-auto sm:px-8"
                    onClick={() => {
                      router.push(`/dashboard/properties/${propertyId}/tools/guidance-overview`);
                    }}
                  >
                    Resolve another issue
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </MobilePageContainer>
      );
    }

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
                  {currentItemName ? (
                    <p className="text-sm font-medium text-slate-500">
                      {currentItemName}
                    </p>
                  ) : null}
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
                  aria-label="Journey progress"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <Card className="hidden rounded-[28px] border-slate-200/80 bg-white shadow-sm lg:block">
            <CardContent className="p-5">
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-950">Your journey</h2>
                  {activePrimaryAction ? (
                    <button
                      type="button"
                      onClick={() => setShowDismissConfirm((v) => !v)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Journey options"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {showDismissConfirm ? (
                  <DismissConfirmPanel
                    isPending={dismissMutation.isPending}
                    onConfirm={() => {
                      if (activePrimaryAction) {
                        dismissMutation.mutate({ journeyId: activePrimaryAction.journeyId });
                      }
                    }}
                    onCancel={() => setShowDismissConfirm(false)}
                  />
                ) : null}
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
                        aria-current={isCurrent ? 'step' : undefined}
                        aria-label={`Step ${step.stepOrder}: ${step.label}${isCurrent ? ' — current step' : ''}`}
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
            {activePrimaryAction ? (
              <div className="flex items-center justify-between lg:hidden">
                <span className="text-sm font-semibold text-slate-950">Your journey</span>
                <button
                  type="button"
                  onClick={() => setShowDismissConfirm((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Journey options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {showDismissConfirm ? (
              <DismissConfirmPanel
                className="lg:hidden"
                isPending={dismissMutation.isPending}
                onConfirm={() => {
                  if (activePrimaryAction) {
                    dismissMutation.mutate({ journeyId: activePrimaryAction.journeyId });
                  }
                }}
                onCancel={() => setShowDismissConfirm(false)}
              />
            ) : null}
            <div className="lg:hidden">
              <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
                <GuidanceJourneyStrip steps={activeJourneySteps} />
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
                  {/* AI Strategic Advice (FRD-FR-15: Top Class Feature) */}
                  <AnimatePresence mode="wait">
                    {activePrimaryAction?.strategicAdvice ? (
                      <motion.div
                        key={selectedJourneyStep?.id ?? 'advice'}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="relative overflow-hidden rounded-[24px] border border-sky-100 bg-sky-50/40 p-5 lg:p-6"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
                            <Wand2 className="h-5 w-5" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-sky-700">Strategic Take</span>
                              <span className="flex h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                            </div>
                            <p className="text-sm font-medium leading-relaxed text-slate-800 lg:text-base">
                              &ldquo;{activePrimaryAction.strategicAdvice}&rdquo;
                            </p>
                          </div>
                        </div>
                        <div className="absolute -bottom-2 -right-2 opacity-5">
                          <Sparkles className="h-16 w-16 text-sky-900" />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {selectedJourneyStep ? (
                    <GuidanceStepCta
                      step={selectedJourneyStep}
                      isActive={true}
                      propertyId={propertyId}
                      activePrimaryAction={activePrimaryAction}
                      activeJourneySteps={activeJourneySteps}
                      journeyForSelectedStepHref={journeyForSelectedStepHref}
                      selectedInventoryItemId={selectedInventoryItemId}
                      selectedHomeAssetId={selectedHomeAssetId}
                      selectedIssueType={selectedIssueType}
                      selectedAssetOption={selectedAssetOption}
                      router={router}
                      pathname={pathname}
                      searchParams={searchParams}
                      onStepComplete={handleStepComplete}
                    />
                  ) : null}

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
                    selectedJourneyStep.status !== 'SKIPPED' &&
                    !selectedJourneyStep.isRequired ? (
                      showSkipConfirm ? (
                        <div
                          role="alert"
                          className="w-full rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm sm:w-auto"
                        >
                          <p className="font-medium text-amber-900">Skip this step?</p>
                          <p className="mt-0.5 text-amber-700">{skipConsequence}</p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={skipStepMutation.isPending}
                              onClick={() => skipStepMutation.mutate({ stepId: selectedJourneyStep.id })}
                              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                            >
                              {skipStepMutation.isPending ? 'Skipping…' : 'Yes, skip'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowSkipConfirm(false)}
                              className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                            >
                              Keep this step
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowSkipConfirm(true)}
                          className="text-left text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
                        >
                          Skip this step
                        </button>
                      )
                    ) : null}

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
                    <p className="text-sm text-slate-600">Estimated cost of waiting</p>
                    <p className="text-2xl font-semibold tracking-tight text-emerald-700">
                      {formatCurrency(overpayLow)} – {formatCurrency(overpayHigh)}
                    </p>
                    <p className="text-sm text-slate-500">from your repair cost model.</p>
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
                      Based on {activePrimaryAction?.progress.completedCount ?? 0} of {activePrimaryAction?.progress.totalCount ?? 0} completed checks
                    </p>
                  </div>

                  <div className="border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-600">Data freshness</p>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{freshnessLabel}</p>
                    <p className="text-sm text-slate-500">{getFreshnessCopy(freshnessCategory, activePrimaryAction?.issueDomain)}</p>
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

  if (guidance.isError && !isInPinnedMode) {
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
          subtitle={
            issueLabelDisplay
              ? `Issue: ${issueLabelDisplay}`
              : 'We need guidance data before we can continue this workflow.'
          }
          progressLabel="Journey progress"
          progressValue={phaseBProgressValue}
          main={
            <ScenarioInputCard
              title="We couldn't load your guidance right now"
              subtitle="This looks like a temporary loading problem, so we are not creating a new journey yet."
              badge={<StatusChip tone="danger">Retry needed</StatusChip>}
            >
              <p className="mb-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
                Retry loading guidance to check for an existing journey and the correct next steps for this issue.
              </p>
              <ActionPriorityRow
                primaryAction={
                  <Button
                    className="min-h-[44px] w-full"
                    onClick={() => {
                      void guidance.refetch();
                    }}
                  >
                    Retry guidance
                  </Button>
                }
              />
            </ScenarioInputCard>
          }
        />
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
