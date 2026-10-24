// Attach Home Records as evidence for a maintenance task, in Ask (continuation FRD section 41). Launched from a journey step (the compliance task step) or from a task's own row; the task
// is a task linked to that step, never inferred from a title. The evidence is chosen from Home Records or uploaded straight into Home Records (the canonical store), and is attached through
// the same shared service the Desktop route uses, which reruns the journey reporter when the task is already completed. Confirmation-gated, CONTRIBUTOR floor.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { APIError } from '../../../middleware/error.middleware';
import { assertProjectDocuments, listProjectDocumentOptions } from '../../projectDocuments.service';
import { MAINTENANCE_LINKABLE_STEP_KEYS, MAINTENANCE_STEP_TOOL_KEY, attachMaintenanceTaskEvidence, linkMaintenanceTaskToStep } from '../../maintenanceTaskJourneyOperations';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId, resolveGuidanceStepBinding } from '../support/guidanceStepBinding';
import { MAINTENANCE_EVIDENCE_ATTACH_MESSAGE, MAINTENANCE_LINK_CAPTURE_KEY, MAINTENANCE_LINK_EXISTING_MESSAGE, type MaintenanceLinkAnswer, MAINTENANCE_EVIDENCE_CAPTURE_KEY, MAINTENANCE_TASK_ENTITY_TYPE, MaintenanceEvidenceAnswerSchema, type MaintenanceEvidenceAnswer } from '../support/maintenanceEvidenceAttach';

type Launch = CreateAskExecutionRequest['launchContext'];
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });
const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string, actions: any[] = []): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'maintenance-evidence-attach-boundary', title, body, severity: 'INFO', suggestions: ['Show my guided journeys'] }, ...(actions.length ? [{ type: 'SUMMARY' as const, id: 'maintenance-evidence-attach-actions', title: 'What you can do', body: 'Nothing was changed.', tone: 'DEFAULT' as const, actions }] : [])],
  suggestions: [],
});

/** The version the form and the confirmation are bound to: the task and when it last changed (a record uploaded meanwhile is validated again on confirm). */
export const evidenceContextVersion = (task: { id: string; updatedAt: Date }) => sha(`maintenance-evidence:${task.id}:${task.updatedAt.toISOString()}`);

/** The tasks a journey step is linked to (explicit links only), newest first. */
async function linkedTasks(propertyId: string, stepId: string) {
  const links = await prisma.guidanceStepMaintenanceTaskLink.findMany({ where: { propertyId, stepId }, orderBy: { createdAt: 'desc' } });
  if (links.length === 0) return [];
  return prisma.propertyMaintenanceTask.findMany({ where: { propertyId, id: { in: links.map((link: { maintenanceTaskId: string }) => link.maintenanceTaskId) } } });
}

