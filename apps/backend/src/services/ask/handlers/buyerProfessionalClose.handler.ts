// Recording that the professional closing is complete (register P2 "Buyer Closing"; FRD v1.461; owner ruling D2). Reached only by the declared action on the
// closing-day readiness answer, through the BUYER_CLOSING_ITEM_COMMAND capability. The write is BuyerClosingDayService.confirmProfessionalClose, the call the
// Desktop route makes: same contributor floor, same prerequisites, same stage transition. Ask records the buyer's own report and nothing more.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { APIError } from '../../../middleware/error.middleware';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerClosingDayService } from '../../buyerClosingDay.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../../analytics';
import {
  PROFESSIONAL_CLOSE_CAPTURE_KEY, PROFESSIONAL_CLOSE_MESSAGE, parseProfessionalCloseAnswer, professionalCloseGaps, professionalCloseTimestamp,
  type ClosingDayView, type ProfessionalCloseForm,
} from '../support/buyerProfessionalCloseCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'buyer-closing-item-back', label: 'Back to closing-day readiness', interactionType: 'START_WORKFLOW' as const, message: 'Show my closing day readiness', operationId: 'BUYER_CLOSING_DAY_READINESS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-professional-close-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

/** Bound to what the prerequisites read, so a confirmation opened before any of it changed is refused as out of date. */
const versionOf = (view: ClosingDayView) => sha(`professional-close:${String(view.workspace?.updatedAt ?? 'none')}:${view.appointment?.scheduledAt ?? ''}:${view.appointment?.format ?? ''}:${view.lifecycle.stage}:${view.signedDocument ? 'signed' : 'unsigned'}`);

function formCapture(contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  return {
    requirementId: 'buyer-professional-close-inputs', captureKey: PROFESSIONAL_CLOSE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'When did your professional closing finish?',
    question: 'On what day was the professional closing completed?',
    helpText: 'Use this only after the closing is actually complete. A scheduled date, a signing appointment, a funds transfer or a clear-to-close status is not a completed closing.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'closedDate', label: 'Day it was completed', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
      { key: 'confirmationNotes', label: 'Notes (optional)', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ?? {}, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this record; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

async function loadView(userId: string, propertyId: string): Promise<ClosingDayView> {
  return await BuyerClosingDayService.get(userId, propertyId) as unknown as ClosingDayView;
}

export async function professionalCloseResult(
  userId: string, propertyId: string, launch: { sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-professional-close-permission', title: 'A contributor or owner can record this', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [back] }], suggestions: [] };
  }
  const view = await loadView(userId, propertyId);
  if (view.workspace?.professionalClosingConfirmedAt) {
    return unavailable('BUYER_PROFESSIONAL_CLOSE_ALREADY_RECORDED', 'The professional close is already recorded', 'A completed professional closing was recorded for this purchase earlier. Nothing has changed.');
  }
  const gaps = professionalCloseGaps(view);
  if (gaps.length) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'BUYER_PROFESSIONAL_CLOSE_NOT_READY',
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'buyer-professional-close-gaps', title: 'Not ready to record yet',
        description: 'The closing can be recorded once everything below is in place on your closing-day checklist. Ask cannot record these for you yet. Nothing has changed.',
        sections: [{ id: 'gaps', title: 'Still needed', count: gaps.length, items: gaps.map((gap, index) => ({ id: `gap-${index}`, title: gap, description: null, meta: [], status: null, href: null })) }], actions: [back],
      }],
      suggestions: [],
    };
  }
  const contextVersion = versionOf(view);
  const launchParameters = { professionalCloseLaunch: { sourceExecutionId: launch.sourceExecutionId } };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'BUYER_PROFESSIONAL_CLOSE_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'buyer-professional-close-input', title: 'Record that your professional closing is complete', body: 'Nothing has been saved yet. You will review what is recorded before confirming.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(contextVersion)], suggestions: [],
    };
  }
  const parsed = parseProfessionalCloseAnswer(supplied);
  if (!parsed.success) {
    return unavailable(parsed.reason === 'FUTURE' ? 'BUYER_PROFESSIONAL_CLOSE_FUTURE_DATE' : 'BUYER_PROFESSIONAL_CLOSE_INPUT_INVALID', 'Check the date',
      parsed.reason === 'FUTURE' ? 'A completed closing cannot be dated in the future. Nothing has changed.' : 'Choose the day the closing was completed. Nothing has changed.');
  }
  const form = parsed.data;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const day = humanDate(new Date(`${form.closedDate}T12:00:00.000Z`)) ?? form.closedDate;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_PROFESSIONAL_CLOSE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { professionalClose: form, professionalCloseContextVersion: contextVersion, ...launchParameters, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'buyer-professional-close-review', title: 'Record that the closing is complete?', body: 'Nothing is saved until you confirm.', tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `buyer-professional-close-${sha(`${propertyId}:${form.closedDate}`).slice(0, 12)}-1`, version: 1, title: 'Record that your professional closing is complete?',
      description: 'This records your report that the professional closing is complete and moves this purchase to ownership. Ask has not verified it, has not read your signed documents and does not decide whether you should close. Nobody is contacted.',
      fields: [{ label: 'Closing completed', value: day }, ...(form.confirmationNotes ? [{ label: 'Notes', value: form.confirmationNotes }] : [])],
      editableFields: [], confirmLabel: 'Record the close',
      consentText: 'I confirm that my professional closing process is complete.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(contextVersion, form as unknown as Record<string, unknown>)], suggestions: [],
  };
}

export async function confirmProfessionalCloseCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  if (ctx.access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner can record this.');
  const parsed = parseProfessionalCloseAnswer(parameters.professionalClose);
  if (!parsed.success) throw stale('The completion date to record is invalid.');
  const form: ProfessionalCloseForm = parsed.data;
  const view = await loadView(userId, propertyId);
  if (parameters.professionalCloseContextVersion !== versionOf(view)) throw stale('This purchase changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  if (view.workspace?.professionalClosingConfirmedAt) throw stale('The professional close is already recorded.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const closedAt = professionalCloseTimestamp(form.closedDate);
  try {
    await BuyerClosingDayService.confirmProfessionalClose(userId, propertyId, { professionalClosingComplete: true, closedAt, confirmationNotes: form.confirmationNotes ?? null });
  } catch (error) {
    if (error instanceof APIError) throw stale(error.message);
    throw error;
  }
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.HOME_BUYER, featureKey: AnalyticsFeature.HOME_BUYER_TASK,
    metadataJson: { actionType: 'buyer_professional_close_confirmed', closedAt, surface: 'ask' },
  });
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'BUYER_PROFESSIONAL_CLOSE_COMPLETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `buyer-professional-close-${propertyId}`, title: 'Professional close recorded', status: 'COMPLETED',
      description: 'You reported that your professional closing is complete, and this purchase moves to ownership. Ask did not verify the closing or interpret any document, and nobody was contacted.',
      details: [{ label: 'Closing completed', value: humanDate(new Date(`${form.closedDate}T12:00:00.000Z`)) ?? form.closedDate }],
      actions: [back],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-professional-close-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'BUYER_CLOSING_DAY_WORKSPACE', artifactId: propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
export { PROFESSIONAL_CLOSE_MESSAGE };
