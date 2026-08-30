'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type {
  WorkItemDetailDTO,
  WorkItemListEntryDTO,
  OperationalWorkItemState,
  OperationalWorkItemDisposition,
  OperationalWorkEvidenceType,
  OperationalWorkEvidenceVerificationStatus,
  HouseholdMember,
  Document as PropertyDocument,
} from '@/types';
import { api } from '@/lib/api/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { getMemberDisplayName } from '@/components/features/household/HouseholdUtils';
import { WorkItemMemberPicker } from './WorkItemMemberPicker';
import { WorkItemDuplicatePicker } from './WorkItemDuplicatePicker';
import { RichCompletionDialog } from './RichCompletionDialog';
import { useConfirmDestructiveAction } from '@/components/system/ConfirmDestructiveActionDialog';

// Raw enum labels — kept for the collapsed "Advanced" section only.
const STATE_LABELS: Record<OperationalWorkItemState, string> = {
  CANDIDATE: 'Candidate',
  ACCEPTED: 'Accepted',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  IN_GUIDANCE: 'In guidance',
  IN_PROJECT: 'In project',
  BLOCKED: 'Blocked',
  DEFERRED: 'Deferred',
  REPORTED_COMPLETE: 'Reported complete',
  REOPENED: 'Reopened',
  VERIFIED: 'Verified',
  FOLLOW_UP_DUE: 'Follow-up due',
  CLOSED: 'Closed',
};

// Homeowner-facing status — never shows the raw lifecycle enum.
const FRIENDLY_STATE: Record<OperationalWorkItemState, string> = {
  CANDIDATE: 'Suggested',
  ACCEPTED: 'On your list',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  IN_GUIDANCE: 'Working through it',
  IN_PROJECT: 'Part of a project',
  BLOCKED: 'Waiting on something',
  DEFERRED: 'Put off for now',
  REPORTED_COMPLETE: 'Done — being confirmed',
  REOPENED: 'Back on your list',
  VERIFIED: 'Done',
  FOLLOW_UP_DUE: 'Time for a follow-up',
  CLOSED: 'Closed',
};

const FRIENDLY_DISPOSITION: Record<OperationalWorkItemDisposition, string> = {
  NOT_RELEVANT: 'Marked not for you',
  DUPLICATE: 'Merged with another task',
  EXPIRED: 'No longer needed',
  DISMISSED: 'Dismissed',
};

const DISPOSITION_LABELS: Record<OperationalWorkItemDisposition, string> = {
  NOT_RELEVANT: 'Not relevant',
  DUPLICATE: 'Duplicate',
  EXPIRED: 'Expired',
  DISMISSED: 'Dismissed',
};
const DISPOSITION_OPTIONS: OperationalWorkItemDisposition[] = ['NOT_RELEVANT', 'DUPLICATE', 'EXPIRED', 'DISMISSED'];

const EVIDENCE_TYPE_LABELS: Record<OperationalWorkEvidenceType, string> = {
  PROPERTY_FACT: 'Property fact',
  DOCUMENT: 'Document',
  HOME_EVENT: 'Home event',
  USER_ATTESTATION: 'Self-attestation',
  DOMAIN_COMPLETION_RECORD: 'Completion record',
  SYSTEM_DERIVATION: 'System-derived',
};
const EVIDENCE_TYPE_OPTIONS: OperationalWorkEvidenceType[] = [
  'DOCUMENT', 'PROPERTY_FACT', 'HOME_EVENT', 'USER_ATTESTATION', 'DOMAIN_COMPLETION_RECORD', 'SYSTEM_DERIVATION',
];
const VERIFICATION_STATUS_OPTIONS: OperationalWorkEvidenceVerificationStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];

const EXECUTION_LABEL: Record<string, string> = {
  MAINTENANCE_TASK: 'maintenance plan',
  GUIDANCE: 'guided plan',
  PROJECT: 'project',
  INSPECTION_FINDING: 'inspection follow-up',
};

function synthesizeEvidenceEntityId(type: OperationalWorkEvidenceType, workItemId: string): string {
  return `${type.toLowerCase()}:${workItemId}:${crypto.randomUUID()}`;
}

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()).toLocaleDateString();
}

