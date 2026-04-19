// apps/frontend/src/components/orchestration/ActionCenter.tsx
'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { api } from '@/lib/api/client';
import { OrchestratedActionDTO, Property, SuppressionSourceDTO, CompletionDataDTO, InventoryItem, InventoryRoom } from '@/types';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { OrchestrationActionCard } from './OrchestrationActionCard';
import InventoryItemDrawer from '@/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer';
import { getInventoryItem, listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';

import { MaintenanceConfigModal } from '@/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal';
import {
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
} from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { useRecentAction } from '@/hooks/useRecentAction';
import { DecisionTraceModal } from './DecisionTraceModal';
import { SnoozeModal } from './SnoozeModal';
import { CompletionModal } from './CompletionModal';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import humanizeActionType from '@/lib/utils/humanize';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import {
  buildGuidanceCtaLabel,
  resolveGuidanceForOrchestrationAction,
} from './guidanceActionLinking';
import { track } from '@/lib/analytics/events';

type Props = {
  propertyId: string;
  maxItems?: number;
};

const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

function isStaleAction(action: OrchestratedActionDTO): boolean {
  if (!action.createdAt) return false;
  return Date.now() - new Date(action.createdAt).getTime() > STALE_THRESHOLD_MS;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function orchestrationPriorityLabel(action: OrchestratedActionDTO): string {
  if (action.overdue) return 'URGENT';
  if (action.priority >= 80) return 'HIGH';
  if (action.priority >= 50) return 'MEDIUM';
  return 'LOW';
}

function orchestrationCategoryLabel(action: OrchestratedActionDTO): string {
  return String(action.serviceCategory || action.category || action.systemType || action.source || 'ORCHESTRATION');
}


export const ActionCenter: React.FC<Props> = ({
  propertyId,
  maxItems = 5,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 🔑 FIXED: Separate state for each category - backend already separates them
  const [actions, setActions] = useState<OrchestratedActionDTO[]>([]);
  const [suppressedActions, setSuppressedActions] = useState<OrchestratedActionDTO[]>([]);
  const [snoozedActions, setSnoozedActions] = useState<OrchestratedActionDTO[]>([]);
  
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showSuppressed, setShowSuppressed] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const suppressedSectionRef = useRef<HTMLDivElement | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [template, setTemplate] = useState<MaintenanceTaskTemplate | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const [traceAction, setTraceAction] =
    useState<OrchestratedActionDTO | null>(null);
  const [isSnoozeModalOpen, setIsSnoozeModalOpen] = useState(false);

  const recentKey = `ctc:actioncenter:recent:${propertyId}`;
  const recent = useRecentAction(recentKey);

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionAction, setCompletionAction] = useState<OrchestratedActionDTO | null>(null);
  const showInternalDetails = process.env.NODE_ENV !== 'production';

  // Inventory item drawer (opened directly from "View item" links)
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [itemDrawerItem, setItemDrawerItem] = useState<InventoryItem | null>(null);
  const [itemDrawerRooms, setItemDrawerRooms] = useState<InventoryRoom[]>([]);

  const router = useRouter();
  const guidanceQuery = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
    limit: 12,
  });
  const guidanceByActionKey = useMemo(() => {
    const out = new Map<string, ReturnType<typeof resolveGuidanceForOrchestrationAction>>();
    const allActions = [...actions, ...suppressedActions, ...snoozedActions];
    for (const action of allActions) {
      const match = resolveGuidanceForOrchestrationAction({
        action,
        guidanceActions: guidanceQuery.actions,
      });
      if (match?.href) out.set(action.actionKey, match);
    }
    return out;
  }, [actions, suppressedActions, snoozedActions, guidanceQuery.actions]);

  /* ------------------------------------------------------------------
     Load Actions
  ------------------------------------------------------------------- */

  const loadActions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summary, propertiesRes] = await Promise.all([
        api.getOrchestrationSummary(propertyId),
        api.getProperties(),
      ]);

      const adapted = adaptOrchestrationSummary(summary);

      // 🔑 FIXED: Set all three arrays directly from adapter - no filtering needed
      setActions(adapted.actions);
      setSuppressedActions(adapted.suppressedActions);
      setSnoozedActions(adapted.snoozedActions);

      if (propertiesRes.success) {
        setProperties(propertiesRes.data.properties || []);
      }
    } catch (err) {
      console.error('ActionCenter error:', err);
      setError('Unable to load actions right now.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    loadActions();
  }, [propertyId, loadActions]);

  /* ------------------------------------------------------------------
     CTA Handler
  ------------------------------------------------------------------- */

  const handleActionCta = useCallback((action: OrchestratedActionDTO) => {
    if (action.suppression?.suppressed) return;
    if (isModalOpen) return;
    if (activeActionKey === action.actionKey) return;

    const guidanceAction = guidanceByActionKey.get(action.actionKey);
    if (guidanceAction?.href && action.source === 'RISK') {
      router.push(guidanceAction.href);
      return;
    }

    setActiveActionKey(action.actionKey);

    // 🔑 FIX: Map riskLevel to priority (same as backend does)
    const priorityMap: Record<string, string> = {
      'CRITICAL': 'URGENT',
      'HIGH': 'HIGH',
      'ELEVATED': 'MEDIUM',
      'MODERATE': 'MEDIUM',
      'LOW': 'LOW',
    };
    const derivedPriority = action.riskLevel
      ? priorityMap[action.riskLevel.toUpperCase()] || 'MEDIUM'
      : 'MEDIUM';

    setTemplate({
      id: `orchestration:${action.actionKey}`,
      title: humanizeActionType(action.title),
      description: action.description ?? '',
      serviceCategory:
        (action.serviceCategory as ServiceCategory) ??
        (action.category as ServiceCategory) ??
        'INSPECTION',
      defaultFrequency: RecurrenceFrequency.ANNUALLY,
      sortOrder: 0,
      // 🔑 FIX: Use correct field names from DTO
      assetType: action.systemType,        // systemType → assetType
      priority: derivedPriority,            // Derived from riskLevel
      riskLevel: action.riskLevel,
      estimatedCost: action.exposure,       // exposure → estimatedCost
    } as any);

    setIsModalOpen(true);
  }, [isModalOpen, activeActionKey, guidanceByActionKey, router]);

  /* ------------------------------------------------------------------
     Maintenance Modal Success
  ------------------------------------------------------------------- */

  const handleSuccess = () => {
    toast({
      title: 'Task scheduled successfully',
      description: "We've added this to your maintenance checklist.",
    });
  
    if (activeActionKey) {
      const action = actions.find(a => a.actionKey === activeActionKey);
      if (action) recent.setScheduled(action);
    }
  
    setIsModalOpen(false);
    setTemplate(null);
    setActiveActionKey(null);
  
    // 🔑 FIX: Reload immediately to show suppression
    loadActions();
  };

  /* ------------------------------------------------------------------
     Decision Trace Actions
  ------------------------------------------------------------------- */

  const handleMarkCompletedFromTrace = useCallback(() => {
    if (!traceAction) return;
    
    setCompletionAction(traceAction);
    setTraceAction(null);
    setIsCompletionModalOpen(true);
  }, [traceAction]);

  const handleUndoCompletedFromTrace = useCallback(async () => {
    if (!traceAction) return;

    try {
      await api.undoOrchestrationActionCompleted(
        propertyId,
        traceAction.actionKey
      );

      toast({
        title: 'Completion undone',
        description: 'This action is active again.',
      });

      setTraceAction(null);
      await loadActions();
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['seasonalTasks', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['seasonalProgress', propertyId] });
    } catch (e: any) {
      toast({
        title: 'Unable to undo completion',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [traceAction, propertyId, loadActions, toast]);

  const handleOpenDecisionTrace = useCallback(async (action: OrchestratedActionDTO) => {
    // If we already have steps, just open
    const hasSteps = (action.decisionTrace?.steps?.length ?? 0) > 0;
    if (hasSteps || !propertyId) {
      setTraceAction(action);
      return;
    }
  
    try {
      const resp = await api.getOrchestrationDecisionTrace(propertyId, action.actionKey);
      const persisted = resp?.success ? resp.data : null;
  
      setTraceAction({
        ...action,
        decisionTrace: { steps: persisted?.steps ?? [] },
        // optional: you could also surface persisted.signals/confidence in the modal later
      });
    } catch {
      setTraceAction(action); // degrade gracefully
    }
  }, [propertyId]);
  
  
  const handleSnoozeFromTrace = useCallback(() => {
    if (!traceAction) return;
    setIsSnoozeModalOpen(true);
  }, [traceAction]);
  
  const handleSnooze = useCallback(
    async (snoozeUntil: Date, snoozeReason?: string) => {
      if (!traceAction || !propertyId) return;
  
      try {
        await api.snoozeOrchestrationAction(
          propertyId,
          traceAction.actionKey,
          snoozeUntil.toISOString(),
          snoozeReason
        );
  
        toast({
          title: 'Action snoozed',
          description: `We'll remind you about this on ${snoozeUntil.toLocaleDateString()}.`,
        });
  
        setTraceAction(null);
        setIsSnoozeModalOpen(false);
        await loadActions();
      } catch (e: any) {
        toast({
          title: 'Unable to snooze action',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [traceAction, propertyId, loadActions, toast]
  );
  
  const handleUnsnooze = useCallback(
    async (action: OrchestratedActionDTO) => {
      if (!propertyId) return;
  
      try {
        await api.unsnoozeOrchestrationAction(propertyId, action.actionKey);
  
        toast({
          title: 'Action un-snoozed',
          description: 'This action is now active again.',
        });
  
        await loadActions();
      } catch (e: any) {
        toast({
          title: 'Unable to un-snooze action',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [propertyId, loadActions, toast]
  );

  const handleCompletionSubmit = useCallback(async (data: CompletionDataDTO) => {
    if (!completionAction) return;
  
    try {
      await api.markOrchestrationActionCompleted(
        propertyId,
        completionAction.actionKey,
        data
      );

      track('task_completed', {
        priority: orchestrationPriorityLabel(completionAction),
        category: orchestrationCategoryLabel(completionAction),
        propertyId: completionAction.propertyId || propertyId,
      });
  
      toast({
        title: 'Marked as completed',
        description: 'Your completion details have been saved.',
      });
  
      setIsCompletionModalOpen(false);
      setCompletionAction(null);
      await loadActions();
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['seasonalTasks', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['seasonalProgress', propertyId] });
    } catch (e: any) {
      toast({
        title: 'Unable to mark completed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [completionAction, propertyId, loadActions, toast]);
  
  const handlePhotoUpload = useCallback(async (file: File, orderIndex: number) => {
    if (!completionAction) throw new Error('No action selected');
  
    const result = await api.uploadCompletionPhoto(
      propertyId,
      completionAction.actionKey,
      file,
      orderIndex
    );
  
    if (!result.success) {
      throw new Error('Upload failed');
    }
  
    return result.data.photo;
  }, [completionAction, propertyId]);

  // Add this with other handlers (around line 100)
  const handleViewTaskFromTrace = useCallback(() => {
    if (!traceAction) return;

    // 🔑 FIX: Navigate with propertyId parameter
    router.push(`/dashboard/maintenance?propertyId=${propertyId}`);
  }, [traceAction, propertyId, router]);

  const handleViewItem = useCallback(async (itemId: string) => {
    try {
      const [item, rooms] = await Promise.all([
        getInventoryItem(propertyId, itemId),
        listInventoryRooms(propertyId),
      ]);
      setItemDrawerItem(item);
      setItemDrawerRooms(rooms);
      setItemDrawerOpen(true);
    } catch (err) {
      console.error('[ActionCenter] Failed to load item for drawer:', err);
    }
  }, [propertyId]);

  const scrollToSuppressed = useCallback(() => {
    setShowSuppressed(true);
    suppressedSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  /* ------------------------------------------------------------------
     Derived Groups - 🔑 FIXED: Only group by risk level, don't re-filter
  ------------------------------------------------------------------- */

  // Group active actions by risk level for display
  const critical = useMemo(() => actions.filter(a => a.riskLevel === 'CRITICAL'), [actions]);
  const high = useMemo(() => actions.filter(a => a.riskLevel === 'HIGH'), [actions]);
  const otherFresh = useMemo(() => actions.filter(
    a => a.riskLevel !== 'CRITICAL' && a.riskLevel !== 'HIGH' && !isStaleAction(a)
  ), [actions]);
  const otherStale = useMemo(() => actions.filter(
    a => a.riskLevel !== 'CRITICAL' && a.riskLevel !== 'HIGH' && isStaleAction(a)
  ), [actions]);
  const other = useMemo(() => actions.filter(
    a => a.riskLevel !== 'CRITICAL' && a.riskLevel !== 'HIGH'
  ), [actions]);

  const totalEstCost = useMemo(
    () =>
      [...actions, ...suppressedActions].reduce((sum, action) => {
        const estimatedCost = Number(action.exposure ?? (action as { estimatedCost?: number | null }).estimatedCost ?? 0);
        return sum + (Number.isFinite(estimatedCost) ? estimatedCost : 0);
      }, 0),
    [actions, suppressedActions]
  );

  const completedCount = useMemo(
    () =>
      [...suppressedActions, ...snoozedActions].filter((action) => {
        const suppressionSource = action.suppression?.suppressionSource;
        return (
          suppressionSource?.type === 'USER_EVENT' &&
          suppressionSource?.eventType === 'USER_MARKED_COMPLETE'
        );
      }).length,
    [suppressedActions, snoozedActions]
  );

  const completedPct = useMemo(() => {
    const denominator = actions.length + suppressedActions.length + completedCount;
    if (!denominator) return 0;
    return Math.round((completedCount / denominator) * 100);
  }, [actions.length, suppressedActions.length, completedCount]);

  useEffect(() => {
    if (!loading && actions.length === 0 && suppressedActions.length > 0) {
      setShowSuppressed(true);
    }
  }, [loading, actions.length, suppressedActions.length]);

  /* ------------------------------------------------------------------
     Render Group
  ------------------------------------------------------------------- */

  const renderGroup = (
    label: string,
    items: OrchestratedActionDTO[],
    labelClass: string
  ) => {
    if (!items.length) return null;
  
    return (
      <section className="space-y-2">
        <div className={`text-xs font-semibold uppercase ${labelClass}`}>
          {label} ({items.length})
        </div>
  
        <div className="space-y-3">
          {items.slice(0, maxItems).map(action => {
            const isSuppressed = action.suppression?.suppressed;
            const hasTaskCreated = action.hasRelatedChecklistItem === true;
            const isCurrentlyBeingScheduled = activeActionKey === action.actionKey;
            const isChecklistAction = action.source === 'CHECKLIST';
            const guidanceAction = guidanceByActionKey.get(action.actionKey);
            const guidanceCtaLabel = guidanceAction ? buildGuidanceCtaLabel(guidanceAction) : undefined;

            return (
              <OrchestrationActionCard
                key={action.actionKey}
                action={action}
                onCtaClick={handleActionCta}
                ctaDisabled={
                  isSuppressed ||
                  hasTaskCreated ||
                  isCurrentlyBeingScheduled ||
                  isModalOpen ||
                  isChecklistAction
                }
                ctaLabel={
                  isSuppressed
                    ? 'Suppressed'
                    : hasTaskCreated
                      ? 'Already scheduled'
                      : isChecklistAction
                        ? 'View in Maintenance'
                        : guidanceCtaLabel
                }
                forceShowCta
                onOpenTrace={handleOpenDecisionTrace}
                onViewItem={handleViewItem}
              />
            );
          })}
        </div>
      </section>
    );
  };

  /* ------------------------------------------------------------------
     Render
  ------------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="rounded-lg border p-4 bg-white">
        <div className="text-sm text-muted-foreground">
          Loading prioritized actions…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border p-4 bg-white">
        <div className="text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!actions.length && !suppressedActions.length && !snoozedActions.length) {
    return (
      <div className="rounded-lg border p-4 bg-white">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-gray-900">No urgent actions right now</div>
              <div className="text-sm text-muted-foreground">You&apos;re in good shape. Check all actions if needed.</div>
            </div>
          </div>
          <Link
            href={`/dashboard/actions?propertyId=${encodeURIComponent(propertyId)}`}
            className="inline-flex min-h-[44px] items-center whitespace-nowrap text-sm font-semibold text-blue-600 hover:text-blue-700 touch-manipulation"
          >
            View all actions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Active</p>
            <p className="mt-0.5 text-xl font-bold text-gray-900">{actions.length}</p>
            <p className={suppressedActions.length > 0 ? 'mt-0.5 text-[11px] text-amber-600' : 'mt-0.5 text-[11px] text-gray-400'}>
              {suppressedActions.length > 0
                ? `+${suppressedActions.length} suppressed`
                : 'tasks in progress'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Est. Costs</p>
            <p className="mt-0.5 text-xl font-bold text-gray-900">{formatCurrency(totalEstCost)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {suppressedActions.length > 0 ? 'Includes suppressed items' : 'for active tasks'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Completed</p>
            <p className="mt-0.5 text-xl font-bold text-gray-900">{completedPct}%</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {completedCount} recently completed
            </p>
          </div>
        </div>

        {actions.length === 0 && suppressedActions.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    {suppressedActions.length} high-priority task{suppressedActions.length !== 1 ? 's' : ''} suppressed
                  </p>
                  <p className="text-sm text-amber-800">
                    Review suppressed items. They may still require attention.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={scrollToSuppressed}
                className="inline-flex min-h-[40px] items-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
              >
                Review →
              </button>
            </div>
          </div>
        )}

        {renderGroup('Critical', critical, 'text-red-700')}
        {renderGroup('High Priority', high, 'text-amber-700')}
        {renderGroup('Other Actions', otherFresh, 'text-gray-700')}

        {/* Aging Actions — items open for 90+ days */}
        {otherStale.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-gray-400">
                Aging Actions ({otherStale.length})
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                90+ days open — snooze or complete to clear
              </span>
            </div>
            <div className="space-y-3 opacity-80">
              {otherStale.slice(0, maxItems).map(action => {
                const isSuppressed = action.suppression?.suppressed;
                const hasTaskCreated = action.hasRelatedChecklistItem === true;
                const isCurrentlyBeingScheduled = activeActionKey === action.actionKey;
                const isChecklistAction = action.source === 'CHECKLIST';
                const guidanceAction = guidanceByActionKey.get(action.actionKey);
                const guidanceCtaLabel = guidanceAction ? buildGuidanceCtaLabel(guidanceAction) : undefined;
                return (
                  <OrchestrationActionCard
                    key={action.actionKey}
                    action={action}
                    onCtaClick={handleActionCta}
                    ctaDisabled={isSuppressed || hasTaskCreated || isCurrentlyBeingScheduled || isModalOpen || isChecklistAction}
                    ctaLabel={
                      isSuppressed ? 'Suppressed'
                        : hasTaskCreated ? 'Already scheduled'
                        : isChecklistAction ? 'View in Maintenance'
                        : guidanceCtaLabel
                    }
                    forceShowCta
                    onOpenTrace={handleOpenDecisionTrace}
                    onViewItem={handleViewItem}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Suppressed Actions */}
        {suppressedActions.length > 0 && (
          <div ref={suppressedSectionRef} className="pt-2">
            <button
              type="button"
              onClick={() => setShowSuppressed(v => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 touch-manipulation"
            >
              {showSuppressed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>
                {showSuppressed
                ? 'Hide suppressed actions'
                : actions.length === 0
                  ? `↓ ${suppressedActions.length} suppressed actions — snoozed or auto-filtered`
                  : `↓ Show ${suppressedActions.length} lower-priority items`}
              </span>
              <TooltipProvider delayDuration={180}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center text-gray-500" aria-label="Suppressed actions info">
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-left">
                    Suppressed actions are lower-priority or snoozed items. They won&apos;t appear in your active queue but can be reactivated anytime.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </button>

            {showSuppressed && (
              <div className="mt-3 space-y-3">
                {suppressedActions.map(action => (
                  <OrchestrationActionCard
                    key={action.actionKey}
                    action={action}
                    ctaDisabled
                    ctaLabel="Suppressed"
                    forceShowCta
                    onOpenTrace={handleOpenDecisionTrace}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Snoozed Actions */}
        {snoozedActions.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowSnoozed(v => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 touch-manipulation"
            >
              {showSnoozed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showSnoozed
                ? 'Hide snoozed actions'
                : `Show snoozed actions (${snoozedActions.length})`}
            </button>

            {showSnoozed && (
              <div className="mt-3 space-y-3">
                {snoozedActions.map(action => {
                  const snoozeInfo = action.snooze;
                  const snoozeLabel = snoozeInfo
                    ? `Snoozed for ${snoozeInfo.daysRemaining} more ${
                        snoozeInfo.daysRemaining === 1 ? 'day' : 'days'
                      }`
                    : 'Snoozed';

                  return (
                    <div key={action.actionKey} className="relative">
                      <OrchestrationActionCard
                        action={action}
                        ctaDisabled
                        ctaLabel={snoozeLabel}
                        forceShowCta
                        onOpenTrace={handleOpenDecisionTrace}
                      />
                      
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleUnsnooze(action)}
                          className="inline-flex min-h-[44px] items-center rounded-md border border-gray-200 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 touch-manipulation"
                        >
                          Un-snooze now
                        </button>
                        <button
                          onClick={() => {
                            setTraceAction(action);
                            setIsSnoozeModalOpen(true);
                          }}
                          className="inline-flex min-h-[44px] items-center rounded-md border border-gray-200 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 touch-manipulation"
                        >
                          Extend snooze
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <MaintenanceConfigModal
        isOpen={isModalOpen}
        orchestrationMode
        template={template}
        properties={properties}
        selectedPropertyId={propertyId}
        orchestrationActionKey={activeActionKey}
        onClose={() => {
          setIsModalOpen(false);
          setTemplate(null);
          setActiveActionKey(null);
        }}
        onSuccess={handleSuccess}
      />

      <DecisionTraceModal
        open={Boolean(traceAction)}
        onClose={() => setTraceAction(null)}
        steps={traceAction?.decisionTrace?.steps ?? []}
        showInternalDetails={showInternalDetails}
        onMarkCompleted={
          traceAction && 
          traceAction.source === 'RISK' && 
          !traceAction.suppression?.suppressed &&
          !traceAction.snooze
            ? handleMarkCompletedFromTrace
            : undefined
        }
        onSnooze={
          traceAction &&
          traceAction.source === 'RISK' &&
          !traceAction.suppression?.suppressed
            ? handleSnoozeFromTrace
            : undefined
        }
        onUndo={
          traceAction &&
          traceAction.source === 'RISK' &&
          traceAction.suppression?.suppressionSource?.type === 'USER_EVENT' &&
          traceAction.suppression?.suppressionSource?.eventType === 'USER_MARKED_COMPLETE'
            ? handleUndoCompletedFromTrace
            : undefined
        }
        onViewTask={
          traceAction &&
          traceAction.suppression?.suppressionSource?.type === 'PROPERTY_MAINTENANCE_TASK'
            ? handleViewTaskFromTrace
            : undefined
        }
      />
      <SnoozeModal
        open={isSnoozeModalOpen}
        onClose={() => setIsSnoozeModalOpen(false)}
        onSnooze={handleSnooze}
        currentSnoozeUntil={traceAction?.snooze?.snoozeUntil}
      />
      <CompletionModal
        open={isCompletionModalOpen}
        onClose={() => {
          setIsCompletionModalOpen(false);
          setCompletionAction(null);
        }}
        onSubmit={handleCompletionSubmit}
        actionTitle={completionAction?.title || ''}
        propertyId={propertyId}
        actionKey={completionAction?.actionKey || ''}
        onPhotoUpload={handlePhotoUpload}
      />

      <InventoryItemDrawer
        open={itemDrawerOpen}
        onClose={() => setItemDrawerOpen(false)}
        propertyId={propertyId}
        rooms={itemDrawerRooms}
        initialItem={itemDrawerItem}
        onSaved={() => setItemDrawerOpen(false)}
      />
    </>
  );
};
