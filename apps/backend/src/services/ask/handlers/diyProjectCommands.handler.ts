// DIY project commands (docs/architecture/ASK_COZY_DIY_PROJECT_COMMANDS_PLAN.md, step 7B): finish a project (DIY_PROJECT_COMPLETE), and stop it or hand it off to a pro
// (DIY_PROJECT_ABANDON). Both are reached only by declared actions on the project guide (launchContext.operationId, entityType 'DIY_PROJECT', the project id and the exact canned
// message), never by typed wording or a refresh, and both are IRREVERSIBLE in Cozy: no operation reopens a closed project, so the confirmations say so.
//
// What is recorded is the person's own report; nothing is verified. The checks here are early, friendly answers. The authority is the service, which re-checks the role, the open
// project and (for a finish) every step and the Ask policy INSIDE its transaction. Neither command changes an incident (O13); a stop touches no linked task; a hand-off books and
// contacts nobody; a finish only QUEUES the home-history record and any linked-task completion (the worker does them later) and the receipt says exactly that.
import { HouseholdRole } from '@prisma/client';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { diyService } from '../../diy.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';
import { logger } from '../../../lib/logger';
import { currentStepOf, evaluateAskProjectPolicy, guideContextVersion } from '../../diy/askStepPolicy';
import { describeCompletionEffects } from '../../diy/completionEffectsStatus';
import { DIY_PROJECT_ENTITY_TYPE, DIY_PROJECT_FINISH, DIY_PROJECT_STOP_ACTIONS, projectPageHref, type GuideSource } from '../../diy/projectGuide';

const BOUNDARY_ID = 'diy-project-command-boundary';
const SUGGESTIONS = ['Show my DIY projects'];
const OPEN = ['PLANNING', 'IN_PROGRESS'];

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode, blocks: [{ type: 'BOUNDARY', id: BOUNDARY_ID, title, body, severity: 'INFO', suggestions: SUGGESTIONS }], suggestions: SUGGESTIONS,
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });
const openLink = (propertyId: string, projectId: string) => ({ id: 'open-diy-project', label: 'Open this project', href: projectPageHref(propertyId, projectId), style: 'SECONDARY' as const });

type Launch = CreateAskExecutionRequest['launchContext'] | undefined;

/** The declared action of a launch, or null: the operation, the entity type, an entity id, a canned message, and an action id that agrees with it when one is sent. */
function declared<K extends string>(operationId: string, table: Record<K, { message: string; actionId: string }>, message: string, launchContext: Launch): { key: K; projectId: string } | null {
  if (!launchContext || launchContext.operationId !== operationId || launchContext.surface === 'ASK_REFRESH') return null;
  if (launchContext.entityType !== DIY_PROJECT_ENTITY_TYPE || !launchContext.entityId) return null;
  const key = (Object.keys(table) as K[]).find((candidate) => table[candidate].message === message.trim());
  if (!key) return null;
  if (launchContext.actionId && launchContext.actionId !== table[key].actionId) return null;
  return { key, projectId: launchContext.entityId };
}

type ProjectSource = GuideSource & { project: GuideSource['project'] & { status: string; maintenanceTaskId?: string | null; updatedAt?: Date | string | null } };
const token = (source: ProjectSource) => new Date(source.project.updatedAt as Date | string).toISOString();

/** The service's refusals become the confirmation's own answers. A closed project that is already in the wanted status is "already", handled by the caller through `closedAs`. */
function serviceRefusal(error: any): never {
  const code = error?.code;
  if (code === 'DIY_ACCESS_REVOKED') throw writeError('A contributor or owner is required to change a project in Ask.', 'ASK_PERMISSION_REQUIRED');
  if (code === 'DIY_STALE' || code === 'DIY_PROJECT_STEPS_INCOMPLETE' || code === 'PROJECT_NOT_FOUND') throw writeError(error.message, 'ASK_CONTEXT_VERSION_CONFLICT');
  if (code === 'DIY_GUIDE_NOT_CURRENT' || code === 'DIY_PROJECT_CLOSED') throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
  throw error;
}

/** Best-effort, non-authoritative analytics parity with the page (the controllers emit these after their write). Never throws, never decides anything. */
function track(userId: string, propertyId: string, metadata: Record<string, unknown>): void {
  try {
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.FINANCIAL, featureKey: AnalyticsFeature.DIY_DECISION, metadataJson: { ...metadata, source: 'ask' },
    });
  } catch (error) {
    logger.warn({ error: (error as Error).message }, '[DIY] analytics emit failed for an Ask project command');
  }
}