/** Where the actual work happens — the linked maintenance / guidance / project record. */
function executionHref(detail: WorkItemDetailDTO, propertyId: string): { href: string; label: string } | null {
  const primary = detail.executions.find((entry) => entry.role === 'PRIMARY') ?? detail.executions[0];
  if (!primary) return null;
  if (primary.executionType === 'MAINTENANCE_TASK') {
    return { href: `/dashboard/maintenance?propertyId=${propertyId}`, label: 'Open in maintenance' };
  }
  if (primary.executionType === 'GUIDANCE') {
    return {
      href: `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${encodeURIComponent(primary.executionEntityId)}`,
      label: 'Open the guided plan',
    };
  }
  if (primary.executionType === 'PROJECT') {
    return {
      href: `/dashboard/properties/${propertyId}/projects/${encodeURIComponent(primary.executionEntityId)}`,
      label: 'Open the project',
    };
  }
  return null;
}

/**
 * Home Operations Item #16 — the durable work item behind a Home action.
 *
 * The top of the sheet is the homeowner view: what it is, when it's due, who's
 * handling it, and the everyday actions (done / snooze / reschedule / not for
 * me). The raw lifecycle, watchers, evidence records, and duplicate handling
 * live under a collapsed "Advanced" section for power users and providers —
 * see docs/product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md §15.
 */
