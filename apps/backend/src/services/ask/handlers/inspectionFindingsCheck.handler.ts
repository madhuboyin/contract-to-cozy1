// Check that every inspection finding a journey is about has a decision, and complete "Act on findings" on that proof, in Ask (continuation FRD section 46). Decisions themselves are made with the finding
// commands; nothing is decided here. Reached only by the step's own declared action (non-routable); confirmation-gated, CONTRIBUTOR floor. The evaluation is re-run at the confirmation and must still
// cover the same decided findings.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { APIError } from '../../../middleware/error.middleware';
import { checkFindingDecisionsWithEffects, evaluateFindingDecisions, resolveFindingsDecisionBinding } from '../../inspectionFindingsProofOperations';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId } from '../support/guidanceStepBinding';
import { INSPECTION_FINDINGS_CHECK_MESSAGE } from '../support/inspectionFindingsCheck';

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'inspection-findings-check-boundary', title, body, severity: 'INFO', suggestions: ['Show my inspection findings'] }],
  suggestions: [],
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });
const version = (ids: readonly string[]) => createHash('sha256').update([...ids].sort().join(',')).digest('hex');

export async function inspectionFindingsCheckResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const stepId = launchedGuidanceStepId(launchContext);
  const declared = launchContext?.operationId === 'INSPECTION_FINDINGS_CHECK' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === INSPECTION_FINDINGS_CHECK_MESSAGE;
  if (!stepId || !declared) return boundary('Choose the step from its journey', 'The findings are checked from the journey step\'s own action. Nothing was changed.', 'NOT_APPLICABLE', 'INSPECTION_FINDINGS_CHECK_STEP_REQUIRED');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can complete this step in Ask. Nothing was changed.', 'BLOCKED', 'INSPECTION_FINDINGS_CHECK_PERMISSION_REQUIRED');
  const bound = await resolveFindingsDecisionBinding(propertyId, stepId);
  if (!bound.ok) return boundary('This step cannot be checked', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'INSPECTION_FINDINGS_CHECK_STEP_UNAVAILABLE');
  const state = await evaluateFindingDecisions(propertyId, bound.binding);
  if (!state) return boundary('No findings found for this journey', 'Ask could not find the inspection findings this journey is about. Nothing was changed.', 'NOT_APPLICABLE', 'INSPECTION_FINDINGS_CHECK_NO_FINDINGS');
  if (state.pending.length > 0) {
    return boundary(`${state.pending.length} finding${state.pending.length === 1 ? ' needs' : 's need'} a decision`, `Decide what to do about: ${state.pending.map((finding) => finding.title).join('; ')}. Then check again. Nothing was changed.`, 'NOT_APPLICABLE', 'INSPECTION_FINDINGS_CHECK_PENDING');
  }
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSPECTION_FINDINGS_CHECK_CONFIRMATION_REQUIRED', contextVersion: version(state.decidedIds),
    parameters: { guidanceStepId: stepId, findingsVersion: version(state.decidedIds), sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'inspection-findings-check-review', title: 'Every finding has a decision', body: 'Nothing has changed yet. Confirming completes this step on those decisions.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `inspection-findings-check-${stepId}-1`, version: 1, title: 'Complete "Act on findings"?',
      description: 'This records that each finding has a decision. It does not change any finding.',
      fields: [{ label: 'Findings decided', value: `${state.decided} of ${state.total}` }],
      editableFields: [], confirmLabel: 'Complete step', consentText: 'I confirm I have decided what to do about these findings.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmInspectionFindingsCheck(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to complete this step in Ask.', 'ASK_PERMISSION_REQUIRED');
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  const shown = typeof parameters.findingsVersion === 'string' ? parameters.findingsVersion : null;
  if (!stepId || !shown) throw writeError('The step selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const bound = await resolveFindingsDecisionBinding(execution.propertyId, stepId);
  if (!bound.ok) throw writeError(`${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]}`, 'ASK_CONFIRMATION_NOT_ACTIVE');
  const before = await evaluateFindingDecisions(execution.propertyId, bound.binding);
  if (!before || version(before.decidedIds) !== shown) throw writeError('The findings changed while this confirmation was open. Check again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  let outcome: Awaited<ReturnType<typeof checkFindingDecisionsWithEffects>>;
  try {
    outcome = await checkFindingDecisionsWithEffects(execution.propertyId, userId, stepId);
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'INSPECTION_FINDINGS_CHECKED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inspection-findings-check-${stepId}`, title: 'Step completed', status: 'COMPLETED',
      description: 'Your decisions on the findings are recorded as this step\'s proof.',
      details: [{ label: 'Findings decided', value: `${outcome.state.decided} of ${outcome.state.total}` }, { label: 'Guided journey', value: outcome.guidanceReported ? 'This step is recorded as done' : 'The check passed, but the journey step could not be updated. Open the journey to check it' }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: 'INSPECTION_REPORT', artifactId: outcome.state.reportId ?? stepId, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('inspection-findings.check', async (envelope) => inspectionFindingsCheckResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
registerConfirmCapabilityHandler('inspection-findings.check', confirmInspectionFindingsCheck);
