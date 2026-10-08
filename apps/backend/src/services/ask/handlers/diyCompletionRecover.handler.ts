// DIY completion recovery (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md, step 7C): ask Cozy to try again to record a finished project (the DIY_PROJECT_COMPLETED outbox
// event) or to update an open project's linked maintenance task (the task reconciliation event) AFTER the earlier request was dead-lettered. Two declared actions, each offered only
// where its own canonical status model can expose it (W13): COMPLETION_EFFECTS on the finished-project view, TASK_LINK on the open project's guide.
//
// It re-queues the SAME request through the same service methods the project page's retry buttons use; the worker remains the only trigger. It never says the retry worked and
// never verifies anything: the receipt says only that the request was queued again. The whole recovery decision (role, lookups, eligibility, the conditional re-queue) is one
// transaction inside the service; the checks here are early, friendly answers.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { diyService } from '../../diy.service';
import { DIY_PROJECT_ENTITY_TYPE, DIY_RECOVER_ACTIONS, showProjectsAction } from '../../diy/projectGuide';

const BOUNDARY_ID = 'diy-recover-boundary';
const SUGGESTIONS = ['Show my DIY projects'];
const OPEN = ['PLANNING', 'IN_PROGRESS'];
type Kind = keyof typeof DIY_RECOVER_ACTIONS;

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode, blocks: [{ type: 'BOUNDARY', id: BOUNDARY_ID, title, body, severity: 'INFO', suggestions: SUGGESTIONS }], suggestions: SUGGESTIONS,
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });

type Effects = NonNullable<Awaited<ReturnType<typeof diyService.readProjectEffects>>>;

/** Whether the canonical status model for this kind of recovery says a dead-lettered request can be queued again right now. */
function recoverable(kind: Kind, effects: Effects): boolean {
  if (kind === 'COMPLETION_EFFECTS') return effects.status === 'COMPLETED' && Boolean(effects.completionEffects?.canRecover);
  return OPEN.includes(effects.status) && Boolean(effects.taskLink?.canRecover);
}
const contextOf = (kind: Kind, effects: Effects) =>
  createHash('sha256').update(JSON.stringify([kind, effects.status, effects.completionEffects?.state ?? null, effects.taskLink?.state ?? null, kind === 'COMPLETION_EFFECTS' ? effects.versions.completion : effects.versions.task])).digest('hex');

/** The plain reason nothing can be queued again, from the same status the person would see. */
function nothingToDo(kind: Kind, effects: Effects): AskOperationResult {
  const state = kind === 'COMPLETION_EFFECTS' ? effects.completionEffects?.state : effects.taskLink?.state;
  if (state === 'RECORDING' || state === 'UPDATING') return boundary('Already queued', 'The request is already queued, and Cozy is working on it in the background. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_RECOVER_ALREADY_QUEUED');
  if (state === 'RECORDED') return boundary('Nothing to record again', 'The completion was recorded. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_RECOVER_NOT_NEEDED');
  if (state === 'LEGACY_UNKNOWN') return boundary('This cannot be recorded again here', 'This project was completed before Cozy tracked those records, so there is nothing to queue again. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_RECOVER_NOT_POSSIBLE');
  return boundary('Nothing to queue again', 'No failed request is waiting for this project. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_RECOVER_NOT_NEEDED');
}

function declared(message: string, launchContext: CreateAskExecutionRequest['launchContext'] | undefined): { kind: Kind; projectId: string } | null {
  if (!launchContext || launchContext.operationId !== 'DIY_COMPLETION_RECOVER' || launchContext.surface === 'ASK_REFRESH') return null;
  if (launchContext.entityType !== DIY_PROJECT_ENTITY_TYPE || !launchContext.entityId) return null;
  const kind = (Object.keys(DIY_RECOVER_ACTIONS) as Kind[]).find((candidate) => DIY_RECOVER_ACTIONS[candidate].message === message.trim());
  if (!kind) return null;
  if (launchContext.actionId && launchContext.actionId !== DIY_RECOVER_ACTIONS[kind].actionId) return null;
  return { kind, projectId: launchContext.entityId };
}