export function WorkItemManageDrawer({
  propertyId,
  workItemId,
  open,
  onOpenChange,
  onChanged,
}: {
  propertyId: string;
  workItemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useConfirmDestructiveAction();

  const [detail, setDetail] = useState<WorkItemDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerPending, setOwnerPending] = useState<string | null>(null);

  const [watcherPickerOpen, setWatcherPickerOpen] = useState(false);
  const [watcherPending, setWatcherPending] = useState<string | null>(null);

  const [nextState, setNextState] = useState<OperationalWorkItemState | ''>('');
  const [disposition, setDisposition] = useState<OperationalWorkItemDisposition | ''>('');
  const [transitionPending, setTransitionPending] = useState(false);

  const [duplicatePickerOpen, setDuplicatePickerOpen] = useState(false);
  const [duplicatePending, setDuplicatePending] = useState<string | null>(null);
  const [duplicateUndoPending, setDuplicateUndoPending] = useState(false);

  const [evidenceType, setEvidenceType] = useState<OperationalWorkEvidenceType>('DOCUMENT');
  const [evidenceEntityId, setEvidenceEntityId] = useState('');
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [evidenceVerification, setEvidenceVerification] = useState<OperationalWorkEvidenceVerificationStatus | ''>('');
  const [evidencePending, setEvidencePending] = useState(false);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [approvalEvidenceId, setApprovalEvidenceId] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [approvalCostDollars, setApprovalCostDollars] = useState('');
  const [approvalObservedResult, setApprovalObservedResult] = useState<'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | ''>('');
  const [approvalPending, setApprovalPending] = useState(false);

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completePending, setCompletePending] = useState(false);

  const [scheduleMode, setScheduleMode] = useState<null | 'SNOOZE' | 'RESCHEDULE'>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [schedulePending, setSchedulePending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getWorkItem(propertyId, workItemId);
      if (res.success) setDetail(res.data);
      else throw new Error(res.message || 'Unable to load this work item.');
    } catch (error) {
      toast({
        title: 'Unable to load this task',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    api.listHouseholdMembers(propertyId).then(setMembers).catch(() => {});
    setOwnerPickerOpen(false);
    setWatcherPickerOpen(false);
    setDuplicatePickerOpen(false);
    setNextState('');
    setDisposition('');
    setEvidenceEntityId('');
    setEvidenceLabel('');
    setEvidenceVerification('');
    setScheduleMode(null);
    setScheduleDate('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, propertyId, workItemId]);

  useEffect(() => {
    if (!open || evidenceType !== 'DOCUMENT') return;
    api.listDocuments(propertyId)
      .then((res) => { if (res.success) setDocuments(res.data.documents); })
      .catch(() => {});
  }, [open, evidenceType, propertyId]);

  const refresh = async () => {
    await load();
    await onChanged();
  };

  const memberName = (userId: string | null) => {
    if (!userId) return null;
    const match = members.find((member) => member.userId === userId);
    return match ? getMemberDisplayName(match) : userId;
  };

  const handleAssign = async (userId: string) => {
    if (!detail) return;
    const nextOwnerId = userId === detail.ownerUserId ? null : userId;
    setOwnerPending(userId);
    try {
      const res = await api.assignWorkItemOwner(propertyId, workItemId, nextOwnerId);
      if (!res.success) throw new Error(res.message || 'Unable to assign owner.');
      toast({ title: nextOwnerId ? 'Owner updated' : 'Set back to no one' });
      setOwnerPickerOpen(false);
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to update this', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setOwnerPending(null);
    }
  };

  const handleAddWatcher = async (userId: string) => {
    setWatcherPending(userId);
    try {
      const res = await api.addWorkItemWatcher(propertyId, workItemId, userId);
      if (!res.success) throw new Error(res.message || 'Unable to add watcher.');
      toast({ title: 'Watching this item' });
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to add watcher', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setWatcherPending(null);
    }
  };

  const handleRemoveWatcher = async (userId: string) => {
    setWatcherPending(userId);
    try {
      const res = await api.removeWorkItemWatcher(propertyId, workItemId, userId);
      if (!res.success) throw new Error(res.message || 'Unable to remove watcher.');
      toast({ title: 'Stopped watching' });
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to remove watcher', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setWatcherPending(null);
    }
  };

  const handleTransition = async () => {
    if (!nextState) return;
    setTransitionPending(true);
    try {
      const res = await api.transitionWorkItem(
        propertyId,
        workItemId,
        nextState,
        disposition || undefined,
      );
      if (!res.success) throw new Error(res.message || 'Unable to change status.');
      toast({ title: `Status changed to ${STATE_LABELS[nextState]}` });
      setNextState('');
      setDisposition('');
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to change status', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setTransitionPending(false);
    }
  };

  const handleMarkDuplicate = async (candidate: WorkItemListEntryDTO) => {
    const confirmed = await requestConfirmation({
      title: 'Mark as duplicate?',
      description: `"${detail?.title}" will be treated as superseded by "${candidate.title}" and moved to Completed. You can undo this later.`,
      confirmLabel: 'Mark as duplicate',
    });
    if (!confirmed) return;

    setDuplicatePending(candidate.id);
    try {
      const res = await api.recordWorkItemDuplicateDecision(propertyId, workItemId, candidate.id);
      if (!res.success) throw new Error(res.message || 'Unable to record duplicate decision.');
      toast({ title: 'Marked as duplicate' });
      setDuplicatePickerOpen(false);
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to mark as duplicate', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setDuplicatePending(null);
    }
  };

  const handleUndoDuplicate = async () => {
    setDuplicateUndoPending(true);
    try {
      const res = await api.reverseWorkItemDuplicateDecision(propertyId, workItemId);
      if (!res.success) throw new Error(res.message || 'Unable to undo the duplicate decision.');
      toast({ title: 'Duplicate decision undone' });
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to undo duplicate', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setDuplicateUndoPending(false);
    }
  };

  const handleAddEvidence = async () => {
    const entityId = evidenceEntityId.trim() || synthesizeEvidenceEntityId(evidenceType, workItemId);
    setEvidencePending(true);
    try {
      const res = await api.recordWorkItemEvidence(propertyId, workItemId, {
        evidenceType,
        evidenceEntityId: entityId,
        verificationStatus: evidenceVerification || undefined,
      });
      if (!res.success) throw new Error(res.message || 'Unable to record evidence.');
      toast({ title: 'Evidence added' });
      setEvidenceEntityId('');
      setEvidenceLabel('');
      setEvidenceVerification('');
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to add evidence', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setEvidencePending(false);
    }
  };

  const handleApprove = async () => {
    if (!approvalEvidenceId || !approvalNote.trim()) return;
    setApprovalPending(true);
    try {
      const costCents = approvalCostDollars.trim() ? Math.round(Number(approvalCostDollars) * 100) : null;
      const res = await api.approveMaterialWorkItem(propertyId, workItemId, approvalEvidenceId, approvalNote.trim(), {
        costCents: Number.isFinite(costCents) ? costCents : null,
        observedResult: approvalObservedResult || null,
      });
      if (!res.success) throw new Error(res.message || 'Unable to confirm this.');
      toast({ title: 'Confirmed', description: 'The proof and your note are saved with this task.' });
      setApprovalEvidenceId('');
      setApprovalNote('');
      setApprovalCostDollars('');
      setApprovalObservedResult('');
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to confirm', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setApprovalPending(false);
    }
  };

  const handleSnooze = async () => {
    if (!scheduleDate) return;
    setSchedulePending(true);
    try {
      const res = await api.snoozeWorkItem(propertyId, workItemId, new Date(`${scheduleDate}T12:00:00.000Z`).toISOString());
      if (!res.success) throw new Error(res.message || 'Unable to snooze this task.');
      toast({ title: `Snoozed until ${formatDate(res.data.snoozedUntil) ?? scheduleDate}` });
      setScheduleMode(null);
      setScheduleDate('');
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to snooze', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setSchedulePending(false);
    }
  };

  const handleReschedule = async () => {
    if (!scheduleDate) return;
    setSchedulePending(true);
    try {
      const res = await api.rescheduleWorkItem(propertyId, workItemId, new Date(`${scheduleDate}T12:00:00.000Z`).toISOString());
      if (!res.success) throw new Error(res.message || 'Unable to reschedule this task.');
      toast({ title: `Now due ${formatDate(res.data.dueAt) ?? scheduleDate}` });
      setScheduleMode(null);
      setScheduleDate('');
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to reschedule', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setSchedulePending(false);
    }
  };

  const handleDismiss = async () => {
    const confirmed = await requestConfirmation({
      title: 'Mark this as not for you?',
      description: `"${detail?.title}" will move to Completed as skipped. You won't be reminded about it again.`,
      confirmLabel: 'Yes, not for me',
    });
    if (!confirmed) return;
    setTransitionPending(true);
    try {
      const useDisposition = detail?.closureDispositionRule !== 'FORBIDDEN';
      const res = await api.transitionWorkItem(
        propertyId, workItemId, 'CLOSED', useDisposition ? 'NOT_RELEVANT' : undefined,
      );
      if (!res.success) throw new Error(res.message || 'Unable to update this task.');
      toast({ title: 'Marked not for you' });
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to update this task', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setTransitionPending(false);
    }
  };

  const showDispositionField = nextState === 'CLOSED' && detail?.closureDispositionRule !== 'FORBIDDEN';
  const dispositionRequired = nextState === 'CLOSED' && detail?.closureDispositionRule === 'REQUIRED';

  // Home Intelligence Functional Completeness FRD Phase 4 review finding 2
  // gap fix (HI-OUT-003): completeAcceptedOperationalWorkItem/
  // completeWorkItemHandler only support a MAINTENANCE_TASK primary
  // execution today (homeActionCompletion.service.ts), and
  // assertCompletionEvidenceSatisfied unconditionally rejects
  // REGULATED_COVERAGE/SAFETY_EMERGENCY quick-completion (attestation:
  // INSUFFICIENT).
  const canQuickComplete = detail
    ? detail.executions.some((execution) => execution.executionType === 'MAINTENANCE_TASK')
    && (detail.safetyTier === 'LOW_CONSEQUENCE' || detail.safetyTier === 'MATERIAL_FINANCIAL')
    && !['VERIFIED', 'CLOSED', 'FOLLOW_UP_DUE'].includes(detail.state)
    : false;

  const isTerminal = detail ? ['VERIFIED', 'CLOSED'].includes(detail.state) : true;
  const canDismiss = Boolean(detail && !isTerminal && detail.legalNextStates.includes('CLOSED'));
  const showOwner = members.length > 1;
  const execution = detail ? executionHref(detail, propertyId) : null;
  const needsConfirmation = Boolean(detail?.materialApprovalRequired && !detail?.materialApprovedAt);

  const dueLabel = useMemo(() => {
    if (!detail) return null;
    if (detail.snoozedUntil && new Date(detail.snoozedUntil).getTime() > Date.now()) {
      return `Snoozed until ${formatDate(detail.snoozedUntil)}`;
    }
    return detail.dueAt ? `Due ${formatDate(detail.dueAt)}` : null;
  }, [detail]);

  const handleComplete = async (values: {
    completedAt: string;
    costCents: number | null;
    fulfillmentMode: 'DIY' | 'PROVIDER' | null;
    providerName: string | null;
    notes: string | null;
    observedResult: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | null;
    followUpNeeded: boolean;
    photoDocumentIds: string[];
  }) => {
    setCompletePending(true);
    try {
      const res = await api.completeWorkItem(propertyId, workItemId, {
        costCents: values.costCents,
        observedResult: values.observedResult,
        completedAt: values.completedAt,
        fulfillmentMode: values.fulfillmentMode,
        providerName: values.providerName,
        notes: values.notes,
        followUpNeeded: values.followUpNeeded,
        photoDocumentIds: values.photoDocumentIds,
      });
      if (!res.success) throw new Error(res.message || 'Unable to mark this done.');
      toast({ title: 'Marked done' });
      setCompleteDialogOpen(false);
      await refresh();
    } catch (error) {
      toast({ title: 'Unable to mark this done', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setCompletePending(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-slate-100 p-6 pb-4">
            <SheetTitle>{detail?.title ?? 'Task details'}</SheetTitle>
            <SheetDescription>
              {detail?.homeownerReason ?? 'What this is, when it’s due, and what you can do about it.'}
            </SheetDescription>
          </SheetHeader>

          {loading || !detail ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="space-y-6 p-6">
              {/* Status + timing */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="rounded-full">{FRIENDLY_STATE[detail.state]}</Badge>
                {detail.disposition && (
                  <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                    {FRIENDLY_DISPOSITION[detail.disposition]}
                  </Badge>
                )}
                {dueLabel && (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5" />{dueLabel}
                  </span>
                )}
              </div>

              {/* Everyday actions */}
              {isTerminal ? (
                <p className="text-sm text-slate-500">
                  This task is {FRIENDLY_STATE[detail.state].toLowerCase()} — nothing more to do here.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {canQuickComplete ? (
                      <Button size="sm" className="rounded-full" onClick={() => setCompleteDialogOpen(true)}>
                        Mark done
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => { setScheduleMode(scheduleMode === 'SNOOZE' ? null : 'SNOOZE'); setScheduleDate(''); }}
                    >
                      Snooze
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => { setScheduleMode(scheduleMode === 'RESCHEDULE' ? null : 'RESCHEDULE'); setScheduleDate(detail.dueAt ? isoDateOnly(new Date(detail.dueAt)) : ''); }}
                    >
                      Reschedule
                    </Button>
                    {canDismiss && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-slate-500 hover:text-slate-800"
                        disabled={transitionPending}
                        onClick={handleDismiss}
                      >
                        Not for me
                      </Button>
                    )}
                  </div>

                  {scheduleMode && (
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                      <p className="text-xs font-medium text-slate-600">
                        {scheduleMode === 'SNOOZE' ? 'Hide this until:' : 'Change the due date to:'}
                      </p>
                      {scheduleMode === 'SNOOZE' && (
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: 'In a week', days: 7 },
                            { label: 'In a month', days: 30 },
                          ].map((preset) => (
                            <Button
                              key={preset.days}
                              size="sm"
                              variant="outline"
                              className="rounded-full"
                              onClick={() => setScheduleDate(isoDateOnly(new Date(Date.now() + preset.days * 86_400_000)))}
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                      )}
                      <Input
                        type="date"
                        value={scheduleDate}
                        min={isoDateOnly(new Date())}
                        onChange={(event) => setScheduleDate(event.target.value)}
                      />
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={!scheduleDate || schedulePending}
                        onClick={scheduleMode === 'SNOOZE' ? handleSnooze : handleReschedule}
                      >
                        {schedulePending ? 'Saving…' : scheduleMode === 'SNOOZE' ? 'Snooze' : 'Reschedule'}
                      </Button>
                    </div>
                  )}

                  {!canQuickComplete && execution && (
                    <p className="text-xs leading-5 text-slate-500">
                      This gets marked done when the {EXECUTION_LABEL[detail.executions.find((e) => e.role === 'PRIMARY')?.executionType ?? ''] ?? 'linked work'} it belongs to is finished.
                    </p>
                  )}
                </div>
              )}

              {/* Who's handling it — only with a real household */}
              {showOwner && (
                <section className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Who&apos;s handling this?</h4>
                    <Button size="sm" variant="ghost" onClick={() => setOwnerPickerOpen((v) => !v)}>
                      {detail.ownerUserId ? 'Change' : 'Choose someone'}
                    </Button>
                  </div>
                  <p className="text-sm text-slate-600">{memberName(detail.ownerUserId) ?? 'No one yet'}</p>
                  {ownerPickerOpen && (
                    <WorkItemMemberPicker
                      propertyId={propertyId}
                      members={members}
                      highlightUserId={detail.ownerUserId}
                      pendingUserId={ownerPending}
                      onSelect={handleAssign}
                    />
                  )}
                </section>
              )}

              {/* Confirm the result — the material/safety approval, reframed */}
              {needsConfirmation && (
                <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-amber-950">Confirm the result</h4>
                    <p className="mt-1 text-xs text-amber-800">
                      This one affects {detail.safetyTier === 'SAFETY_EMERGENCY' ? 'safety' : 'a big expense'}, so it needs a quick check.
                      Pick the photo or document that shows it&apos;s done, add a short note, and confirm.
                    </p>
                  </div>
                  {detail.evidence.length === 0 ? (
                    <p className="text-xs text-amber-800">
                      Add a photo or document first (under Advanced options below), then come back to confirm.
                    </p>
                  ) : (
                    <>
                      <Select value={approvalEvidenceId} onValueChange={setApprovalEvidenceId}>
                        <SelectTrigger><SelectValue placeholder="Which photo or document shows it’s done?" /></SelectTrigger>
                        <SelectContent>
                          {detail.evidence.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {EVIDENCE_TYPE_LABELS[entry.evidenceType]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="What did you find?" />
                      {detail.safetyTier === 'MATERIAL_FINANCIAL' && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input type="number" min="0" step="0.01" value={approvalCostDollars} onChange={(event) => setApprovalCostDollars(event.target.value)} placeholder="Cost ($), if known" />
                          <Select value={approvalObservedResult} onValueChange={(value) => setApprovalObservedResult(value as typeof approvalObservedResult)}>
                            <SelectTrigger><SelectValue placeholder="How does it look?" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CONFIRMED_HEALTHY">Looks good</SelectItem>
                              <SelectItem value="NEEDS_ATTENTION">Needs attention</SelectItem>
                              <SelectItem value="FAILED">Failed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Button size="sm" disabled={!approvalEvidenceId || !approvalNote.trim() || approvalPending || (detail.safetyTier === 'MATERIAL_FINANCIAL' && !approvalCostDollars.trim() && !approvalObservedResult)} onClick={handleApprove}>
                        {approvalPending ? 'Confirming…' : 'Confirm'}
                      </Button>
                    </>
                  )}
                </section>
              )}

              {/* Link to the underlying record */}
              {execution && (
                <Link
                  href={execution.href}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/40"
                >
                  {execution.label}
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              )}

              {/* Advanced — the operational controls, out of the way */}
              <details className="group border-t border-slate-100 pt-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-500 hover:text-slate-800">
                  Advanced options
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-4 space-y-6">
                  <p className="font-mono text-[11px] leading-4 text-slate-400 break-all">{detail.workKey}</p>

                  {/* Raw status */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Change status</h4>
                    {detail.legalNextStates.length === 0 ? (
                      <p className="text-sm text-slate-500">This item is closed — no further status changes are possible.</p>
                    ) : (
                      <div className="space-y-2">
                        <Select value={nextState} onValueChange={(value) => { setNextState(value as OperationalWorkItemState); setDisposition(''); }}>
                          <SelectTrigger><SelectValue placeholder="Choose a new status" /></SelectTrigger>
                          <SelectContent>
                            {detail.legalNextStates.map((state) => (
                              <SelectItem key={state} value={state}>{STATE_LABELS[state]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {showDispositionField && (
                          <Select value={disposition} onValueChange={(value) => setDisposition(value as OperationalWorkItemDisposition)}>
                            <SelectTrigger>
                              <SelectValue placeholder={dispositionRequired ? 'Reason (required)' : 'Reason (optional)'} />
                            </SelectTrigger>
                            <SelectContent>
                              {DISPOSITION_OPTIONS.map((value) => (
                                <SelectItem key={value} value={value}>{DISPOSITION_LABELS[value]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={!nextState || (dispositionRequired && !disposition) || transitionPending}
                          onClick={handleTransition}
                        >
                          {transitionPending ? 'Updating…' : 'Update status'}
                        </Button>
                      </div>
                    )}
                  </section>

                  {/* Watchers */}
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Watchers</h4>
                      <Button size="sm" variant="ghost" onClick={() => setWatcherPickerOpen((v) => !v)}>Add watcher</Button>
                    </div>
                    {detail.watchers.length === 0 ? (
                      <p className="text-sm text-slate-500">No one is watching this item.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.watchers.map((watcher) => (
                          <li key={watcher.userId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                            <span className="text-slate-700">{memberName(watcher.userId) ?? watcher.userId}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveWatcher(watcher.userId)}
                              disabled={watcherPending !== null}
                              className="text-xs font-medium text-slate-400 hover:text-slate-700 disabled:opacity-60"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {watcherPickerOpen && (
                      <WorkItemMemberPicker
                        propertyId={propertyId}
                        members={members}
                        excludeUserIds={detail.watchers.map((w) => w.userId)}
                        pendingUserId={watcherPending}
                        onSelect={handleAddWatcher}
                        emptyLabel="Every household member is already watching this item."
                      />
                    )}
                  </section>

                  {/* Evidence */}
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Evidence</h4>
                    {detail.evidence.length > 0 && (
                      <ul className="space-y-1.5">
                        {detail.evidence.map((entry, index) => (
                          <li key={`${entry.evidenceType}-${entry.evidenceEntityId}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                            <span className="font-medium text-slate-800">{EVIDENCE_TYPE_LABELS[entry.evidenceType]}</span>
                            {entry.verificationStatus && (
                              <span className="ml-2 text-xs text-slate-500">{entry.verificationStatus.toLowerCase()}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                      <Select value={evidenceType} onValueChange={(value) => { setEvidenceType(value as OperationalWorkEvidenceType); setEvidenceEntityId(''); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EVIDENCE_TYPE_OPTIONS.map((value) => (
                            <SelectItem key={value} value={value}>{EVIDENCE_TYPE_LABELS[value]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {evidenceType === 'DOCUMENT' ? (
                        <Select value={evidenceEntityId} onValueChange={setEvidenceEntityId}>
                          <SelectTrigger><SelectValue placeholder="Choose a document" /></SelectTrigger>
                          <SelectContent>
                            {documents.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-slate-500">No documents found for this property.</div>
                            ) : documents.map((doc) => (
                              <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <>
                          <Input
                            placeholder={evidenceType === 'USER_ATTESTATION' ? 'What are you attesting to?' : 'What is this evidence?'}
                            value={evidenceLabel}
                            onChange={(event) => setEvidenceLabel(event.target.value)}
                          />
                          <Input
                            placeholder="Reference ID (optional — leave blank to auto-generate)"
                            value={evidenceEntityId}
                            onChange={(event) => setEvidenceEntityId(event.target.value)}
                          />
                          <p className="text-xs text-slate-400">
                            This is saved as a reference ID only — there&apos;s no separate notes field yet, so the description above won&apos;t be stored elsewhere.
                          </p>
                        </>
                      )}

                      <Select value={evidenceVerification} onValueChange={(value) => setEvidenceVerification(value as OperationalWorkEvidenceVerificationStatus)}>
                        <SelectTrigger><SelectValue placeholder="Verification status (optional)" /></SelectTrigger>
                        <SelectContent>
                          {VERIFICATION_STATUS_OPTIONS.filter((value) =>
                            value !== 'VERIFIED' || (evidenceType === 'USER_ATTESTATION' && detail.safetyTier === 'LOW_CONSEQUENCE')
                          ).map((value) => (
                            <SelectItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={evidencePending || (evidenceType === 'DOCUMENT' && !evidenceEntityId)}
                        onClick={handleAddEvidence}
                      >
                        {evidencePending ? 'Adding…' : 'Add evidence'}
                      </Button>
                    </div>
                  </section>

                  {/* Duplicate */}
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Duplicate</h4>
                      {detail.supersededByWorkItemId ? (
                        <Button size="sm" variant="ghost" disabled={duplicateUndoPending} onClick={handleUndoDuplicate}>{duplicateUndoPending ? 'Undoing…' : 'Undo duplicate'}</Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDuplicatePickerOpen((v) => !v)}>Mark as duplicate…</Button>
                      )}
                    </div>
                    {detail.supersededByWorkItemId && (
                      <p className="text-sm text-slate-500">Already marked as superseded by another work item.</p>
                    )}
                    {duplicatePickerOpen && !detail.supersededByWorkItemId && (
                      <WorkItemDuplicatePicker
                        propertyId={propertyId}
                        excludeWorkItemId={workItemId}
                        pendingWorkItemId={duplicatePending}
                        onSelect={handleMarkDuplicate}
                      />
                    )}
                  </section>
                </div>
              </details>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {canQuickComplete && (
        <RichCompletionDialog
          open={completeDialogOpen}
          onOpenChange={setCompleteDialogOpen}
          propertyId={propertyId}
          submitting={completePending}
          costRequired={detail?.safetyTier === 'MATERIAL_FINANCIAL'}
          safetyTier={detail?.safetyTier}
          obligationType={detail?.obligationType}
          onSubmit={handleComplete}
        />
      )}
      {confirmationDialog}
    </>
  );
}
