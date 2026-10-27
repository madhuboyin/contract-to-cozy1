// Attach an existing Home Record to a Negotiation Shield review inside Ask (ASK_COZY_NEGOTIATION_SHIELD_DOCUMENTS_DESIGN.md, slice 3a; owner decisions
// D-A1, D-A2, D-A3 accepted as recommended).
//
// Reached only by the declared "Attach a document" action on a review's Documents block (launchContext.entityType NEGOTIATION_SHIELD_CASE). One form
// asks the document's role in this review (the roles that scenario's rules engine counts) and which record; a review card names the record, its kind and
// sensitivity and says it is shared with everyone who can see the review; and only after the homeowner confirms does it link the record through the
// canonical NegotiationShieldService.attachDocumentMetadata (documentId branch).
//
// What is offered: ACTIVE Home Records the WHOLE household can see (a review is shared, so an owner-only record is never offered, even to an owner),
// of a STANDARD, FINANCIAL, INSURANCE or CLAIM sensitivity, not already attached. Nothing is read or analyzed by attaching, and Ask never shows a file
// link, storage key, file name or content. Not here: uploading a new file (the page's upload goes through Home Records; Ask's own upload makes a
// legacy Document the review cannot link), detaching (no desktop capability), or parsing (slice 3b).
//
// Idempotency: the canonical link is idempotent by (case, record) and the operation's identity is that same pair, so no new key is needed.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { getNegotiationShieldCaseReviewForProperty } from '../../negotiationShieldCaseList';
import { listPropertyDocuments } from '../../propertyDocuments/propertyDocumentInventory.service';
import {
  NEGOTIATION_ATTACH_ALLOWED_SENSITIVITIES, NEGOTIATION_ATTACH_DOCUMENT_TYPES, NEGOTIATION_DOCUMENT_TYPE_LABELS, NEGOTIATION_SHIELD_ATTACH_CAPTURE_KEY,
  NEGOTIATION_SHIELD_ATTACH_MESSAGE, offerableNegotiationDocuments, parseNegotiationAttachAnswer, type NegotiationAttachCandidate,
} from '../support/negotiationShieldAttach';
import { NEGOTIATION_SHIELD_ANALYZE_ACTION_ID, NEGOTIATION_SHIELD_ANALYZE_MESSAGE } from '../support/negotiationShieldAnalyze';
import { isNegotiationEditScenario, NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, type NegotiationEditScenario } from '../support/negotiationShieldStart';

const CONFIRMATION_MINUTES = 30;
const REVIEW_MESSAGE = 'Review this negotiation case.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToReviews = { id: 'negotiation-shield-back', label: 'Back to my reviews', interactionType: 'START_WORKFLOW' as const, message: 'Show my negotiation shield cases', operationId: 'NEGOTIATION_SHIELD_CASES' as const, style: 'SECONDARY' as const };
const SENSITIVITY_LABELS: Record<string, string> = { STANDARD: 'Standard', FINANCIAL: 'Financial', INSURANCE: 'Insurance', CLAIM: 'Claim' };

/** Bound to the case and the records the form offered, so a form opened before the household's records changed is refused as out of date. */
export const negotiationShieldAttachContextVersion = (caseId: string, optionIds: readonly string[]) => sha(`negotiation-shield-attach:${caseId}:${[...optionIds].sort().join(',')}`);

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-attach-permission', title: 'A contributor or owner can attach a document', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_NEGOTIATION_SHIELD_ATTACH_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-attach-not-routable', title: 'Open a review first', body: 'A document is attached from Attach a document on one of your reviews. Nothing has changed.', tone: 'DEFAULT', actions: [] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode,
  blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-attach-unavailable', title, body, tone: 'DEFAULT', actions: [backToReviews] }],
  suggestions: [],
});

export interface NegotiationAttachLaunch { caseId: string | null; sourceExecutionId: string | null }

