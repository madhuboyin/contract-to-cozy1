// Recording what the household saw after a hazard event (register P1 "Home Risk Replay"; FRD v1.325). Reached only by the declared "Record what I
// observed" row action on the past-hazard answer. The write goes through recordPropertyHazardOutcome, the same function the route calls, behind a review
// card and a confirmation, and behind the route's own reviewed-source-coverage gate. A confirmed effect also writes an entry to the home's timeline, which
// the review says. Not here: linking evidence (a claim, an inspection or repair record, a document) to an outcome, which needs a record picker.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { isReviewedIntelligenceCoverageAvailable } from '../../../middleware/intelligenceCoverage.middleware';
import { getPastHazardExposure, recordPropertyHazardOutcome } from '../../../propertyIntelligence/pastHazardExposure.service';
import {
  PAST_HAZARD_CAPTURE_KEY, PAST_HAZARD_COMMAND_MESSAGE, PAST_HAZARD_INVALID_MESSAGES, PAST_HAZARD_RECORD_ENTITY_TYPE, PAST_HAZARD_STATUSES, PAST_HAZARD_STATUS_LABELS,
  parsePastHazardOutcomeAnswer, type PastHazardOutcomeForm,
} from '../support/pastHazardOutcomeCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export interface PastHazardCommandLaunch { entityId: string; sourceExecutionId: string | null }

const backToHazards = { id: 'past-hazard-back', label: 'Back to hazard records', interactionType: 'START_WORKFLOW' as const, message: 'Show my past hazard exposure', operationId: 'PAST_HAZARD_EXPOSURE' as const, style: 'SECONDARY' as const };

const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'past-hazard-command-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'past-hazard-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToHazards] }], suggestions: [],
});
const notRoutable = (): AskOperationResult => unavailable('ASK_PAST_HAZARD_COMMAND_NOT_DIRECTLY_ROUTABLE', 'Open your hazard records first', 'What you observed is recorded from a hazard record. Nothing has changed.');

type HazardItem = Awaited<ReturnType<typeof getPastHazardExposure>>['pastEvents'][number];
async function findRecord(propertyId: string, propertyMatchId: string): Promise<HazardItem | null> {
  const view = await getPastHazardExposure(propertyId);
  return [...view.pastEvents, ...view.longTermContext].find((item) => item.propertyMatchId === propertyMatchId) ?? null;
}
const recordVersion = (item: HazardItem) =>
  sha(`past-hazard:${item.propertyMatchId}:${item.propertyEffect.status}:${item.propertyEffect.outcomeId ?? ''}:${item.propertyEffect.note ?? ''}`);

