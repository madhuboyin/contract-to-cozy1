// Start a Negotiation Shield review inside Ask (ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md, slice 2a; owner decisions D1-D5, D8 revised).
//
// Reached by the declared "Start a review" action on the case list, by a scenario choice row, or by a typed "start a negotiation review". It asks
// which of four scenarios, shows that scenario's form (the fields the page's own forms build), shows a review card, and writes only after the
// homeowner confirms, through the same NegotiationShieldService.createCase the page calls: the case and its first input in ONE transaction.
//
// Idempotency (D8 revised): the create carries `ask:<execution id>:negotiation-shield-start`, persisted on the case under a (property, key) unique
// index, so a replayed confirmation, a lease-reclaimed worker or a double click returns the original case. A second, separate execution is a
// deliberate second review and creates another.
//
// Deliberately NOT here: the analysis (2b), editing (2c), documents (D7), buyer inspection (2d), a Quote Comparison link (D5), and raw pasted text (D4).
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { NEGOTIATION_SHIELD_ANALYZE_ACTION_ID, NEGOTIATION_SHIELD_ANALYZE_MESSAGE } from '../support/negotiationShieldAnalyze';
import { assertProjectComplianceApplicable } from '../../projectCompliance/context';
import {
  inferNegotiationStartScenario, isNegotiationShieldStartRequest, isNegotiationStartScenario, NEGOTIATION_SHIELD_CASE_ENTITY_TYPE,
  NEGOTIATION_SHIELD_SCENARIO_ACTION_ID, NEGOTIATION_SHIELD_SCENARIO_ENTITY, NEGOTIATION_SHIELD_START_CAPTURE_KEY, NEGOTIATION_SHIELD_START_MESSAGE,
  NEGOTIATION_START_SCENARIOS, NEGOTIATION_START_SCENARIO_SPECS, parseNegotiationStartAnswer,
  type NegotiationFieldSpec, type NegotiationStartInput, type NegotiationStartScenario,
} from '../support/negotiationShieldStart';
import { collectionDescriptor } from '../support/collectionDescriptor';

const CONFIRMATION_MINUTES = 30;
const REVIEW_MESSAGE = 'Review this negotiation case.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export const negotiationShieldStartContextVersion = (propertyId: string, scenario: NegotiationStartScenario) => sha(`negotiation-shield-start:${propertyId}:${scenario}`);
/** The key the create is bound to: the confirming Ask execution, so any retry of that same confirmation returns the original case. */
export const negotiationShieldStartIdempotencyKey = (executionId: string) => `ask:${executionId}:negotiation-shield-start`;

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-start-permission', title: 'A contributor or owner can start a review', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_NEGOTIATION_SHIELD_START_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-start-not-routable', title: 'Use Start a review', body: 'A review is started from Start a review on your negotiation reviews, or by asking to start a negotiation review. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
  suggestions: [],
});

// ── Scenario choice ───────────────────────────────────────────────────────────────────────────────────────────