async function loadCandidates(propertyId: string, role: HouseholdRole): Promise<NegotiationAttachCandidate[]> {
  // Home Records only (the review's link is a Home Record foreign key); never the transitional legacy store.
  const inventory = await listPropertyDocuments({ propertyId, role });
  return inventory.items
    .filter((item) => item.source === 'HOME_RECORD')
    .map((item) => ({
      id: item.id, title: item.title, kind: item.kind, kindLabel: item.kindLabel, addedAt: item.addedAt,
      sensitivity: item.sensitivity, visibility: item.visibility, lifecycle: item.lifecycle,
    }));
}

const optionLabel = (candidate: NegotiationAttachCandidate) => `${candidate.title} (${candidate.kindLabel}, added ${humanDate(candidate.addedAt) ?? 'earlier'})`;

function captureRequest(scenario: NegotiationEditScenario, title: string, contextVersion: string, options: NegotiationAttachCandidate[], entered?: { documentType?: string; recordId?: string }): AskCaptureRequest {
  return {
    requirementId: 'negotiation-shield-attach-inputs', captureKey: NEGOTIATION_SHIELD_ATTACH_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: `Attach a document: ${title}`, question: 'Which document, and what is it for this review?',
    helpText: 'Only records already shared with your household are listed, because everyone who can see this review can see what is attached. Nothing is saved until you confirm, and attaching does not read the file.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'documentType', label: 'What is it?', required: true, inputSchema: {
        type: 'SINGLE_SELECT', options: NEGOTIATION_ATTACH_DOCUMENT_TYPES[scenario].map((value) => ({ label: NEGOTIATION_DOCUMENT_TYPE_LABELS[value] ?? value, value })),
      } },
      { key: 'recordId', label: 'Document', required: true, inputSchema: { type: 'SINGLE_SELECT', options: options.map((option) => ({ label: optionLabel(option), value: option.id })) } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: { ...(entered?.documentType ? { documentType: entered.documentType } : {}), ...(entered?.recordId ? { recordId: entered.recordId } : {}) },
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change; nothing is attached until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

/** What the form offers for one case, and the version it is bound to. Shared with the capture path so both see the same list. */
export async function negotiationShieldAttachOffer(propertyId: string, role: HouseholdRole, caseId: string) {
  const review = await getNegotiationShieldCaseReviewForProperty(propertyId, caseId);
  if (!review) return null;
  const attachedIds = new Set(review.documents.map((document) => document.documentId));
  const offered = offerableNegotiationDocuments(await loadCandidates(propertyId, role), attachedIds);
  return { review, ...offered, contextVersion: negotiationShieldAttachContextVersion(caseId, offered.options.map((option) => option.id)) };
}

export async function negotiationShieldAttachResult(
  userId: string, propertyId: string, launch: NegotiationAttachLaunch, submitted?: { documentType: string; recordId: string },
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  if (!launch.caseId) return notRoutable();
  const offer = await negotiationShieldAttachOffer(propertyId, access.role, launch.caseId);
  if (!offer) return unavailable('NEGOTIATION_SHIELD_CASE_NOT_FOUND', 'That review is no longer available', 'Ask could not find that negotiation review for this home. It may have been removed. Nothing has changed.');
  const scenario = offer.review.case.scenarioType;
  if (!isNegotiationEditScenario(scenario)) {
    return unavailable('NEGOTIATION_SHIELD_ATTACH_UNSUPPORTED', 'Attaching to this kind of review is not currently available in Ask',
      'Ask cannot attach a document to this kind of review. Nothing has changed.');
  }
  if (offer.options.length === 0) {
    const hidden = offer.excludedPrivate + offer.excludedSensitive;
    return unavailable('NEGOTIATION_SHIELD_ATTACH_NO_RECORDS', 'There is no record to attach yet',
      'Only records already shared with your household and filed as standard, financial, insurance or claim documents can be attached here. '
      + (hidden > 0 ? 'Some records are not offered because they are private or of a more sensitive kind. ' : '')
      + 'Adding a new file to your Home Records is not currently available in Ask. Nothing has changed.');
  }

  if (!submitted) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'NEGOTIATION_SHIELD_ATTACH_INPUT_REQUIRED', contextVersion: offer.contextVersion,
      parameters: { negotiationAttachLaunch: { caseId: offer.review.case.id, scenarioType: scenario, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-attach-input', title: `Attach a document: ${offer.review.case.title}`, body: 'Choose what it is and which record. Nothing has been attached yet, and attaching does not read the file.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [captureRequest(scenario, offer.review.case.title, offer.contextVersion, offer.options)], suggestions: [],
    };
  }

  const chosen = offer.options.find((option) => option.id === submitted.recordId);
  if (!chosen) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'NEGOTIATION_SHIELD_ATTACH_RECORD_UNAVAILABLE', contextVersion: offer.contextVersion,
      parameters: { negotiationAttachLaunch: { caseId: offer.review.case.id, scenarioType: scenario, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-attach-record-missing', title: 'That record is not available to attach', body: 'Choose another record. Nothing has been attached.', tone: 'CAUTION', actions: [] }],
      captureRequests: [captureRequest(scenario, offer.review.case.title, offer.contextVersion, offer.options, { documentType: submitted.documentType })], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const roleLabel = NEGOTIATION_DOCUMENT_TYPE_LABELS[submitted.documentType] ?? submitted.documentType;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'NEGOTIATION_SHIELD_ATTACH_CONFIRMATION_REQUIRED', contextVersion: offer.contextVersion,
    parameters: {
      negotiationShieldAttach: { caseId: offer.review.case.id, scenarioType: scenario, recordId: chosen.id, documentType: submitted.documentType },
      negotiationAttachContextVersion: offer.contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'negotiation-shield-attach-review', title: 'Review this attachment', body: 'Nothing is attached until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `negotiation-shield-attach-${sha(`${propertyId}:${offer.review.case.id}:${chosen.id}:${submitted.documentType}`).slice(0, 12)}-1`, version: 1,
      title: `Attach "${chosen.title}" to "${offer.review.case.title}"?`,
      description: 'This shares the record with everyone who can see this review. The file is not read or analyzed by attaching; the next analysis will count it as '
        + `${roleLabel.toLowerCase()}.`,
      fields: [
        { label: 'Review', value: offer.review.case.title },
        { label: 'Document', value: chosen.title },
        { label: 'Kind', value: chosen.kindLabel },
        { label: 'Sensitivity', value: SENSITIVITY_LABELS[chosen.sensitivity ?? ''] ?? 'Standard' },
        { label: 'It is', value: roleLabel },
      ],
      editableFields: [], confirmLabel: 'Attach document', consentText: 'I authorize attaching this record to this shared review.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [captureRequest(scenario, offer.review.case.title, offer.contextVersion, offer.options, submitted)],
    suggestions: [],
  };
}

registerCapabilityHandler('negotiation-shield.attach', async (envelope) => {
  const launch = envelope.launchContext;
  const declared = launch?.operationId === 'NEGOTIATION_SHIELD_CASE_ATTACH' && launch.surface !== 'ASK_REFRESH'
    && envelope.message === NEGOTIATION_SHIELD_ATTACH_MESSAGE && launch.entityType === NEGOTIATION_SHIELD_CASE_ENTITY_TYPE && Boolean(launch.entityId);
  if (!declared) return notRoutable();
  return negotiationShieldAttachResult(envelope.userId, envelope.propertyId!, { caseId: launch!.entityId ?? null, sourceExecutionId: launch!.sourceExecutionId ?? null });
});

async function confirmNegotiationShieldAttach(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  const stored = parameters.negotiationShieldAttach as { caseId?: unknown; scenarioType?: unknown; recordId?: unknown; documentType?: unknown } | undefined;
  const invalid = () => Object.assign(new Error('The attachment to make is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  if (!stored || typeof stored.caseId !== 'string' || !stored.caseId || !isNegotiationEditScenario(stored.scenarioType)) throw invalid();
  const checked = parseNegotiationAttachAnswer(stored.scenarioType, { documentType: stored.documentType, recordId: stored.recordId });
  if (!checked.success) throw invalid();
  const propertyId = execution.propertyId;
  const caseId = stored.caseId;

  const review = await getNegotiationShieldCaseReviewForProperty(propertyId, caseId);
  if (!review) throw Object.assign(new Error('That review is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  // Re-check the record itself, server-side, not the form: same property, active, household-visible, an allowed sensitivity. (The canonical attach
  // checks the caller's visibility and the household's again; the sensitivity rule is Ask's own, so it is enforced here.)
  const record = await prisma.propertyRecord.findFirst({
    where: { id: checked.data.recordId, propertyId, visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE' },
    select: { id: true, title: true, recordType: true, sensitivity: true },
  });
  if (!record || !NEGOTIATION_ATTACH_ALLOWED_SENSITIVITIES.has(String(record.sensitivity))) {
    throw Object.assign(new Error('That record is no longer available to attach.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  }
  const alreadyAttached = review.documents.some((document) => document.documentId === record.id);

  let linkId = review.documents.find((document) => document.documentId === record.id)?.id ?? null;
  if (!alreadyAttached) {
    // Loaded here, not at boot: the service pulls in document parsing and OCR, which Ask's reads deliberately avoid.
    const { NegotiationShieldService } = await import('../../negotiationShield.service');
    const detail = await new NegotiationShieldService().attachDocumentMetadata({
      propertyId, caseId, userId, role: access.role, payload: { documentType: checked.data.documentType as never, documentId: record.id },
    });
    linkId = detail.documents.find((document) => document.documentId === record.id)?.id ?? null;
  }

  const after = await getNegotiationShieldCaseReviewForProperty(propertyId, caseId);
  const hasAnalysis = Boolean(after?.latestAnalysis);
  const roleLabel = NEGOTIATION_DOCUMENT_TYPE_LABELS[checked.data.documentType] ?? checked.data.documentType;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'NEGOTIATION_SHIELD_DOCUMENT_ATTACHED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `negotiation-shield-attached-${linkId ?? caseId}`, title: alreadyAttached ? 'Document already attached' : 'Document attached', status: 'COMPLETED',
      description: hasAnalysis
        ? 'The document was not read. The analysis was not re-run, so it does not count this document until you run it again.'
        : 'The document was not read. The next analysis will count it.',
      details: [{ label: 'Review', value: review.case.title }, { label: 'Document', value: record.title }, { label: 'It is', value: roleLabel }],
      actions: [
        { id: 'negotiation-shield-review', label: 'Review', interactionType: 'START_WORKFLOW' as const, message: REVIEW_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASES', entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: caseId, style: 'SECONDARY' as const },
        ...(after?.hasInput ? [{
          id: NEGOTIATION_SHIELD_ANALYZE_ACTION_ID, label: hasAnalysis ? 'Run it again' : 'Run the analysis', interactionType: 'START_WORKFLOW' as const, message: NEGOTIATION_SHIELD_ANALYZE_MESSAGE,
          operationId: 'NEGOTIATION_SHIELD_CASE_ANALYZE', entityType: NEGOTIATION_SHIELD_CASE_ENTITY_TYPE, entityId: caseId, style: 'PRIMARY' as const,
        }] : []),
      ],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `negotiation-shield-attach-refresh-failed-${caseId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The document was attached. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'NEGOTIATION_SHIELD_DOCUMENT', artifactId: linkId ?? caseId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('negotiation-shield.attach', confirmNegotiationShieldAttach);

