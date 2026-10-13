// Buyer-mode Negotiation Shield inside Ask (register P0 "Negotiation Shield", buyer mode; FRD v1.312).
//
// Reached only by the declared row actions on the buyer negotiation readiness answer. A finding classified for seller negotiation on a confirmed
// inspection report can be started (a buyer negotiation case is created, or the one already linked is reused) and, once started, its seller response and
// outcome recorded. Both write through NegotiationShieldService, the same methods the routes call (the route's only extras are the contributor floor and
// passing the caller's role, both honored here). Recording some outcomes also resolves the finding and completes its Buyer Plan task; the review card says
// so before anything is written. Nothing is sent to the seller: Ask records what the household did and was told.
//
// Not here: attaching completion evidence, the buyer analysis and draft message, and classifying a finding for negotiation (the Buyer Plan's own step).
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { money } from '../askFormatting';
import {
  BUYER_FINDING_ENTITY_TYPE, BUYER_NEGOTIATION_ACTION_IDS, BUYER_NEGOTIATION_CAPTURE_KEYS, BUYER_NEGOTIATION_MESSAGES, BUYER_OUTCOMES, BUYER_OUTCOME_LABELS,
  BUYER_REQUEST_LABELS, BUYER_REQUEST_TYPES, BUYER_SELLER_RESPONSES, BUYER_SELLER_RESPONSE_LABELS, buyerNegotiationKindFromMessage, buyerOutcomeConsequence,
  parseBuyerNegotiationAnswer, type BuyerNegotiationFormData, type BuyerNegotiationKind, type BuyerOutcomeInput, type BuyerStartInput,
} from '../support/negotiationShieldBuyer';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface BuyerNegotiationLaunch { kind: BuyerNegotiationKind; entityId: string; sourceExecutionId: string | null }

const backToReadiness = { id: 'buyer-negotiation-back', label: 'Back to the negotiation', interactionType: 'START_WORKFLOW' as const, message: 'What is still in negotiation with the seller?', operationId: 'BUYER_NEGOTIATION_READINESS' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'buyer-negotiation-permission', title: 'A contributor or owner can change a negotiation', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_BUYER_NEGOTIATION_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'buyer-negotiation-not-routable', title: 'Open the negotiation first', body: 'A negotiation step is started from a finding in your negotiation list. Nothing has changed.', tone: 'DEFAULT', actions: [backToReadiness] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string, actions: unknown[] = [backToReadiness]): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-negotiation-unavailable', title, body, tone: 'DEFAULT', actions: actions as never }], suggestions: [],
});

type FindingRow = {
  id: string; homeSystem: string; inspectorDescription: string | null; severity: string; status: string; buyerDisposition: string | null; buyerTaskId: string | null;
  updatedAt: Date; report: { status: string };
  negotiationCaseLinks: Array<{
    id: string; caseId: string; requestType: string; requestedCreditCents: number | null; sellerResponse: string; sellerResponseNotes: string | null;
    outcome: string; agreedCreditCents: number | null; outcomeNotes: string | null; updatedAt: Date;
  }>;
};
async function loadFinding(propertyId: string, findingId: string): Promise<FindingRow | null> {
  return database.inspectionFinding.findFirst({
    where: { id: findingId, propertyId },
    select: {
      id: true, homeSystem: true, inspectorDescription: true, severity: true, status: true, buyerDisposition: true, buyerTaskId: true, updatedAt: true,
      report: { select: { status: true } },
      negotiationCaseLinks: { select: { id: true, caseId: true, requestType: true, requestedCreditCents: true, sellerResponse: true, sellerResponseNotes: true, outcome: true, agreedCreditCents: true, outcomeNotes: true, updatedAt: true } },
    },
  });
}
const systemLabel = (finding: FindingRow) => finding.homeSystem.toLowerCase().replace(/_/g, ' ');
/** Bound to the finding's last change and its negotiation link, so a confirmation opened before either changed is refused as out of date. */
export const buyerNegotiationContextVersion = (finding: FindingRow) =>
  sha(`buyer-negotiation:${finding.id}:${finding.updatedAt.toISOString()}:${finding.status}:${finding.buyerDisposition}:${finding.negotiationCaseLinks.map((l) => `${l.id}${l.updatedAt.toISOString()}${l.sellerResponse}${l.outcome}`).join(',')}`);

