// Edit a Negotiation Shield review's saved details inside Ask (ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md, slice 2c; owner decisions D1, D3, D4).
//
// Reached only by the declared "Edit details" / "Add details" action on a review (launchContext.entityType NEGOTIATION_SHIELD_CASE). It shows the same
// scenario form as starting a review, pre-filled with what is saved (only the form's own fields; raw text is never loaded), then a review card that lists
// exactly what would change, and writes only after the homeowner confirms: NegotiationShieldService.updateManualInputFields, which merges into the saved
// input (so a field only the page saved is kept) and saves through the canonical saveManualInput.
//
// Not editable here: the title (the page cannot change it either), a buyer inspection review (buyer mode), parsed-document inputs (immutable by rule),
// and raw text. The saved analysis is NOT re-run: the review then says its details changed and offers Run it again (slice 2b).
//
// Freshness: the form is bound to the input's last-saved time, so a form opened before the page changed the details is refused. Idempotency: a retry of
// this confirmation finds the details already as intended and reports them, instead of failing on the freshness check its own write just tripped.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { getNegotiationShieldCaseReviewForProperty, getNegotiationShieldEditableInputForProperty } from '../../negotiationShieldCaseList';
import {
  diffNegotiationEdit, NEGOTIATION_SHIELD_EDIT_CAPTURE_KEY, NEGOTIATION_SHIELD_EDIT_MESSAGE, parseNegotiationEditAnswer, type NegotiationEditValues,
} from '../support/negotiationShieldEdit';
import { NEGOTIATION_SHIELD_ANALYZE_ACTION_ID, NEGOTIATION_SHIELD_ANALYZE_MESSAGE } from '../support/negotiationShieldAnalyze';
import {
  isNegotiationStartScenario, NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, NEGOTIATION_START_SCENARIO_SPECS, type NegotiationFieldSpec, type NegotiationStartScenario,
} from '../support/negotiationShieldStart';
import { negotiationDetailLabel } from './negotiationShieldStart.handler';

const CONFIRMATION_MINUTES = 30;
const REVIEW_MESSAGE = 'Review this negotiation case.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToReviews = { id: 'negotiation-shield-back', label: 'Back to my reviews', interactionType: 'START_WORKFLOW' as const, message: 'Show my negotiation shield cases', operationId: 'NEGOTIATION_SHIELD_CASES' as const, style: 'SECONDARY' as const };

export const negotiationShieldEditContextVersion = (caseId: string, inputId: string | null, inputUpdatedAt: string | null) =>
  sha(`negotiation-shield-edit:${caseId}:${inputId ?? 'none'}:${inputUpdatedAt ?? 'none'}`);

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-edit-permission', title: 'A contributor or owner can edit a review', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_NEGOTIATION_SHIELD_EDIT_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-edit-not-routable', title: 'Open a review first', body: 'Details are edited from Edit details on one of your reviews. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode,
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-edit-unavailable', title, body, tone: 'DEFAULT', actions: [backToReviews] }],
  suggestions: [],
});

const currentAnswerFor = (scenario: NegotiationStartScenario, values: Record<string, unknown>): Record<string, unknown> => {
  const answer: Record<string, unknown> = {};
  for (const field of NEGOTIATION_START_SCENARIO_SPECS[scenario].fields) {
    const value = values[field.key];
    if (value === undefined || value === null) continue;
    answer[field.key] = field.kind === 'YES_NO' ? (value === true ? 'yes' : value === false ? 'no' : 'unknown') : value;
  }
  return answer;
};