export async function diyCompletionRecoverResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const decl = declared(message, launchContext);
  if (!decl) return boundary("Use the project's own action", 'Open the project and use Record my completion again, or Update my linked task again, where it is offered. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_RECOVER_NOT_DIRECTLY_ROUTABLE');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can ask for this in Ask. Nothing was changed.', 'BLOCKED', 'DIY_RECOVER_PERMISSION_REQUIRED');
  const effects = await diyService.readProjectEffects(decl.projectId, propertyId);
  if (!effects) return boundary('This project is no longer available', 'It was removed or does not belong to this home. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_RECOVER_NOT_FOUND');
  if (!recoverable(decl.kind, effects)) return nothingToDo(decl.kind, effects);

  const contextVersion = contextOf(decl.kind, effects);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const what = decl.kind === 'COMPLETION_EFFECTS' ? 'the records that follow your completion' : 'the update of your linked maintenance task';
  const description = `Some of ${what} could not be updated. This asks Cozy to try again in the background. It does not change the project, and it cannot tell you whether the retry worked: ask me to show this project again afterwards to see its status.`;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DIY_COMPLETION_RECOVER_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      diyProjectId: decl.projectId, diyRecoverKind: decl.kind, diyRecoverContext: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'diy-recover-review', title: 'Review trying again', body: `Nothing has changed yet. ${description}`, tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `diy-recover-${decl.projectId}-${decl.kind}-1`, version: 1, title: decl.kind === 'COMPLETION_EFFECTS' ? 'Record your completion again?' : 'Update your linked task again?', description,
      fields: [
        { label: 'What happens', value: 'Cozy tries again in the background' },
        { label: 'Changes to the project', value: 'None' },
        { label: 'Verified', value: 'Nothing is verified' },
      ],
      editableFields: [], confirmLabel: 'Try again', consentText: 'I want Cozy to try again to update these records.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('diy.completion-recover', async (envelope) => diyCompletionRecoverResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

async function confirmDiyCompletionRecover(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to ask for this in Ask.', 'ASK_PERMISSION_REQUIRED');
  const projectId = typeof parameters.diyProjectId === 'string' ? parameters.diyProjectId : null;
  const kind: Kind | null = parameters.diyRecoverKind === 'COMPLETION_EFFECTS' || parameters.diyRecoverKind === 'TASK_LINK' ? parameters.diyRecoverKind : null;
  if (!projectId || !kind) throw writeError('The project selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const effects = await diyService.readProjectEffects(projectId, execution.propertyId);
  if (!effects) throw writeError('This project is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');

  const queuedReceipt = (already: boolean): AskOperationResult => ({
    status: 'COMPLETED', reasonCode: already ? 'DIY_RECOVER_ALREADY_QUEUED' : 'DIY_RECOVER_QUEUED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'diy-recover-receipt', title: already ? 'Already queued' : 'Queued again', status: 'COMPLETED',
      description: already
        ? 'The request was already queued, so nothing was changed. The records update in the background.'
        : 'I asked Cozy to try again. The records update in the background, and this answer does not know yet whether it worked. Ask me to show this project again afterwards to see its status.',
      details: [{ label: 'Request', value: kind === 'COMPLETION_EFFECTS' ? 'Record my completion' : 'Update my linked task' }], actions: [showProjectsAction()],
    }],
    suggestions: SUGGESTIONS,
  });

  let already = false;
  if (!recoverable(kind, effects)) {
    const state = kind === 'COMPLETION_EFFECTS' ? effects.completionEffects?.state : effects.taskLink?.state;
    // Someone else (or an earlier press) already queued it: nothing to do, and nothing to claim.
    if (state === 'RECORDING' || state === 'UPDATING') already = true;
    else throw writeError('This project changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  } else {
    if (parameters.diyRecoverContext !== contextOf(kind, effects)) throw writeError('This project changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    try {
      // The service decides again, inside one transaction: the role, the lookups, that the event is still a dead letter, and the conditional re-queue.
      const outcome = kind === 'COMPLETION_EFFECTS'
        ? await diyService.retryCompletionEffects(projectId, execution.propertyId, userId)
        : await diyService.retryTaskReconciliation(projectId, execution.propertyId, userId);
      already = !outcome.reset;
    } catch (error: any) {
      if (error?.code === 'DIY_ACCESS_REVOKED') throw writeError('A contributor or owner is required to ask for this in Ask.', 'ASK_PERMISSION_REQUIRED');
      if (error?.code === 'PROJECT_NOT_FOUND') throw writeError(error.message, 'ASK_CONTEXT_VERSION_CONFLICT');
      throw error;
    }
  }
  const result = queuedReceipt(already);
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: BOUNDARY_ID, severity: 'CAUTION', title: 'Queued; the guide could not refresh',
      body: 'The request was queued. The guide you were looking at could not refresh automatically; open it again to see the latest status.', suggestions: [],
    });
  }
  return { result, artifactType: 'DIY_PROJECT', artifactId: projectId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('diy.completion-recover', confirmDiyCompletionRecover);
