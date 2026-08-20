'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, FileSearch, Users } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import type {
  BuyerFindingDisposition,
  BuyerInspectionPlanInput,
  BuyerPlanPhase,
  BuyerPlanOverviewTask,
  BuyerPurchasePath,
  HomeBuyerTaskStatus,
} from '@/types';
import { appendBuyerPlanReturnContext } from '@/lib/navigation/buyerReturnContext';
import { startBuyerNegotiationCase } from '../tools/negotiation-shield/negotiationShieldApi';
import { BuyerPurchaseLoanEstimateCenter } from './BuyerPurchaseLoanEstimateCenter';
import { BuyerClosingDisclosureCenter } from './BuyerClosingDisclosureCenter';
import { BuyerClosingDayCenter } from './BuyerClosingDayCenter';
import { BuyerPurchaseLenderReadinessCenter } from './BuyerPurchaseLenderReadinessCenter';
import { BuyerTitleEscrowCenter } from './BuyerTitleEscrowCenter';
import { BuyerInsuranceCenter } from './BuyerInsuranceCenter';
import { BuyerWalkthroughCenter } from './BuyerWalkthroughCenter';
import { BuyerContractContingencyCenter } from './BuyerContractContingencyCenter';
import {
  BUYER_PLAN_WORKSPACES,
  BuyerPlanOverviewPanel,
  BuyerPlanPhaseGuidance,
  BuyerPlanPhaseNavigation,
  BuyerTaskAssigneeControl,
  BuyerPlanTool,
  type BuyerPlanWorkspaceKey,
  workspaceForStage,
  workspaceForTask,
} from './BuyerPlanExperience';
import RouteStateCard from '@/components/system/RouteStateCard';
import { BuyerPlanPersonalization } from './BuyerPlanPersonalization';
import { BuyerWorkspaceDetails } from './BuyerWorkspaceGuidance';
import { BuyerInspectionGuide } from './BuyerInspectionGuide';

const PRE_CLOSE_PHASES: BuyerPlanPhase[] = ['EXPLORING', 'OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP'];
const ACTIVE_TASK_STATUSES: HomeBuyerTaskStatus[] = ['PENDING', 'IN_PROGRESS', 'BLOCKED'];
// Hard structural cap so a phase with many applicable checklist items never
// reads as "complete 20 fields" — the recommended action already surfaces
// above this list, so this is a record, not the primary decision surface.
const MAX_VISIBLE_PHASE_TASKS = 6;

const FINDING_DECISIONS: Array<{ value: Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'>; label: string }> = [
  { value: 'VERIFIED_FACT', label: 'Verified fact' },
  { value: 'PRE_CLOSE_NEGOTIATION', label: 'Negotiate pre-close' },
  { value: 'POST_CLOSE_ACTION', label: 'Add to ownership plan' },
  { value: 'DISMISSED', label: 'Dismiss' },
];

const NEXT_STEP_LABELS = {
  IMPORT_INSPECTION: 'Import an inspection report',
  REVIEW_EXTRACTION: 'Review extracted inspection findings',
  VERIFY_MATERIAL_FINDINGS: 'Verify material inspection findings',
  VERIFY_DOCUMENTS: 'Verify imported property documents',
  BUILD_90_DAY_PLAN: 'Continue the 90-day plan',
} as const;

