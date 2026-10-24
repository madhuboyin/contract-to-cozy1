// Mark the inspection report a journey is about as reviewed, in Ask (continuation FRD section 35). The proof is an append-only review record of THIS version of the report (a content fingerprint), made through the
// same shared service the page uses. Reached only by a review step's own declared action (non-routable); confirmation-gated, CONTRIBUTOR floor. The report is derived from the journey, never named by the caller, and
// the confirmation is tied to the version the person was shown: a report that changed in between must be reviewed again.
import { HouseholdRole } from '@prisma/client';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { APIError } from '../../../middleware/error.middleware';
import {
  INSPECTION_REVIEW_STEP_KEYS, INSPECTION_REVIEW_TOOL_KEY, REVIEWABLE_REPORT_STATUSES, inspectionReportFingerprint, inspectionReportForJourney, resolveInspectionReviewBinding, reviewInspectionReportWithEffects,
} from '../../inspectionReportReviewOperations';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId, resolveGuidanceStepBinding } from '../support/guidanceStepBinding';
import { INSPECTION_REPORT_REVIEW_MESSAGE } from '../support/inspectionReportReview';

const boundary = (title: string, body: string, status: 'BLOCKED' | 'NOT_APPLICABLE', reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id: 'inspection-report-review-boundary', title, body, severity: 'INFO', suggestions: ['Show my guided journeys'] }],
  suggestions: [],
});
const writeError = (message: string, code: string) => Object.assign(new Error(message), { code });
const label = (value: string) => value.toLowerCase().replace(/_/g, ' ');

export async function inspectionReportReviewResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const stepId = launchedGuidanceStepId(launchContext);
  const declared = launchContext?.operationId === 'INSPECTION_REPORT_REVIEW' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === INSPECTION_REPORT_REVIEW_MESSAGE;
  if (!stepId || !declared) return boundary('Choose the step from its journey', 'A report is reviewed from the journey step\'s own action. Nothing was changed.', 'NOT_APPLICABLE', 'INSPECTION_REVIEW_STEP_REQUIRED');
  if (access.role === HouseholdRole.VIEWER) return boundary('A contributor or owner is needed', 'Only a contributor or owner can mark a report as reviewed in Ask. Nothing was changed.', 'BLOCKED', 'INSPECTION_REVIEW_PERMISSION_REQUIRED');
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: INSPECTION_REVIEW_TOOL_KEY, stepKeys: INSPECTION_REVIEW_STEP_KEYS });
  if (!bound.ok) return boundary('This step cannot mark a report as reviewed', `${GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'INSPECTION_REVIEW_STEP_UNAVAILABLE');
  const report = await inspectionReportForJourney(propertyId, bound.binding);
  if (!report) return boundary('No report is linked to this journey', 'Ask could not find the inspection report this journey is about. Nothing was changed.', 'NOT_APPLICABLE', 'INSPECTION_REVIEW_REPORT_NOT_FOUND');
  const fitted = await resolveInspectionReviewBinding(propertyId, stepId, report);
  if (!fitted.ok) return boundary('This report is not the one this step is about', `${GUIDANCE_STEP_REFUSAL_TEXT[fitted.reason]} Nothing was changed.`, 'NOT_APPLICABLE', 'INSPECTION_REVIEW_REPORT_MISMATCH');
  if (!(REVIEWABLE_REPORT_STATUSES as readonly string[]).includes(report.status)) return boundary('This report is not ready to review', 'It is still being processed or has been archived. Nothing was changed.', 'NOT_APPLICABLE', 'INSPECTION_REVIEW_REPORT_NOT_REVIEWABLE');
  const version = await inspectionReportFingerprint(propertyId, report.id);
  if (!version) return boundary('This report is no longer available', 'Nothing was changed.', 'NOT_APPLICABLE', 'INSPECTION_REVIEW_REPORT_NOT_FOUND');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const title = `${label(report.reportType)} inspection${report.inspectorCompany ? ` by ${report.inspectorCompany}` : ''}`;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSPECTION_REPORT_REVIEW_CONFIRMATION_REQUIRED', contextVersion: version.fingerprint,
    parameters: { guidanceStepId: stepId, inspectionReportId: report.id, inspectionReportFingerprint: version.fingerprint, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'inspection-report-review-review', title: `Review ${title}`, body: 'Nothing has changed yet. Confirming records that you reviewed this version of the report; a report that changes later needs a new review.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `inspection-report-review-${report.id}-1`, version: 1, title: `Mark this report as reviewed?`,
      description: 'This records that you reviewed it, with the time and the version of the report. It does not accept the findings or change anything else.',
      fields: [{ label: 'Report', value: title }, { label: 'Inspected', value: humanDate(report.inspectionDate) ?? 'Date not recorded' }, { label: 'Findings', value: `${report.totalFindings} total, ${report.openFindings} open` }, { label: 'Outcome', value: 'Reviewed' }],
      editableFields: [], confirmLabel: 'Mark as reviewed', consentText: 'I reviewed this inspection report.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function confirmInspectionReportReview(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw writeError('A contributor or owner is required to mark a report as reviewed in Ask.', 'ASK_PERMISSION_REQUIRED');
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  const reportId = typeof parameters.inspectionReportId === 'string' ? parameters.inspectionReportId : null;
  const fingerprint = typeof parameters.inspectionReportFingerprint === 'string' ? parameters.inspectionReportFingerprint : null;
  if (!stepId || !reportId || !fingerprint) throw writeError('The review selection is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  let outcome: Awaited<ReturnType<typeof reviewInspectionReportWithEffects>>;
  try {
    // The review is of the version that was shown: a report that changed since is refused (INSPECTION_REPORT_CHANGED), and the step and the report are re-read by the shared service.
    outcome = await reviewInspectionReportWithEffects(execution.propertyId, userId, reportId, { outcome: 'REVIEWED', guidanceStepId: stepId, expectedFingerprint: fingerprint });
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) throw writeError(error.message, error.code === 'INSPECTION_REPORT_CHANGED' ? 'ASK_CONTEXT_VERSION_CONFLICT' : 'ASK_CONFIRMATION_NOT_ACTIVE');
    throw error;
  }
  const note = outcome.guidanceReported ? 'This step is recorded as done' : outcome.guidanceRefusal ? (GUIDANCE_STEP_REFUSAL_TEXT[outcome.guidanceRefusal as keyof typeof GUIDANCE_STEP_REFUSAL_TEXT] ?? 'No journey step was updated')
    : 'The review is saved, but the journey step could not be updated. Open the journey to check it';
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: outcome.reused ? 'INSPECTION_REPORT_ALREADY_REVIEWED' : 'INSPECTION_REPORT_REVIEWED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `inspection-report-review-${outcome.review.id}`, title: outcome.reused ? 'Already reviewed' : 'Marked as reviewed', status: 'COMPLETED',
      description: outcome.reused ? 'This version of the report was already reviewed; nothing was added.' : 'Your review of this version of the report is recorded with the time.',
      details: [{ label: 'Outcome', value: 'Reviewed' }, { label: 'Guided journey', value: note }], actions: [],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'BOUNDARY', id: `inspection-review-refresh-failed-${outcome.review.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'This was saved. The journey view you were looking at could not refresh automatically; ask "Show my guided journeys" to see it.', suggestions: [] });
  return { result, artifactType: 'INSPECTION_REPORT_REVIEW', artifactId: outcome.review.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerCapabilityHandler('inspection-report.review', async (envelope) => inspectionReportReviewResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));
registerConfirmCapabilityHandler('inspection-report.review', confirmInspectionReportReview);
