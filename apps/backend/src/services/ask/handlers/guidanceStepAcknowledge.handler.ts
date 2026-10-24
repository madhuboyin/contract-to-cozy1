// Mark a review step of a guided journey as reviewed, in Ask (continuation FRD section 28). The proof is a typed, durable acknowledgement (guidanceAcknowledgement.ts)
// and is valid only for a true review step: the step's tool must be guidance-overview and its key one of ACKNOWLEDGEABLE_STEP_KEYS. Reached only by the journey
// step's own declared action; confirmation-gated, CONTRIBUTOR floor, non-routable. Like a dismissal it is not reversible in Ask, so it has no correction mode.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { ACKNOWLEDGEABLE_STEP_KEYS, ACKNOWLEDGEMENT_TOOL_KEY, acknowledgeGuidanceStep } from '../../guidanceEngine/guidanceAcknowledgement';
import { GUIDANCE_STEP_REFUSAL_TEXT, resolveGuidanceStepBinding } from '../support/guidanceStepBinding';
import { GUIDANCE_STEP_ACKNOWLEDGE_MESSAGE } from '../support/guidanceAcknowledge';
import { getGuidanceModels } from '../../guidanceEngine/guidanceTypes';

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'guidance-step-boundary', title, body, severity: 'INFO', suggestions: ['Show my guided journeys'] }],
  suggestions: [],
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });

/** The step, its journey and the signal as it stands now: the version the acknowledgement will name and the confirmation will be tied to. */
async function loadStep(propertyId: string, stepId: string) {
  const step = await getGuidanceModels().guidanceJourneyStep.findFirst({
    where: { id: stepId, journey: { propertyId } },
    select: { id: true, label: true, stepKey: true, status: true, updatedAt: true, journey: { select: { id: true, status: true, inventoryItemId: true, primarySignal: { select: { id: true, signalIntentFamily: true, updatedAt: true } } } } },
  });
  if (!step) return null;
  const signal = step.journey.primarySignal;
  return { ...step, signalId: signal?.id ?? null, signalVersion: signal?.updatedAt ? new Date(signal.updatedAt).toISOString() : null, signalIntentFamily: signal?.signalIntentFamily ?? null };
}
export const guidanceAcknowledgeContextVersion = (step: { id: string; status: string; updatedAt: Date | string; signalId: string | null; signalVersion: string | null }) =>
  createHash('sha256').update(`ack:${step.id}:${step.status}:${new Date(step.updatedAt).toISOString()}:${step.signalId ?? ''}:${step.signalVersion ?? ''}`).digest('hex');

export async function guidanceStepAcknowledgeResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const stepId = launchContext?.entityType === 'GUIDANCE_STEP' ? launchContext.entityId : null;
  const declared = launchContext?.operationId === 'GUIDANCE_STEP_ACKNOWLEDGE' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === GUIDANCE_STEP_ACKNOWLEDGE_MESSAGE;
  if (!stepId || !declared) return boundary('Choose the step from its journey', 'Open the guided journey and use the step\'s own action. Nothing was changed.', 'NOT_APPLICABLE', 'GUIDANCE_STEP_REQUIRED');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can mark a step as reviewed in Ask. Nothing was changed.', 'BLOCKED', 'GUIDANCE_STEP_PERMISSION_REQUIRED');
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: ACKNOWLEDGEMENT_TOOL_KEY, stepKeys: ACKNOWLEDGEABLE_STEP_KEYS });
  if (!bound.ok) {
    if (bound.reason === 'STEP_DONE') return boundary('This step is already done', 'Nothing was changed.', 'NOT_APPLICABLE', 'GUIDANCE_STEP_ALREADY_COMPLETED');
    return boundary('This step cannot be marked as reviewed', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Only a review step can be completed this way. Nothing was changed.`, 'NOT_APPLICABLE', 'GUIDANCE_STEP_ACKNOWLEDGE_UNAVAILABLE');
  }
  const step = await loadStep(propertyId, stepId);
  if (!step) return boundary('This step is no longer available', 'It was removed or does not belong to this home. Nothing was changed.', 'NOT_APPLICABLE', 'GUIDANCE_STEP_NOT_FOUND');
  const contextVersion = guidanceAcknowledgeContextVersion(step);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'GUIDANCE_STEP_ACKNOWLEDGE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { guidanceStepId: step.id, guidanceAcknowledgeContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'guidance-step-acknowledge-review', title: `Review "${step.label}"`, body: 'Nothing has changed yet. Confirming records that you reviewed this, with the time and what you reviewed.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `guidance-step-acknowledge-${step.id}-1`, version: 1, title: `Mark "${step.label}" as reviewed?`,
      description: 'This records that you reviewed it. It does not take any other action, and Ask cannot undo it.',
      fields: [{ label: 'Step', value: step.label }, { label: 'Outcome', value: 'Reviewed' }],
      editableFields: [], confirmLabel: 'Mark as reviewed', consentText: 'I reviewed this step of the guided journey.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmGuidanceStepAcknowledge(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to mark a step as reviewed in Ask.', 'ASK_PERMISSION_REQUIRED');
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  if (!stepId) throw writeError('The step selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const step = await loadStep(execution.propertyId, stepId);
  if (!step) throw writeError('This guided journey step is no longer available.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const alreadyApplied = step.status === 'COMPLETED';
  if (!alreadyApplied) {
    if (parameters.guidanceAcknowledgeContextVersion !== guidanceAcknowledgeContextVersion(step)) {
      throw writeError('This step or its signal changed while confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    }
    const bound = await resolveGuidanceStepBinding(execution.propertyId, stepId, { toolKey: ACKNOWLEDGEMENT_TOOL_KEY, stepKeys: ACKNOWLEDGEABLE_STEP_KEYS });
    if (!bound.ok) throw writeError(`${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'ASK_CONFIRMATION_NOT_ACTIVE');
    const recorded = await acknowledgeGuidanceStep(execution.propertyId, userId, {
      stepId: step.id, stepKey: step.stepKey, journeyId: step.journey.id, signalId: step.signalId, signalVersion: step.signalVersion,
      inventoryItemId: step.journey.inventoryItemId ?? null, signalIntentFamily: step.signalIntentFamily, acknowledgedAt: new Date(),
    });
    if (!recorded) throw writeError('The review could not be recorded. Nothing was changed; try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: alreadyApplied ? 'GUIDANCE_STEP_ALREADY_REVIEWED' : 'GUIDANCE_STEP_REVIEWED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `guidance-step-acknowledge-${step.id}`, title: alreadyApplied ? 'Already done' : 'Marked as reviewed', status: 'COMPLETED',
      description: alreadyApplied ? 'Nothing was changed.' : 'Your review is recorded with the time, and the journey carries on.',
      details: [{ label: 'Step', value: step.label }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'BOUNDARY', id: `guidance-refresh-failed-${step.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'This was saved. The journey view you were looking at could not refresh automatically; ask "Show my guided journeys" to see it.', suggestions: [] });
  }
  return { result, artifactType: 'GUIDANCE_JOURNEY_STEP', artifactId: step.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('guidance-overview.step-acknowledge', async (envelope) => guidanceStepAcknowledgeResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
registerConfirmCapabilityHandler('guidance-overview.step-acknowledge', confirmGuidanceStepAcknowledge);
