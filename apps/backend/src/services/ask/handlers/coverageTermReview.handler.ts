// Mark the current policy or warranty terms a journey is about as reviewed, in Ask (continuation FRD section 39). The proof is an append-only review of THESE terms (a fingerprint over the current terms), made
// through the same shared service the Desktop route uses. Reached only by a review step's own declared action (non-routable); confirmation-gated, CONTRIBUTOR floor. The kind comes from the step and the scope
// from the journey, never from the caller; the confirmation is tied to the terms shown: terms that changed in between must be reviewed again.
import { HouseholdRole } from '@prisma/client';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { APIError } from '../../../middleware/error.middleware';
import { COVERAGE_REVIEW_TOOL_KEY, COVERAGE_TERM_STEP_KEY, currentCoverageTerms, reviewCoverageTermsWithEffects, type CoverageTermKind } from '../../coverageTermReviewOperations';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId, resolveGuidanceStepBinding } from '../support/guidanceStepBinding';
import { COVERAGE_TERM_REVIEW_MESSAGE } from '../support/coverageTermReview';

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'coverage-term-review-boundary', title, body, severity: 'INFO', suggestions: ['Show my guided journeys'] }],
  suggestions: [],
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });
const KINDS: CoverageTermKind[] = ['POLICY', 'WARRANTY'];

export async function coverageTermReviewResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const stepId = launchedGuidanceStepId(launchContext);
  const declared = launchContext?.operationId === 'COVERAGE_TERM_REVIEW' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === COVERAGE_TERM_REVIEW_MESSAGE;
  if (!stepId || !declared) return boundary('Choose the step from its journey', 'Coverage terms are reviewed from the journey step\'s own action. Nothing was changed.', 'NOT_APPLICABLE', 'COVERAGE_TERM_REVIEW_STEP_REQUIRED');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can mark coverage terms as reviewed in Ask. Nothing was changed.', 'BLOCKED', 'COVERAGE_TERM_REVIEW_PERMISSION_REQUIRED');
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: COVERAGE_REVIEW_TOOL_KEY, stepKeys: KINDS.map((kind) => COVERAGE_TERM_STEP_KEY[kind]) });
  if (!bound.ok) return boundary('This step cannot mark coverage as reviewed', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'COVERAGE_TERM_REVIEW_STEP_UNAVAILABLE');
  const kind = KINDS.find((candidate) => COVERAGE_TERM_STEP_KEY[candidate] === bound.binding.stepKey)!;
  const terms = await currentCoverageTerms(propertyId, kind, bound.binding.inventoryItemId);
  const noun = kind === 'POLICY' ? 'insurance policy' : 'warranty';
  if (terms.count === 0) return boundary(`No current ${noun} is recorded`, `There is nothing to review yet. Add it to your records first. Nothing was changed.`, 'NOT_APPLICABLE', 'COVERAGE_TERM_REVIEW_NO_TERMS');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'COVERAGE_TERM_REVIEW_CONFIRMATION_REQUIRED', contextVersion: terms.fingerprint,
    parameters: { guidanceStepId: stepId, coverageTermKind: kind, coverageTermFingerprint: terms.fingerprint, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'coverage-term-review-review', title: `Review your current ${noun}${terms.count === 1 ? '' : 's'}`, body: 'Nothing has changed yet. Confirming records that you reviewed these terms; terms that change later need a new review.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `coverage-term-review-${stepId}-1`, version: 1, title: `Mark your ${noun} terms as reviewed?`,
      description: 'This records that you reviewed the current terms, with the time. It does not change the policy or warranty.',
      fields: [{ label: kind === 'POLICY' ? 'Policies' : 'Warranties', value: terms.labels.join('; ') }],
      editableFields: [], confirmLabel: 'Mark as reviewed', consentText: `I reviewed my current ${noun} terms.`, expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmCoverageTermReview(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to mark coverage terms as reviewed in Ask.', 'ASK_PERMISSION_REQUIRED');
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  const kind = KINDS.find((candidate) => candidate === parameters.coverageTermKind);
  const fingerprint = typeof parameters.coverageTermFingerprint === 'string' ? parameters.coverageTermFingerprint : null;
  if (!stepId || !kind || !fingerprint) throw writeError('The review selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  let outcome: Awaited<ReturnType<typeof reviewCoverageTermsWithEffects>>;
  try {
    outcome = await reviewCoverageTermsWithEffects(execution.propertyId, userId, kind, { guidanceStepId: stepId, expectedFingerprint: fingerprint });
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, error.code === 'COVERAGE_TERMS_CHANGED' ? 'ASK_CONTEXT_VERSION_CONFLICT' : 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  const note = outcome.guidanceReported ? 'This step is recorded as done' : outcome.guidanceRefusal ? (GUIDANCE_STEP_REFUSAL_TEXT[outcome.guidanceRefusal as keyof typeof GUIDANCE_STEP_REFUSAL_TEXT] ?? 'No journey step was updated')
    : 'The review is saved, but the journey step could not be updated. Open the journey to check it';
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: outcome.reused ? 'COVERAGE_TERMS_ALREADY_REVIEWED' : 'COVERAGE_TERMS_REVIEWED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `coverage-term-review-${outcome.review.id}`, title: outcome.reused ? 'Already reviewed' : 'Marked as reviewed', status: 'COMPLETED',
      description: outcome.reused ? 'These terms were already reviewed; nothing was added.' : 'Your review of the current terms is recorded with the time.',
      details: [{ label: 'Terms reviewed', value: String(outcome.review.termCount) }, { label: 'Guided journey', value: note }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'BOUNDARY', id: `coverage-term-review-refresh-failed-${outcome.review.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'This was saved. The journey view you were looking at could not refresh automatically; ask "Show my guided journeys" to see it.', suggestions: [] } as any);
  return { result, artifactType: 'COVERAGE_TERM_REVIEW', artifactId: outcome.review.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('coverage-term.review', async (envelope) => coverageTermReviewResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
registerConfirmCapabilityHandler('coverage-term.review', confirmCoverageTermReview);
