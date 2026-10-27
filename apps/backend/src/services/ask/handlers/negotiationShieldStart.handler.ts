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
import { SERVICE_PRICE_CHECK_ENTITY_TYPE, SERVICE_PRICE_NEGOTIATE_MESSAGE } from '../support/homeToolRunConstants';
import { servicePriceCategoryLabel } from './servicePriceRadar.handler';
import { prisma } from '../../../lib/prisma';
import { GUIDANCE_STEP_REFUSAL_TEXT, launchedGuidanceStepId, resolveGuidanceStepBinding } from '../support/guidanceStepBinding';

export const NEGOTIATION_SHIELD_START_NEW_ACTION_ID = 'negotiation-shield-start-new';
export const NEGOTIATION_SHIELD_USE_EXISTING_ACTION_ID = 'negotiation-shield-journey-use-existing';
const JOURNEY_STEP_KEYS = ['prepare_negotiation'] as const;
/** The review a journey signal calls for. A buyer-inspection signal is a different tool flow, so it has none here. */
function scenarioForJourneySignal(family: string | null): NegotiationStartScenario | null {
  if (family === 'inspection_followup_needed') return null;
  if (family === 'coverage_gap') return 'INSURANCE_PREMIUM_INCREASE';
  if (family === 'financial_exposure') return 'INSURANCE_CLAIM_SETTLEMENT';
  return 'CONTRACTOR_QUOTE_REVIEW';
}

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

const stepUnavailable = (body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'NEGOTIATION_SHIELD_JOURNEY_STEP_UNAVAILABLE',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-journey-step-unavailable', title: 'This step cannot start a review', body: `${body} Nothing has changed.`, tone: 'DEFAULT', actions: [] }],
  suggestions: [],
});

/** The home already has a review of this kind: use it for the step (no second one), or start a separate one on purpose. */
const existingReviewOffer = (existing: { id: string; title: string }, guidanceStepId: string): AskOperationResult => ({
  status: 'ANSWERED', reasonCode: 'NEGOTIATION_SHIELD_JOURNEY_EXISTING_REVIEW',
  blocks: [{
    type: 'SUMMARY', id: 'negotiation-shield-journey-existing', title: 'You already have a review for this',
    body: `"${existing.title}" is saved for this home. Run its analysis for this step, or start a separate review.`, tone: 'DEFAULT',
    actions: [{
      id: NEGOTIATION_SHIELD_USE_EXISTING_ACTION_ID, label: 'Run the analysis on it', interactionType: 'START_WORKFLOW' as const, message: NEGOTIATION_SHIELD_ANALYZE_MESSAGE,
      operationId: 'NEGOTIATION_SHIELD_CASE_ANALYZE', entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: existing.id, guidanceStepId, style: 'PRIMARY' as const,
    }, {
      id: NEGOTIATION_SHIELD_START_NEW_ACTION_ID, label: 'Start a separate review', interactionType: 'START_WORKFLOW' as const, message: NEGOTIATION_SHIELD_START_MESSAGE,
      operationId: 'NEGOTIATION_SHIELD_CASE_START', entityType: 'GUIDANCE_STEP', entityId: guidanceStepId, actionId: NEGOTIATION_SHIELD_START_NEW_ACTION_ID, style: 'SECONDARY' as const,
    }],
  }],
  suggestions: [],
});

// ── Scenario choice ───────────────────────────────────────────────────────────────────────────────────────────

const scenarioStartMessage = (scenario: NegotiationStartScenario) => {
  const label = NEGOTIATION_START_SCENARIO_SPECS[scenario].label.toLowerCase();
  const subject = label.endsWith(' review') ? label : `${label} review`;
  return `Start ${/^[aeiou]/.test(subject) ? 'an' : 'a'} ${subject}.`;
};