function formCapture(kind: BuyerNegotiationKind, contextVersion: string, finding: FindingRow, entered?: Record<string, unknown>): AskCaptureRequest {
  const base = { classification: 'WORKFLOW_INPUT' as const, state: 'UNKNOWN' as const, allowNotSure: false, sensitivity: 'FINANCIAL' as const, confirmationText: null, expectedContextVersion: contextVersion };
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const select = (key: string, label: string, values: readonly string[], labels: Record<string, string>, required = true) =>
    ({ key, label, required, inputSchema: { type: 'SINGLE_SELECT' as const, options: values.map((value) => ({ label: labels[value] ?? value, value })) } });
  if (kind === 'START') {
    return { ...base, requirementId: 'buyer-negotiation-start-inputs', captureKey: BUYER_NEGOTIATION_CAPTURE_KEYS.START, title: `Negotiate the ${systemLabel(finding)} finding`,
      question: 'What do you want from the seller?',
      helpText: 'This records your request. Nothing is sent to the seller from Ask. You will review it before it is saved.',
      inputSchema: { type: 'GROUP', fields: [
        select('requestType', 'What are you asking for?', BUYER_REQUEST_TYPES, BUYER_REQUEST_LABELS),
        { key: 'requestedCredit', label: 'Credit you are asking for ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 10_000_000 } },
        { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } },
      ] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: { requestType: 'REPAIR_OR_CREDIT', ...clean(entered) }, destinationLabel: 'Starts a negotiation record after confirmation' };
  }
  return { ...base, requirementId: 'buyer-negotiation-outcome-inputs', captureKey: BUYER_NEGOTIATION_CAPTURE_KEYS.OUTCOME, title: `Seller response: ${systemLabel(finding)} finding`,
    question: 'What did the seller say, and where did it end up?',
    helpText: 'Record what you were told and the result. Some results also resolve the finding and complete its Buyer Plan task; the review says which.',
    inputSchema: { type: 'GROUP', fields: [
      select('sellerResponse', 'Seller response', BUYER_SELLER_RESPONSES, BUYER_SELLER_RESPONSE_LABELS),
      { key: 'sellerResponseNotes', label: 'What the seller said', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } },
      select('outcome', 'Outcome', BUYER_OUTCOMES, BUYER_OUTCOME_LABELS),
      { key: 'agreedCredit', label: 'Credit agreed ($)', required: false, helpText: 'Needed when the seller agreed to a credit.', inputSchema: { type: 'NUMBER', min: 0, max: 10_000_000 } },
      { key: 'outcomeNotes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered), destinationLabel: 'Records the seller response and outcome after confirmation' };
}

export async function buyerNegotiationResult(userId: string, propertyId: string, launch: BuyerNegotiationLaunch, supplied?: BuyerNegotiationFormData): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const finding = await loadFinding(propertyId, launch.entityId);
  if (!finding) return unavailable('BUYER_FINDING_NOT_FOUND', 'That finding is no longer available', 'Ask could not find that inspection finding for this home. Nothing has changed.');
  const kind = launch.kind;
  const link = finding.negotiationCaseLinks[0] ?? null;
  const contextVersion = buyerNegotiationContextVersion(finding);
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const parameters = { buyerNegotiationLaunch: { kind, entityId: finding.id, sourceExecutionId: launch.sourceExecutionId } };
  const confirmBase = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const label = `${systemLabel(finding)} finding`;

  if (kind === 'START') {
    if (link) {
      return unavailable('BUYER_NEGOTIATION_ALREADY_STARTED', 'This finding is already in negotiation', 'Record the seller’s response instead. Nothing has changed.',
        [{ id: BUYER_NEGOTIATION_ACTION_IDS.OUTCOME, label: 'Record the seller response', interactionType: 'START_WORKFLOW' as const, message: BUYER_NEGOTIATION_MESSAGES.OUTCOME,
          operationId: 'NEGOTIATION_SHIELD_BUYER_COMMAND' as const, entityType: BUYER_FINDING_ENTITY_TYPE, entityId: finding.id, style: 'PRIMARY' as const }, backToReadiness]);
    }
    if (finding.report.status !== 'CONFIRMED' || finding.status === 'DISMISSED' || finding.buyerDisposition !== 'PRE_CLOSE_NEGOTIATION') {
      return unavailable('BUYER_NEGOTIATION_FINDING_NOT_READY', 'This finding is not ready to negotiate',
        'Only a finding on a confirmed inspection report, classified for seller negotiation and not dismissed, can be negotiated. Nothing has changed.');
    }
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'BUYER_NEGOTIATION_START_INPUT_REQUIRED', contextVersion, parameters,
        blocks: [{ type: 'SUMMARY', id: 'buyer-negotiation-start-input', title: `Negotiate the ${label}`, body: finding.inspectorDescription ? `Inspector: ${finding.inspectorDescription.slice(0, 280)}` : 'Choose what you want from the seller.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('START', contextVersion, finding)], suggestions: [],
      };
    }
    const input = supplied as BuyerStartInput;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_NEGOTIATION_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: {
      // Stored in the form's own shape (dollars), so the confirmation re-validates it through the same schema as the form.
      buyerNegotiationStart: { requestType: input.requestType, requestedCredit: input.requestedCreditCents === null ? null : input.requestedCreditCents / 100, notes: input.notes },
      buyerNegotiationCommand: { kind, entityId: finding.id }, buyerNegotiationContextVersion: contextVersion, ...confirmBase },
      blocks: [{ type: 'SUMMARY', id: 'buyer-negotiation-start-review', title: 'Review this request', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `buyer-negotiation-start-${sha(`${propertyId}:${finding.id}:${input.requestType}:${input.requestedCreditCents}`).slice(0, 12)}-1`, version: 1,
        title: `Start negotiating the ${label}?`,
        description: 'This opens a negotiation record for this finding. Ask does not send anything to the seller or your agent.',
        fields: [
          { label: 'Finding', value: `${systemLabel(finding)}${finding.severity ? ` (${String(finding.severity).toLowerCase()})` : ''}` },
          { label: 'Asking for', value: BUYER_REQUEST_LABELS[input.requestType] ?? input.requestType },
          ...(input.requestedCreditCents !== null ? [{ label: 'Credit requested', value: money(input.requestedCreditCents / 100) }] : []),
          ...(input.notes ? [{ label: 'Notes', value: input.notes }] : []),
        ],
        editableFields: [], confirmLabel: 'Start negotiation', consentText: 'I authorize adding this negotiation to the shared purchase record.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [formCapture('START', contextVersion, finding, { requestType: input.requestType, requestedCredit: input.requestedCreditCents === null ? null : input.requestedCreditCents / 100, notes: input.notes })],
      suggestions: [],
    };
  }

  // OUTCOME
  if (!link) {
    return unavailable('BUYER_NEGOTIATION_NOT_STARTED', 'This finding is not in negotiation yet', 'Start negotiating it first. Nothing has changed.',
      [{ id: BUYER_NEGOTIATION_ACTION_IDS.START, label: 'Start negotiating', interactionType: 'START_WORKFLOW' as const, message: BUYER_NEGOTIATION_MESSAGES.START,
        operationId: 'NEGOTIATION_SHIELD_BUYER_COMMAND' as const, entityType: BUYER_FINDING_ENTITY_TYPE, entityId: finding.id, style: 'PRIMARY' as const }, backToReadiness]);
  }
  const current: Record<string, unknown> = {
    sellerResponse: link.sellerResponse, sellerResponseNotes: link.sellerResponseNotes, outcome: link.outcome,
    agreedCredit: link.agreedCreditCents === null ? null : link.agreedCreditCents / 100, outcomeNotes: link.outcomeNotes,
  };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'BUYER_NEGOTIATION_OUTCOME_INPUT_REQUIRED', contextVersion, parameters,
      blocks: [{ type: 'SUMMARY', id: 'buyer-negotiation-outcome-input', title: `Seller response: ${label}`, body: `Currently: ${BUYER_SELLER_RESPONSE_LABELS[link.sellerResponse] ?? link.sellerResponse}; ${BUYER_OUTCOME_LABELS[link.outcome] ?? link.outcome}.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture('OUTCOME', contextVersion, finding, current)], suggestions: [],
    };
  }
  const input = supplied as BuyerOutcomeInput;
  const consequence = buyerOutcomeConsequence(input.outcome, Boolean(finding.buyerTaskId));
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_NEGOTIATION_OUTCOME_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      buyerNegotiationOutcome: {
        sellerResponse: input.sellerResponse, sellerResponseNotes: input.sellerResponseNotes, outcome: input.outcome,
        agreedCredit: input.agreedCreditCents === null ? null : input.agreedCreditCents / 100, outcomeNotes: input.outcomeNotes,
      },
      buyerNegotiationCommand: { kind, entityId: finding.id }, buyerNegotiationContextVersion: contextVersion, ...confirmBase },
    blocks: [{ type: 'SUMMARY', id: 'buyer-negotiation-outcome-review', title: 'Review this outcome', body: 'Nothing is saved until you confirm.', tone: consequence ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `buyer-negotiation-outcome-${sha(`${propertyId}:${finding.id}:${input.sellerResponse}:${input.outcome}:${input.agreedCreditCents}`).slice(0, 12)}-1`, version: 1,
      title: `Record the seller’s response on the ${label}?`,
      description: `This records what the seller said and the result. Nothing is sent to anyone.${consequence ? ` ${consequence}` : ''}`,
      fields: [
        { label: 'Seller response', value: BUYER_SELLER_RESPONSE_LABELS[input.sellerResponse] ?? input.sellerResponse },
        { label: 'Outcome', value: BUYER_OUTCOME_LABELS[input.outcome] ?? input.outcome },
        ...(input.agreedCreditCents !== null ? [{ label: 'Credit agreed', value: money(input.agreedCreditCents / 100) }] : []),
        ...(input.sellerResponseNotes ? [{ label: 'What the seller said', value: input.sellerResponseNotes }] : []),
        ...(input.outcomeNotes ? [{ label: 'Notes', value: input.outcomeNotes }] : []),
      ],
      editableFields: [], confirmLabel: 'Record outcome', consentText: 'I authorize recording this outcome in the shared purchase record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture('OUTCOME', contextVersion, finding, { ...input, agreedCredit: input.agreedCreditCents === null ? null : input.agreedCreditCents / 100 })],
    suggestions: [],
  };
}

registerCapabilityHandler('negotiation-shield.buyer', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = buyerNegotiationKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'NEGOTIATION_SHIELD_BUYER_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== BUYER_FINDING_ENTITY_TYPE || !launch.entityId) return notRoutable();
  return buyerNegotiationResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmBuyerNegotiation(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  const command = parameters.buyerNegotiationCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as BuyerNegotiationKind | undefined;
  if ((kind !== 'START' && kind !== 'OUTCOME') || typeof command?.entityId !== 'string') throw stale('The negotiation step is invalid.');
  const propertyId = execution.propertyId;
  const finding = await loadFinding(propertyId, command.entityId);
  if (!finding) throw stale('That finding is no longer available.');
  if (parameters.buyerNegotiationContextVersion !== buyerNegotiationContextVersion(finding)) {
    throw stale('This finding changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  const link = finding.negotiationCaseLinks[0] ?? null;
  // Loaded here, not at boot: the service pulls in document parsing and OCR, which Ask's reads deliberately avoid.
  const { NegotiationShieldService } = await import('../../negotiationShield.service');
  const service = new NegotiationShieldService();
  try {
    let title: string; let description: string; const details: Array<{ label: string; value: string }> = []; let caseId = link?.caseId ?? finding.id;
    const actions: Array<Record<string, unknown>> = [{ ...backToReadiness, label: 'See the negotiation', style: 'SECONDARY' }];
    if (kind === 'START') {
      const checked = parseBuyerNegotiationAnswer('START', parameters.buyerNegotiationStart);
      if (!checked.success) throw stale('The request to record is invalid.');
      const input = checked.data as BuyerStartInput;
      if (link) throw stale('This finding is already in negotiation.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (finding.report.status !== 'CONFIRMED' || finding.status === 'DISMISSED' || finding.buyerDisposition !== 'PRE_CLOSE_NEGOTIATION') throw stale('This finding is not ready to negotiate.');
      const detail = await service.startBuyerNegotiation(propertyId, userId, {
        findingId: finding.id, requestType: input.requestType, requestedCreditCents: input.requestedCreditCents, notes: input.notes,
      });
      caseId = (detail as { id?: string }).id ?? caseId;
      title = 'Negotiation started'; description = 'The request is recorded for this finding. Nothing was sent to the seller.';
      details.push({ label: 'Finding', value: systemLabel(finding) }, { label: 'Asking for', value: BUYER_REQUEST_LABELS[input.requestType] ?? input.requestType });
      actions.unshift({ id: BUYER_NEGOTIATION_ACTION_IDS.OUTCOME, label: 'Record the seller response', interactionType: 'START_WORKFLOW', message: BUYER_NEGOTIATION_MESSAGES.OUTCOME,
        operationId: 'NEGOTIATION_SHIELD_BUYER_COMMAND', entityType: BUYER_FINDING_ENTITY_TYPE, entityId: finding.id, style: 'PRIMARY' });
    } else {
      if (!link) throw stale('This finding is not in negotiation.');
      const checked = parseBuyerNegotiationAnswer('OUTCOME', parameters.buyerNegotiationOutcome);
      if (!checked.success) throw stale('The outcome to record is invalid.');
      const input = checked.data as BuyerOutcomeInput;
      await service.recordBuyerNegotiationOutcome(propertyId, link.caseId, userId, {
        findingId: finding.id, sellerResponse: input.sellerResponse, sellerResponseNotes: input.sellerResponseNotes, outcome: input.outcome,
        agreedCreditCents: input.agreedCreditCents, outcomeNotes: input.outcomeNotes,
      }, access.role);
      title = 'Outcome recorded'; description = buyerOutcomeConsequence(input.outcome, Boolean(finding.buyerTaskId)) ?? 'The seller’s response and the outcome are saved.';
      details.push({ label: 'Seller response', value: BUYER_SELLER_RESPONSE_LABELS[input.sellerResponse] ?? input.sellerResponse }, { label: 'Outcome', value: BUYER_OUTCOME_LABELS[input.outcome] ?? input.outcome });
    }
    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `BUYER_NEGOTIATION_${kind}_COMPLETED`,
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `buyer-negotiation-${kind.toLowerCase()}-${finding.id}`, title, status: 'COMPLETED', description, details, actions: actions as never }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `buyer-negotiation-refresh-failed-${finding.id}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType: 'NEGOTIATION_SHIELD_BUYER_FINDING', artifactId: caseId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('negotiation-shield.buyer', confirmBuyerNegotiation);
