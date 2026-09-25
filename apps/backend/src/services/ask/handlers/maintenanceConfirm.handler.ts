// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { AskExecution, HouseholdRole, MaintenanceTaskStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskExecutionResponse, type EditAskConfirmation } from '../../../productFramework/ask/ask.contract';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { humanDate } from '../askFormatting';
import { asInputJson, isValidDateEditInput, MaintenanceTaskUpdateInputSchema, MaintenanceTaskWorkflowInputSchema, mapPersistedExecution, preservedExecutionHistory, propertySummary } from '../askHandlerSupport';
import { householdService } from '../handlers/homeRecordWrites.handler';
import { reconcileAskExecutionSideEffects, refreshAskSourceExecution } from '../execution/executeOperation';
import { maintenanceConflictDescription, maintenanceMoney, maintenanceTaskVersion, maintenanceWorkflowVersion } from '../handlers/maintenance.handler';

async function confirmMaintenanceTaskComplete(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to complete maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const taskId = parameters.maintenanceTaskId;
    if (typeof taskId !== 'string') {
      const error = new Error('The maintenance task selection is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: taskId, propertyId: execution.propertyId } });
    if (!task) {
      const error = new Error('The selected maintenance task is no longer available.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const completionIdempotencyKey = `ask:${execution.id}:maintenance-completion`;
    const completionMetadata = task.completionMetadata && typeof task.completionMetadata === 'object' && !Array.isArray(task.completionMetadata)
      ? task.completionMetadata as Record<string, unknown>
      : {};
    const completedByThisExecution = task.status === MaintenanceTaskStatus.COMPLETED
      && completionMetadata.completionIdempotencyKey === completionIdempotencyKey;
    if (!completedByThisExecution && (task.status === MaintenanceTaskStatus.COMPLETED
      || task.status === MaintenanceTaskStatus.CANCELLED
      || parameters.maintenanceTaskVersion !== maintenanceTaskVersion(task))) {
      const error = new Error(maintenanceConflictDescription(task));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const actualCostUsd = parameters.maintenanceActualCostUsd;
    const outcomeHealth = parameters.maintenanceOutcomeHealth;
    if (actualCostUsd !== null && actualCostUsd !== undefined && (typeof actualCostUsd !== 'number' || actualCostUsd < 0 || actualCostUsd > 10_000_000)) {
      const error = new Error('The actual maintenance cost is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const projectOutcomeRequired = Boolean(task.actionKey?.match(/^project:[^:]+:follow-up$/));
    if (projectOutcomeRequired && !['CONFIRMED_HEALTHY', 'NEEDS_ATTENTION', 'FAILED'].includes(String(outcomeHealth))) {
      const error = new Error('Select the project follow-up outcome before completing this task.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const updated = completedByThisExecution
      ? task
      : await PropertyMaintenanceTaskService.updateTaskStatus(
        userId,
        task.id,
        MaintenanceTaskStatus.COMPLETED,
        typeof actualCostUsd === 'number' ? actualCostUsd : undefined,
        projectOutcomeRequired ? outcomeHealth as 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' : undefined,
        completionIdempotencyKey,
      );
    const taskHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_COMPLETED', contextVersion: maintenanceTaskVersion(updated),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `maintenance-completed-${updated.id}`, title: 'Maintenance task completed', status: 'COMPLETED',
        description: updated.isRecurring && updated.frequency
          ? 'This occurrence is complete and the recurring task’s next due date has been recalculated.'
          : 'Completion is recorded in this home’s canonical Maintenance record.',
        details: [
          { label: 'Task', value: updated.title },
          { label: 'Completed', value: humanDate(updated.lastCompletedDate) ?? 'Recorded now' },
          { label: 'Actual cost', value: updated.actualCost == null ? 'Not recorded' : maintenanceMoney(updated.actualCost) ?? 'Not recorded' },
          ...(updated.isRecurring ? [{ label: 'Next due', value: humanDate(updated.nextDueDate) ?? 'Not scheduled' }] : []),
          ...(projectOutcomeRequired ? [{ label: 'Project outcome', value: String(outcomeHealth).toLowerCase().replace(/_/g, ' ') }] : []),
        ],
        actions: [{ id: 'open-task', label: 'Open completed task', href: taskHref, style: 'PRIMARY' }],
      }],
      confirmation: null,
      suggestions: ['What maintenance is still pending?', 'Show maintenance completed this year'],
    };
    artifactType = 'PROPERTY_MAINTENANCE_TASK_COMPLETION';
    artifactId = updated.id;
    const refresh = await refreshAskSourceExecution(userId, execution.id, parameters);
    // CONF-005: a refresh failure must never look like the mutation itself
    // failed or invite a repeat -- the completion above already succeeded
    // and is not touched. Disclose the stale list honestly with a concrete,
    // non-repeating way to see current state, exactly the required
    // "Saved; list could not refresh" shape.
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `maintenance-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This completion was saved to the canonical Maintenance record. The pending list you were viewing could not refresh automatically -- ask "What maintenance is pending?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What maintenance is pending?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmMaintenanceTaskCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    if (access.role === HouseholdRole.VIEWER) {
      const error = new Error('A contributor or owner is required to create maintenance tasks.');
      (error as Error & { code?: string }).code = 'ASK_PERMISSION_REQUIRED';
      throw error;
    }
    const expectedMaintenanceVersion = parameters.maintenanceWorkflowVersion;
    const currentMaintenanceVersion = await maintenanceWorkflowVersion(execution.propertyId);
    const candidate = MaintenanceTaskWorkflowInputSchema.safeParse({
      title: parameters.maintenanceTitle,
      description: parameters.maintenanceDescription ?? undefined,
      priority: parameters.maintenancePriority,
      nextDueDate: parameters.maintenanceNextDueDate ?? undefined,
      estimatedCostUsd: parameters.maintenanceEstimatedCostUsd ?? undefined,
      isRecurring: parameters.maintenanceIsRecurring,
      frequency: parameters.maintenanceFrequency ?? undefined,
    });
    if (!candidate.success || expectedMaintenanceVersion !== currentMaintenanceVersion) {
      const error = new Error(expectedMaintenanceVersion !== currentMaintenanceVersion
        ? 'Maintenance tasks changed while this confirmation was open. Review the current record and try again.'
        : 'The maintenance task details are invalid.');
      (error as Error & { code?: string }).code = expectedMaintenanceVersion !== currentMaintenanceVersion
        ? 'ASK_CONTEXT_VERSION_CONFLICT'
        : 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const actionKey = `ask:${execution.id}:maintenance-task`;
    let task = await prisma.propertyMaintenanceTask.findUnique({
      where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } },
    });
    if (!task) {
      try {
        task = await PropertyMaintenanceTaskService.createUserTask(userId, execution.propertyId, {
          title: candidate.data.title,
          description: candidate.data.description,
          priority: candidate.data.priority,
          estimatedCost: candidate.data.estimatedCostUsd,
          isRecurring: candidate.data.isRecurring,
          frequency: candidate.data.isRecurring ? candidate.data.frequency : undefined,
          nextDueDate: candidate.data.nextDueDate,
          actionKey,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        task = await prisma.propertyMaintenanceTask.findUnique({
          where: { propertyId_actionKey: { propertyId: execution.propertyId, actionKey } },
        });
        if (!task) throw error;
      }
    }
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(task.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_CREATED', contextVersion: await maintenanceWorkflowVersion(execution.propertyId),
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `maintenance-task-${task.id}`, title: 'Maintenance task created', status: 'COMPLETED',
        description: 'The task is now part of this home’s canonical Maintenance record.',
        details: [
          { label: 'Task', value: task.title },
          { label: 'Status', value: 'Pending' },
          { label: 'Priority', value: task.priority.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) },
          { label: 'Due', value: task.nextDueDate ? humanDate(task.nextDueDate) ?? task.nextDueDate.toISOString() : 'Not scheduled' },
          { label: 'Recurrence', value: task.isRecurring && task.frequency ? task.frequency.toLowerCase().replace(/_/g, ' ') : 'One-time' },
        ],
        actions: [],
      }, {
        type: 'OUTPUT_ARTIFACTS', id: `maintenance-output-${task.id}`, title: 'Created record',
        items: [{
          artifactType: 'PROPERTY_MAINTENANCE_TASK', artifactId: task.id, relationship: 'CREATED',
          label: task.title, status: task.status, createdAt: task.createdAt.toISOString(),
          navigation: { label: 'Open task in Maintenance', href: maintenanceHref },
        }],
      }],
      confirmation: null,
      suggestions: ['What maintenance is still pending?', 'Create another maintenance task'],
    };
    artifactType = 'PROPERTY_MAINTENANCE_TASK';
    artifactId = task.id;
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: 'maintenance-create-refresh-limitation', title: 'Task saved; list could not refresh',
      body: 'The maintenance task was created successfully, but the earlier Ask Cozy list could not be refreshed. Refresh that result or ask for pending maintenance again.',
      severity: 'CAUTION', suggestions: ['What maintenance is still pending?'],
    });
  }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmMaintenanceTaskUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access, command } = ctx;
  let result: AskOperationResult;
  let artifactType: string;
  let artifactId: string;
    const candidate = MaintenanceTaskUpdateInputSchema.safeParse(parameters.maintenanceUpdate);
    if (!candidate.success) {
      const error = new Error('The maintenance update is invalid.');
      (error as Error & { code?: string }).code = 'ASK_CONFIRMATION_NOT_ACTIVE';
      throw error;
    }
    const current = await prisma.propertyMaintenanceTask.findFirst({ where: { id: candidate.data.taskId, propertyId: execution.propertyId } });
    if (!current) {
      const error = new Error('This task is no longer available. It may have been deleted.');
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    const isFieldPatchAction = candidate.data.action !== 'ASSIGN' && candidate.data.action !== 'UNASSIGN'
      && candidate.data.action !== 'ARCHIVE' && candidate.data.action !== 'REOPEN';
    // External review [P2] follow-up: a recovery retry of THIS SAME
    // execution (its confirmation receipt reclaimed after a crash between
    // the write below committing and the receipt being marked COMPLETED)
    // re-runs this whole handler with the ORIGINAL, pre-update
    // maintenanceTaskVersion -- current now reflects that already-applied
    // write, so the version check below would otherwise misreport the
    // execution's own prior success as "changed in another session."
    // Recognizing this execution's own idempotency key on the row (set by
    // updateTask below on the write that already succeeded) short-circuits
    // both the version check and the write itself, mirroring
    // confirmMaintenanceTaskComplete's completedByThisExecution.
    const updateIdempotencyKey = `ask:${execution.id}:maintenance-update`;
    const appliedByThisExecution = isFieldPatchAction && current.lastUpdateIdempotencyKey === updateIdempotencyKey;
    if (!appliedByThisExecution && parameters.maintenanceTaskVersion !== maintenanceTaskVersion(current)) {
      const error = new Error(maintenanceConflictDescription(current));
      (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
      throw error;
    }
    if (candidate.data.action === 'ASSIGN' || candidate.data.action === 'UNASSIGN') {
      await householdService.assignTask(execution.propertyId, current.id, 'MAINTENANCE', candidate.data.assigneeUserId ?? null, userId);
    } else if (candidate.data.action === 'ARCHIVE') {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, current.id, MaintenanceTaskStatus.CANCELLED);
    } else if (candidate.data.action === 'REOPEN') {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, current.id, MaintenanceTaskStatus.PENDING);
    } else if (!appliedByThisExecution) {
      try {
        // External review [P1] follow-up: passing current.updatedAt through
        // as expectedUpdatedAt pins updateTask's own compare-and-swap to the
        // version this handler already validated at the check above, instead
        // of letting updateTask re-derive its own baseline from a fresh
        // getTask() call. Without this, a write landing between the check
        // above and updateTask's internal read was silently adopted as
        // updateTask's own baseline and succeeded against it -- overwriting
        // a version nobody actually reviewed instead of tripping the CAS.
        await PropertyMaintenanceTaskService.updateTask(userId, current.id, {
          ...(candidate.data.priority ? { priority: candidate.data.priority } : {}),
          ...(candidate.data.nextDueDate !== undefined ? { nextDueDate: candidate.data.nextDueDate } : {}),
          ...(candidate.data.title ? { title: candidate.data.title } : {}),
        }, { expectedUpdatedAt: current.updatedAt, idempotencyKey: updateIdempotencyKey });
      } catch (raceError) {
        // The version check above rejects a change that already committed
        // BEFORE this handler ran; updateTask's own compare-and-swap, now
        // pinned to the same current.updatedAt via expectedUpdatedAt, catches
        // one that lands in the gap between that check and this write.
        // Re-fetching current state gives the same rich conflict description
        // rather than a raw "concurrent update" error.
        if (raceError instanceof Error && (raceError as Error & { code?: string }).code === 'CONCURRENT_TASK_UPDATE') {
          const raceCurrent = await prisma.propertyMaintenanceTask.findFirst({ where: { id: current.id, propertyId: execution.propertyId } });
          const error = new Error(raceCurrent ? maintenanceConflictDescription(raceCurrent) : 'This task is no longer available. It may have been deleted.');
          (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
          throw error;
        }
        throw raceError;
      }
    }
    const updated = await prisma.propertyMaintenanceTask.findUniqueOrThrow({ where: { id: current.id }, include: { assignedTo: { select: { email: true } } } });
    const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId)}&taskId=${encodeURIComponent(updated.id)}&from=ask`;
    result = {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_UPDATED', contextVersion: maintenanceTaskVersion(updated),
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `maintenance-update-${updated.id}`, title: 'Maintenance task updated', status: candidate.data.action === 'ARCHIVE' ? 'CANCELLED' : 'COMPLETED', description: 'The canonical Maintenance record and its downstream work state were updated.', details: [{ label: 'Task', value: updated.title }, { label: 'Action', value: candidate.data.action.toLowerCase() }, { label: 'Status', value: updated.status.toLowerCase().replace(/_/g, ' ') }, { label: 'Due', value: humanDate(updated.nextDueDate) ?? 'Not scheduled' }, { label: 'Assignee', value: updated.assignedTo?.email ?? 'Unassigned' }], actions: [{ id: 'open-task', label: 'Open task', href: maintenanceHref, style: 'PRIMARY' }] }],
      confirmation: null, suggestions: candidate.data.action === 'ARCHIVE' ? [`Reopen ${updated.title}`] : ['What maintenance is pending?'],
    };
    artifactType = command.artifactType;
    artifactId = updated.id;
    const refresh = await refreshAskSourceExecution(userId, execution.id, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `maintenance-list-refresh-failed-${updated.id}`, title: 'Saved; list could not refresh',
        body: 'This change was saved to the canonical Maintenance record. The list you were viewing could not refresh automatically -- ask "What maintenance is pending?" to see its current state.',
        severity: 'CAUTION',
      });
      result.suggestions = [...new Set([...result.suggestions, 'What maintenance is pending?'])];
    }
  return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('maintenance.complete', confirmMaintenanceTaskComplete);

registerConfirmCapabilityHandler('maintenance.create', confirmMaintenanceTaskCreate);

registerConfirmCapabilityHandler('maintenance.update', confirmMaintenanceTaskUpdate);

export async function editMaintenanceTaskUpdateConfirmation(
  execution: AskExecution,
  parameters: Record<string, unknown>,
  input: EditAskConfirmation,
): Promise<AskExecutionResponse> {
  const existingUpdate = MaintenanceTaskUpdateInputSchema.safeParse(parameters.maintenanceUpdate);
  if (!existingUpdate.success || existingUpdate.data.action !== 'RESCHEDULE') {
    const error = new Error('Editing is only available for a reschedule proposal.');
    (error as Error & { code?: string }).code = 'ASK_EDIT_NOT_SUPPORTED';
    throw error;
  }
  const nextDueDateEdit = input.edits.nextDueDate;
  if (!isValidDateEditInput(nextDueDateEdit)) {
    const error = new Error('Enter a valid date.');
    (error as Error & { code?: string }).code = 'ASK_INVALID_CONFIRMATION_EDIT';
    throw error;
  }
  const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: existingUpdate.data.taskId, propertyId: execution.propertyId! } });
  if (!task) {
    const error = new Error('The selected maintenance task is no longer available.');
    (error as Error & { code?: string }).code = 'ASK_CONTEXT_VERSION_CONFLICT';
    throw error;
  }
  const updatedInput = MaintenanceTaskUpdateInputSchema.parse({ ...existingUpdate.data, nextDueDate: nextDueDateEdit });
  const nextVersion = input.confirmationVersion + 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const taskHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(execution.propertyId!)}&taskId=${encodeURIComponent(task.id)}`;
  const newConfirmation = {
    confirmationId: `maintenance-update-${task.id}-${nextVersion}`, version: nextVersion, title: `Reschedule ${task.title}?`,
    description: 'This command writes through the canonical Maintenance service and preserves downstream reconciliation.',
    fields: [
      { label: 'Task', value: task.title }, { label: 'Action', value: 'reschedule' },
      { label: 'Current due date', value: humanDate(task.nextDueDate) ?? 'Not scheduled' },
      ...(task.isRecurring && task.frequency ? [{ label: 'Recurrence', value: `Repeats ${task.frequency.toLowerCase().replace(/_/g, ' ')}; only this next due date changes` }] : []),
    ],
    editableFields: [{ key: 'nextDueDate', label: 'New due date', type: 'DATE' as const, value: nextDueDateEdit }],
    confirmLabel: 'Confirm reschedule', consentText: 'I authorize this reschedule of the shared Maintenance record.', expiresAt: expiresAt.toISOString(),
  };
  // External review finding: this was an unconditional update-by-id. Two
  // concurrent edits (a double-click, two tabs) could both read version N,
  // both compute nextVersion N+1, and both write -- the loser's response
  // would then claim "saved as version N+1" while the winner's edit is what
  // actually persisted. Guard the write itself on the version still
  // matching (same JSON-path pattern already used elsewhere in this
  // codebase, e.g. adminWorkerJobs.service.ts's metadataJson filter), so a
  // losing concurrent edit fails loudly instead of silently.
  //
  // External review finding (2nd pass): guarding on version alone was
  // still not enough. confirmAskExecution's claim transaction moves status
  // to RUNNING without touching parametersJson.confirmationVersion at all
  // -- so once a confirm has claimed this execution, this edit's version
  // guard would still match (the version genuinely hasn't changed) and
  // silently overwrite parametersJson/resultJson out from under a
  // confirmation that is actively executing or has already completed.
  // Guarding on status too closes that: any status transition away from
  // NEEDS_CONFIRMATION (claimed, completed, expired) now makes this write
  // match nothing, exactly like an already-superseded version does.
  const editWrite = await prisma.askExecution.updateMany({
    where: { id: execution.id, status: 'NEEDS_CONFIRMATION', parametersJson: { path: ['confirmationVersion'], equals: input.confirmationVersion } },
    data: {
      parametersJson: asInputJson({ ...parameters, maintenanceUpdate: updatedInput, confirmationVersion: nextVersion, confirmationExpiresAt: expiresAt.toISOString() }),
      resultJson: asInputJson({
        schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
        blocks: [{ type: 'SUMMARY', id: 'maintenance-update-review', title: 'Review this reschedule', body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: taskHref, style: 'SECONDARY' }] }],
        captureRequests: [], confirmation: newConfirmation, clarification: null, suggestions: [],
        ...preservedExecutionHistory(execution.resultJson, [{ type: 'SUMMARY', id: 'maintenance-update-review', title: 'Review this reschedule', body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [] }]),
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