function captureRequest(task: { id: string; title: string; updatedAt: Date }, options: Array<{ label: string; value: string }>, version: string, entered?: Partial<MaintenanceEvidenceAnswer>): AskCaptureRequest {
  return {
    requirementId: 'maintenance-evidence-inputs', captureKey: MAINTENANCE_EVIDENCE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Evidence for: ${task.title}`, question: 'Which Home Records are the evidence for this task?',
    helpText: 'Choose records already saved to your Home Records, or upload a new document; it is saved straight to Home Records. Nothing is attached until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'recordIds', label: 'Evidence', required: true, inputSchema: { type: 'DOCUMENT_MULTI_SELECT', options, maxItems: 20, allowUpload: true, uploadTarget: 'HOME_RECORDS' } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered?.recordIds ? { recordIds: entered.recordIds } : {},
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is attached until you confirm', confirmationText: null,
    expectedContextVersion: version,
  };
}

export interface MaintenanceEvidenceLaunch { stepId: string | null; taskId: string | null; sourceExecutionId: string | null }

export async function maintenanceEvidenceAttachResult(userId: string, propertyId: string, launch: MaintenanceEvidenceLaunch, submitted?: MaintenanceEvidenceAnswer): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can attach evidence. Nothing was changed.', 'BLOCKED', 'MAINTENANCE_EVIDENCE_PERMISSION_REQUIRED');
  if (!launch.stepId && !launch.taskId) return boundary('Choose the task first', 'Evidence is attached from a journey step or from a task. Nothing was changed.', 'NOT_APPLICABLE', 'MAINTENANCE_EVIDENCE_TARGET_REQUIRED');
  let tasks: any[] = [];
  if (launch.stepId) {
    const bound = await resolveGuidanceStepBinding(propertyId, launch.stepId, { toolKey: MAINTENANCE_STEP_TOOL_KEY, stepKeys: MAINTENANCE_LINKABLE_STEP_KEYS });
    if (!bound.ok) return boundary('This step cannot take evidence', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'MAINTENANCE_EVIDENCE_STEP_UNAVAILABLE');
    tasks = await linkedTasks(propertyId, launch.stepId);
    if (tasks.length === 0) {
      return boundary('No task is linked to this step yet', 'Create a maintenance task for this step first; the step is completed by that task being done with evidence.', 'NOT_APPLICABLE', 'MAINTENANCE_EVIDENCE_NO_LINKED_TASK', [
        { id: 'maintenance-create-for-step', label: 'Create a task for this step', interactionType: 'START_WORKFLOW', message: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE', entityType: 'GUIDANCE_STEP', entityId: launch.stepId, style: 'PRIMARY' },
        { id: 'maintenance-link-existing', label: 'Use an existing task', interactionType: 'START_WORKFLOW', message: MAINTENANCE_LINK_EXISTING_MESSAGE, operationId: 'MAINTENANCE_EVIDENCE_ATTACH', entityType: 'GUIDANCE_STEP', entityId: launch.stepId, style: 'SECONDARY' },
      ]);
    }
  } else {
    const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: launch.taskId!, propertyId } });
    if (task) tasks = [task];
  }
  // Only the task the person named; when a step has several linked tasks the form is for the most recent one, and the others are reached from their own rows.
  const task = (launch.taskId && tasks.find((candidate) => candidate.id === launch.taskId)) || tasks[0];
  if (!task) return boundary('That task is no longer available', 'Ask could not find that maintenance task for this home. Nothing was changed.', 'NOT_APPLICABLE', 'MAINTENANCE_EVIDENCE_TASK_NOT_FOUND');
  const version = evidenceContextVersion(task);
  const options = (await listProjectDocumentOptions(propertyId, 25)).map((doc) => ({ value: doc.id, label: `${doc.title} (${(doc.recordType ?? 'OTHER').toLowerCase().replace(/_/g, ' ')})` }));
  if (!submitted) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_EVIDENCE_INPUT_REQUIRED', contextVersion: version,
      parameters: { maintenanceEvidenceLaunch: { stepId: launch.stepId, taskId: task.id, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'maintenance-evidence-input', title: `Attach evidence to "${task.title}"`, body: task.status === 'COMPLETED' ? 'Nothing is attached yet. Once you confirm, the journey step is updated if this task is linked to one.' : 'Nothing is attached yet. The task is not completed yet, so the journey step completes after you complete it.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [captureRequest(task, options, version)], suggestions: [],
    };
  }
  // Re-validate through the shared Home Records resolver now, so what is shown is what will be attached.
  let documents;
  try {
    documents = await assertProjectDocuments(propertyId, submitted.recordIds, { message: 'One or more of those records are no longer available for this home.', code: 'MAINTENANCE_EVIDENCE_NOT_FOUND' });
  } catch (error) {
    if (error instanceof APIError) return boundary('Those records cannot be used', `${error.message} Nothing was changed.`, 'NOT_APPLICABLE', 'MAINTENANCE_EVIDENCE_RECORDS_UNAVAILABLE');
    throw error;
  }
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const linkedNote = launch.stepId ? (task.status === 'COMPLETED' ? 'The journey step is completed by this.' : 'The journey step completes once the task is completed.') : 'Evidence is saved on the task.';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_EVIDENCE_CONFIRMATION_REQUIRED', contextVersion: version,
    parameters: { maintenanceEvidenceLaunch: { stepId: launch.stepId, taskId: task.id, sourceExecutionId: launch.sourceExecutionId }, maintenanceEvidenceAnswer: submitted, maintenanceEvidenceVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'maintenance-evidence-review', title: `Attach evidence to "${task.title}"`, body: 'Nothing has changed yet. Confirm to attach these Home Records to the task.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `maintenance-evidence-${task.id}-1`, version: 1, title: 'Attach this evidence?',
      description: 'The records stay in your Home Records. They are linked to this task as proof of the work.',
      fields: [{ label: 'Task', value: task.title }, { label: 'Task status', value: String(task.status).toLowerCase().replace(/_/g, ' ') }, { label: 'Evidence', value: documents.map((doc) => doc.title).join(', ') }, { label: 'Guided journey', value: linkedNote }],
      editableFields: [], confirmLabel: 'Attach evidence', consentText: 'I confirm these records are evidence for this task.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

/** Tasks of this home that can be linked to a step: not cancelled, not already linked to it. Chosen by the person from this list, never matched by title, category or asset. */
async function eligibleExistingTasks(propertyId: string, stepId: string) {
  const linked = new Set((await prisma.guidanceStepMaintenanceTaskLink.findMany({ where: { propertyId, stepId } })).map((link: { maintenanceTaskId: string }) => link.maintenanceTaskId));
  const tasks = await prisma.propertyMaintenanceTask.findMany({ where: { propertyId, status: { not: 'CANCELLED' } }, orderBy: { updatedAt: 'desc' }, take: 25 });
  return tasks.filter((task: { id: string }) => !linked.has(task.id));
}
const linkContextVersion = (stepId: string, ids: readonly string[]) => sha(`maintenance-link:${stepId}:${[...ids].sort().join(',')}`);

export async function maintenanceTaskLinkResult(userId: string, propertyId: string, launch: { stepId: string | null; sourceExecutionId: string | null }, submitted?: MaintenanceLinkAnswer): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can link a task. Nothing was changed.', 'BLOCKED', 'MAINTENANCE_LINK_PERMISSION_REQUIRED');
  if (!launch.stepId) return boundary('Choose the step first', 'A task is linked from a journey step. Nothing was changed.', 'NOT_APPLICABLE', 'MAINTENANCE_LINK_STEP_REQUIRED');
  const bound = await resolveGuidanceStepBinding(propertyId, launch.stepId, { toolKey: MAINTENANCE_STEP_TOOL_KEY, stepKeys: MAINTENANCE_LINKABLE_STEP_KEYS });
  if (!bound.ok) return boundary('This step cannot take a task', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'MAINTENANCE_LINK_STEP_UNAVAILABLE');
  const tasks = await eligibleExistingTasks(propertyId, launch.stepId);
  if (tasks.length === 0) return boundary('No task can be linked', 'This home has no other open or completed maintenance task to use. Create one for this step instead. Nothing was changed.', 'NOT_APPLICABLE', 'MAINTENANCE_LINK_NO_TASKS');
  const version = linkContextVersion(launch.stepId, tasks.map((task: { id: string }) => task.id));
  const parameters = { maintenanceLinkLaunch: { stepId: launch.stepId, sourceExecutionId: launch.sourceExecutionId } };
  if (!submitted) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_LINK_INPUT_REQUIRED', contextVersion: version, parameters,
      blocks: [{ type: 'SUMMARY', id: 'maintenance-link-input', title: 'Which task is for this step?', body: 'Choose a task already in your Maintenance. Nothing is linked until you confirm.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [{
        requirementId: 'maintenance-link-inputs', captureKey: MAINTENANCE_LINK_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Use an existing task', question: 'Which maintenance task should complete this step?',
        helpText: 'Only tasks you choose here are linked; Ask never matches a task by its title.',
        inputSchema: { type: 'GROUP', fields: [{ key: 'taskId', label: 'Task', required: true, inputSchema: { type: 'SINGLE_SELECT', options: tasks.map((task: { id: string; title: string; status: string }) => ({ label: `${task.title} (${String(task.status).toLowerCase().replace(/_/g, ' ')})`, value: task.id })) } }] } as unknown as AskCaptureRequest['inputSchema'],
        currentAnswer: {}, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this link; nothing is linked until you confirm', confirmationText: null, expectedContextVersion: version,
      }], suggestions: [],
    };
  }
  const task = tasks.find((candidate: { id: string }) => candidate.id === submitted.taskId);
  if (!task) return boundary('That task cannot be linked', 'It is not one of the tasks offered, or it is already linked to this step. Nothing was changed.', 'NOT_APPLICABLE', 'MAINTENANCE_LINK_TASK_UNAVAILABLE');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_LINK_CONFIRMATION_REQUIRED', contextVersion: version,
    parameters: { ...parameters, maintenanceLinkTaskId: task.id, maintenanceLinkVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'maintenance-link-review', title: `Use "${task.title}" for this step`, body: 'Nothing has changed yet. Confirm to link this task to the journey step.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `maintenance-link-${launch.stepId}-${task.id}-1`, version: 1, title: 'Link this task to the step?',
      description: 'The step is completed only when this task is completed with Home Record evidence. The task itself does not change.',
      fields: [{ label: 'Task', value: task.title }, { label: 'Task status', value: String(task.status).toLowerCase().replace(/_/g, ' ') }, { label: 'Completes the step', value: task.status === 'COMPLETED' ? 'Once evidence is attached' : 'When it is completed with evidence' }],
      editableFields: [], confirmLabel: 'Link task', consentText: 'I confirm this task is for this journey step.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmMaintenanceTaskLink(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const launch = parameters.maintenanceLinkLaunch as { stepId?: string } | undefined;
  const taskId = typeof parameters.maintenanceLinkTaskId === 'string' ? parameters.maintenanceLinkTaskId : null;
  if (!launch?.stepId || !taskId) throw writeError('The task selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const tasks = await eligibleExistingTasks(execution.propertyId, launch.stepId);
  if (parameters.maintenanceLinkVersion !== linkContextVersion(launch.stepId, tasks.map((task: { id: string }) => task.id))) throw writeError('Your tasks changed while this confirmation was open. Review it again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  try {
    await linkMaintenanceTaskToStep(execution.propertyId, userId, taskId, launch.stepId, 'ASK');
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  const task = tasks.find((candidate: { id: string }) => candidate.id === taskId);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_LINKED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `maintenance-link-${taskId}`, title: 'Task linked to the step', status: 'COMPLETED',
      description: 'The step is completed when this task is completed with Home Record evidence.',
      details: [{ label: 'Task', value: task?.title ?? 'Maintenance task' }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: 'PROPERTY_MAINTENANCE_TASK', artifactId: taskId, refreshedExecutions: refresh.refreshedExecutions };
}

async function confirmMaintenanceEvidenceAttach(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to attach evidence.', 'ASK_PERMISSION_REQUIRED');
  if (parameters.maintenanceLinkLaunch) return confirmMaintenanceTaskLink(ctx);
  const launch = parameters.maintenanceEvidenceLaunch as MaintenanceEvidenceLaunch | undefined;
  const answer = MaintenanceEvidenceAnswerSchema.safeParse(parameters.maintenanceEvidenceAnswer);
  if (!launch?.taskId || !answer.success) throw writeError('The evidence selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: launch.taskId, propertyId: execution.propertyId } });
  if (!task) throw writeError('That task is no longer available.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  if (parameters.maintenanceEvidenceVersion !== evidenceContextVersion(task)) throw writeError('The task changed while this confirmation was open. Review it again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  // A linked step must still fit (the link is re-read; an unlinked or closed step attaches the evidence to the task and reports nothing).
  let outcome: Awaited<ReturnType<typeof attachMaintenanceTaskEvidence>>;
  try {
    outcome = await attachMaintenanceTaskEvidence(userId, task.id, answer.data.recordIds);
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  const note = outcome.reportedStepIds.length > 0 ? 'The journey step is recorded as done'
    : task.status === 'COMPLETED' ? (launch.stepId ? 'The evidence is saved; the journey step could not be updated, so open the journey to check it' : 'The evidence is saved on the task')
      : 'The evidence is saved; the journey step completes once the task is completed';
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'MAINTENANCE_EVIDENCE_ATTACHED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `maintenance-evidence-${task.id}`, title: 'Evidence attached', status: 'COMPLETED',
      description: 'These Home Records are now linked to the task as evidence.',
      details: [{ label: 'Task', value: task.title }, { label: 'Evidence', value: `${outcome.evidence.length} record${outcome.evidence.length === 1 ? '' : 's'}` }, { label: 'Guided journey', value: note }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'BOUNDARY', id: `maintenance-evidence-refresh-failed-${task.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The evidence was saved. The view you were looking at could not refresh automatically; ask "Show my guided journeys" to see it.', suggestions: [] } as any);
  return { result, artifactType: 'PROPERTY_MAINTENANCE_TASK', artifactId: task.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('maintenance.evidence-attach', async (envelope) => {
  const launch = envelope.launchContext as Launch;
  const linkExisting = launch?.operationId === 'MAINTENANCE_EVIDENCE_ATTACH' && launch.surface !== 'ASK_REFRESH' && envelope.message.trim() === MAINTENANCE_LINK_EXISTING_MESSAGE;
  if (linkExisting) return maintenanceTaskLinkResult(envelope.userId, envelope.propertyId!, { stepId: launchedGuidanceStepId(launch), sourceExecutionId: launch?.sourceExecutionId ?? null });
  const declared = launch?.operationId === 'MAINTENANCE_EVIDENCE_ATTACH' && launch.surface !== 'ASK_REFRESH' && envelope.message.trim() === MAINTENANCE_EVIDENCE_ATTACH_MESSAGE;
  if (!declared) return boundary('Choose the task first', 'Evidence is attached from a journey step or a task\'s own action. Nothing was changed.', 'NOT_APPLICABLE', 'MAINTENANCE_EVIDENCE_NOT_DIRECTLY_ROUTABLE');
  const taskId = launch?.entityType === MAINTENANCE_TASK_ENTITY_TYPE ? launch.entityId ?? null : null;
  return maintenanceEvidenceAttachResult(envelope.userId, envelope.propertyId!, { stepId: launchedGuidanceStepId(launch), taskId, sourceExecutionId: launch?.sourceExecutionId ?? null });
});
registerConfirmCapabilityHandler('maintenance.evidence-attach', confirmMaintenanceEvidenceAttach);