function formCapture(contextVersion: string, title: string, entered: Record<string, unknown> = {}): AskCaptureRequest {
  const clean = Object.fromEntries(Object.entries(entered).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return {
    requirementId: 'past-hazard-outcome-inputs', captureKey: PAST_HAZARD_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `What did you observe after: ${title}`, question: 'Did this event have any effect on the home?',
    helpText: 'A matched hazard record is not proof of damage. Describe only what you saw, without guessing at a cause. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'status', label: 'What you saw', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: PAST_HAZARD_STATUSES.map((value) => ({ label: PAST_HAZARD_STATUS_LABELS[value], value })) } },
      { key: 'observedOn', label: 'When you noticed it', required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
      { key: 'note', label: 'What you saw', helpText: 'At least 10 characters if you saw an effect.', required: true, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 1200 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this record; nothing is saved until you confirm',
    confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function pastHazardCommandResult(userId: string, propertyId: string, launch: PastHazardCommandLaunch, supplied?: PastHazardOutcomeForm): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can record what was observed', 'Your role can view this home but not change it. Nothing has changed.');
  if (!isReviewedIntelligenceCoverageAvailable('HOME_RISK_REPLAY')) {
    return blocked('REVIEWED_SOURCE_COVERAGE_REQUIRED', 'Home Risk Replay is not available yet', 'Recording an observation is unavailable until reviewed hazard source coverage is configured. Nothing has changed.');
  }
  const item = await findRecord(propertyId, launch.entityId);
  if (!item) return unavailable('PAST_HAZARD_RECORD_NOT_FOUND', 'That hazard record is no longer available', 'Ask could not find that record. Nothing has changed.');
  const contextVersion = recordVersion(item);
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'PAST_HAZARD_OUTCOME_INPUT_REQUIRED', contextVersion,
      parameters: { pastHazardLaunch: { entityId: item.propertyMatchId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{
        type: 'SUMMARY', id: 'past-hazard-outcome-input', title: item.title,
        body: `${item.propertyEffect.status === 'UNKNOWN' ? 'No effect on the home has been recorded.' : 'You recorded an effect earlier; saving again replaces it and keeps the earlier statement in the history.'} Nothing has been saved yet.`,
        tone: 'DEFAULT', actions: [],
      }],
      captureRequests: [formCapture(contextVersion, item.title)], suggestions: [],
    };
  }
  const confirmedEffect = supplied.status === 'OBSERVED_EFFECT_CONFIRMED';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'PAST_HAZARD_OUTCOME_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      pastHazardForm: supplied, pastHazardCommand: { entityId: item.propertyMatchId }, pastHazardContextVersion: contextVersion,
      sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'past-hazard-outcome-review', title: `Review: ${item.title}`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `past-hazard-${sha(`${propertyId}:${item.propertyMatchId}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1,
      title: 'Record what you observed?',
      description: confirmedEffect
        ? 'This records the effect you described and adds an entry to the home’s timeline. It is your observation, not a finding of damage or a cause.'
        : 'This records your statement. It is your observation, not a finding that the event had no effect.',
      fields: [
        { label: 'Hazard record', value: item.title }, { label: 'What you saw', value: PAST_HAZARD_STATUS_LABELS[supplied.status] ?? supplied.status },
        ...(supplied.observedOn ? [{ label: 'When', value: humanDate(new Date(`${supplied.observedOn}T12:00:00.000Z`)) ?? supplied.observedOn }] : []),
        { label: 'Note', value: supplied.note },
      ],
      editableFields: [], confirmLabel: 'Record it', consentText: 'I authorize this record in the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(contextVersion, item.title, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('past-hazard.command', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message !== PAST_HAZARD_COMMAND_MESSAGE || launch?.operationId !== 'PAST_HAZARD_OUTCOME_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId
    || launch.entityType !== PAST_HAZARD_RECORD_ENTITY_TYPE) return notRoutable();
  return pastHazardCommandResult(envelope.userId, envelope.propertyId!, { entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmPastHazardCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.pastHazardCommand as { entityId?: unknown } | undefined;
  if (typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  if (!isReviewedIntelligenceCoverageAvailable('HOME_RISK_REPLAY')) throw stale('Home Risk Replay is not available yet.');
  const propertyId = execution.propertyId;
  const item = await findRecord(propertyId, command.entityId);
  if (!item) throw stale('That hazard record is no longer available.');
  if (parameters.pastHazardContextVersion !== recordVersion(item)) throw stale('This record changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const checked = parsePastHazardOutcomeAnswer(parameters.pastHazardForm);
  if (!checked.success) throw stale(PAST_HAZARD_INVALID_MESSAGES[checked.reason]);
  const v = checked.data;
  try {
    await recordPropertyHazardOutcome({
      propertyId, propertyMatchId: item.propertyMatchId, userId, status: v.status,
      effectObservedAt: v.observedOn ? new Date(`${v.observedOn}T12:00:00.000Z`) : null, note: v.note,
    });
  } catch (error) {
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    if (error instanceof Error && (error as { statusCode?: unknown }).statusCode) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'PAST_HAZARD_OUTCOME_RECORDED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `past-hazard-outcome-${item.propertyMatchId}`, title: 'Observation recorded', status: 'COMPLETED',
      description: v.status === 'OBSERVED_EFFECT_CONFIRMED' ? 'It is on this hazard record and on the home’s timeline.' : 'It is on this hazard record.',
      details: [], actions: [{ ...backToHazards, label: 'See hazard records', style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `past-hazard-refresh-failed-${item.propertyMatchId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'PROPERTY_HAZARD_OUTCOME', artifactId: item.propertyMatchId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('past-hazard.command', confirmPastHazardCommand);
