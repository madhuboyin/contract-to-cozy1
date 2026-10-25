// Declare one of the two intentionally manual journey steps, in Ask (continuation FRD section 51): `prepare_property_access` and `select_cleaning_type`, and nothing else. This is deliberately NOT a generic
// escape hatch: it is launchable only from the exact journey step's own action (never routed from a message, never by family), the step must be one of the two and open, the declaration words are the server's
// (the person picks a KEY from the step's catalog; no free-form text exists), a confirmation is required, and the actor, time, exact words, subject and signal version are persisted by the same shared service
// the Desktop uses.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { MANUAL_DECLARATIONS, MANUAL_DECLARATION_STEP_KEYS, MANUAL_DECLARATION_TOOL_KEY, declareGuidanceStep } from '../../guidanceEngine/guidanceManualDeclaration';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId, resolveGuidanceStepBinding } from '../support/guidanceStepBinding';
import { GUIDANCE_STEP_DECLARE_CAPTURE_KEY, GUIDANCE_STEP_DECLARE_MESSAGE } from '../support/guidanceStepDeclare';

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'guidance-step-declare-boundary', title, body, severity: 'INFO', suggestions: ['Show my guided journeys'] }],
  suggestions: [],
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });
const version = (stepId: string, key: string) => createHash('sha256').update(`declare:${stepId}:${key}`).digest('hex');

export async function guidanceStepDeclareResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext'], chosenKey?: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const stepId = launchedGuidanceStepId(launchContext);
  const declared = launchContext?.operationId === 'GUIDANCE_STEP_DECLARE' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === GUIDANCE_STEP_DECLARE_MESSAGE;
  if (!stepId || !declared) return boundary('Choose the step from its journey', 'A step is declared from its own action in the journey. Nothing was changed.', 'NOT_APPLICABLE', 'GUIDANCE_STEP_DECLARE_STEP_REQUIRED');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can complete this step in Ask. Nothing was changed.', 'BLOCKED', 'GUIDANCE_STEP_DECLARE_PERMISSION_REQUIRED');
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: MANUAL_DECLARATION_TOOL_KEY, stepKeys: MANUAL_DECLARATION_STEP_KEYS });
  if (!bound.ok) return boundary('This step cannot be declared', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Only two low-consequence steps are completed by a declaration. Nothing was changed.`, 'NOT_APPLICABLE', 'GUIDANCE_STEP_DECLARE_STEP_UNAVAILABLE');
  const catalog = MANUAL_DECLARATIONS[bound.binding.stepKey];
  const keys = Object.keys(catalog);
  const key = chosenKey ?? (keys.length === 1 ? keys[0] : undefined);
  if (!key) {
    // More than one declaration for this step: the person picks a KEY from the server's catalog; the words are not theirs.
    const capture: AskCaptureRequest = {
      requirementId: 'guidance-step-declare-inputs', captureKey: GUIDANCE_STEP_DECLARE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
      title: 'Choose', question: 'Which one applies?', helpText: 'Nothing is recorded until you confirm.',
      inputSchema: { type: 'GROUP', fields: [{ key: 'declarationKey', label: 'Choice', required: true, inputSchema: { type: 'SINGLE_SELECT', options: keys.map((value) => ({ value, label: catalog[value].text.replace(/^I choose: /, '').replace(/\.$/, '') })) } }] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: {}, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this declaration; nothing is recorded until you confirm', confirmationText: null, expectedContextVersion: version(stepId, 'choose'),
    };
    return { status: 'NEEDS_CONTEXT', reasonCode: 'GUIDANCE_STEP_DECLARE_INPUT_REQUIRED', contextVersion: version(stepId, 'choose'), parameters: { guidanceDeclareLaunch: { stepId, sourceExecutionId: launchContext?.sourceExecutionId ?? null } },
      blocks: [{ type: 'SUMMARY', id: 'guidance-step-declare-input', title: 'Choose one', body: 'Nothing is recorded yet.', tone: 'DEFAULT', actions: [] }], captureRequests: [capture], suggestions: [] };
  }
  const declaration = catalog[key];
  if (!declaration) return boundary('That is not a choice for this step', 'Nothing was changed.', 'NOT_APPLICABLE', 'GUIDANCE_STEP_DECLARE_UNKNOWN');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'GUIDANCE_STEP_DECLARE_CONFIRMATION_REQUIRED', contextVersion: version(stepId, key),
    parameters: { guidanceStepId: stepId, guidanceDeclarationKey: key, guidanceDeclareVersion: version(stepId, key), sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'guidance-step-declare-review', title: 'Confirm your declaration', body: 'Nothing has changed yet. This records that you said it, with the time. It does not check or change anything else.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `guidance-step-declare-${stepId}-${key}-1`, version: 1, title: 'Record this declaration?',
      description: 'The step is completed on your word, recorded with who, when and these exact words.',
      fields: [{ label: 'Declaration', value: declaration.text }],
      editableFields: [], confirmLabel: 'Record declaration', consentText: declaration.text, expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmGuidanceStepDeclare(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to complete this step in Ask.', 'ASK_PERMISSION_REQUIRED');
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  const key = typeof parameters.guidanceDeclarationKey === 'string' ? parameters.guidanceDeclarationKey : null;
  if (!stepId || !key || parameters.guidanceDeclareVersion !== version(stepId, key)) throw writeError('The declaration is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const outcome = await declareGuidanceStep(execution.propertyId, userId, stepId, key);
  if (!outcome.ok) {
    if (outcome.reason === 'RECORD_FAILED') throw writeError('The declaration could not be recorded. Nothing was changed; try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    throw writeError(outcome.reason === 'UNKNOWN_DECLARATION' ? 'That is not a choice for this step.' : `${GUIDANCE_STEP_REFUSAL_TEXT[outcome.reason]} Nothing was changed.`, 'ASK_CONFIRMATION_NOT_ACTIVE');
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'GUIDANCE_STEP_DECLARED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `guidance-step-declare-${stepId}`, title: 'Declaration recorded', status: 'COMPLETED', description: 'Your declaration is recorded with the time, and the journey carries on.', details: [{ label: 'Guided journey', value: 'This step is recorded as done' }], actions: [] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: 'GUIDANCE_JOURNEY_STEP', artifactId: stepId, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('guidance-step.declare', async (envelope) => guidanceStepDeclareResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
registerConfirmCapabilityHandler('guidance-step.declare', confirmGuidanceStepDeclare);