function scenarioChoice(): AskOperationResult {
  const items = NEGOTIATION_START_SCENARIOS.map((scenario) => ({
    id: scenario, title: NEGOTIATION_START_SCENARIO_SPECS[scenario].label, description: NEGOTIATION_START_SCENARIO_SPECS[scenario].summary,
    meta: [], status: null, href: null, entityType: NEGOTIATION_SHIELD_SCENARIO_ENTITY,
    actions: [{ id: NEGOTIATION_SHIELD_SCENARIO_ACTION_ID, label: 'Start', message: NEGOTIATION_SHIELD_START_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASE_START' as const, interactionType: 'CONVERSATION_CONTINUE' as const, style: 'PRIMARY' as const }],
  }));
  return {
    status: 'NEEDS_CONTEXT', reasonCode: 'NEGOTIATION_SHIELD_SCENARIO_REQUIRED',
    blocks: [{
      type: 'GROUPED_LIST', filters: [], id: 'negotiation-shield-scenarios', title: 'What would you like to review?',
      description: 'Choose one. You will enter what you know and review it before anything is saved.',
      presentation: { pattern: 'CHOICE_GRID' },
      sections: [{
        id: 'negotiation-shield-scenarios-all', title: 'Reviews you can start', count: NEGOTIATION_START_SCENARIOS.length,
        items,
      }],
      collection: collectionDescriptor({ sourceTotal: items.length, fetchedCount: items.length, sections: [{ items }], nextPageAvailable: false }),
      actions: [],
    }],
    suggestions: [],
  };
}

// ── The form ──────────────────────────────────────────────────────────────────────────────────────────────────

const YES_NO_OPTIONS = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Not sure', value: 'unknown' }];

function fieldInput(field: NegotiationFieldSpec): Record<string, unknown> {
  switch (field.kind) {
    case 'MONEY': return { type: 'NUMBER', min: 0.01, max: 100_000_000 };
    case 'DATE': return { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: field.allowFuture === true };
    case 'YES_NO': return { type: 'SINGLE_SELECT', options: YES_NO_OPTIONS };
    case 'NOTES': return { type: 'LONG_TEXT', maxLength: field.max ?? 1000 };
    default: return { type: 'SHORT_TEXT', maxLength: field.max ?? 200 };
  }
}

/** The form's current answer for a stored input, so a form reopened from the review card keeps what was entered. */
function currentAnswerFor(scenario: NegotiationStartScenario, entered?: Pick<NegotiationStartInput, 'title' | 'structuredData'>): Record<string, unknown> {
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];
  const answer: Record<string, unknown> = { title: entered?.title ?? spec.label };
  for (const field of spec.fields) {
    const value = entered?.structuredData[field.key];
    if (value === undefined || value === null) continue;
    answer[field.key] = field.kind === 'YES_NO' ? (value === true ? 'yes' : value === false ? 'no' : 'unknown') : value;
  }
  return answer;
}

function captureRequest(scenario: NegotiationStartScenario, contextVersion: string, entered?: Pick<NegotiationStartInput, 'title' | 'structuredData'>): AskCaptureRequest {
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];
  return {
    requirementId: 'negotiation-shield-start-inputs', captureKey: NEGOTIATION_SHIELD_START_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Start a review: ${spec.label.toLowerCase()}`, question: spec.question,
    helpText: 'Enter what you know; every detail is optional but at least one is needed. This saves a draft review for you to look at later. Nothing is analyzed or sent.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'title', label: 'Name for this review', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
      ...spec.fields.map((field) => ({ key: field.key, label: field.label, ...(field.help ? { helpText: field.help } : {}), required: false, inputSchema: fieldInput(field) })),
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: currentAnswerFor(scenario, entered),
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this review; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export const negotiationDetailLabel = (field: NegotiationFieldSpec, value: unknown): string => {
  if (field.kind === 'MONEY' && typeof value === 'number') return money(value);
  if (field.kind === 'DATE' && typeof value === 'string') return humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value;
  if (field.kind === 'YES_NO') return value === true ? 'Yes' : 'No';
  return String(value);
};

// ── The command ───────────────────────────────────────────────────────────────────────────────────────────────

export async function negotiationShieldStartResult(
  userId: string,
  propertyId: string,
  launch: { scenarioType: NegotiationStartScenario | null; sourceExecutionId: string | null },
  supplied?: NegotiationStartInput,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const scenario = launch.scenarioType;
  if (!scenario) return scenarioChoice();
  const contextVersion = negotiationShieldStartContextVersion(propertyId, scenario);
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];

  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'NEGOTIATION_SHIELD_START_INPUT_REQUIRED', contextVersion,
      parameters: { negotiationStartLaunch: { scenarioType: scenario, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-start-input', title: `Start a review: ${spec.label.toLowerCase()}`, body: 'Nothing has been saved yet. Enter what you know, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [captureRequest(scenario, contextVersion)], suggestions: [],
    };
  }

  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const details = spec.fields.flatMap((field) => {
    const value = supplied.structuredData[field.key];
    return value === undefined ? [] : [{ label: field.label, value: negotiationDetailLabel(field, value) }];
  });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'NEGOTIATION_SHIELD_START_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      negotiationShieldStart: { scenarioType: scenario, title: supplied.title, structuredData: supplied.structuredData },
      negotiationStartContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-start-review', title: 'Review this negotiation review', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `negotiation-shield-start-${sha(`${propertyId}:${scenario}:${supplied.title}`).slice(0, 12)}-1`, version: 1,
      title: `Start "${supplied.title}"?`,
      description: 'This saves a draft review with these details, the same record the Negotiation Shield page creates. It is not analyzed and nothing is sent to anyone.',
      fields: [{ label: 'Type', value: spec.label }, { label: 'Name', value: supplied.title }, ...details],
      editableFields: [], confirmLabel: 'Start review', consentText: 'I authorize saving this review to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be changed and resubmitted before confirming.
    captureRequests: [captureRequest(scenario, contextVersion, supplied)],
    suggestions: [],
  };
}

registerCapabilityHandler('negotiation-shield.start', async (envelope) => {
  const launch = envelope.launchContext;
  if (launch?.surface === 'ASK_REFRESH') return notRoutable();
  const declared = launch?.operationId === 'NEGOTIATION_SHIELD_CASE_START' && envelope.message === NEGOTIATION_SHIELD_START_MESSAGE;
  if (declared) {
    const chosen = launch?.entityType === NEGOTIATION_SHIELD_SCENARIO_ENTITY && isNegotiationStartScenario(launch.entityId) ? launch.entityId : null;
    return negotiationShieldStartResult(envelope.userId, envelope.propertyId!, { scenarioType: chosen, sourceExecutionId: launch?.sourceExecutionId ?? null });
  }
  if (isNegotiationShieldStartRequest(envelope.message)) {
    return negotiationShieldStartResult(envelope.userId, envelope.propertyId!, { scenarioType: inferNegotiationStartScenario(envelope.message), sourceExecutionId: null });
  }
  return notRoutable();
});

async function confirmNegotiationShieldStart(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const stored = parameters.negotiationShieldStart as { scenarioType?: unknown; title?: unknown; structuredData?: unknown } | undefined;
  if (!stored || !isNegotiationStartScenario(stored.scenarioType)) {
    throw Object.assign(new Error('The review to start is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const scenario = stored.scenarioType;
  // Re-validate what was stored: the confirmation is the only thing standing between these parameters and the canonical write.
  const structured = (stored.structuredData && typeof stored.structuredData === 'object' ? stored.structuredData : {}) as Record<string, unknown>;
  const candidate = parseNegotiationStartAnswer(scenario, {
    title: stored.title,
    ...Object.fromEntries(NEGOTIATION_START_SCENARIO_SPECS[scenario].fields.flatMap((field) => {
      const value = structured[field.key];
      if (value === undefined) return [];
      return [[field.key, field.kind === 'YES_NO' ? (value === true ? 'yes' : value === false ? 'no' : 'unknown') : value]];
    })),
  });
  if (!candidate.success) throw Object.assign(new Error('The review to start is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId;

  // The same applicability gate the page's create runs before the service call.
  await assertProjectComplianceApplicable(propertyId, userId, 'NEGOTIATION_SHIELD', {}, 'negotiationShield');
  // Loaded here, not at boot: the service pulls in document parsing and OCR, which Ask's reads deliberately avoid.
  const { NegotiationShieldService } = await import('../../negotiationShield.service');
  const detail = await new NegotiationShieldService().createCase(propertyId, userId, {
    scenarioType: input.scenarioType,
    title: input.title,
    description: null,
    sourceType: 'MANUAL',
    idempotencyKey: negotiationShieldStartIdempotencyKey(execution.id),
    initialInput: { inputType: input.inputType, rawText: null, structuredData: input.structuredData },
  });
  const caseId = detail.case.id;
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'NEGOTIATION_SHIELD_REVIEW_STARTED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `negotiation-shield-started-${caseId}`, title: 'Review started', status: 'COMPLETED',
      description: 'Saved as a draft review. It has not been analyzed yet and nothing has been sent.',
      details: [{ label: 'Review', value: input.title }, { label: 'Type', value: spec.label }],
      actions: [{
        id: 'negotiation-shield-review', label: 'Review', interactionType: 'START_WORKFLOW' as const, message: REVIEW_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASES',
        entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: caseId, style: 'SECONDARY' as const,
      }, {
        id: NEGOTIATION_SHIELD_ANALYZE_ACTION_ID, label: 'Run the analysis', interactionType: 'START_WORKFLOW' as const, message: NEGOTIATION_SHIELD_ANALYZE_MESSAGE,
        operationId: 'NEGOTIATION_SHIELD_CASE_ANALYZE', entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: caseId, style: 'PRIMARY' as const,
      }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `negotiation-shield-refresh-failed-${caseId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The review was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'NEGOTIATION_SHIELD_CASE', artifactId: caseId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('negotiation-shield.start', confirmNegotiationShieldStart);
