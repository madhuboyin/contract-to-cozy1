// DIY step command (docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md, step 6 of the stateful GUIDE): mark the CURRENT step of a guided project done, or skip it,
// after a confirmation. Reached only by the declared "Mark this step done" / "Skip this step" actions on the project guide card (launchContext.operationId
// 'DIY_STEP_UPDATE', entityType 'DIY_STEP', entityId the step id, and the exact canned message). Typed wording and ASK_REFRESH never write.
//
// What is recorded is the person's OWN report; nothing is verified. The checks here (role, the guide gate, "still the current step", the context version) are early,
// friendly answers. The authority is diyService.updateStep: it re-checks the role and the Ask policy `askPolicy` INSIDE its transaction.
import { HouseholdRole } from '@prisma/client';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { diyService } from '../../diy.service';
import { evaluateAskStepPolicy, guideContextVersion, currentStepOf, type AskStepPolicyName } from '../../diy/askStepPolicy';
import { DIY_STEP_ACTIONS, DIY_STEP_ENTITY_TYPE, projectPageHref, type DiyStepActionKey, type GuideSource } from '../../diy/projectGuide';

const BOUNDARY_ID = 'diy-step-boundary';
const SUGGESTIONS = ['Show my DIY projects'];

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode, blocks: [{ type: 'BOUNDARY', id: BOUNDARY_ID, title, body, severity: 'INFO', suggestions: SUGGESTIONS }], suggestions: SUGGESTIONS,
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });

/** The action a launch declares, or null: the operation, the entity type, an entity id, a canned message, and an action id that agrees with it when one is sent. */
function declaredAction(message: string, launchContext: CreateAskExecutionRequest['launchContext'] | undefined): { key: DiyStepActionKey; stepId: string } | null {
  if (!launchContext || launchContext.operationId !== 'DIY_STEP_UPDATE' || launchContext.surface === 'ASK_REFRESH') return null;
  if (launchContext.entityType !== DIY_STEP_ENTITY_TYPE || !launchContext.entityId) return null;
  const key = (Object.keys(DIY_STEP_ACTIONS) as DiyStepActionKey[]).find((candidate) => DIY_STEP_ACTIONS[candidate].message === message.trim());
  if (!key) return null;
  if (launchContext.actionId && launchContext.actionId !== key) return null;
  return { key, stepId: launchContext.entityId };
}

/** The plain copy for each reason the policy can refuse with, at propose time and (through the service's codes) at confirm time. */
function refusalFor(decision: Extract<ReturnType<typeof evaluateAskStepPolicy>, { ok: false }>): AskOperationResult {
  if (decision.code === 'DIY_STEP_NOT_CURRENT') return boundary('This step has moved on', 'It is no longer the current step. Open the guide again to see where the project is. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_STEP_NOT_CURRENT');
  if (decision.code === 'DIY_STEP_NOT_REOPENABLE') return boundary('This step is not finished', 'There is nothing to reopen: the step is not marked done or skipped. Open the guide again to see where the project is. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_STEP_NOT_REOPENABLE');
  if (decision.code === 'DIY_STEP_TRANSITION_NOT_ALLOWED') {
    if (decision.reason === 'SKIP_REQUIRED_STEP') return boundary('This step cannot be skipped', 'It is a required step, so it has to be done rather than skipped. Nothing was changed.', 'BLOCKED', 'DIY_STEP_SKIP_REQUIRED');
    if (decision.reason === 'SKIP_SAFETY_STEP') return boundary('This step cannot be skipped', 'It carries a safety note, so it has to be done rather than skipped. Nothing was changed.', 'BLOCKED', 'DIY_STEP_SKIP_SAFETY');
    return boundary('This step cannot be changed here', 'Ask only marks a step done, skips it, or reopens a finished one. Nothing was changed.', 'BLOCKED', 'DIY_STEP_NOT_OFFERED');
  }
  if (decision.reason === 'PROJECT_FINISHED') return boundary('This project is finished', 'A finished project cannot be changed here. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_STEP_PROJECT_FINISHED');
  return boundary('This guide cannot be used here any more', 'It was withdrawn or can no longer be checked against its reviewed version. Use the project page. Nothing was changed.', 'BLOCKED', 'DIY_STEP_GUIDE_NOT_CURRENT');
}

