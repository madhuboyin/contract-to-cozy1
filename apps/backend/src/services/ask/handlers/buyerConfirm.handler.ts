// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskExecution, BuyerFindingDisposition, HouseholdRole, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type EditAskConfirmation } from '../../../productFramework/ask/ask.contract';
import { HomeBuyerTaskService } from '../../HomeBuyerTask.service';
import { BuyerAcquisitionService } from '../../buyerAcquisition.service';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { humanDate } from '../askFormatting';
import { asInputJson, BUYER_FINDING_DISPOSITION_LABELS, isValidDateEditInput, mapPersistedExecution, preservedExecutionHistory, propertySummary } from '../askHandlerSupport';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { buyerFindingConflictDescription, buyerPlanHref, buyerTaskConflictDescription, buyerTaskVersion } from '../handlers/buyerPlan.handler';

async function confirmBuyerTaskComplete(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete Buyer Plan tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const taskId = parameters.buyerTaskId;
    if (typeof taskId !== 'string') {
      const error = new Error('The Buyer Plan task selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const task = await prisma.homeBuyerTask.findFirst({ where: { id: taskId, checklist: { propertyId: execution.propertyId } } });
    if (!task) {
      const error = new Error('The selected Buyer Plan task is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const completionIdempotencyKey = `ask:${execution.id}:buyer-task-completion`;
    const completionEvidence = task.completionEvidenceJson && typeof task.completionEvidenceJson === 'object' && !Array.isArray(task.completionEvidenceJson)
      ? task.completionEvidenceJson as Record<string, unknown>
      : {};
    const completedByThisExecution = task.status === 'COMPLETED' && completionEvidence.completionIdempotencyKey === completionIdempotencyKey;
    if (!completedByThisExecution && (task.status === 'COMPLETED'
      || task.status === 'CANCELLED'
      || task.status === 'NOT_NEEDED'
      || parameters.buyerTaskVersion !== buyerTaskVersion(task))) {
      const error = new Error(buyerTaskConflictDescription(task));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const updated = completedByThisExecution
      ? task
      : await HomeBuyerTaskService.updateTask(userId, execution.propertyId, task.id, {
        status: 'COMPLETED',
        completionEvidenceJson: { proofType: 'USER_ATTESTATION', confirmedByUserId: userId, confirmedAt: new Date().toISOString(), completionIdempotencyKey },
      });
    const buyerTaskHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan?taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_TASK_COMPLETED', contextVersion: buyerTaskVersion(updated),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-task-completed-${updated.id}`, title: 'Buyer Plan task completed', status: 'COMPLETED',
        description: 'Completion is recorded in this purchase’s canonical Buyer Plan and closing readiness is updated.',
        details: [
          { label: 'Task', value: updated.title },
          { label: 'Completion method', value: 'User attestation' },
        ],
        actions: [{ id: 'open-task', label: 'Open completed task', href: buyerTaskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What should I do next for this purchase?', 'What is due before closing?'],
    };
    artifactType = 'HOME_BUYER_TASK';
    artifactId = updated.id;
    // B03 fix: previously called no reconciliation mechanism at all -- not
    // even the single-target one BUYER_TASK_UPDATE had before B04.
    // Completing a task changes the same BUYER_PLAN_STATUS/BUYER_DEADLINES
    // membership/counts a reschedule does, so it shares B04's exact
    // mechanism (reconcileAskExecutionSideEffects), not a new one.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-task-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This completion was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmBuyerTaskCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to add Buyer Plan tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const title = parameters.buyerTaskTitle;
    if (typeof title !== 'string' || !title.trim()) {
      const error = new Error('The closing checklist item title is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const dueAt = typeof parameters.buyerTaskDueAt === 'string' ? parameters.buyerTaskDueAt : null;
    const actionKey = `ask:${execution.id}:buyer-task-create`;
    let created = await prisma.homeBuyerTask.findFirst({ where: { actionKey, checklist: { propertyId: execution.propertyId } } });
    if (!created) {
      try {
        created = await HomeBuyerTaskService.createTask(userId, execution.propertyId, {
          title, actionKey, dueAt, phase: 'CLOSING_PREP', priority: 'PLAN',
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        created = await prisma.homeBuyerTask.findFirst({ where: { actionKey, checklist: { propertyId: execution.propertyId } } });
        if (!created) throw error;
      }
    }
    const buyerTaskHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan?taskId=${encodeURIComponent(created.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_TASK_CREATED', contextVersion: buyerTaskVersion(created),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-task-created-${created.id}`, title: 'Closing checklist item added', status: 'COMPLETED',
        description: 'The task is recorded in this purchase’s canonical Buyer Plan.',
        details: [
          { label: 'Task', value: created.title },
          { label: 'Due', value: created.dueAt ? humanDate(created.dueAt) ?? 'Not scheduled' : 'Not scheduled' },
        ],
        actions: [{ id: 'open-task', label: 'Open new task', href: buyerTaskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What should I do next for this purchase?'],
    };
    artifactType = 'HOME_BUYER_TASK';
    artifactId = created.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's BUYER_TASK_CREATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-task-create-refresh-failed-${created.id}`, title: 'Saved; list could not refresh',
        body: 'This task was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmBuyerTaskUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to update Buyer Plan tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const taskId = parameters.buyerTaskId;
    if (typeof taskId !== 'string') {
      const error = new Error('The Buyer Plan task selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const task = await prisma.homeBuyerTask.findFirst({ where: { id: taskId, checklist: { propertyId: execution.propertyId } } });
    if (!task || parameters.buyerTaskVersion !== buyerTaskVersion(task)) {
      const error = new Error(task ? buyerTaskConflictDescription(task) : 'The selected Buyer Plan task is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const buyerAction = parameters.buyerTaskAction;
    const dueAt = typeof parameters.buyerTaskDueAt === 'string' ? parameters.buyerTaskDueAt : undefined;
    const assigneeUserId = parameters.buyerTaskAssigneeUserId === null ? null : typeof parameters.buyerTaskAssigneeUserId === 'string' ? parameters.buyerTaskAssigneeUserId : undefined;
    const updated = await HomeBuyerTaskService.updateTask(userId, execution.propertyId, task.id, {
      ...(buyerAction === 'RESCHEDULE' && dueAt ? { dueAt } : {}),
      ...(buyerAction === 'ASSIGN' || buyerAction === 'UNASSIGN' ? { assignedToUserId: assigneeUserId } : {}),
    });
    const buyerTaskHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan?taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_TASK_UPDATED', contextVersion: buyerTaskVersion(updated),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-task-updated-${updated.id}`, title: 'Buyer Plan task updated', status: 'COMPLETED',
        description: 'The change is recorded in this purchase’s canonical Buyer Plan.',
        details: [
          { label: 'Task', value: updated.title },
          ...(dueAt ? [{ label: 'New due date', value: dueAt }] : []),
        ],
        actions: [{ id: 'open-task', label: 'Open updated task', href: buyerTaskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What should I do next for this purchase?'],
    };
    artifactType = 'HOME_BUYER_TASK';
    artifactId = updated.id;
    // B04 fix: previously never reconciled any other visible Buyer result
    // (e.g. BUYER_DEADLINES, which the rescheduled/reassigned task may
    // appear in) after this write succeeded -- confirmed by direct read that
    // this handler never populated refreshedExecutions at all. Reconciles
    // both the explicit sourceExecutionId (the one list this row-action was
    // launched from) AND the server-owned sibling-impact map (every OTHER
    // still-visible Buyer result this operation may have affected) via
    // reconcileAskExecutionSideEffects, not just the single-target mechanism
    // Maintenance's own reference implementation used alone.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-task-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This change was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmBuyerFindingDisposition(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to classify Buyer Plan findings.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const findingId = parameters.buyerFindingId;
    const disposition = parameters.buyerFindingDisposition;
    if (typeof findingId !== 'string' || typeof disposition !== 'string') {
      const error = new Error('The finding selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const finding = await prisma.inspectionFinding.findFirst({ where: { id: findingId, propertyId: execution.propertyId } });
    if (!finding) {
      const error = new Error('The selected finding is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const expectedFindingVersion = parameters.buyerFindingVersion;
    const currentFindingVersion = finding.buyerDispositionAt ? finding.buyerDispositionAt.toISOString() : null;
    if (expectedFindingVersion !== currentFindingVersion) {
      const error = new Error(buyerFindingConflictDescription(finding));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const dispositionResult = await BuyerAcquisitionService.dispositionFinding(userId, execution.propertyId, finding.id, {
      disposition: disposition as Exclude<BuyerFindingDisposition, 'PENDING_REVIEW'>,
    });
    const dispositionLabel = BUYER_FINDING_DISPOSITION_LABELS[disposition] ?? disposition;
    const inspectionHref = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/inspection-hub`;
    result = {
      status: 'COMPLETED', reasonCode: 'BUYER_FINDING_DISPOSITIONED', contextVersion: dispositionResult.finding.buyerDispositionAt?.toISOString() ?? null,
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `buyer-finding-dispositioned-${finding.id}`, title: 'Finding classified', status: 'COMPLETED',
        description: `This finding is now classified as ${dispositionLabel}.`,
        details: [
          { label: 'Finding', value: [finding.homeSystem, finding.subsystem].filter(Boolean).join(' ') },
          { label: 'Disposition', value: dispositionLabel },
        ],
        actions: [{ id: 'open-inspection-hub', label: 'Open Inspection Hub', href: inspectionHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['Which inspection findings still need a decision?', 'What should I do next for this purchase?'],
    };
    artifactType = 'INSPECTION_FINDING';
    artifactId = finding.id;
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's BUYER_FINDING_DISPOSITION entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-finding-disposition-refresh-failed-${finding.id}`, title: 'Saved; list could not refresh',
        body: 'This classification was saved to the canonical record. The findings list you were viewing could not refresh automatically -- ask "Which inspection findings still need a decision?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'Which inspection findings still need a decision?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmBuyerLifecycleUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const lifecycleAction = parameters.buyerLifecycleAction;
    const buyerPlanHrefValue = `/dashboard/properties/${encodeURIComponent(execution.propertyId)}/buyer-plan`;
    if (lifecycleAction === 'PAUSE' || lifecycleAction === 'RESUME') {
      if (access.role !== HouseholdRole.OWNER) {
        const error = new Error(`Only the property owner can ${lifecycleAction === 'RESUME' ? 'resume' : 'pause'} this purchase.`);
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      const updatedPlan = lifecycleAction === 'RESUME'
        ? await BuyerAcquisitionService.resumeJourney(userId, execution.propertyId, { confirmed: true })
        : await BuyerAcquisitionService.pauseJourney(userId, execution.propertyId, { confirmed: true });
      result = {
        status: 'COMPLETED', reasonCode: lifecycleAction === 'RESUME' ? 'BUYER_JOURNEY_RESUMED' : 'BUYER_JOURNEY_PAUSED', contextVersion: updatedPlan.updatedAt.toISOString(),
        blocks: [{
          type: 'WORKFLOW_PROGRESS', id: `buyer-lifecycle-${lifecycleAction.toLowerCase()}`, title: lifecycleAction === 'RESUME' ? 'Purchase resumed' : 'Purchase paused', status: 'COMPLETED',
          description: lifecycleAction === 'RESUME' ? 'Deadline reminders and active tasks are reactivated.' : 'Deadline reminders are stopped. Recorded work, documents, findings, and evidence are preserved.',
          details: [],
          actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: buyerPlanHrefValue, style: 'PRIMARY' }],
        }],
        confirmation: null,
        suggestions: [],
      };
      artifactType = 'HOME_BUYER_CHECKLIST';
      artifactId = updatedPlan.id;
    } else if (lifecycleAction === 'CANCEL') {
      if (access.role !== HouseholdRole.OWNER) {
        const error = new Error('Only the property owner can cancel this purchase.');
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      const cancelReason = parameters.buyerCancelReason;
      if (typeof cancelReason !== 'string' || cancelReason.trim().length < 5) {
        const error = new Error('A cancellation reason of at least 5 characters is required.');
        (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
        throw error;
      }
      const cancelled = await BuyerAcquisitionService.cancelJourney(userId, execution.propertyId, { confirmed: true, reason: cancelReason });
      result = {
        status: 'COMPLETED', reasonCode: 'BUYER_JOURNEY_CANCELLED', contextVersion: cancelled.updatedAt.toISOString(),
        blocks: [{
          type: 'WORKFLOW_PROGRESS', id: 'buyer-lifecycle-cancelled', title: 'Purchase cancelled', status: 'COMPLETED',
          description: 'Reminders are stopped and open work is archived. Completed work, documents, findings, and evidence are preserved.',
          details: [{ label: 'Reason', value: cancelReason }],
          actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: buyerPlanHrefValue, style: 'PRIMARY' }],
        }],
        confirmation: null,
        suggestions: [],
      };
      artifactType = 'HOME_BUYER_CHECKLIST';
      artifactId = cancelled.id;
    } else if (lifecycleAction === 'RESCHEDULE_CLOSING' || lifecycleAction === 'RESCHEDULE_MOVE_IN') {
      if (access.role === HouseholdRole.VIEWER) {
        const error = new Error('A contributor or owner is required to change this purchase’s recorded dates.');
        (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
        throw error;
      }
      const newDate = parameters.buyerLifecycleDate;
      if (typeof newDate !== 'string') {
        const error = new Error('The new date is invalid.');
        (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
        throw error;
      }
      const updatedChecklist = await BuyerAcquisitionService.updateLifecycle(
        userId,
        execution.propertyId,
        lifecycleAction === 'RESCHEDULE_MOVE_IN' ? { moveInDate: newDate } : { targetCloseDate: newDate },
      );
      result = {
        status: 'COMPLETED', reasonCode: 'BUYER_LIFECYCLE_DATE_UPDATED', contextVersion: updatedChecklist.updatedAt.toISOString(),
        blocks: [{
          type: 'WORKFLOW_PROGRESS', id: 'buyer-lifecycle-date-updated', title: lifecycleAction === 'RESCHEDULE_MOVE_IN' ? 'Move-in date updated' : 'Target closing date updated', status: 'COMPLETED',
          description: 'Unedited task due dates were recalculated from the new date.',
          details: [{ label: 'New date', value: newDate }],
          actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: buyerPlanHrefValue, style: 'PRIMARY' }],
        }],
        confirmation: null,
        suggestions: [],
      };
      artifactType = 'HOME_BUYER_CHECKLIST';
      artifactId = updatedChecklist.id;
    } else {
      const error = new Error('This lifecycle action is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    // IW-FRESH-003 fix: previously called no reconciliation mechanism at
    // all -- see ASK_MUTATION_IMPACT_MAP's BUYER_LIFECYCLE_UPDATE entry.
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-lifecycle-refresh-failed-${artifactId}`, title: 'Saved; list could not refresh',
        body: 'This change was saved to the canonical Buyer Plan. The list you were viewing could not refresh automatically -- ask "What should I do next for this purchase?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What should I do next for this purchase?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('buyer.task.complete', confirmBuyerTaskComplete);

registerConfirmCapabilityHandler('buyer.task.create', confirmBuyerTaskCreate);

registerConfirmCapabilityHandler('buyer.task.update', confirmBuyerTaskUpdate);

registerConfirmCapabilityHandler('buyer.finding.disposition', confirmBuyerFindingDisposition);

registerConfirmCapabilityHandler('buyer.lifecycle.update', confirmBuyerLifecycleUpdate);

// B04 fix: BUYER_TASK_UPDATE's own reschedule-edit path, mirroring
// MAINTENANCE_TASK_UPDATE's edit handling above exactly (same shared-caller
// checks, same version-and-status-guarded optimistic write, same
// CONFIRMATION_EDITED event) but against Buyer's own flat parameter shape
// (parameters.buyerTaskAction/buyerTaskId/buyerTaskDueAt, not a single
// nested maintenanceUpdate object) and its own canonical model
// (prisma.homeBuyerTask, not propertyMaintenanceTask). Only RESCHEDULE is
// editable, same restriction Maintenance's own edit path has.
export async function editBuyerTaskUpdateConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  if (parameters.buyerTaskAction !== 'RESCHEDULE') {
    const error = new Error('Editing is only available for a reschedule proposal.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  const taskId = parameters.buyerTaskId;
  if (typeof taskId !== 'string') {
    const error = new Error('The Buyer Plan task selection is invalid.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  const dueAtEdit = input.edits.dueAt;
  if (!isValidDateEditInput(dueAtEdit)) {
    const error = new Error('Enter a valid date.');
    (error as Error & { code?: string }).code = 'ASK_INVALID_CONFIRMATION_EDIT';
    throw error;
  }
  const task = await prisma.homeBuyerTask.findFirst({ where: { id: taskId, checklist: { propertyId: execution.propertyId! } } });
  if (!task) {
    const error = new Error('The selected Buyer Plan task is no longer available.');
    (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
    throw error;
  }
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const taskHref = `${buyerPlanHref(execution.propertyId!)}?${new URLSearchParams({ taskId: task.id }).toString()}`;
  const newConfirmation = {
    confirmationId: `buyer-task-update-${task.id}-${nextVersion}`, version: nextVersion, title: `Reschedule ${task.title}?`,
    description: 'This command writes through the canonical Buyer Plan and preserves closing readiness.',
    fields: [
      { label: 'Task', value: task.title }, { label: 'Action', value: 'reschedule' },
      { label: 'Current due date', value: task.dueAt ? (humanDate(task.dueAt) ?? 'Not scheduled') : 'Not scheduled' },
    ],
    editableFields: [{ key: 'dueAt', label: 'New due date', type: 'DATE' as const, value: dueAtEdit }],
    confirmLabel: 'Confirm reschedule', consentText: 'I authorize this reschedule of the shared Buyer Plan.', expiresAt: expiresAt.toISOString(),
  };
  // Same optimistic status-and-version-guarded write as Maintenance's own
  // edit path above -- see its comment for why both are required, not just
  // the version.
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, buyerTaskDueAt: dueAtEdit, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'SUMMARY', id: 'buyer-task-update-review', title: 'Review this reschedule', body: 'No shared Buyer Plan record has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: taskHref, style: 'SECONDARY' }] }],
        captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY', id: 'buyer-task-update-review', title: 'Review this reschedule', body: 'No shared Buyer Plan record has changed yet.', tone: 'DEFAULT', actions: [] }]),
      }),
    },
  });
  if (editWrite.count !== 1) {
    const error = new Error('This confirmation changed before your edit was applied. Review the current proposal and try again.');
    (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
    throw error;
  }
  await prisma.askExecutionEvent.create({
    data: { executionId: execution.id, eventType: 'CONFIRMATION_EDITED', metadataJson: asInputJson({ previousVersion: input.confirmationVersion, newVersion: nextVersion, editedFields: Object.keys(input.edits) }) },
  });
  const saved = await prisma.askExecution.findUniqueOrThrow({ where: { id: execution.id } });
  return mapPersistedExecution(saved, await propertySummary(execution.propertyId));
}