function datetimeInputValue(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoFromDatetimeInput(value: FormDataEntryValue | null) {
  const text = String(value ?? '');
  return text ? new Date(text).toISOString() : null;
}

function listFromInput(value: FormDataEntryValue | null) {
  return String(value ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export default function BuyerPlanPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const returnTaskId = searchParams.get('taskId');
  const returnSection = searchParams.get('section');
  const restoredPositionRef = useRef(false);
  const autoAppliedCompositionRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeWorkspace, setActiveWorkspace] = useState<BuyerPlanWorkspaceKey | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [selectedNegotiationFindingIds, setSelectedNegotiationFindingIds] = useState<string[]>([]);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showAllPhaseTasks, setShowAllPhaseTasks] = useState(false);

  useEffect(() => {
    setShowAllPhaseTasks(false);
  }, [activeWorkspace]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-import-readiness', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-evidence-review', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-inspection-plan', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-purchase-financing', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-acceptance', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['buyer-checklist-composition', propertyId] }),
    ]);
  };

  const overviewQuery = useQuery({
    queryKey: ['buyer-plan-overview', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerPlanOverview(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the Buyer Plan overview.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const readinessQuery = useQuery({
    queryKey: ['buyer-import-readiness', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerImportReadiness(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const evidenceQuery = useQuery({
    queryKey: ['buyer-evidence-review', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerEvidenceReview(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const inspectionPlanQuery = useQuery({
    queryKey: ['buyer-inspection-plan', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerInspectionPlan(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the inspection plan.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const purchaseFinancingQuery = useQuery({
    queryKey: ['buyer-purchase-financing', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerPurchaseFinancingPlan(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the purchase path.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const acceptanceQuery = useQuery({
    queryKey: ['buyer-acceptance', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerAcceptanceStatus(propertyId);
      if (!response.success) throw new Error(response.message);
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const compositionQuery = useQuery({
    queryKey: ['buyer-checklist-composition', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerChecklistComposition(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to tailor the closing checklist.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });

  const journeyStatusMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume') => {
      const response = action === 'pause'
        ? await api.pauseBuyerJourney(propertyId)
        : await api.resumeBuyerJourney(propertyId);
      if (!response.success) throw new Error(response.message || `Unable to ${action} this purchase journey.`);
      return response;
    },
    onSuccess: (_response, action) => {
      void refresh();
      toast(action === 'pause'
        ? { title: 'Closing plan paused', description: 'Deadline and task reminders are stopped. Your tasks, notes, documents, and evidence are preserved.' }
        : { title: 'Closing plan resumed', description: 'Your saved closing work is active again from the same place.' });
    },
    onError: (error, action) => toast({
      title: `Unable to ${action} closing plan`,
      description: error instanceof Error ? error.message : 'Refresh the plan and try again.',
      variant: 'destructive',
    }),
  });
  const cancellationMutation = useMutation({
    mutationFn: () => api.cancelBuyerJourney(propertyId, { confirmed: true, reason: cancellationReason.trim() }),
    onSuccess: () => {
      void refresh();
      toast({
        title: 'Purchase journey cancelled',
        description: 'Active purchase work was stopped. Completed work, documents, and evidence remain in this property record.',
      });
    },
    onError: (error) => toast({
      title: 'Unable to cancel purchase journey',
      description: error instanceof Error ? error.message : 'Refresh the plan and try again.',
      variant: 'destructive',
    }),
  });
  const taskMutation = useMutation({
    mutationFn: ({ task, status }: { task: BuyerPlanOverviewTask; status: HomeBuyerTaskStatus }) =>
      api.updateHomeBuyerTask(propertyId, task.id, {
        status,
        ...(status === 'COMPLETED' ? { completionEvidenceJson: { proofType: 'USER_ATTESTATION', confirmedAt: new Date().toISOString() } } : {}),
      }),
    onSuccess: () => void refresh(),
  });
  const assignmentMutation = useMutation({
    mutationFn: ({ task, assignedToUserId }: { task: BuyerPlanOverviewTask; assignedToUserId: string | null }) =>
      api.assignTask(propertyId, task.id, 'BUYER', assignedToUserId),
    onSuccess: (_response, variables) => {
      void refresh();
      const assignee = members.find((member) => member.userId === variables.assignedToUserId);
      const name = assignee
        ? assignee.displayName || `${assignee.firstName} ${assignee.lastName}`.trim()
        : null;
      toast({
        title: name ? `Action assigned to ${name}` : 'Household assignment removed',
        description: name ? 'This responsibility is now clear to everyone sharing the home.' : 'Anyone in the household can take this action.',
      });
    },
    onError: (error) => toast({
      title: 'Unable to update who is handling this',
      description: error instanceof Error ? error.message : 'Refresh the closing guide and try again.',
      variant: 'destructive',
    }),
  });
  const findingMutation = useMutation({
    mutationFn: ({ findingId, disposition }: { findingId: string; disposition: Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'> }) =>
      api.dispositionBuyerFinding(propertyId, findingId, { disposition }),
    onSuccess: (response) => {
      void refresh();
      toast({
        title: 'Finding classified',
        description: response.success && response.data.repairJourneyId ? 'The canonical major-repair journey and ownership-plan action were created.' : 'The finding decision and lineage were saved.',
      });
    },
  });
  const documentMutation = useMutation({
    mutationFn: ({ documentId, status }: { documentId: string; status: 'VERIFIED' | 'REJECTED' }) =>
      api.verifyBuyerDocument(propertyId, documentId, status),
    onSuccess: () => void refresh(),
  });
  const inspectionPlanMutation = useMutation({
    mutationFn: (input: BuyerInspectionPlanInput) => api.updateBuyerInspectionPlan(propertyId, input),
    onSuccess: () => {
      void refresh();
      toast({ title: 'Inspection details updated', description: 'Your dates and any optional repair follow-up are synchronized with the closing guide.' });
    },
    onError: (error) => toast({
      title: 'Unable to update inspection plan',
      description: error instanceof Error ? error.message : 'Review the inspection dates and try again.',
      variant: 'destructive',
    }),
  });
  const purchaseFinancingMutation = useMutation({
    mutationFn: (purchasePath: BuyerPurchasePath) =>
      api.updateBuyerPurchaseFinancingPlan(propertyId, purchasePath),
    onSuccess: (_, purchasePath) => {
      void refresh();
      toast({
        title: 'Purchase path confirmed',
        description: purchasePath === 'CASH'
          ? 'Lender and appraisal work is now excluded from active closing progress.'
          : 'Purchase loan, Loan Estimate, and appraisal work is now active.',
      });
    },
    onError: (error) => toast({
      title: 'Unable to confirm purchase path',
      description: error instanceof Error ? error.message : 'Try again.',
      variant: 'destructive',
    }),
  });
  const negotiationMutation = useMutation({
    mutationFn: ({ findingIds }: { findingIds: string[] }) => startBuyerNegotiationCase(propertyId, {
      findingIds,
      requestType: 'REPAIR_OR_CREDIT',
    }),
    onSuccess: (detail) => {
      const finding = detail.buyerFindings[0];
      router.push(appendBuyerPlanReturnContext(
        `/dashboard/properties/${propertyId}/tools/negotiation-shield?caseId=${detail.case.id}`,
        { taskId: finding?.buyerTaskId, section: 'INSPECTION_DUE_DILIGENCE' },
      ));
      setSelectedNegotiationFindingIds([]);
    },
    onError: (error) => toast({
      title: 'Unable to open buyer negotiation',
      description: error instanceof Error ? error.message : 'Try again after confirming the inspection finding.',
      variant: 'destructive',
    }),
  });
  const handoffMutation = useMutation({
    mutationFn: () => api.handoffBuyerPlan(propertyId),
    onSuccess: (response) => {
      void refresh();
      const result = response.success ? response.data : null;
      if (result?.handedOff) {
        toast({ title: 'Recurring Home handoff complete', description: `${result.taskCount} unresolved ownership item(s) moved into recurring Home care.` });
      } else if (result?.reason === 'STRANDED_PRE_CLOSE_WORK') {
        toast({ title: 'Resolve pre-close work first', description: `${result.strandedTaskCount} pre-close item(s) still need to be completed or marked not needed.` });
      } else if (result?.reason === 'OWNERSHIP_NOT_CONFIRMED') {
        toast({ title: 'Ownership is not confirmed', description: 'Handoff starts only after an explicit professional-close confirmation persists.' });
      } else {
        toast({ title: 'Handoff is not due yet', description: 'The plan will hand off on day 91 or when ownership becomes established.' });
      }
    },
  });
  const compositionMutation = useMutation({
    mutationFn: () => api.applyBuyerChecklistComposition(propertyId),
    onSuccess: (response) => {
      void refresh();
      if (!response.success) return;
      toast({
        title: 'Closing checklist updated',
        description: `${response.data.delta.added} item(s) added and ${response.data.delta.removed} item(s) removed from active progress. Your existing work was preserved.`,
      });
    },
  });
  const personalizationAnswerMutation = useMutation({
    mutationFn: ({ factKey, value }: { factKey: string; value: unknown }) =>
      api.patch(`/api/properties/${propertyId}/context/${encodeURIComponent(factKey)}`, { value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['buyer-checklist-composition', propertyId] });
      toast({ title: 'Answer saved', description: 'We’re updating only the guidance affected by this answer.' });
    },
    onError: (error) => toast({
      title: 'Unable to save this answer',
      description: error instanceof Error ? error.message : 'Try again.',
      variant: 'destructive',
    }),
  });

  useEffect(() => {
    const composition = compositionQuery.data;
    const overview = overviewQuery.data;
    if (!composition || !overview || composition.delta.added === 0 || composition.delta.removed > 0) return;
    if (overview.accessRole === 'VIEWER' || ['PAUSED', 'CANCELLED', 'HANDED_OFF', 'ARCHIVED'].includes(overview.plan.status)) return;
    const applicationKey = `${composition.contextVersion}:${composition.delta.added}`;
    if (autoAppliedCompositionRef.current === applicationKey || compositionMutation.isPending) return;
    autoAppliedCompositionRef.current = applicationKey;
    compositionMutation.mutate();
  }, [compositionQuery.data, compositionMutation, overviewQuery.data]);

  useEffect(() => {
    if (restoredPositionRef.current || (!returnTaskId && !returnSection) || !overviewQuery.data) return;
    const targetTask = returnTaskId
      ? overviewQuery.data.tasks.find((task) => task.id === returnTaskId)
      : overviewQuery.data.tasks.find((task) => task.checklistSection === returnSection);
    const targetTaskId = targetTask?.id;
    if (targetTask && activeWorkspace !== workspaceForTask(targetTask)) {
      setActiveWorkspace(workspaceForTask(targetTask));
      return;
    }
    const target = targetTaskId ? document.getElementById(`buyer-task-${targetTaskId}`) : null;
    if (!target) return;
    restoredPositionRef.current = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeWorkspace, overviewQuery.data, returnSection, returnTaskId]);

  if (overviewQuery.isLoading) {
    return (
      <DashboardShell className="pt-8">
        <RouteStateCard
          state="loading"
          title="Loading your Closing Plan"
          description="We’re gathering this property’s deadlines, tasks, evidence, and people."
        />
      </DashboardShell>
    );
  }
  if (overviewQuery.isError || !overviewQuery.data) {
    const errorMessage = overviewQuery.error instanceof Error
      ? overviewQuery.error.message
      : 'Unable to load the buyer plan.';
    return (
      <DashboardShell className="pt-8">
        <RouteStateCard
          state="error"
          title="Your Closing Plan couldn’t load"
          description={`${errorMessage} Your property record is still safe.`}
          action={(
            <Button
              type="button"
              disabled={overviewQuery.isFetching}
              onClick={() => { void overviewQuery.refetch(); }}
            >
              {overviewQuery.isFetching ? 'Trying again…' : 'Try again'}
            </Button>
          )}
          secondaryAction={(
            <Button asChild variant="outline">
              <Link href={`/dashboard/properties/${propertyId}`}>Back to property</Link>
            </Button>
          )}
        />
      </DashboardShell>
    );
  }

  const overview = overviewQuery.data;
  const plan = {
    ...overview.plan,
    tasks: overview.tasks.filter((task) => task.applicability !== 'NOT_APPLICABLE'),
  };
  const readiness = readinessQuery.data;
  const evidence = evidenceQuery.data;
  const inspectionPlan = inspectionPlanQuery.data?.plan;
  const purchaseFinancingPlan = purchaseFinancingQuery.data;
  const inspectionModules = inspectionPlanQuery.data?.recommendations.modules ?? [];
  const applicableInspectionModules = inspectionModules.filter((module) => module.status === 'APPLICABLE');
  const unresolvedInspectionModules = inspectionModules.filter((module) => module.status === 'UNKNOWN');
  const acceptance = acceptanceQuery.data;
  const composition = compositionQuery.data;
  // FRD §14.17.5: while "Make this plan fit my home" is incomplete, that gate
  // is the entire next-action result — no phase task is offered here, the same
  // way BuyerClosingHome suppresses its next action while needsPersonalization.
  const needsPersonalization = overview.personalization.setupStatus === 'NEEDS_INPUT';
  const gatedNextAction = needsPersonalization ? null : overview.nextAction;
  const gatedNextActionGuidance = needsPersonalization ? null : overview.nextActionGuidance;
  const members = overview.workload;
  const completed = overview.summary.completed;
  const journeyLocked = ['CANCELLED', 'HANDED_OFF', 'ARCHIVED'].includes(plan.status);
  const readOnly = overview.accessRole === 'VIEWER' || journeyLocked || plan.status === 'PAUSED';
  const canPauseResume = overview.accessRole === 'OWNER'
    && ['ACTIVE', 'PAUSED'].includes(plan.status)
    && ['EXPLORING', 'OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP'].includes(plan.stage);
  const canCancel = overview.accessRole !== 'VIEWER'
    && ['ACTIVE', 'PAUSED'].includes(plan.status)
    && ['EXPLORING', 'OFFER_CONTRACT', 'DUE_DILIGENCE', 'CLOSING_PREP'].includes(plan.stage);
  const strandedPreCloseTasks = ['CLOSED', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90'].includes(plan.stage)
    ? plan.tasks.filter((task) => PRE_CLOSE_PHASES.includes(task.phase) && ACTIVE_TASK_STATUSES.includes(task.status))
    : [];
  const inspectionTask = plan.tasks.find((task) => task.actionKey === 'buyer:inspection:import');
  const documentsTask = plan.tasks.find((task) => task.actionKey === 'buyer:closing:documents');
  const restoredTaskId = returnTaskId
    ?? plan.tasks.find((task) => task.checklistSection === returnSection)?.id;
  const currentWorkspace = workspaceForStage(plan.stage);
  const selectedWorkspace = activeWorkspace
    ? BUYER_PLAN_WORKSPACES.find((workspace) => workspace.key === activeWorkspace) ?? null
    : null;
  const selectedTasks = activeWorkspace
    ? plan.tasks.filter((task) => workspaceForTask(task) === activeWorkspace)
    : [];
  const openTask = (task: BuyerPlanOverviewTask) => {
    setFocusedTaskId(task.id);
    setActiveWorkspace(workspaceForTask(task));
    window.setTimeout(() => document.getElementById(`buyer-task-${task.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  return (
    <DashboardShell>
      <div className="space-y-7 pb-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3 text-slate-500"><Link href={`/dashboard/properties/${propertyId}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to property</Link></Button>
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Your closing plan</h1><Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">{plan.stage.replace(/_/g, ' ').toLowerCase()}</Badge></div>
            <p className="mt-2 text-sm text-slate-500 sm:text-base"><span className="font-medium text-slate-700">{overview.property.address}</span> · {overview.property.city}, {overview.property.state}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            {canPauseResume && <Button
              variant="outline"
              size="sm"
              disabled={journeyStatusMutation.isPending}
              onClick={() => {
                const action = plan.status === 'PAUSED' ? 'resume' : 'pause';
                const prompt = action === 'pause'
                  ? 'Pause this closing plan? Reminders will stop, but all saved work will remain.'
                  : 'Resume this closing plan and its reminders?';
                if (window.confirm(prompt)) journeyStatusMutation.mutate(action);
              }}
            >{journeyStatusMutation.isPending ? 'Saving…' : plan.status === 'PAUSED' ? 'Resume plan' : 'Pause plan'}</Button>}
            <div className="text-right"><p className="text-xs text-slate-400">Plan progress</p><p className="text-sm font-semibold text-slate-900">{plan.status === 'HANDED_OFF' ? 'Handoff complete' : plan.status === 'CANCELLED' ? 'Purchase cancelled' : plan.status === 'PAUSED' ? 'Plan paused' : `${completed} of ${overview.summary.total} resolved`}</p></div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700">{overview.summary.progressPercent}%</div>
          </div>
        </header>

        {plan.status === 'CANCELLED' && <Card className="border-amber-200 bg-amber-50/60"><CardContent className="py-4 text-sm text-amber-950"><strong>This purchase journey is closed.</strong> Active tasks and milestones were cancelled, while completed work, documents, findings, and evidence remain available for reference.{plan.cancellationReason ? ` Reason: ${plan.cancellationReason}` : ''}</CardContent></Card>}
        {plan.status === 'PAUSED' && <Card className="border-blue-200 bg-blue-50/60"><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-blue-950"><div><strong>This closing plan is paused.</strong> Deadline and task reminders are stopped. Your tasks, notes, documents, and evidence remain saved and can be reviewed below.</div>{canPauseResume && <Button size="sm" onClick={() => journeyStatusMutation.mutate('resume')} disabled={journeyStatusMutation.isPending}>{journeyStatusMutation.isPending ? 'Resuming…' : 'Resume closing plan'}</Button>}</CardContent></Card>}
        {overview.accessRole === 'VIEWER' && <Card className="border-blue-200 bg-blue-50/60"><CardContent className="py-4 text-sm text-blue-950"><strong>View-only access.</strong> You can review tasks, milestones, contacts, evidence, and history, but only an owner or contributor can change this plan.</CardContent></Card>}

        {composition && <BuyerPlanPersonalization
          composition={composition}
          readOnly={readOnly}
          saving={compositionMutation.isPending || personalizationAnswerMutation.isPending}
          onAnswer={(factKey, value) => personalizationAnswerMutation.mutate({ factKey, value })}
          onApplyReviewedChanges={() => compositionMutation.mutate()}
        />}

        <BuyerPlanPhaseNavigation active={activeWorkspace} current={currentWorkspace} tasks={plan.tasks} onChange={setActiveWorkspace} />

        {!activeWorkspace && <BuyerPlanOverviewPanel
          targetCloseDate={plan.targetCloseDate}
          nextAction={gatedNextAction}
          nextActionGuidance={gatedNextActionGuidance}
          milestones={overview.milestones}
          blockedCount={overview.summary.blocked}
          currentWorkspace={currentWorkspace}
          onOpenWorkspace={setActiveWorkspace}
          onOpenTask={openTask}
        />}

        {selectedWorkspace && <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{selectedWorkspace.eyebrow}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{selectedWorkspace.label}</h2><p className="mt-1 text-sm text-slate-500">{selectedWorkspace.description}. Open only the details you need right now.</p></div><Button type="button" variant="outline" onClick={() => setActiveWorkspace(null)}>Back to overview</Button></div>}

        {activeWorkspace && <BuyerPlanPhaseGuidance
          workspace={activeWorkspace}
          tasks={selectedTasks}
          nextAction={gatedNextAction}
          nextActionGuidance={gatedNextActionGuidance}
          milestones={overview.milestones}
          targetCloseDate={plan.targetCloseDate}
          onOpenTask={openTask}
        />}

        {activeWorkspace === 'CONTRACT' && <div className="space-y-4">
          <BuyerContractContingencyCenter propertyId={propertyId} readOnly={readOnly} onChanged={() => void refresh()} />

          <BuyerPlanTool title="Purchase method" description="Tell the plan whether lender-only work applies. You can change this later." meta={purchaseFinancingPlan?.purchasePath === 'CASH' ? 'Cash' : purchaseFinancingPlan?.purchasePath === 'FINANCED' ? 'Financed' : 'Not confirmed'}>
        <Card className="border-0 shadow-none">
          <CardHeader><CardTitle className="text-lg">Purchase financing path</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Is this purchase cash or financed?</p>
              <p className="mt-1 text-sm text-muted-foreground">This decision controls checklist applicability only. ContractToCozy does not approve financing or certify clear-to-close status.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['CASH', 'FINANCED'] as BuyerPurchasePath[]).map((purchasePath) => (
                <Button
                  key={purchasePath}
                  type="button"
                  variant={purchaseFinancingPlan?.purchasePath === purchasePath ? 'default' : 'outline'}
                  disabled={readOnly || purchaseFinancingMutation.isPending}
                  onClick={() => purchaseFinancingMutation.mutate(purchasePath)}
                >
                  {purchasePath === 'CASH' ? 'Cash purchase' : 'Purchase financing'}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {purchaseFinancingPlan?.purchasePath === 'CASH'
                ? 'Lender, Loan Estimate, and appraisal tasks are excluded from active progress.'
                : purchaseFinancingPlan?.purchasePath === 'FINANCED'
                  ? 'Loan application, official Loan Estimate, and lender appraisal tasks are active.'
                  : 'Confirm a path to keep lender-only work from appearing for a cash buyer.'}
            </p>
          </CardContent>
        </Card>
          </BuyerPlanTool>
        </div>}

        {activeWorkspace === 'FINANCING_PROTECTION' && <div className="space-y-4">
          {purchaseFinancingPlan?.purchasePath === 'FINANCED' && <>
            <BuyerPlanTool title="Loan Estimates" description="Upload official lender disclosures so C2C can organize payment, closing-cash and timing differences."><BuyerPurchaseLoanEstimateCenter propertyId={propertyId} readOnly={readOnly} /></BuyerPlanTool>
            <BuyerPlanTool title="Lender readiness" description="See what the lender still needs, what could delay closing and who to contact next."><BuyerPurchaseLenderReadinessCenter propertyId={propertyId} readOnly={readOnly} /></BuyerPlanTool>
          </>}
          {purchaseFinancingPlan?.purchasePath !== 'FINANCED' && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">Financing tools remain hidden until you select a financed purchase in the Contract phase.</div>}
          <BuyerPlanTool title="Title, escrow & HOA" description="Know who is handling closing, which documents are pending and which questions need professional help."><BuyerTitleEscrowCenter propertyId={propertyId} readOnly={readOnly} /></BuyerPlanTool>
          <BuyerPlanTool title="Homeowners insurance" description="Know when coverage must begin, what proof is still needed and which follow-up could hold up closing."><BuyerInsuranceCenter propertyId={propertyId} readOnly={readOnly} /></BuyerPlanTool>
        </div>}

        {activeWorkspace === 'CLOSING_PREP' && <div className="space-y-4">
          {purchaseFinancingPlan?.purchasePath === 'FINANCED' && <BuyerPlanTool title="Closing Disclosure & funds" description="See what changed from the Loan Estimate and prepare the verified amount needed for closing."><BuyerClosingDisclosureCenter propertyId={propertyId} readOnly={readOnly} /></BuyerPlanTool>}
          <BuyerPlanTool title="Final walkthrough" description="Focus on meaningful changes, document concerns and know when to contact your professional before closing."><BuyerWalkthroughCenter propertyId={propertyId} readOnly={readOnly} /></BuyerPlanTool>
        </div>}

        {activeWorkspace === 'CLOSE_MOVE_IN' && <div className="space-y-4">
          <BuyerPlanTool title="Closing day" description="Know what to bring, what to verify and when the professional close and key handoff are complete."><BuyerClosingDayCenter propertyId={propertyId} readOnly={readOnly} /></BuyerPlanTool>
        </div>}

        {activeWorkspace === 'DUE_DILIGENCE' && <div className="space-y-4"><BuyerPlanTool title="Your home inspection guide" description="Use a personalized checklist during the inspection, then upload the report when it arrives.">
          <div className="space-y-5">
            <BuyerInspectionGuide
              address={`${overview.property.address}, ${overview.property.city}, ${overview.property.state}`}
              scheduledAt={inspectionPlan?.scheduledAt}
              decisionDeadline={inspectionPlan?.contingencyDueAt}
              modules={applicableInspectionModules}
              unresolvedModules={unresolvedInspectionModules}
              printHref={`/dashboard/properties/${propertyId}/buyer-plan/inspection-checklist/print`}
            />

            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-lg">Keep the two important dates handy</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Both are optional here. Your signed contract or agent should be the source for the deadline.</p>
                <form key={`inspection-dates-${inspectionPlan?.updatedAt ?? 'new'}`} className="grid gap-4 md:grid-cols-2" onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  inspectionPlanMutation.mutate({
                    scheduledAt: isoFromDatetimeInput(form.get('scheduledAt')),
                    contingencyDueAt: isoFromDatetimeInput(form.get('contingencyDueAt')),
                  });
                }}>
                  <label className="space-y-1 text-sm"><span>When is the inspection?</span><Input name="scheduledAt" type="datetime-local" defaultValue={datetimeInputValue(inspectionPlan?.scheduledAt)} disabled={readOnly} /></label>
                  <label className="space-y-1 text-sm"><span>Last day to raise inspection concerns</span><Input name="contingencyDueAt" type="datetime-local" defaultValue={datetimeInputValue(inspectionPlan?.contingencyDueAt)} disabled={readOnly} /><span className="block text-xs text-muted-foreground">If you are unsure, ask your agent or attorney before relying on this date.</span></label>
                  <div className="md:col-span-2"><Button type="submit" disabled={readOnly || inspectionPlanMutation.isPending}>{inspectionPlanMutation.isPending ? 'Saving…' : 'Save dates'}</Button></div>
                </form>
              </CardContent>
            </Card>

            {inspectionPlanQuery.data?.latestReport && <div className="rounded-xl border bg-muted/30 p-4 text-sm"><span className="font-medium">Latest inspection report:</span> {new Date(inspectionPlanQuery.data.latestReport.inspectionDate).toLocaleDateString()} · {inspectionPlanQuery.data.latestReport.status.replace(/_/g, ' ').toLowerCase()} · {inspectionPlanQuery.data.latestReport.openFindings} open finding(s)</div>}

            <BuyerWorkspaceDetails summary="Optional scheduling and repair follow-up">
              <form key={`inspection-details-${inspectionPlan?.updatedAt ?? 'new'}`} className="grid gap-4 md:grid-cols-2" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const appointmentCompleted = form.has('appointmentCompleted');
                const reinspectionCompleted = form.has('reinspectionCompleted');
                inspectionPlanMutation.mutate({
                  appointmentCompletedAt: appointmentCompleted ? (inspectionPlan?.appointmentCompletedAt ?? new Date().toISOString()) : null,
                  accessNotes: String(form.get('accessNotes') ?? '').trim() || null,
                  attendees: listFromInput(form.get('attendees')),
                  reportDueAt: isoFromDatetimeInput(form.get('reportDueAt')),
                  scopeNotes: String(form.get('scopeNotes') ?? '').trim() || null,
                  reinspectionRequired: form.has('reinspectionRequired'),
                  reinspectionScheduledAt: isoFromDatetimeInput(form.get('reinspectionScheduledAt')),
                  reinspectionCompletedAt: reinspectionCompleted ? (inspectionPlan?.reinspectionCompletedAt ?? new Date().toISOString()) : null,
                  reinspectionProofDocumentId: String(form.get('reinspectionProofDocumentId') ?? '') || null,
                  reinspectionNotes: String(form.get('reinspectionNotes') ?? '').trim() || null,
                });
              }}>
                <label className="space-y-1 text-sm"><span>When do you expect the report?</span><Input name="reportDueAt" type="datetime-local" defaultValue={datetimeInputValue(inspectionPlan?.reportDueAt)} disabled={readOnly} /></label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input name="appointmentCompleted" type="checkbox" defaultChecked={Boolean(inspectionPlan?.appointmentCompletedAt)} disabled={readOnly} />Inspection finished</label>
                <label className="space-y-1 text-sm"><span>Access notes</span><textarea name="accessNotes" defaultValue={inspectionPlan?.accessNotes ?? ''} disabled={readOnly} className="min-h-20 w-full rounded-md border bg-background px-3 py-2" placeholder="Only if useful" /></label>
                <label className="space-y-1 text-sm"><span>Who plans to attend?</span><textarea name="attendees" defaultValue={inspectionPlan?.attendees.join('\n') ?? ''} disabled={readOnly} className="min-h-20 w-full rounded-md border bg-background px-3 py-2" placeholder="Optional" /></label>
                <label className="space-y-1 text-sm md:col-span-2"><span>Notes from your inspector about what is included</span><textarea name="scopeNotes" defaultValue={inspectionPlan?.scopeNotes ?? ''} disabled={readOnly} className="min-h-20 w-full rounded-md border bg-background px-3 py-2" placeholder="Optional" /></label>
                <div className="space-y-3 rounded-lg border p-4 md:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium"><input name="reinspectionRequired" type="checkbox" defaultChecked={inspectionPlan?.reinspectionRequired ?? false} disabled={readOnly} />A repair follow-up or proof is needed</label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm"><span>Repair follow-up appointment</span><Input name="reinspectionScheduledAt" type="datetime-local" defaultValue={datetimeInputValue(inspectionPlan?.reinspectionScheduledAt)} disabled={readOnly} /></label>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input name="reinspectionCompleted" type="checkbox" defaultChecked={Boolean(inspectionPlan?.reinspectionCompletedAt)} disabled={readOnly} />Repair follow-up completed</label>
                    <label className="space-y-1 text-sm"><span>Repair proof</span><select name="reinspectionProofDocumentId" defaultValue={inspectionPlan?.reinspectionProofDocumentId ?? ''} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="">No document selected</option>{evidence?.documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select></label>
                    <label className="space-y-1 text-sm"><span>Follow-up notes</span><Input name="reinspectionNotes" defaultValue={inspectionPlan?.reinspectionNotes ?? ''} disabled={readOnly} placeholder="What was checked and what remains?" /></label>
                  </div>
                </div>
                <div className="md:col-span-2"><Button type="submit" disabled={readOnly || inspectionPlanMutation.isPending}>{inspectionPlanMutation.isPending ? 'Saving…' : 'Save optional details'}</Button></div>
              </form>
            </BuyerWorkspaceDetails>
          </div>
        </BuyerPlanTool>

        {readiness && <BuyerPlanTool title="Reports & documents" description="Import evidence when it becomes available; empty records do not count against progress." meta={`${readiness.documents.verified}/${readiness.documents.total} verified`}><Card className="border-0 shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSearch className="h-5 w-5" />Evidence readiness</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4"><div className="text-sm"><p className="font-medium">Next: {NEXT_STEP_LABELS[readiness.nextRecommendedStep]}</p><p className="text-muted-foreground">{readiness.inspectionReports.total} report(s), {readiness.inspectionReports.openMaterialFindings} open material finding(s), {readiness.documents.verified}/{readiness.documents.total} documents verified</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link href={appendBuyerPlanReturnContext(`/dashboard/properties/${propertyId}/inspection-hub`, { taskId: inspectionTask?.id, section: 'INSPECTION_DUE_DILIGENCE' })}>Import inspection</Link></Button><Button asChild variant="outline"><Link href={appendBuyerPlanReturnContext(`/dashboard/properties/${propertyId}/documents?action=upload`, { taskId: documentsTask?.id, section: 'CLOSING_DISCLOSURE_FUNDS' })}>Import documents</Link></Button></div></CardContent></Card></BuyerPlanTool>}

        <BuyerPlanTool title="Evidence decisions" description="Review confirmed findings and route only the decisions that require attention." meta={evidence?.reports.length ? `${evidence.reports.length} report(s)` : 'No reports'}><Card className="border-0 shadow-none">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Evidence and decisions</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {selectedNegotiationFindingIds.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3"><p className="text-sm font-medium">{selectedNegotiationFindingIds.length} finding(s) selected for one negotiation request</p><Button disabled={negotiationMutation.isPending} onClick={() => negotiationMutation.mutate({ findingIds: selectedNegotiationFindingIds })}>{negotiationMutation.isPending ? 'Opening…' : 'Open grouped negotiation'}</Button></div>}
            {evidence?.reports.map((report) => <div key={report.id} className="space-y-3"><div className="flex items-center justify-between"><p className="font-semibold">{report.reportType.replace(/_/g, ' ')} · {new Date(report.inspectionDate).toLocaleDateString()}</p><Badge variant="outline">{report.status}</Badge></div>{report.findings.map((finding) => <div key={finding.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="max-w-3xl"><div className="flex gap-2"><Badge variant={finding.severity === 'SAFETY' ? 'destructive' : 'outline'}>{finding.severity}</Badge><Badge variant="secondary">{finding.buyerDisposition.replace(/_/g, ' ')}</Badge></div><p className="mt-2 font-medium">{finding.homeSystem.replace(/_/g, ' ')}</p><p className="mt-1 text-sm text-muted-foreground">{finding.inspectorDescription}</p>{finding.buyerOutcomeDocument && <p className="mt-2 text-xs text-muted-foreground">Outcome evidence: <span className="font-medium text-foreground">{finding.buyerOutcomeDocument.name}</span> · {finding.buyerOutcomeDocument.verificationStatus.replace(/_/g, ' ').toLowerCase()}</p>}<div className="flex flex-wrap gap-2">{finding.buyerDisposition === 'PRE_CLOSE_NEGOTIATION' && <Button variant="link" className="h-auto p-0 pt-2" disabled={negotiationMutation.isPending} onClick={() => setSelectedNegotiationFindingIds((current) => current.includes(finding.id) ? current.filter((id) => id !== finding.id) : [...current, finding.id])}>{selectedNegotiationFindingIds.includes(finding.id) ? 'Remove from negotiation' : 'Add to negotiation'}</Button>}{finding.buyerRepairJourneyId && <Button asChild variant="link" className="h-auto p-0 pt-2"><Link href={`/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${finding.buyerRepairJourneyId}`}>Open major-repair journey</Link></Button>}</div></div><div className="flex max-w-md flex-wrap gap-2">{FINDING_DECISIONS.map((decision) => <Button key={decision.value} size="sm" variant={finding.buyerDisposition === decision.value ? 'default' : 'outline'} disabled={readOnly || report.status !== 'CONFIRMED' || findingMutation.isPending} onClick={() => findingMutation.mutate({ findingId: finding.id, disposition: decision.value })}>{decision.label}</Button>)}</div></div></div>)}</div>)}
            {!evidence?.reports.length && <p className="text-sm text-muted-foreground">No inspection reports imported yet.</p>}
            <div className="border-t pt-4"><p className="mb-3 font-semibold">Property documents</p><div className="space-y-2">{evidence?.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{document.name}</p><p className="text-xs text-muted-foreground">{document.type.replace(/_/g, ' ')} · {document.verificationStatus}</p></div><div className="flex gap-2"><Button size="sm" variant={document.verificationStatus === 'VERIFIED' ? 'default' : 'outline'} disabled={readOnly} onClick={() => documentMutation.mutate({ documentId: document.id, status: 'VERIFIED' })}>Verify</Button><Button size="sm" variant="outline" disabled={readOnly} onClick={() => documentMutation.mutate({ documentId: document.id, status: 'REJECTED' })}>Reject</Button></div></div>)}{!evidence?.documents.length && <p className="text-sm text-muted-foreground">No transaction, disclosure, or warranty documents imported yet.</p>}</div></div>
          </CardContent>
        </Card>
        </BuyerPlanTool>
        </div>}

        {activeWorkspace && <BuyerPlanTool title="All phase actions" description="Optional checklist and record of completed work. Your recommended next action appears at the top of this phase." meta={`${selectedTasks.length} item${selectedTasks.length === 1 ? '' : 's'}`} openSignal={focusedTaskId ?? restoredTaskId}>
          <Card className="border-0 shadow-none"><CardContent className="space-y-3 pt-6">
            {(showAllPhaseTasks ? selectedTasks : selectedTasks.slice(0, MAX_VISIBLE_PHASE_TASKS)).map((task) => {
              const done = task.status === 'COMPLETED';
              const resolvedWithoutCompletion = ['NOT_NEEDED', 'CANCELLED'].includes(task.status);
              const stranded = strandedPreCloseTasks.some((candidate) => candidate.id === task.id);
              const restored = task.id === restoredTaskId;
              return <div id={`buyer-task-${task.id}`} key={task.id} className={`flex flex-col justify-between gap-4 rounded-lg border p-4 lg:flex-row ${restored ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-100' : ''} ${stranded ? 'border-amber-300 bg-amber-50/50' : ''}`}>
                <div className="flex gap-3">
                  {done || resolvedWithoutCompletion ? <CheckCircle2 className={`mt-0.5 h-5 w-5 ${done ? 'text-green-600' : 'text-slate-500'}`} /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{task.title}</p>{task.templateKey && <Badge variant="secondary">Plan template</Badge>}{stranded && <Badge className="bg-amber-200 text-amber-950">Resolve before handoff</Badge>}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : 'No due date'}{task.handedOffMaintenanceTaskId ? ' · In recurring Home feed' : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{task.priority}</Badge>
                  <BuyerTaskAssigneeControl
                    members={members}
                    assignedToUserId={task.assignedToUserId}
                    disabled={readOnly || assignmentMutation.isPending}
                    onAssign={(assignedToUserId) => assignmentMutation.mutate({ task, assignedToUserId })}
                  />
                  <Button size="sm" variant={done || resolvedWithoutCompletion ? 'outline' : 'default'} disabled={readOnly || taskMutation.isPending} onClick={() => taskMutation.mutate({ task, status: done || resolvedWithoutCompletion ? 'PENDING' : 'COMPLETED' })}>{done ? 'Reopen' : resolvedWithoutCompletion ? 'Restore' : 'Mark complete'}</Button>
                  {stranded && <Button size="sm" variant="outline" disabled={readOnly || taskMutation.isPending} onClick={() => taskMutation.mutate({ task, status: 'NOT_NEEDED' })}>Not needed after close</Button>}
                </div>
              </div>;
            })}
            {selectedTasks.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No actions are assigned to this phase yet. You can still open the phase tools above and add details when known.</p>}
            {!showAllPhaseTasks && selectedTasks.length > MAX_VISIBLE_PHASE_TASKS && (
              <Button type="button" variant="ghost" className="w-full text-slate-600" onClick={() => setShowAllPhaseTasks(true)}>
                Show {selectedTasks.length - MAX_VISIBLE_PHASE_TASKS} more item{selectedTasks.length - MAX_VISIBLE_PHASE_TASKS === 1 ? '' : 's'}
              </Button>
            )}
          </CardContent></Card>
        </BuyerPlanTool>}

        {activeWorkspace === 'CLOSE_MOVE_IN' && <BuyerPlanTool title="Continuity & handoff" description="Move unresolved ownership work into recurring Home only after the professional close is confirmed." meta={acceptance?.acceptanceReady ? 'Ready' : 'Not ready'}><Card className={`border-0 shadow-none ${acceptance?.acceptanceReady ? 'bg-green-50/50' : strandedPreCloseTasks.length ? 'bg-amber-50/50' : ''}`}>
          <CardHeader><CardTitle className="text-lg">Continuity status</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-4"><p>Findings reviewed: {acceptance?.findings.reviewed ?? 0}/{acceptance?.findings.total ?? 0}</p><p>Material journeys: {acceptance?.findings.materialBranched ?? 0}/{acceptance?.findings.material ?? 0}</p><p>Documents verified: {acceptance?.documents.verified ?? 0}/{acceptance?.documents.total ?? 0}</p><p>Tasks assigned: {acceptance?.tasks.assigned ?? 0}/{acceptance?.tasks.total ?? 0}</p></div>
            {strandedPreCloseTasks.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3"><div><p className="font-medium text-amber-950">{strandedPreCloseTasks.length} pre-close item(s) need a final decision</p><p className="text-amber-900">Complete each item or mark it not needed so nothing disappears during recurring Home handoff.</p></div><Button asChild size="sm" variant="outline"><a href={`#buyer-task-${strandedPreCloseTasks[0].id}`}>Review first item</a></Button></div>}
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-muted-foreground">Day-91 handoff is checked from the persisted ownership start—not the scheduled closing date—and promotes this property to Established Owner only after all pre-close work is resolved.</p><Button variant="outline" onClick={() => handoffMutation.mutate()} disabled={readOnly || handoffMutation.isPending || plan.status === 'HANDED_OFF'}>{plan.status === 'HANDED_OFF' ? 'Handoff complete' : 'Check handoff now'}</Button></div>
          </CardContent>
        </Card></BuyerPlanTool>}

        {canCancel && !activeWorkspace && <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">Purchase no longer proceeding?</summary><div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-muted-foreground">Use this only when this property purchase is no longer proceeding. Active tasks and milestones will stop; completed work, documents, findings, and evidence will be preserved.</p>
            <Textarea aria-label="Purchase cancellation reason" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Why is this purchase no longer proceeding?" maxLength={500} />
            <Button
              variant="destructive"
              disabled={cancellationReason.trim().length < 5 || cancellationMutation.isPending}
              onClick={() => {
                if (window.confirm('Cancel this purchase journey? This stops all active purchase tasks and cannot be undone from this screen.')) cancellationMutation.mutate();
              }}
            >{cancellationMutation.isPending ? 'Cancelling…' : 'Cancel purchase journey'}</Button>
          </div></details>}
      </div>
    </DashboardShell>
  );
}
