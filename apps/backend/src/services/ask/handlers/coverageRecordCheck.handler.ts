// Check that the policy or warranty a journey step is about has actually been saved, and complete the step on that proof, in Ask (continuation FRD section 45). Nothing is created here: the saved, active
// record decides (the same evaluation the Desktop page's check runs). Reached only by the step's own declared action (non-routable); confirmation-gated, CONTRIBUTOR floor. The record is shown at the
// proposal and re-evaluated at the confirmation.
import { HouseholdRole } from '@prisma/client';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { APIError } from '../../../middleware/error.middleware';
import { COVERAGE_RECORD_STEP_KINDS, checkCoverageRecordWithEffects, findQualifyingCoverageRecord, resolveCoverageRecordBinding } from '../../coverageRecordProofOperations';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId } from '../support/guidanceStepBinding';
import { COVERAGE_RECORD_CHECK_MESSAGE } from '../support/coverageRecordCheck';

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'coverage-record-check-boundary', title, body, severity: 'INFO', suggestions: ['Show my guided journeys'] }],
  suggestions: [],
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });

export async function coverageRecordCheckResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const stepId = launchedGuidanceStepId(launchContext);
  const declared = launchContext?.operationId === 'COVERAGE_RECORD_CHECK' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === COVERAGE_RECORD_CHECK_MESSAGE;
  if (!stepId || !declared) return boundary('Choose the step from its journey', 'The saved plan is checked from the journey step\'s own action. Nothing was changed.', 'NOT_APPLICABLE', 'COVERAGE_RECORD_CHECK_STEP_REQUIRED');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can complete this step in Ask. Nothing was changed.', 'BLOCKED', 'COVERAGE_RECORD_CHECK_PERMISSION_REQUIRED');
  const bound = await resolveCoverageRecordBinding(propertyId, stepId);
  if (!bound.ok) return boundary('This step cannot be checked', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'COVERAGE_RECORD_CHECK_STEP_UNAVAILABLE');
  const kind = COVERAGE_RECORD_STEP_KINDS[bound.binding.stepKey];
  const noun = kind === 'POLICY' ? 'insurance policy' : 'warranty';
  const record = await findQualifyingCoverageRecord(propertyId, bound.binding);
  if (!record) return boundary(`No saved ${noun} yet`, `No active ${noun} has been saved for this journey. Save it first (your records can take it from a document or typed details), then check again. Nothing was changed.`, 'NOT_APPLICABLE', 'COVERAGE_RECORD_CHECK_NO_RECORD');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'COVERAGE_RECORD_CHECK_CONFIRMATION_REQUIRED', contextVersion: `${record.id}:${record.savedAt.toISOString()}`,
    parameters: { guidanceStepId: stepId, coverageRecordId: record.id, coverageRecordSavedAt: record.savedAt.toISOString(), sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'coverage-record-check-review', title: `Your saved ${noun} is on record`, body: 'Nothing has changed yet. Confirming completes this step on the saved record shown.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `coverage-record-check-${stepId}-1`, version: 1, title: 'Complete this step with the saved plan?',
      description: 'This records that the plan below is saved and active. It does not change the plan.',
      fields: [{ label: kind === 'POLICY' ? 'Policy' : 'Warranty', value: record.label }, { label: 'Saved', value: record.savedAt.toISOString().slice(0, 10) }],
      editableFields: [], confirmLabel: 'Complete step', consentText: `I confirm this ${noun} is saved.`, expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmCoverageRecordCheck(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to complete this step in Ask.', 'ASK_PERMISSION_REQUIRED');
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  const recordId = typeof parameters.coverageRecordId === 'string' ? parameters.coverageRecordId : null;
  const savedAt = typeof parameters.coverageRecordSavedAt === 'string' ? parameters.coverageRecordSavedAt : null;
  if (!stepId || !recordId || !savedAt) throw writeError('The step selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  let outcome: Awaited<ReturnType<typeof checkCoverageRecordWithEffects>>;
  try {
    outcome = await checkCoverageRecordWithEffects(execution.propertyId, userId, stepId);
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  // The record that completes the step must be the one that was shown.
  if (outcome.record.id !== recordId || outcome.record.savedAt.toISOString() !== savedAt) {
    throw writeError('The saved plan changed while this confirmation was open. Check again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'COVERAGE_RECORD_CHECKED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `coverage-record-check-${recordId}`, title: 'Step completed', status: 'COMPLETED',
      description: 'The saved plan is recorded as this step\'s proof.',
      details: [{ label: 'Plan', value: outcome.record.label }, { label: 'Guided journey', value: outcome.guidanceReported ? 'This step is recorded as done' : 'The check passed, but the journey step could not be updated. Open the journey to check it' }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: outcome.record.kind === 'POLICY' ? 'INSURANCE_POLICY' : 'WARRANTY', artifactId: recordId, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('coverage-record.check', async (envelope) => coverageRecordCheckResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
registerConfirmCapabilityHandler('coverage-record.check', confirmCoverageRecordCheck);