async function finishWith(ctx: ConfirmCapabilityContext, projectId: string, result: AskOperationResult): Promise<ConfirmCapabilityResult> {
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: BOUNDARY_ID, severity: 'CAUTION', title: 'Saved; the guide could not refresh',
      body: 'The change was recorded. The guide you were looking at could not refresh automatically; open it again to see where the project is.', suggestions: [],
    });
  }
  return { result, artifactType: 'DIY_PROJECT', artifactId: projectId, refreshedExecutions: refresh.refreshedExecutions };
}

// ---- finish -----------------------------------------------------------------------------------------------------------------------------------------------

const FINISH_TABLE = { FINISH: DIY_PROJECT_FINISH };

function alreadyFinished(title: string): AskOperationResult {
  return {
    status: 'COMPLETED', reasonCode: 'DIY_PROJECT_ALREADY_COMPLETED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'diy-project-complete-already', title: 'Already finished', status: 'COMPLETED', description: 'Nothing was changed.', details: [{ label: 'Project', value: title }], actions: [] }],
    suggestions: SUGGESTIONS,
  };
}

const LINKED_TASK_FIELD: Record<'OPEN' | 'COMPLETED' | 'MISSING', string> = {
  OPEN: 'Cozy will queue it to be marked done as DIY work',
  COMPLETED: 'Already done; it is left as it is',
  MISSING: 'No longer exists; there is nothing to update',
};

export async function diyProjectCompleteResult(userId: string, propertyId: string, message: string, launchContext?: Launch): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const decl = declared('DIY_PROJECT_COMPLETE', FINISH_TABLE, message, launchContext);
  if (!decl) return boundary("Use the project's own action", 'Open the project guide and use Finish this project once every step is resolved. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_NOT_DIRECTLY_ROUTABLE');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can finish a project in Ask. Nothing was changed.', 'BLOCKED', 'DIY_PROJECT_PERMISSION_REQUIRED');

  const source = (await diyService.getProjectGuideSource(decl.projectId, propertyId)) as unknown as ProjectSource | null;
  if (!source) return boundary('This project is no longer available', 'It was removed or does not belong to this home. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_NOT_FOUND');
  if (source.project.status === 'COMPLETED') return alreadyFinished(source.project.title);
  if (!OPEN.includes(source.project.status)) return boundary('This project is already closed', 'A stopped or handed-off project cannot be finished here. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_CLOSED');
  const policy = evaluateAskProjectPolicy(source, 'COMPLETE_PROJECT');
  if (!policy.ok) return boundary('This guide cannot be used here any more', 'It was withdrawn or can no longer be checked against its reviewed version. Finish the project on the project page. Nothing was changed.', 'BLOCKED', 'DIY_PROJECT_GUIDE_NOT_CURRENT');
  if (currentStepOf(source.project.steps)) return boundary('Some steps are still open', 'Finish or skip the remaining steps first. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_STEPS_INCOMPLETE');

  const linked = await diyService.getLinkedTaskState(propertyId, source.project.maintenanceTaskId ?? null);
  const steps = source.project.steps;
  const done = steps.filter((step) => step.status === 'COMPLETED').length;
  const skipped = steps.filter((step) => step.status === 'SKIPPED').length;
  const contextVersion = guideContextVersion(source);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const taskSentence = linked === 'OPEN'
    ? ' and queue the linked maintenance task to be marked done as DIY work'
    : linked === 'NONE' ? '' : linked === 'COMPLETED' ? ', and the linked maintenance task is already done, so it is left as it is' : ', and the linked maintenance task no longer exists, so there is nothing to update';
  const description = `This records the project as finished, on your word, and cannot be undone in Cozy. Cozy will queue a home-history record${taskSentence}. Nothing about any incident changes. These updates happen in the background and can take a little while.`;
  const consequence = 'Nothing has changed yet. ' + description;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DIY_PROJECT_COMPLETE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      diyProjectId: source.project.id, diyProjectExpectedUpdatedAt: token(source), diyProjectContextVersion: contextVersion, diyLinkedTask: linked,
      sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'diy-project-complete-review', title: `Review finishing "${source.project.title}"`, body: consequence, tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `diy-project-complete-${source.project.id}-1`, version: 1, title: `Finish "${source.project.title}"?`, description,
      fields: [
        { label: 'Project', value: source.project.title },
        { label: 'Steps', value: `All ${steps.length} resolved (${done} done${skipped ? `, ${skipped} skipped` : ''})` },
        { label: 'Home history', value: 'Cozy will queue a record' },
        ...(linked === 'NONE' ? [] : [{ label: 'Linked maintenance task', value: LINKED_TASK_FIELD[linked] }]),
        { label: 'Incidents', value: 'Not changed' },
        { label: 'Can be undone', value: 'No' },
      ],
      editableFields: [], confirmLabel: 'Finish project', consentText: 'I finished this project and want to record it as finished.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('diy.project-complete', async (envelope) => diyProjectCompleteResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