function scenarioChoice(): AskOperationResult {
  const items = NEGOTIATION_START_SCENARIOS.map((scenario) => ({
    id: scenario, title: NEGOTIATION_START_SCENARIO_SPECS[scenario].label, description: NEGOTIATION_START_SCENARIO_SPECS[scenario].summary,
    meta: [], status: null, href: null, entityType: NEGOTIATION_SHIELD_SCENARIO_ENTITY,
    actions: [{ id: NEGOTIATION_SHIELD_SCENARIO_ACTION_ID, label: 'Start', message: scenarioStartMessage(scenario), operationId: 'NEGOTIATION_SHIELD_CASE_START' as const, interactionType: 'CONVERSATION_CONTINUE' as const, style: 'PRIMARY' as const }],
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
  launch: { scenarioType: NegotiationStartScenario | null; sourceExecutionId: string | null; guidanceStepId?: string | null; forceNew?: boolean; prefill?: Pick<NegotiationStartInput, 'title' | 'structuredData'> },
  supplied?: NegotiationStartInput,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  let scenario = launch.scenarioType;
  // Started from a journey's step: the step is re-read first (home, journey, tool, status), the review type follows the journey's own signal, and a
  // review the home already has for it is offered before a second one is made. A stale step starts nothing and falls back to nothing.
  let guidanceStepId: string | null = null;
  if (launch.guidanceStepId) {
    const bound = await resolveGuidanceStepBinding(propertyId, launch.guidanceStepId, { toolKey: 'negotiation-shield', stepKeys: JOURNEY_STEP_KEYS });
    if (!bound.ok) return stepUnavailable(GUIDANCE_STEP_REFUSAL_TEXT[bound.reason]);
    guidanceStepId = bound.binding.stepId;
    scenario = scenario ?? scenarioForJourneySignal(bound.binding.signalIntentFamily);
    if (!scenario) return stepUnavailable('Ask cannot start this kind of negotiation review from here yet. Nothing has changed.');
    if (!launch.forceNew && !supplied) {
      const existing = await prisma.negotiationShieldCase.findFirst({
        where: { propertyId, scenarioType: scenario, status: { not: 'ARCHIVED' }, inputs: { some: {} } }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true },
      });
      if (existing) return existingReviewOffer(existing, guidanceStepId);
    }
  }
  if (!scenario) return scenarioChoice();
  const contextVersion = negotiationShieldStartContextVersion(propertyId, scenario);
  const spec = NEGOTIATION_START_SCENARIO_SPECS[scenario];

  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'NEGOTIATION_SHIELD_START_INPUT_REQUIRED', contextVersion,
      parameters: { negotiationStartLaunch: { scenarioType: scenario, sourceExecutionId: launch.sourceExecutionId, ...(guidanceStepId ? { guidanceStepId } : {}) } },
      blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-start-input', title: `Start a review: ${spec.label.toLowerCase()}`, body: 'Nothing has been saved yet. Enter what you know, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [captureRequest(scenario, contextVersion, launch.prefill)], suggestions: [],
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
      negotiationStartContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, ...(guidanceStepId ? { guidanceStepId } : {}),
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
  const chosenScenario = launch?.entityType === NEGOTIATION_SHIELD_SCENARIO_ENTITY && isNegotiationStartScenario(launch.entityId) ? launch.entityId : null;
  const chosenMessage = chosenScenario ? scenarioStartMessage(chosenScenario) : null;
  const declared = launch?.operationId === 'NEGOTIATION_SHIELD_CASE_START' && (envelope.message === NEGOTIATION_SHIELD_START_MESSAGE || envelope.message === chosenMessage);
  // Started from a saved Service Price Radar check (Desktop's "Need help responding?" hand-off): the contractor-quote form opens with what the check holds. The values are
  // read from the check in this home, never taken from the launch, and the person still reviews and confirms the form as usual.
  if (launch?.operationId === 'NEGOTIATION_SHIELD_CASE_START' && launch.entityType === SERVICE_PRICE_CHECK_ENTITY_TYPE && launch.entityId && envelope.message === SERVICE_PRICE_NEGOTIATE_MESSAGE) {
    const check = await prisma.serviceRadarCheck.findFirst({ where: { id: launch.entityId, propertyId: envelope.propertyId! }, select: { quoteVendorName: true, quoteAmount: true, serviceCategory: true } });
    const amount = check ? Number(check.quoteAmount) : NaN;
    const structuredData: Record<string, unknown> = check ? {
      ...(check.quoteVendorName ? { contractorName: check.quoteVendorName } : {}),
      ...(Number.isFinite(amount) && amount > 0 ? { quoteAmount: amount } : {}),
      serviceCategory: servicePriceCategoryLabel(String(check.serviceCategory)),
    } : {};
    return negotiationShieldStartResult(envelope.userId, envelope.propertyId!, {
      scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceExecutionId: launch.sourceExecutionId ?? null,
      ...(check ? { prefill: { title: NEGOTIATION_START_SCENARIO_SPECS.CONTRACTOR_QUOTE_REVIEW.label, structuredData } } : {}),
    });
  }
  const stepId = launchedGuidanceStepId(launch);
  if (declared && stepId && envelope.message === NEGOTIATION_SHIELD_START_MESSAGE) {
    return negotiationShieldStartResult(envelope.userId, envelope.propertyId!, {
      scenarioType: null, sourceExecutionId: launch?.sourceExecutionId ?? null, guidanceStepId: stepId, forceNew: launch?.actionId === NEGOTIATION_SHIELD_START_NEW_ACTION_ID,
    });
  }
  if (declared) {
    return negotiationShieldStartResult(envelope.userId, envelope.propertyId!, { scenarioType: chosenScenario, sourceExecutionId: launch?.sourceExecutionId ?? null });
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
  // The review is saved either way. The step only follows into the analysis if it is still this tool's open step; otherwise the receipt says so.
  const stepId = typeof parameters.guidanceStepId === 'string' ? parameters.guidanceStepId : null;
  const stepBound = stepId ? await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: 'negotiation-shield', stepKeys: JOURNEY_STEP_KEYS }) : null;
  const carriedStepId = stepBound?.ok ? stepBound.binding.stepId : null;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'NEGOTIATION_SHIELD_REVIEW_STARTED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `negotiation-shield-started-${caseId}`, title: 'Review started', status: 'COMPLETED',
      description: 'Saved as a draft review. It has not been analyzed yet and nothing has been sent.',
      details: [{ label: 'Review', value: input.title }, { label: 'Type', value: spec.label }, ...(stepBound && !stepBound.ok ? [{ label: 'Guided journey', value: GUIDANCE_STEP_REFUSAL_TEXT[stepBound.reason] }] : [])],
      actions: [{
        id: 'negotiation-shield-review', label: 'Review', interactionType: 'START_WORKFLOW' as const, message: REVIEW_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASES',
        entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: caseId, style: 'SECONDARY' as const,
      }, {
        id: NEGOTIATION_SHIELD_ANALYZE_ACTION_ID, label: 'Run the analysis', interactionType: 'START_WORKFLOW' as const, message: NEGOTIATION_SHIELD_ANALYZE_MESSAGE,
        operationId: 'NEGOTIATION_SHIELD_CASE_ANALYZE', entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: caseId, ...(carriedStepId ? { guidanceStepId: carriedStepId } : {}), style: 'PRIMARY' as const,
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
