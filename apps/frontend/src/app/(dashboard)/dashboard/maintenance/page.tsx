'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import {
  EmptyStateCard,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import {
  extractGuidanceContinuityContext,
  hasGuidanceContinuityContext,
} from '@/features/guidance/utils/guidanceContinuity';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { track } from '@/lib/analytics/events';
import type {
  MaintenanceTaskServiceCategory,
  Property,
  PropertyMaintenanceTask,
  UpdateMaintenanceTaskInput,
} from '@/types';
import { PersonalizedMaintenanceSuggestions } from './PersonalizedMaintenanceSuggestions';
import {
  normalizeRange,
  normalizeTaskPriority,
  normalizeView,
  splitAndSortTasks,
  type CompletedRange,
  type ViewMode,
} from './taskDisplay';
import { MaintenanceFilterBar } from './components/MaintenanceFilterBar';
import { MaintenanceStats } from './components/MaintenanceStats';
import { TaskDrawer } from './components/TaskDrawer';
import { TaskList } from './components/TaskList';

// Signal families that map to specific maintenance service categories.
// When a guidance journey routes here via one of these families, the completion
// card is gated on tasks in those categories being done — not all open tasks.
// Families absent from this map fall back to gating on all open tasks.
const SIGNAL_FAMILY_MAINTENANCE_CATEGORIES: Record<string, MaintenanceTaskServiceCategory[]> = {
  freeze_risk: ['PLUMBING', 'HVAC'],
  flood_risk: ['PLUMBING'],
  heat_risk: ['HVAC'],
  energy_inefficiency_detected: ['HVAC', 'ELECTRICAL'],
  high_utility_cost: ['HVAC', 'ELECTRICAL'],
};

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId: dashboardSelectedPropertyId } = usePropertyContext();

  const selectedPropertyId = searchParams.get('propertyId') || dashboardSelectedPropertyId || undefined;
  const taskIdFromUrl = searchParams.get('taskId');
  const guidanceContext = extractGuidanceContinuityContext(searchParams);
  const guidanceStepKey = guidanceContext.guidanceStepKey ?? null;
  const guidanceJourneyId = guidanceContext.guidanceJourneyId ?? null;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const returnTo = searchParams.get('returnTo');
  const priorityOnly = searchParams.get('priority') === 'true';
  const filterOverdue = searchParams.get('filter') === 'overdue';
  const from = searchParams.get('from');

  const view: ViewMode = normalizeView(searchParams.get('view'));
  const completedRange: CompletedRange = normalizeRange(searchParams.get('completedRange'));

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      if (selectedPropertyId) params.set('propertyId', selectedPropertyId);
      mutate(params);
      router.replace(`/dashboard/maintenance?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, selectedPropertyId]
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      replaceParams((params) => {
        params.set('view', mode);
        if ((mode === 'completed' || mode === 'all') && !params.get('completedRange')) {
          params.set('completedRange', '30d');
        }
      });
    },
    [replaceParams]
  );

  const setCompletedRange = useCallback(
    (range: CompletedRange) => {
      replaceParams((params) => params.set('completedRange', range));
    },
    [replaceParams]
  );

  const togglePriorityView = useCallback(
    (enabled: boolean) => {
      replaceParams((params) => {
        if (enabled) params.set('priority', 'true');
        else params.delete('priority');
      });
    },
    [replaceParams]
  );

  const getBackLink = () => {
    if (returnTo) {
      return {
        href: returnTo,
        label: guidanceJourneyId ? 'Back to guidance' : 'Back to previous step',
      };
    }
    if (selectedPropertyId && hasGuidanceContinuityContext(guidanceContext)) {
      return {
        href: buildGuidanceOverviewHref({
          propertyId: selectedPropertyId,
          journeyId: guidanceJourneyId,
          stepKey: guidanceStepKey,
          inventoryItemId: guidanceContext.itemId ?? null,
          homeAssetId: guidanceContext.homeAssetId ?? null,
        }),
        label: guidanceJourneyId ? 'Back to guidance' : 'Back to previous step',
      };
    }
    if (from === 'status-board' && selectedPropertyId) {
      return {
        href: `/dashboard/properties/${selectedPropertyId}/status-board`,
        label: 'Back to Status Board',
      };
    }
    if (from === 'seasonal') {
      return {
        href: `/dashboard/seasonal${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`,
        label: 'Back to Seasonal Maintenance',
      };
    }
    if (from === 'risk-assessment' && selectedPropertyId) {
      return {
        href: `/dashboard/properties/${selectedPropertyId}/risk-assessment`,
        label: 'Back to Risk Assessment',
      };
    }
    return null;
  };

  const backLink = getBackLink();

  const propertiesQuery = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const res = await api.getProperties();
      if (!res.success) throw new Error('Failed to fetch properties.');
      return res.data.properties as Property[];
    },
  });

  const effectivePropertyId = useMemo(() => {
    if (selectedPropertyId) return selectedPropertyId;
    const properties = propertiesQuery.data ?? [];
    const primary = properties.find((p) => p.isPrimary);
    return primary?.id || properties[0]?.id;
  }, [selectedPropertyId, propertiesQuery.data]);

  const tasksQuery = useQuery({
    queryKey: ['maintenance-tasks', effectivePropertyId],
    queryFn: async () => {
      const res = await api.getMaintenanceTasks(effectivePropertyId as string, {
        includeCompleted: true,
      });
      return res.success ? res.data : [];
    },
    enabled: Boolean(effectivePropertyId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const allMaintenanceTasks = useMemo(
    () => (Array.isArray(tasksQuery.data) ? tasksQuery.data : []),
    [tasksQuery.data]
  );
  const isInitialLoading =
    propertiesQuery.isLoading || (Boolean(effectivePropertyId) && tasksQuery.isLoading);
  const tasksLoaded = Boolean(effectivePropertyId) && tasksQuery.isSuccess;

  const { openTasks, completedTasks } = useMemo(
    () =>
      splitAndSortTasks(allMaintenanceTasks, {
        completedRange,
        priorityOnly,
        overdueOnly: filterOverdue,
      }),
    [allMaintenanceTasks, completedRange, priorityOnly, filterOverdue]
  );

  const hasEverCompleted = useMemo(
    () => allMaintenanceTasks.some((t) => t.status === 'COMPLETED'),
    [allMaintenanceTasks]
  );

  // Tasks that block guidance step completion. Scoped to signal-relevant service
  // categories when a known mapping exists; otherwise falls back to all open tasks.
  const guidanceScopedOpenTasks = useMemo(() => {
    if (!guidanceStepKey) return [];
    const categories = guidanceSignalIntentFamily
      ? SIGNAL_FAMILY_MAINTENANCE_CATEGORIES[guidanceSignalIntentFamily]
      : undefined;
    if (categories && categories.length > 0) {
      return openTasks.filter((t) => t.serviceCategory != null && categories.includes(t.serviceCategory));
    }
    return openTasks;
  }, [guidanceStepKey, guidanceSignalIntentFamily, openTasks]);

  // ── Drawer + deep link ────────────────────────────────────────────────────
  const [drawerTask, setDrawerTask] = useState<PropertyMaintenanceTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasConsumedTaskParam, setHasConsumedTaskParam] = useState(false);
  const [guidanceProofCompleted, setGuidanceProofCompleted] = useState(false);

  const scrollToTaskRow = useCallback((taskId: string | null | undefined) => {
    if (!taskId) return;
    window.setTimeout(() => {
      document
        .getElementById(`task-row-${taskId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, []);

  const openDrawer = useCallback((task: PropertyMaintenanceTask) => {
    setDrawerTask(task);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    scrollToTaskRow(drawerTask?.id);
  }, [drawerTask?.id, scrollToTaskRow]);

  useEffect(() => {
    setHasConsumedTaskParam(false);
  }, [taskIdFromUrl]);

  useEffect(() => {
    setGuidanceProofCompleted(false);
  }, [guidanceJourneyId, guidanceStepKey, effectivePropertyId]);

  useEffect(() => {
    if (!taskIdFromUrl || hasConsumedTaskParam || !tasksLoaded) return;

    const targetTask = allMaintenanceTasks.find((task) => task.id === taskIdFromUrl);
    setHasConsumedTaskParam(true);

    if (!targetTask) {
      toast({
        title: 'Task not found',
        description: 'It may have been completed or removed.',
        variant: 'destructive',
      });
      return;
    }

    openDrawer(targetTask);
  }, [taskIdFromUrl, hasConsumedTaskParam, tasksLoaded, allMaintenanceTasks, openDrawer, toast]);

  // Auto-complete proof-backed guidance steps once all scoped tasks are cleared.
  // Gated on tasksLoaded: an in-flight query yields an empty task list, which
  // must not be mistaken for "everything is done".
  useEffect(() => {
    if (!tasksLoaded) return;
    if (!effectivePropertyId || !guidanceJourneyId || !guidanceStepKey || guidanceProofCompleted) return;
    if (guidanceScopedOpenTasks.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        await recordGuidanceToolStatus(effectivePropertyId, {
          stepKey: guidanceStepKey,
          journeyId: guidanceJourneyId,
          signalIntentFamily: guidanceSignalIntentFamily || undefined,
          sourceToolKey: 'maintenance',
          status: 'COMPLETED',
          producedData: {
            proofType: 'maintenance_tasks_cleared',
            proofId: `maintenance-cleared:${guidanceJourneyId}:${guidanceStepKey}`,
            remainingScopedOpenTasks: 0,
            scopedServiceCategories:
              guidanceSignalIntentFamily
                ? SIGNAL_FAMILY_MAINTENANCE_CATEGORIES[guidanceSignalIntentFamily] ?? null
                : null,
            completedAt: new Date().toISOString(),
          },
        });
        if (!cancelled) setGuidanceProofCompleted(true);
      } catch (error) {
        console.error('[maintenance] failed to auto-complete proof-backed guidance step', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    tasksLoaded,
    effectivePropertyId,
    guidanceJourneyId,
    guidanceProofCompleted,
    guidanceScopedOpenTasks.length,
    guidanceSignalIntentFamily,
    guidanceStepKey,
  ]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidateTasks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] }),
    [queryClient]
  );

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMaintenanceTaskInput }) => {
      const response = await api.updateMaintenanceTask(id, data);
      if (!response.success) throw new Error(response.error?.message || 'Failed to update task.');
      return response.data;
    },
    onSuccess: (updatedTask: any, variables) => {
      invalidateTasks();
      toast({ title: 'Task updated' });
      setDrawerOpen(false);
      scrollToTaskRow(updatedTask?.id ?? variables.id);
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.message || 'Could not update task.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.deleteMaintenanceTask(id);
      if (!response.success) throw new Error(response.error?.message || 'Failed to delete task.');
      return id;
    },
    onSuccess: () => {
      invalidateTasks();
      toast({ title: 'Task removed' });
      setDrawerOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Removal failed',
        description: error.message || 'Could not remove task.',
        variant: 'destructive',
      });
    },
  });

  const undoComplete = useCallback(
    async (prior: { id: string; title: string; isRecurring: boolean; nextDueDate: string | null }) => {
      try {
        const response = await api.updateMaintenanceTaskStatus(prior.id, { status: 'PENDING' });
        if (!response.success) throw new Error('Failed to reopen task.');
        if (prior.isRecurring && prior.nextDueDate) {
          // Completing a recurring task advances its due date; restore the
          // pre-completion value so undo is a true undo.
          await api.updateMaintenanceTask(prior.id, {
            nextDueDate: prior.nextDueDate.slice(0, 10),
          });
        }
        invalidateTasks();
        toast({ title: 'Task reopened', description: `"${prior.title}" is back on your list.` });
      } catch (error: any) {
        invalidateTasks();
        toast({
          title: 'Undo failed',
          description: error?.message || 'Could not reopen the task.',
          variant: 'destructive',
        });
      }
    },
    [invalidateTasks, toast]
  );

  const completeMutation = useMutation({
    mutationFn: async (task: PropertyMaintenanceTask) => {
      const response = await api.updateMaintenanceTaskStatus(task.id, {
        status: 'COMPLETED',
        actualCost: task.estimatedCost || undefined,
      });
      if (!response.success) throw new Error('Failed to mark as complete.');
      return response.data;
    },
    onSuccess: (updated: any, task) => {
      track('task_completed', {
        priority: normalizeTaskPriority(task.priority),
        category: String(task.serviceCategory || 'MAINTENANCE'),
        propertyId: String(task.propertyId || effectivePropertyId || 'unknown'),
      });

      invalidateTasks();
      setDrawerOpen(false);

      const prior = {
        id: task.id,
        title: task.title,
        isRecurring: Boolean(task.isRecurring),
        nextDueDate: task.nextDueDate,
      };
      toast({
        title: 'Task completed',
        description: `"${task.title}" marked as complete.`,
        action: (
          <ToastAction altText="Undo" onClick={() => undoComplete(prior)}>
            Undo
          </ToastAction>
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Completion failed',
        description: error.message || 'Could not mark task as complete.',
        variant: 'destructive',
      });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (task: PropertyMaintenanceTask) => {
      const response = await api.updateMaintenanceTaskStatus(task.id, { status: 'PENDING' });
      if (!response.success) throw new Error('Failed to reopen task.');
      return response.data;
    },
    onSuccess: (_updated, task) => {
      invalidateTasks();
      setDrawerOpen(false);
      toast({ title: 'Task reopened', description: `"${task.title}" is back on your list.` });
      scrollToTaskRow(task.id);
    },
    onError: (error: any) => {
      toast({
        title: 'Reopen failed',
        description: error.message || 'Could not reopen the task.',
        variant: 'destructive',
      });
    },
  });

  const pendingTaskId = completeMutation.isPending ? completeMutation.variables?.id ?? null : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      {backLink && (
        <Link
          href={backLink.href}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          {backLink.label}
        </Link>
      )}

      <MobilePageIntro
        title="Maintenance"
        subtitle="Track and complete your home's upkeep tasks."
        action={
          <Button asChild size="sm">
            <Link
              href={`/dashboard/maintenance-setup${effectivePropertyId ? `?propertyId=${effectivePropertyId}` : ''}`}
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add Task
            </Link>
          </Button>
        }
      />

      {isInitialLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <MaintenanceStats tasks={allMaintenanceTasks} />

          <MaintenanceFilterBar
            view={view}
            onViewChange={setViewMode}
            completedRange={completedRange}
            onRangeChange={setCompletedRange}
            priorityOnly={priorityOnly}
            onPriorityChange={togglePriorityView}
          />

          {filterOverdue && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
              Showing overdue tasks only —{' '}
              <button
                className="underline"
                onClick={() =>
                  router.replace(
                    `/dashboard/maintenance${effectivePropertyId ? `?propertyId=${effectivePropertyId}` : ''}`
                  )
                }
              >
                Clear filter
              </button>
            </div>
          )}

          {(view === 'open' || view === 'all') && (
            <MobileSection>
              <MobileSectionHeader
                title="Open tasks"
                subtitle={`${openTasks.length} task${openTasks.length === 1 ? '' : 's'}`}
              />
              {openTasks.length === 0 ? (
                priorityOnly ? (
                  <EmptyStateCard
                    title="No high-priority open tasks"
                    description="Nothing urgent or high priority right now."
                    action={
                      <Button variant="outline" size="sm" onClick={() => togglePriorityView(false)}>
                        Show all tasks
                      </Button>
                    }
                  />
                ) : (
                  <EmptyStateCard
                    title="No open tasks"
                    description="Add maintenance tasks to stay ahead of upkeep."
                    action={
                      <Link
                        href={`/dashboard/maintenance-setup${effectivePropertyId ? `?propertyId=${effectivePropertyId}` : ''}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Go to Task Setup
                      </Link>
                    }
                  />
                )
              ) : (
                <TaskList
                  tasks={openTasks}
                  variant="open"
                  highlightTaskId={taskIdFromUrl}
                  pendingTaskId={pendingTaskId}
                  onOpenTask={openDrawer}
                  onCompleteTask={(task) => completeMutation.mutate(task)}
                />
              )}
            </MobileSection>
          )}

          {(view === 'completed' || view === 'all') && (
            <MobileSection>
              <MobileSectionHeader
                title="Completed tasks"
                subtitle={`${completedTasks.length} task${completedTasks.length === 1 ? '' : 's'}`}
              />
              {completedTasks.length === 0 ? (
                hasEverCompleted ? (
                  <EmptyStateCard
                    title="No completed tasks in this range"
                    description="Try expanding the completed time range."
                  />
                ) : (
                  <EmptyStateCard
                    title="Nothing completed yet"
                    description="Tasks you finish will show up here."
                  />
                )
              ) : (
                <TaskList
                  tasks={completedTasks}
                  variant="completed"
                  highlightTaskId={taskIdFromUrl}
                  onOpenTask={openDrawer}
                />
              )}
            </MobileSection>
          )}

          <GuidanceInlinePanel
            propertyId={effectivePropertyId}
            title="Maintenance Resolution Steps"
            subtitle="Follow ordered actions before jumping to provider execution."
            issueDomains={['MAINTENANCE', 'ASSET_LIFECYCLE'] as const}
            limit={2}
            hideWhenEmpty
          />

          <PersonalizedMaintenanceSuggestions propertyId={effectivePropertyId} />

          {tasksLoaded && guidanceJourneyId && guidanceScopedOpenTasks.length === 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {guidanceProofCompleted
                ? 'This guidance step completed automatically after the relevant maintenance tasks were cleared.'
                : 'All relevant maintenance tasks are cleared. Guidance completion is being recorded automatically.'}
            </div>
          )}
        </>
      )}

      <TaskDrawer
        task={drawerTask}
        open={drawerOpen}
        onOpenChange={(open) => (open ? setDrawerOpen(true) : closeDrawer())}
        onSave={(id, data) => updateMutation.mutate({ id, data })}
        onComplete={(task) => completeMutation.mutate(task)}
        onReopen={(task) => reopenMutation.mutate(task)}
        onDelete={(id) => deleteMutation.mutate(id)}
        isSaving={updateMutation.isPending}
        isDeleting={deleteMutation.isPending}
        isCompleting={completeMutation.isPending}
      />
    </MobilePageContainer>
  );
}
