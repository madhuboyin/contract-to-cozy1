// Retry a request that did not finish, or dismiss one that is waiting, from the Work answer (FRD v1.3). Reached only by the declared row
// actions. The writes are the existing ones (retryAskExecution, cancelAskExecution): both reauthorize, and a retry is idempotent per client
// request id. Scoped to the caller's own requests, so the floor is the caller's own account, not the home role.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { WORK_REQUEST_ACTION_IDS, WORK_REQUEST_ENTITY_TYPE, workRequestKindFromMessage, type WorkRequestCommandKind } from '../support/workSavedCommands';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToWork = { id: WORK_REQUEST_ACTION_IDS.RETRY.replace('retry', 'back'), label: 'Back to what needs me', interactionType: 'START_WORKFLOW' as const, message: 'What needs me?', operationId: 'WORK_OVERVIEW' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'work-request-unavailable', title, body, tone: 'DEFAULT', actions: [backToWork] }], suggestions: [],
});

interface RequestRow { id: string; propertyId: string | null; message: string; status: string; reasonCode: string | null; updatedAt: Date }
const loadRequest = (userId: string, propertyId: string, id: string): Promise<RequestRow | null> =>
  prisma.askExecution.findFirst({ where: { id, userId, propertyId }, select: { id: true, propertyId: true, message: true, status: true, reasonCode: true, updatedAt: true } }) as Promise<RequestRow | null>;
const versionOf = (kind: WorkRequestCommandKind, row: RequestRow) => sha(`work-request:${kind}:${row.id}:${row.status}:${row.reasonCode ?? ''}:${row.updatedAt.toISOString()}`);
// The execution lifecycle modules load lazily: a handler never imports them at load time (the layering the import-graph guardrail holds).
async function allowed(kind: WorkRequestCommandKind, row: RequestRow): Promise<boolean> {
  if (kind === 'RETRY') return (await import('../execution/askRetry')).askExecutionCanRetry(row.status as never, row.reasonCode);
  return ((await import('../execution/askSessions')).INTERACTIVE_ASK_STATUSES as readonly string[]).includes(row.status);
}

export async function workRequestProposal(userId: string, propertyId: string, launch: { kind: WorkRequestCommandKind; entityId: string; sourceExecutionId: string | null }): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const row = await loadRequest(userId, propertyId, launch.entityId);
  if (!row) return unavailable('WORK_REQUEST_NOT_FOUND', 'That request is no longer available', 'Ask could not find it. Nothing has changed.');
  if (!(await allowed(launch.kind, row))) {
    return unavailable('WORK_REQUEST_NOT_ACTIONABLE', launch.kind === 'RETRY' ? 'That request no longer needs a retry' : 'That request is no longer waiting', 'It changed since you last looked. Nothing has changed.');
  }
  const contextVersion = versionOf(launch.kind, row);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const retry = launch.kind === 'RETRY';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `WORK_REQUEST_${launch.kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { workRequestCommand: { kind: launch.kind, entityId: row.id }, workRequestContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'work-request-review', title: retry ? 'Try this request again?' : 'Dismiss this pending request?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `work-request-${launch.kind.toLowerCase()}-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title: retry ? 'Try this request again?' : 'Dismiss this pending request?',
      description: retry ? 'The same question is asked again against your current records. It is safe to repeat.' : 'No action is performed. You can ask the question again whenever you are ready.',
      fields: [{ label: 'Request', value: row.message.slice(0, 280) }], editableFields: [], confirmLabel: retry ? 'Try again' : 'Dismiss it', consentText: retry ? 'I authorize asking this again.' : 'I authorize dismissing this request.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('work-request.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = workRequestKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'WORK_REQUEST_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== WORK_REQUEST_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_WORK_REQUEST_NOT_DIRECTLY_ROUTABLE', 'Open what needs you first', 'A request is retried or dismissed from its row in your work. Nothing has changed.');
  }
  return workRequestProposal(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmWorkRequest(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.workRequestCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind;
  if ((kind !== 'RETRY' && kind !== 'DISMISS') || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const row = await loadRequest(userId, execution.propertyId, command.entityId);
  if (!row) throw stale('That request is no longer available.');
  if (parameters.workRequestContextVersion !== versionOf(kind, row) || !(await allowed(kind, row))) {
    throw stale('That request changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  if (kind === 'RETRY') await (await import('../execution/askRetry')).retryAskExecution(userId, row.id, { clientRequestId: `work-retry:${row.id}`.slice(0, 160) });
  else await (await import('../execution/askConfirm')).cancelAskExecution(userId, row.id);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `WORK_REQUEST_${kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `work-request-${kind.toLowerCase()}-${row.id}`, title: kind === 'RETRY' ? 'Asked again' : 'Dismissed', status: 'COMPLETED',
      description: kind === 'RETRY' ? 'The request was asked again. Its answer is in the conversation it came from.' : 'No action was performed. You can ask the question again whenever you are ready.',
      details: [{ label: 'Request', value: row.message.slice(0, 280) }], actions: [backToWork],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'work-request-refresh-failed', severity: 'CAUTION', title: 'Done; view could not refresh', body: 'The change was made. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'ASK_EXECUTION', artifactId: row.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('work-request.command', confirmWorkRequest);