type StepTarget = 'COMPLETED' | 'SKIPPED' | 'IN_PROGRESS';
/** Everything that differs between the three declared actions: the rule set the service enforces, the confirmation and receipt wording, and the reason codes. */
const TARGET_COPY: Record<StepTarget, {
  policy: AskStepPolicyName; verb: string; consequence: string; title: (step: string) => string; confirmLabel: string; consent: string;
  alreadyTitle: string; alreadyCode: string; doneTitle: string; doneCode: string; doneNote: string;
}> = {
  COMPLETED: {
    policy: 'ADVANCE_CURRENT_STEP', verb: 'done', consequence: 'This records the step as done, on your word. Cozy does not check the work.', title: (step) => `Mark "${step}" done?`,
    confirmLabel: 'Mark step done', consent: 'I did this step and want to record it as done.', alreadyTitle: 'Already marked done', alreadyCode: 'DIY_STEP_ALREADY_COMPLETED',
    doneTitle: 'Marked done by you', doneCode: 'DIY_STEP_COMPLETED', doneNote: "This is recorded as your report; Cozy doesn't check the work.",
  },
  SKIPPED: {
    policy: 'ADVANCE_CURRENT_STEP', verb: 'skipped', consequence: 'This records the optional step as skipped, on your word. The project carries on with the next step.', title: (step) => `Skip "${step}"?`,
    confirmLabel: 'Skip step', consent: 'I want to skip this optional step of the project.', alreadyTitle: 'Already skipped', alreadyCode: 'DIY_STEP_ALREADY_SKIPPED',
    doneTitle: 'Skipped by you', doneCode: 'DIY_STEP_SKIPPED', doneNote: "This is recorded as your report; Cozy doesn't check the work.",
  },
  IN_PROGRESS: {
    policy: 'REOPEN_FINISHED_STEP', verb: 'reopened', consequence: 'This puts the step back in progress. The guide returns to it, and steps you finished after it stay finished.', title: (step) => `Reopen "${step}"?`,
    confirmLabel: 'Reopen step', consent: 'I want to reopen this step.', alreadyTitle: 'Already reopened', alreadyCode: 'DIY_STEP_ALREADY_REOPENED',
    doneTitle: 'Reopened by you', doneCode: 'DIY_STEP_REOPENED', doneNote: 'The step is back in progress and the guide returns to it. Steps you finished after it stay finished.',
  },
};

function alreadyReceipt(target: StepTarget, stepTitle: string, projectTitle: string): AskOperationResult {
  return {
    status: 'COMPLETED', reasonCode: TARGET_COPY[target].alreadyCode,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'diy-step-update-already', title: TARGET_COPY[target].alreadyTitle, status: 'COMPLETED', description: 'Nothing was changed.',
      details: [{ label: 'Step', value: stepTitle }, { label: 'Project', value: projectTitle }], actions: [],
    }],
    suggestions: SUGGESTIONS,
  };
}