async function confirmDiyProjectComplete(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to finish a project in Ask.', 'ASK_PERMISSION_REQUIRED');
  const projectId = typeof parameters.diyProjectId === 'string' ? parameters.diyProjectId : null;
  const expectedUpdatedAt = typeof parameters.diyProjectExpectedUpdatedAt === 'string' ? parameters.diyProjectExpectedUpdatedAt : null;
  if (!projectId || !expectedUpdatedAt) throw writeError('The project selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const source = (await diyService.getProjectGuideSource(projectId, execution.propertyId)) as unknown as ProjectSource | null;
  if (!source) throw writeError('This project is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');

  let already = source.project.status === 'COMPLETED';
  let applied = false;
  if (!already) {
    if (!OPEN.includes(source.project.status)) throw writeError('This project was closed in another way while the confirmation was open.', 'ASK_CONFIRMATION_NOT_ACTIVE');
    // An early, friendly answer. The transaction inside completeProject is what actually protects the write.
    if (parameters.diyProjectContextVersion !== guideContextVersion(source)) throw writeError('This project changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    try {
      await diyService.completeProject(projectId, execution.propertyId, {}, { actorUserId: userId, expectedUpdatedAt, askPolicy: 'COMPLETE_PROJECT' });
      applied = true;
    } catch (error: any) {
      // A concurrent finish: the project is closed and the service says in which status. Already finished is "already"; any other closure is a plain conflict.
      if (error?.code === 'DIY_PROJECT_CLOSED' && error?.details?.status === 'COMPLETED') already = true;
      else serviceRefusal(error);
    }
  }
  // Best-effort and non-authoritative, only for a completion this call newly applied; a replay or a closed-project answer emits nothing.
  if (applied) track(userId, execution.propertyId, { actionType: 'complete_project' });

  if (already && !applied) return finishWith(ctx, projectId, alreadyFinished(source.project.title));
  const effects = describeCompletionEffects('COMPLETED', 'PENDING', 'STEPS');
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'DIY_PROJECT_COMPLETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'diy-project-complete-receipt', title: 'Finished by you', status: 'COMPLETED',
      description: `${effects?.summary ?? 'Recording your completion.'} This is recorded as your report; Cozy doesn't check the work. Time, cost and notes can be added on the project page.`,
      details: [{ label: 'Project', value: source.project.title }, { label: 'Records', value: 'Being queued; this can take a little while' }],
      actions: [openLink(execution.propertyId, projectId)],
    }],
    suggestions: SUGGESTIONS,
  };
  return finishWith(ctx, projectId, result);
}

registerConfirmCapabilityHandler('diy.project-complete', confirmDiyProjectComplete);

// ---- stop or hand off -------------------------------------------------------------------------------------------------------------------------------------

type Outcome = 'ABANDONED' | 'HIRED_OUT';
const OUTCOME_COPY: Record<Outcome, {
  title: (project: string) => string; description: string; confirmLabel: string; consent: string; doneTitle: string; doneCode: string; alreadyTitle: string; alreadyCode: string;
}> = {
  ABANDONED: {
    title: (project) => `Stop "${project}"?`,
    description: 'This marks the project as stopped, and cannot be undone in Cozy. Your steps and notes are kept, a linked maintenance task is not changed, and no incident changes.',
    confirmLabel: 'Stop project', consent: 'I want to stop this project.', doneTitle: 'Project stopped', doneCode: 'DIY_PROJECT_STOPPED', alreadyTitle: 'Already stopped', alreadyCode: 'DIY_PROJECT_ALREADY_STOPPED',
  },
  HIRED_OUT: {
    title: (project) => `Hand "${project}" off to a pro?`,
    description: 'This marks the project as handed off to a professional, and cannot be undone in Cozy. It does not book or contact anyone. Your steps and notes are kept, a linked maintenance task is not changed, and no incident changes.',
    confirmLabel: 'Mark as handed off', consent: 'I want to hand this project off to a professional.', doneTitle: 'Handed off', doneCode: 'DIY_PROJECT_HANDED_OFF', alreadyTitle: 'Already handed off', alreadyCode: 'DIY_PROJECT_ALREADY_HANDED_OFF',
  },
};

function alreadyClosed(outcome: Outcome, title: string): AskOperationResult {
  return {
    status: 'COMPLETED', reasonCode: OUTCOME_COPY[outcome].alreadyCode,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'diy-project-abandon-already', title: OUTCOME_COPY[outcome].alreadyTitle, status: 'COMPLETED', description: 'Nothing was changed.', details: [{ label: 'Project', value: title }], actions: [] }],
    suggestions: SUGGESTIONS,
  };
}