function fieldInput(field: NegotiationFieldSpec): Record<string, unknown> {
  switch (field.kind) {
    case 'MONEY': return { type: 'NUMBER', min: 0.01, max: 100_000_000 };
    case 'DATE': return { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: field.allowFuture === true };
    case 'YES_NO': return { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Not sure', value: 'unknown' }] };
    case 'NOTES': return { type: 'LONG_TEXT', maxLength: field.max ?? 1000 };
    default: return { type: 'SHORT_TEXT', maxLength: field.max ?? 200 };
  }
}

function captureRequest(scenario: NegotiationStartScenario, title: string, contextVersion: string, values: Record<string, unknown>, hasSaved: boolean): AskCaptureRequest {
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];
  return {
    requirementId: 'negotiation-shield-edit-inputs', captureKey: NEGOTIATION_SHIELD_EDIT_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `${hasSaved ? 'Edit' : 'Add'} details: ${title}`, question: hasSaved ? 'What should the saved details say?' : spec.question,
    helpText: 'Clear a field to remove it. Anything saved elsewhere on this review that is not shown here is kept. Nothing is saved until you confirm, and the analysis is not re-run.',
    inputSchema: { type: 'GROUP', fields: spec.fields.map((field) => ({
      key: field.key, label: field.label, ...(field.help ? { helpText: field.help } : {}), required: false, inputSchema: fieldInput(field),
    })) } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: currentAnswerFor(scenario, values),
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export interface NegotiationEditLaunch { caseId: string | null; sourceExecutionId: string | null }

export async function negotiationShieldEditResult(
  userId: string, propertyId: string, launch: NegotiationEditLaunch, submitted?: NegotiationEditValues,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  if (!launch.caseId) return notRoutable();
  const review = await getNegotiationShieldCaseReviewForProperty(propertyId, launch.caseId);
  if (!review) return unavailable('NEGOTIATION_SHIELD_CASE_NOT_FOUND', 'That review is no longer available', 'Ask could not find that negotiation review for this home. It may have been removed. Nothing has changed.');
  const scenario = review.case.scenarioType;
  if (!isNegotiationStartScenario(scenario)) {
    return unavailable('NEGOTIATION_SHIELD_EDIT_UNSUPPORTED', 'Editing this kind of review is not currently available in Ask',
      'A buyer inspection negotiation is started from selected findings and is not edited here. Nothing has changed.');
  }
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];
  const editable = await getNegotiationShieldEditableInputForProperty(propertyId, launch.caseId, spec.inputType, spec.fields.map((field) => field.key));
  if (!editable) return unavailable('NEGOTIATION_SHIELD_CASE_NOT_FOUND', 'That review is no longer available', 'Ask could not find that negotiation review for this home. It may have been removed. Nothing has changed.');
  const contextVersion = negotiationShieldEditContextVersion(editable.case.id, editable.inputId, editable.inputUpdatedAt);
  const hasSaved = editable.inputId !== null && Object.keys(editable.values).length > 0;

  if (!submitted) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'NEGOTIATION_SHIELD_EDIT_INPUT_REQUIRED', contextVersion,
      parameters: { negotiationEditLaunch: { caseId: editable.case.id, scenarioType: scenario, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-edit-input', title: `${hasSaved ? 'Edit' : 'Add'} details: ${editable.case.title}`, body: 'Nothing has been saved yet. Change what you need, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [captureRequest(scenario, editable.case.title, contextVersion, editable.values, hasSaved)], suggestions: [],
    };
  }

  const diff = diffNegotiationEdit(scenario, editable.values, submitted);
  if (diff.changes.length === 0) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'NEGOTIATION_SHIELD_EDIT_NO_CHANGE', contextVersion,
      parameters: { negotiationEditLaunch: { caseId: editable.case.id, scenarioType: scenario, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-edit-no-change', title: 'Nothing is different from what is saved', body: 'Change at least one detail, or go back. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [captureRequest(scenario, editable.case.title, contextVersion, editable.values, hasSaved)], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'NEGOTIATION_SHIELD_EDIT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      negotiationShieldEdit: { caseId: editable.case.id, scenarioType: scenario, inputId: editable.inputId, set: diff.set, remove: diff.remove },
      negotiationEditContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-edit-review', title: 'Review these changes', body: 'These are the only details that change. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `negotiation-shield-edit-${sha(`${propertyId}:${editable.case.id}:${contextVersion}:${JSON.stringify(diff.set)}:${diff.remove.join(',')}`).slice(0, 12)}-1`, version: 1,
      title: `Save these changes to "${editable.case.title}"?`,
      description: 'This updates the details saved on this review. The analysis is not re-run and nothing is sent.',
      fields: diff.changes.map((change) => ({
        label: change.field.label,
        value: `${change.before === null ? 'Not set' : negotiationDetailLabel(change.field, change.before)} → ${change.after === null ? 'Removed' : negotiationDetailLabel(change.field, change.after)}`,
      })),
      editableFields: [], confirmLabel: 'Save changes', consentText: 'I authorize changing the details saved on this review in the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be changed and resubmitted before confirming.
    captureRequests: [captureRequest(scenario, editable.case.title, contextVersion, { ...editable.values, ...submittedForForm(submitted) }, hasSaved)],
    suggestions: [],
  };
}

/** The submitted values as the form shows them again (nulls dropped; the form treats an absent field as blank). */
function submittedForForm(submitted: NegotiationEditValues): Record<string, unknown> {
  return Object.fromEntries(Object.entries(submitted).filter(([, value]) => value !== null));
}

registerCapabilityHandler('negotiation-shield.update', async (envelope) => {
  const launch = envelope.launchContext;
  const declared = launch?.operationId === 'NEGOTIATION_SHIELD_CASE_UPDATE' && launch.surface !== 'ASK_REFRESH'
    && envelope.message === NEGOTIATION_SHIELD_EDIT_MESSAGE && launch.entityType === NEGOTIATION_SHIELD_CASE_ENTITY_TYPE && Boolean(launch.entityId);
  if (!declared) return notRoutable();
  return negotiationShieldEditResult(envelope.userId, envelope.propertyId!, { caseId: launch!.entityId ?? null, sourceExecutionId: launch!.sourceExecutionId ?? null });
});

async function confirmNegotiationShieldEdit(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const stored = parameters.negotiationShieldEdit as { caseId?: unknown; scenarioType?: unknown; inputId?: unknown; set?: unknown; remove?: unknown } | undefined;
  const invalid = () => Object.assign(new Error('The change to save is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  if (!stored || typeof stored.caseId !== 'string' || !stored.caseId || !isNegotiationStartScenario(stored.scenarioType)) throw invalid();
  const scenario = stored.scenarioType;
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];
  const keys = new Set(spec.fields.map((field) => field.key));
  const set = stored.set && typeof stored.set === 'object' && !Array.isArray(stored.set) ? stored.set as Record<string, unknown> : null;
  const remove = Array.isArray(stored.remove) ? stored.remove : null;
  if (!set || !remove || remove.some((key) => typeof key !== 'string' || !keys.has(key)) || Object.keys(set).some((key) => !keys.has(key))) throw invalid();
  if (Object.keys(set).length + remove.length === 0) throw invalid();
  // Re-validate the stored values through the same schema the form uses (booleans become the form's yes/no first).
  const asAnswer: Record<string, unknown> = {};
  for (const field of spec.fields) {
    if (!(field.key in set)) continue;
    const value = set[field.key];
    asAnswer[field.key] = field.kind === 'YES_NO' ? (value === true ? 'yes' : value === false ? 'no' : 'unknown') : value;
  }
  const checked = parseNegotiationEditAnswer(scenario, asAnswer);
  if (!checked.success) throw invalid();
  const verifiedSet: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(set)) {
    const value = checked.values[key];
    if (value === null || value === undefined) throw invalid();
    verifiedSet[key] = value;
  }

  const propertyId = execution.propertyId;
  const editable = await getNegotiationShieldEditableInputForProperty(propertyId, stored.caseId, spec.inputType, [...keys]);
  if (!editable) throw Object.assign(new Error('That review is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });

  // A retry of this confirmation finds the details already as intended: report them rather than failing the freshness check its own write tripped.
  const already = (remove as string[]).every((key) => editable.values[key] === undefined) && Object.entries(verifiedSet).every(([key, value]) => editable.values[key] === value);
  const reviewedVersion = typeof parameters.negotiationEditContextVersion === 'string' ? parameters.negotiationEditContextVersion : null;
  const currentVersion = negotiationShieldEditContextVersion(editable.case.id, editable.inputId, editable.inputUpdatedAt);
  if (!already && reviewedVersion !== currentVersion) {
    throw Object.assign(new Error('The details of this review changed while you were reviewing. Open Edit details again to see the latest.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }

  let inputId = editable.inputId;
  if (!already) {
    // Loaded here, not at boot: the service pulls in document parsing and OCR, which Ask's reads deliberately avoid.
    const { NegotiationShieldService } = await import('../../negotiationShield.service');
    const detail = await new NegotiationShieldService().updateManualInputFields(propertyId, stored.caseId, {
      inputType: spec.inputType, inputId: editable.inputId, set: verifiedSet, remove: remove as string[],
    });
    inputId = detail.inputs.find((input) => input.inputType === spec.inputType)?.id ?? inputId;
  }

  const review = await getNegotiationShieldCaseReviewForProperty(propertyId, stored.caseId);
  const changes = [
    ...Object.entries(verifiedSet).map(([key, value]) => {
      const field = spec.fields.find((candidate) => candidate.key === key)!;
      return { label: field.label, value: negotiationDetailLabel(field, value) };
    }),
    ...(remove as string[]).map((key) => ({ label: spec.fields.find((candidate) => candidate.key === key)!.label, value: 'Removed' })),
  ];
  const hasAnalysis = Boolean(review?.latestAnalysis);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'NEGOTIATION_SHIELD_DETAILS_SAVED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `negotiation-shield-edited-${stored.caseId}`, title: already ? 'Details already saved' : 'Details saved', status: 'COMPLETED',
      description: hasAnalysis
        ? 'The saved details changed. The analysis was not re-run, so it still describes the earlier details until you run it again.'
        : 'The saved details changed. The review has not been analyzed yet.',
      details: changes.slice(0, 6),
      actions: [
        { id: 'negotiation-shield-review', label: 'Review', interactionType: 'START_WORKFLOW' as const, message: REVIEW_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASES', entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: stored.caseId, style: 'SECONDARY' as const },
        { id: NEGOTIATION_SHIELD_ANALYZE_ACTION_ID, label: hasAnalysis ? 'Run it again' : 'Run the analysis', interactionType: 'START_WORKFLOW' as const, message: NEGOTIATION_SHIELD_ANALYZE_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASE_ANALYZE', entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: stored.caseId, style: 'PRIMARY' as const },
      ],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `negotiation-shield-edit-refresh-failed-${stored.caseId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The details were saved. The answer you were viewing could not refresh automatically, so ask for it again to see them.',
    });
  }
  return { result, artifactType: 'NEGOTIATION_SHIELD_INPUT', artifactId: inputId ?? stored.caseId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('negotiation-shield.update', confirmNegotiationShieldEdit);