export async function diyStepUpdateResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const declared = declaredAction(message, launchContext);
  if (!declared) return boundary("Use the step's own action", 'Open the project guide and use Mark this step done or Skip this step on the current step. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_STEP_NOT_DIRECTLY_ROUTABLE');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can change a project step in Ask. Nothing was changed.', 'BLOCKED', 'DIY_STEP_PERMISSION_REQUIRED');

  const source = (await diyService.getProjectGuideSourceForStep(declared.stepId, propertyId)) as unknown as GuideSource | null;
  const step = source?.project.steps.find((row) => row.id === declared.stepId);
  if (!source || !step) return boundary('This step is no longer available', 'It was removed or does not belong to this home. Nothing was changed.', 'NOT_APPLICABLE', 'DIY_STEP_NOT_FOUND');

  const target = DIY_STEP_ACTIONS[declared.key].target;
  if (step.status === target) return alreadyReceipt(target, step.title, source.project.title);
  const decision = evaluateAskStepPolicy(source, step.id, target, TARGET_COPY[target].policy);
  if (!decision.ok) return refusalFor(decision);

  const contextVersion = guideContextVersion(source);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const copy = TARGET_COPY[target];
  const verb = copy.verb;
  const consequence = copy.consequence;
  const safety = step.safetyNote && step.safetyNote.trim() ? step.safetyNote : null;
  const blocks: AskPresentationBlock[] = [];
  // The safety note is seen again at the moment of acting, directly above the review.
  if (safety) blocks.push({ type: 'BOUNDARY', id: 'diy-step-safety', title: 'Safety for this step', body: safety, severity: 'CAUTION', suggestions: [] });
  blocks.push({ type: 'SUMMARY', id: 'diy-step-update-review', title: target === 'IN_PROGRESS' ? `Review reopening "${step.title}"` : `Review marking "${step.title}" ${verb}`, body: `Nothing has changed yet. ${consequence}`, tone: 'CAUTION', actions: [] });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DIY_STEP_UPDATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      diyStepId: step.id, diyProjectId: source.project.id, diyStepTarget: target, diyStepExpectedUpdatedAt: new Date(step.updatedAt as Date | string).toISOString(),
      diyStepContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks,
    confirmation: {
      confirmationId: `diy-step-update-${step.id}-1`, version: 1, title: copy.title(step.title), description: consequence,
      fields: [
        { label: 'Step', value: step.title }, { label: 'Project', value: source.project.title },
        ...(safety ? [{ label: 'Safety note', value: safety }] : []),
      ],
      editableFields: [], confirmLabel: copy.confirmLabel,
      consentText: copy.consent, expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('diy.step-update', async (envelope) => diyStepUpdateResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

/** The service's refusals become the confirmation's own conflict answers with the service's plain message. */
function serviceRefusal(error: any): never {
  const code = error?.code;
  if (code === 'DIY_ACCESS_REVOKED') throw writeError('A contributor or owner is required to change a project step in Ask.', 'ASK_PERMISSION_REQUIRED');
  if (code === 'DIY_STALE' || code === 'DIY_STEP_NOT_CURRENT' || code === 'DIY_STEP_NOT_REOPENABLE') throw writeError(error.message, 'ASK_CONTEXT_VERSION_CONFLICT');
  if (code === 'DIY_GUIDE_NOT_CURRENT' || code === 'DIY_PROJECT_CLOSED' || code === 'DIY_STEP_TRANSITION_NOT_ALLOWED' || code === 'STEP_NOT_FOUND' || code === 'PROJECT_NOT_FOUND') {
    throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
  }
  throw error;
}

async function confirmDiyStepUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to change a project step in Ask.', 'ASK_PERMISSION_REQUIRED');
  const stepId = typeof parameters.diyStepId === 'string' ? parameters.diyStepId : null;
  const projectId = typeof parameters.diyProjectId === 'string' ? parameters.diyProjectId : null;
  const target: StepTarget | null = parameters.diyStepTarget === 'COMPLETED' || parameters.diyStepTarget === 'SKIPPED' || parameters.diyStepTarget === 'IN_PROGRESS' ? parameters.diyStepTarget : null;
  const expectedUpdatedAt = typeof parameters.diyStepExpectedUpdatedAt === 'string' ? parameters.diyStepExpectedUpdatedAt : null;
  if (!stepId || !projectId || !target || !expectedUpdatedAt) throw writeError('The step selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');

  const source = (await diyService.getProjectGuideSource(projectId, execution.propertyId)) as unknown as GuideSource | null;
  const step = source?.project.steps.find((row) => row.id === stepId);
  if (!source || !step) throw writeError('This project step is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
  let alreadyApplied = step.status === target;
  if (!alreadyApplied) {
    // An early, friendly answer. The transaction inside updateStep is what actually protects the write.
    if (parameters.diyStepContextVersion !== guideContextVersion(source)) throw writeError('This project changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    try {
      const applied = await diyService.updateStep(projectId, execution.propertyId, stepId, { status: target }, { actorUserId: userId, expectedUpdatedAt, askPolicy: TARGET_COPY[target].policy });
      alreadyApplied = applied.alreadyApplied;
    } catch (error) { serviceRefusal(error); }
  }

  const projectTitle = source.project.title;
  const blocks: AskPresentationBlock[] = [];
  if (alreadyApplied) {
    blocks.push(...alreadyReceipt(target, step.title, projectTitle).blocks);
  } else {
    // Whether that was the last step is read after the write, best effort: the receipt never fails because a follow-up read did.
    let allResolved = false;
    try {
      const after = await diyService.getProjectGuideSource(projectId, execution.propertyId);
      allResolved = Boolean(after) && currentStepOf(after!.project.steps) === null;
    } catch { allResolved = false; }
    blocks.push({
      type: 'WORKFLOW_PROGRESS', id: 'diy-step-update-receipt', title: TARGET_COPY[target].doneTitle, status: 'COMPLETED',
      description: allResolved && target !== 'IN_PROGRESS'
        ? `${TARGET_COPY[target].doneNote} Every step is resolved. Finish the project on the project page.`
        : TARGET_COPY[target].doneNote,
      details: [{ label: 'Step', value: step.title }, { label: 'Project', value: projectTitle }],
      actions: [{ id: 'open-diy-project', label: 'Open this project', href: projectPageHref(execution.propertyId, projectId), style: 'SECONDARY' }],
    });
  }
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode: alreadyApplied ? TARGET_COPY[target].alreadyCode : TARGET_COPY[target].doneCode, blocks, suggestions: SUGGESTIONS };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: BOUNDARY_ID, severity: 'CAUTION', title: 'Saved; the guide could not refresh',
      body: 'The step was recorded. The guide you were looking at could not refresh automatically; open it again to see where the project is.', suggestions: [],
    });
  }
  return { result, artifactType: 'DIY_PROJECT_STEP', artifactId: stepId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('diy.step-update', confirmDiyStepUpdate);