export async function diyProjectAbandonResult(userId: string, propertyId: string, message: string, launchContext?: Launch): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const decl = declared('DIY_PROJECT_ABANDON', DIY_PROJECT_STOP_ACTIONS, message, launchContext);
  if (!decl) return boundary("Use the project's own action", 'Open the project guide, choose Stop or hand off, and use its buttons. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_NOT_DIRECTLY_ROUTABLE');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can stop or hand off a project in Ask. Nothing was changed.', 'BLOCKED', 'DIY_PROJECT_PERMISSION_REQUIRED');

  const outcome = DIY_PROJECT_STOP_ACTIONS[decl.key].status;
  const source = (await diyService.getProjectGuideSource(decl.projectId, propertyId)) as unknown as ProjectSource | null;
  if (!source) return boundary('This project is no longer available', 'It was removed or does not belong to this home. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_NOT_FOUND');
  if (source.project.status === outcome) return alreadyClosed(outcome, source.project.title);
  if (!OPEN.includes(source.project.status)) return boundary('This project is already closed', 'A finished, stopped or handed-off project cannot be changed here. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_PROJECT_CLOSED');

  const copy = OUTCOME_COPY[outcome];
  const contextVersion = guideContextVersion(source);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DIY_PROJECT_ABANDON_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      diyProjectId: source.project.id, diyProjectOutcome: outcome, diyProjectExpectedUpdatedAt: token(source), diyProjectContextVersion: contextVersion,
      sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'diy-project-abandon-review', title: `Review ${outcome === 'ABANDONED' ? 'stopping' : 'handing off'} "${source.project.title}"`, body: `Nothing has changed yet. ${copy.description}`, tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `diy-project-abandon-${source.project.id}-${outcome}-1`, version: 1, title: copy.title(source.project.title), description: copy.description,
      fields: [
        { label: 'Project', value: source.project.title },
        { label: 'Steps and notes', value: 'Kept' },
        ...(source.project.maintenanceTaskId ? [{ label: 'Linked maintenance task', value: 'Not changed' }] : []),
        ...(outcome === 'HIRED_OUT' ? [{ label: 'Booking', value: 'Cozy books and contacts nobody' }] : []),
        { label: 'Can be undone', value: 'No' },
      ],
      editableFields: [], confirmLabel: copy.confirmLabel, consentText: copy.consent, expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('diy.project-abandon', async (envelope) => diyProjectAbandonResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

async function confirmDiyProjectAbandon(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to stop or hand off a project in Ask.', 'ASK_PERMISSION_REQUIRED');
  const projectId = typeof parameters.diyProjectId === 'string' ? parameters.diyProjectId : null;
  const outcome: Outcome | null = parameters.diyProjectOutcome === 'ABANDONED' || parameters.diyProjectOutcome === 'HIRED_OUT' ? parameters.diyProjectOutcome : null;
  const expectedUpdatedAt = typeof parameters.diyProjectExpectedUpdatedAt === 'string' ? parameters.diyProjectExpectedUpdatedAt : null;
  if (!projectId || !outcome || !expectedUpdatedAt) throw writeError('The project selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const source = (await diyService.getProjectGuideSource(projectId, execution.propertyId)) as unknown as ProjectSource | null;
  if (!source) throw writeError('This project is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');

  let already = source.project.status === outcome;
  let applied = false;
  if (!already) {
    if (!OPEN.includes(source.project.status)) throw writeError('This project was closed in another way while the confirmation was open.', 'ASK_CONFIRMATION_NOT_ACTIVE');
    if (parameters.diyProjectContextVersion !== guideContextVersion(source)) throw writeError('This project changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    try {
      await diyService.abandonProject(projectId, execution.propertyId, outcome === 'HIRED_OUT', { actorUserId: userId, expectedUpdatedAt });
      applied = true;
    } catch (error: any) {
      if (error?.code === 'DIY_PROJECT_CLOSED' && error?.details?.status === outcome) already = true;
      else serviceRefusal(error);
    }
  }
  if (applied) track(userId, execution.propertyId, { actionType: 'abandon_project', hireOut: outcome === 'HIRED_OUT' });

  if (already && !applied) return finishWith(ctx, projectId, alreadyClosed(outcome, source.project.title));
  const copy = OUTCOME_COPY[outcome];
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: copy.doneCode,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'diy-project-abandon-receipt', title: copy.doneTitle, status: 'COMPLETED',
      description: outcome === 'HIRED_OUT'
        ? 'The project is marked as handed off. Nobody was booked or contacted, and nothing else was changed.'
        : 'The project is marked as stopped. Nothing else was changed.',
      details: [{ label: 'Project', value: source.project.title }], actions: [openLink(execution.propertyId, projectId)],
    }],
    suggestions: SUGGESTIONS,
  };
  return finishWith(ctx, projectId, result);
}

registerConfirmCapabilityHandler('diy.project-abandon', confirmDiyProjectAbandon);
