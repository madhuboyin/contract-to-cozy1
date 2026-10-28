// Manage the proposals of a quote comparison inside Ask (register P0 "Quote Comparison"; FRD v1.309 and v1.310).
//
// Reached only by declared actions on the Quote Comparison review. Summary actions carry the decision: Add a proposal and Close this decision.
// Per-proposal row actions carry the proposal (the message tells them apart): Select, Change, Confirm the facts, Ask the provider a question,
// Record the provider's answer, Reject / Return to consideration, and Remove. Every write goes through the canonical quoteComparison.service functions
// the desktop routes call, after the same project-compliance applicability check the controller runs, behind a review card and a confirmation.
// Nothing is accepted, booked or sent to a provider here: a question is recorded for the household, not sent.
//
// The same command also imports an unconfirmed proposal from an eligible household-shared Home Record. Finalization is a separate declared command;
// selecting here records the homeowner's shortlist choice and enables that next stage.
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
import { humanDate, money } from '../askFormatting';
import { SERVICE_QUOTE_OUTCOME_CONSENT_COPY, SERVICE_QUOTE_OUTCOME_CONSENT_FIELDS, SERVICE_QUOTE_OUTCOME_POLICY_VERSION } from '../../quoteOutcomeConsentCopy';
import {
  confirmQuoteProposal, createQuoteClarification, createQuoteProposal, deleteQuoteProposal, getQuoteReview, getWorkspaceComparability, resolveQuoteClarification,
  selectQuoteForDecision, setQuoteProposalDisposition, setServiceQuoteOutcomeMeasurementConsent, transitionQuoteDecision, updateQuoteProposal,
} from '../../quoteComparison.service';
import { assertProjectComplianceDecisionsApplicable } from '../../projectCompliance/context';
import { emitServiceQuoteDecisionAnalytics, ServiceQuoteDecisionEvent } from '../../serviceQuoteDecisionAnalytics.service';
import { confirmQuoteReviewSchema, type QuoteReview } from '../../quoteReview';
import { visibleRecordWhere } from '../../homeRecordsAccess';
import {
  parseQuoteAddAnswer, parseQuoteFormAnswer, QUOTE_CLOSE_OUTCOME_LABELS, QUOTE_CLOSE_OUTCOMES, QUOTE_COMMAND_MESSAGES, QUOTE_ENTITY_TYPE,
  QUOTE_FORM_CAPTURE_KEYS, QUOTE_WORKSPACE_ENTITY_TYPE, quoteAddProposalInput, quoteCommandKindFromMessage, quoteCommandTargetsWorkspace, quoteEditChanges,
  type QuoteAddInput, type QuoteImportInput, type QuoteCommandKind, type QuoteCurrentValues, type QuoteFormData, type QuoteFormKind,
} from '../support/quoteComparisonCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;

export interface QuoteCommandLaunch { kind: QuoteCommandKind; entityId: string; sourceExecutionId: string | null }

const backToReview = { id: 'quote-comparison-back', label: 'Back to the comparison', interactionType: 'START_WORKFLOW' as const, message: 'Compare my service quotes', operationId: 'QUOTE_COMPARISON_REVIEW' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'quote-command-permission', title: 'A contributor or owner can change a quote comparison', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_QUOTE_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'quote-command-not-routable', title: 'Open the comparison first', body: 'Proposals are changed from the quote comparison. Nothing has changed.', tone: 'DEFAULT', actions: [backToReview] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode,
  blocks: [{ type: 'SUMMARY', id: 'quote-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToReview] }],
  suggestions: [],
});

type WorkspaceRow = { id: string; outcome: string; journeyStage: string; serviceCategory: string | null; scopeSummary: string | null; updatedAt: Date; selectedQuoteId: string | null };
type QuoteRow = {
  id: string; vendorName: string; quoteAmount: unknown; currency: string | null; decision: string | null; isSelected: boolean; readinessStage: string | null;
  updatedAt: Date; workspaceId: string; scopeSummary: string | null; quoteDate: Date | null; expirationDate: Date | null; notes: string | null;
  homeownerConfirmedAt: Date | null; terms: Array<{ type: string; label: string | null; value: string; included: boolean | null }>;
  clarifications: Array<{ id: string; question: string; status: string; createdAt: Date }>;
};

const workspaceSelect = { id: true, outcome: true, journeyStage: true, serviceCategory: true, scopeSummary: true, updatedAt: true, selectedQuoteId: true };
const quoteSelect = {
  id: true, vendorName: true, quoteAmount: true, currency: true, decision: true, isSelected: true, readinessStage: true, updatedAt: true, workspaceId: true,
  scopeSummary: true, quoteDate: true, expirationDate: true, notes: true, homeownerConfirmedAt: true,
  terms: { select: { type: true, label: true, value: true, included: true }, orderBy: { createdAt: 'asc' } },
  clarifications: { select: { id: true, question: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
};

async function loadWorkspace(propertyId: string, workspaceId: string): Promise<WorkspaceRow | null> {
  return database.quoteComparisonWorkspace.findFirst({ where: { id: workspaceId, propertyId }, select: workspaceSelect });
}
async function loadQuote(propertyId: string, quoteId: string): Promise<{ quote: QuoteRow; workspace: WorkspaceRow } | null> {
  const quote = await database.quoteComparisonQuote.findFirst({
    where: { id: quoteId, workspace: { propertyId } },
    select: { ...quoteSelect, workspace: { select: workspaceSelect } },
  });
  if (!quote) return null;
  const { workspace, ...rest } = quote;
  return { quote: rest as QuoteRow, workspace: workspace as WorkspaceRow };
}

/** Whether the owner's outcome-sharing consent is on now: given, and not since revoked. Read from the record, never from the conversation. */
async function outcomeConsentOn(propertyId: string, workspaceId: string): Promise<boolean> {
  const row = await database.quoteComparisonWorkspace.findFirst({
    where: { id: workspaceId, propertyId }, select: { outcomeMeasurementConsentedAt: true, outcomeMeasurementConsentRevokedAt: true },
  });
  return Boolean(row?.outcomeMeasurementConsentedAt && !row?.outcomeMeasurementConsentRevokedAt);
}

const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const STATE_LABELS: Record<string, string> = {
  EXTRACTED_UNCONFIRMED: 'As extracted', HOMEOWNER_CONFIRMED: 'Confirmed', HOMEOWNER_CORRECTED: 'Corrected by you', NOT_APPLICABLE: 'Not applicable',
};
const valueText = (value: unknown) => (value === null || value === undefined || value === '' ? 'Not recorded' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value));

/** Every value a confirmation would affirm, in the order the person reads them: headline facts, line items, terms. Nothing is summarized away. */
function reviewValuesBlock(review: QuoteReview): AskOperationResult['blocks'][number] {
  const state = (value: string) => STATE_LABELS[value] ?? value;
  const sections = [
    { id: 'headline', title: 'The proposal', count: review.headline.length, items: review.headline.map((fact) => ({
      id: `headline-${fact.key}`, title: fact.label, description: fact.key === 'quoteAmount' && typeof fact.value === 'number' ? money(fact.value) : valueText(fact.value),
      meta: [] as string[], status: state(review.facts.find((entry) => entry.fieldKey === fact.key)?.state ?? 'EXTRACTED_UNCONFIRMED'), href: null, entityType: null, actions: [] as never[],
    })) },
    ...(review.lineItems.length ? [{ id: 'line-items', title: 'Line items', count: review.lineItems.length, items: review.lineItems.map((item, index) => ({
      id: item.id, title: `${index + 1}. ${item.description}`,
      description: [item.quantity !== null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : null, item.unitPrice !== null ? `at ${money(item.unitPrice)}` : null, item.total !== null ? `total ${money(item.total)}` : null]
        .filter(Boolean).join(' · ') || 'No figures recorded',
      meta: [item.kind.toLowerCase()], status: state(item.state), href: null, entityType: null, actions: [] as never[],
    })) }] : []),
    ...(review.terms.length ? [{ id: 'terms', title: 'Terms', count: review.terms.length, items: review.terms.map((term, index) => ({
      id: term.id, title: `${index + 1}. ${term.label ?? term.type.toLowerCase().replace(/_/g, ' ')}`,
      description: `${term.value}${term.included === false ? ' (not included)' : ''}`, meta: [term.type.toLowerCase()], status: state(term.state), href: null, entityType: null, actions: [] as never[],
    })) }] : []),
  ];
  return { type: 'GROUPED_LIST', filters: [], id: 'quote-review-values', title: 'Everything this confirmation covers', description: 'Only what is listed here is confirmed.', sections, actions: [] } as never;
}
const warrantyOf = (quote: QuoteRow) => quote.terms.find((term) => term.type === 'WARRANTY')?.value ?? null;
const currentValues = (quote: QuoteRow): QuoteCurrentValues => ({
  vendorName: quote.vendorName, quoteAmount: Number(quote.quoteAmount), scopeSummary: quote.scopeSummary, quoteDate: isoDate(quote.quoteDate),
  expirationDate: isoDate(quote.expirationDate), warranty: warrantyOf(quote), notes: quote.notes,
});
const openClarification = (quote: QuoteRow) => quote.clarifications.find((entry) => entry.status === 'OPEN') ?? null;

/** Bound to the workspace's and the proposal's last change (and its questions), so a confirmation opened before either changed is refused as out of date. */
export const quoteCommandContextVersion = (workspace: WorkspaceRow, quote?: QuoteRow | null) =>
  sha(`quote-command:${workspace.id}:${workspace.updatedAt.toISOString()}:${quote
    ? `${quote.id}:${quote.updatedAt.toISOString()}:${quote.decision}:${quote.isSelected}:${quote.clarifications.map((c) => `${c.id}${c.status}`).join(',')}` : ''}`);

const closedMessage = 'This quote decision is closed. Start a new comparison to evaluate revised proposals.';
const lockedStages = ['FINALIZATION', 'BOOKING', 'SCHEDULED', 'COMPLETED', 'CLOSED'];

interface ImportableRecord { id: string; title: string; recordType: string; updatedAt: Date; currentVersionId: string | null }
const RECORD_TYPE_LABELS: Record<string, string> = { QUOTE: 'Quote or estimate', CONTRACT: 'Contract', OTHER: 'Other document' };
/** Household-shared, active Home Records that may hold a quote (design §3.3): an owner-only record is never offered, even to an owner. */
async function importableRecords(propertyId: string, role: HouseholdRole): Promise<ImportableRecord[]> {
  return database.propertyRecord.findMany({
    where: { propertyId, lifecycleStatus: 'ACTIVE', visibility: 'HOUSEHOLD', recordType: { in: ['QUOTE', 'CONTRACT', 'OTHER'] }, ...visibleRecordWhere(role) },
    orderBy: { updatedAt: 'desc' }, take: 25, select: { id: true, title: true, recordType: true, updatedAt: true, currentVersionId: true },
  });
}

function formCapture(kind: QuoteFormKind, contextVersion: string, entered?: Record<string, unknown>, quote?: QuoteRow, records: ImportableRecord[] = [], choiceRequired = false): AskCaptureRequest {
  const base = { classification: 'WORKFLOW_INPUT' as const, state: 'UNKNOWN' as const, allowNotSure: false, sensitivity: 'FINANCIAL' as const, confirmationText: null, expectedContextVersion: contextVersion };
  const text = (key: string, label: string, max: number, required = false) => ({ key, label, required, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  if (kind === 'IMPORT') {
    return { ...base, requirementId: 'quote-comparison-import-inputs', captureKey: QUOTE_FORM_CAPTURE_KEYS.IMPORT, title: 'Add a proposal from a document',
      question: 'Which document is the quote?',
      helpText: 'Only quotes already on file that your whole household can see are listed. Ask reads the document and adds what it finds as an unconfirmed proposal; you review every value before anything is confirmed.',
      inputSchema: { type: 'GROUP', fields: [
        { key: 'recordId', label: 'Document', required: true, inputSchema: { type: 'SINGLE_SELECT', options: records.map((record) => ({ label: `${record.title} (${RECORD_TYPE_LABELS[record.recordType] ?? 'Document'}, updated ${humanDate(record.updatedAt) ?? 'earlier'})`, value: record.id })) } },
        { key: 'onNewerVersion', label: 'An earlier version of this document is already here. What should happen to it?', required: choiceRequired,
          inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Replace that proposal with this version', value: 'REPLACE' }, { label: 'Keep both proposals', value: 'RETAIN_BOTH' }] } },
      ] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: clean(entered), destinationLabel: 'Used to prepare this change; nothing is saved until you confirm' };
  }
  if (kind === 'CLARIFY') {
    return { ...base, requirementId: 'quote-comparison-clarify-inputs', captureKey: QUOTE_FORM_CAPTURE_KEYS.CLARIFY, title: 'Ask the provider a question',
      question: `What do you need to know about ${quote?.vendorName ?? 'this'} proposal?`,
      helpText: 'The question is recorded with the proposal for your household. It is not sent to the provider.',
      inputSchema: { type: 'GROUP', fields: [{ key: 'question', label: 'Your question', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: clean(entered), destinationLabel: 'Recorded with the proposal after confirmation' };
  }
  if (kind === 'RESOLVE') {
    return { ...base, requirementId: 'quote-comparison-resolve-inputs', captureKey: QUOTE_FORM_CAPTURE_KEYS.RESOLVE, title: 'Record the provider’s answer',
      question: 'What did the provider answer?', helpText: 'Record what you were told. It marks the question answered.',
      inputSchema: { type: 'GROUP', fields: [{ key: 'response', label: 'The answer', required: true, inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } }] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: clean(entered), destinationLabel: 'Recorded with the question after confirmation' };
  }
  if (kind === 'CLOSE') {
    return { ...base, requirementId: 'quote-comparison-close-inputs', captureKey: QUOTE_FORM_CAPTURE_KEYS.CLOSE, title: 'Close this quote decision',
      question: 'How are you leaving this decision?', helpText: 'Closing ends this comparison; revised quotes start a new one. Nothing is cancelled or sent.',
      inputSchema: { type: 'GROUP', fields: [
        { key: 'outcome', label: 'Outcome', required: true, inputSchema: { type: 'SINGLE_SELECT', options: QUOTE_CLOSE_OUTCOMES.map((value) => ({ label: QUOTE_CLOSE_OUTCOME_LABELS[value], value })) } },
        { key: 'reason', label: 'Why (optional)', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
      ] } as unknown as AskCaptureRequest['inputSchema'],
      currentAnswer: clean(entered), destinationLabel: 'Closes the decision after confirmation' };
  }
  const isEdit = kind === 'EDIT';
  return {
    ...base, requirementId: isEdit ? 'quote-comparison-edit-inputs' : 'quote-comparison-add-inputs', captureKey: isEdit ? QUOTE_FORM_CAPTURE_KEYS.EDIT : QUOTE_FORM_CAPTURE_KEYS.ADD,
    title: isEdit ? `Change ${quote?.vendorName ?? 'this'} proposal` : 'Add a proposal',
    question: isEdit ? 'What should change?' : 'What did the provider quote?',
    helpText: isEdit
      ? 'Change only what is wrong. Saving a change clears the confirmed facts, selection and rejections for this comparison so it can be reviewed again.'
      : 'Enter what is on the quote. Nothing is saved until you confirm, and a proposal is not compared until its scope facts are confirmed.',
    inputSchema: { type: 'GROUP', fields: [
      text('vendorName', 'Provider', 300, true),
      { key: 'quoteAmount', label: 'Total quoted ($)', required: true, inputSchema: { type: 'NUMBER', min: 0, max: 100_000_000 } },
      { key: 'scopeSummary', label: 'What the quote covers', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 4000 } },
      { key: 'quoteDate', label: 'Quote date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
      { key: 'expirationDate', label: 'Quote expires', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      text('warranty', 'Warranty', 500),
      { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered), destinationLabel: 'Used to prepare this change; nothing is saved until you confirm',
  };
}

export async function quoteCommandResult(userId: string, propertyId: string, launch: QuoteCommandLaunch, supplied?: QuoteFormData): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const kind = launch.kind;
  const detail = (label: string, value: string | null) => (value ? [{ label, value }] : []);
  const date = (value: string | null) => (value ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
  const launchParameters = { quoteCommandLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } };

  // ── the commands that target the decision ───────────────────────────────────────────────────────────────────────────────────────────────────
  if (quoteCommandTargetsWorkspace(kind)) {
    const workspace = await loadWorkspace(propertyId, launch.entityId);
    if (!workspace) return unavailable('QUOTE_WORKSPACE_NOT_FOUND', 'That comparison is no longer available', 'Ask could not find that quote comparison for this home. Nothing has changed.');
    // Outcome sharing is the owner's own data-sharing choice (as on Desktop), and it stays available on a closed decision: the figures it covers arrive after the work.
    if (kind === 'CONSENT') {
      if (access.role !== HouseholdRole.OWNER) {
        return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'quote-consent-owner-only', title: 'Only the owner can change this', body: `${SERVICE_QUOTE_OUTCOME_CONSENT_COPY.ownerOnly} Nothing has changed.`, tone: 'CAUTION', actions: [backToReview] }], suggestions: [] };
      }
      const contextVersion = quoteCommandContextVersion(workspace);
      const turnOn = !(await outcomeConsentOn(propertyId, workspace.id));
      const title = turnOn ? 'Share the outcome of this quote decision?' : 'Stop sharing the outcome of this quote decision?';
      const description = turnOn
        ? `${SERVICE_QUOTE_OUTCOME_CONSENT_COPY.scope} ${SERVICE_QUOTE_OUTCOME_CONSENT_COPY.exclusions} ${SERVICE_QUOTE_OUTCOME_CONSENT_COPY.revocation}`
        : 'This stops future capture of the final price and change-order totals. It does not affect recommendations or booking, and you can turn it on again later.';
      return {
        status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_CONSENT_CONFIRMATION_REQUIRED', contextVersion,
        parameters: { quoteConsent: { consented: turnOn }, quoteCommand: { kind, entityId: workspace.id }, quoteCommandContextVersion: contextVersion, ...base },
        blocks: [{ type: 'SUMMARY', id: 'quote-consent-review', title, body: 'Nothing changes until you confirm. This is your choice alone and is not needed to use the comparison.', tone: 'DEFAULT', actions: [] }],
        confirmation: {
          confirmationId: `quote-consent-${sha(`${propertyId}:${workspace.id}:${turnOn}`).slice(0, 12)}-1`, version: 1, title, description,
          fields: [
            { label: 'Shared if you agree', value: 'The final price and material change-order totals, after completed work' },
            { label: 'Never included', value: 'Estimates, contractor notes and quote text' },
            { label: 'Policy', value: SERVICE_QUOTE_OUTCOME_POLICY_VERSION },
          ],
          editableFields: [], confirmLabel: turnOn ? 'Share outcome' : 'Stop sharing',
          consentText: turnOn ? 'I choose to share the final price and change-order totals of this quote decision to improve price guidance.' : 'I choose to stop sharing the outcome of this quote decision.',
          expiresAt: expiresAt.toISOString(),
        },
        suggestions: [],
      };
    }
    if (workspace.outcome !== 'OPEN') return unavailable('QUOTE_WORKSPACE_CLOSED', 'This quote decision is closed', `${closedMessage} Nothing has changed.`);
    const contextVersion = quoteCommandContextVersion(workspace);
    const formKind: QuoteFormKind = kind === 'CLOSE' ? 'CLOSE' : kind === 'IMPORT' ? 'IMPORT' : 'ADD';
    if (kind === 'IMPORT') {
      if (lockedStages.includes(workspace.journeyStage)) return unavailable('QUOTE_PROPOSALS_LOCKED', 'Proposal controls are locked', 'Proposals cannot be changed after final-term review begins. Nothing has changed.');
      const records = await importableRecords(propertyId, access.role);
      if (!records.length) {
        return unavailable('QUOTE_NO_DOCUMENT_ON_FILE', 'No quote is on file to add',
          'Add the quote to your home records as a quote or estimate first, shared with your household, then come back. Ask cannot upload a file. Nothing has changed.');
      }
      const contextVersion = quoteCommandContextVersion(workspace);
      const choice = supplied as QuoteImportInput | undefined;
      if (!choice) {
        return {
          status: 'NEEDS_CONTEXT', reasonCode: 'QUOTE_IMPORT_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
          blocks: [{ type: 'SUMMARY', id: 'quote-import-input', title: 'Add a proposal from a document', body: 'Nothing has been saved yet. Choose the document, then review what will happen.', tone: 'DEFAULT', actions: [] }],
          captureRequests: [formCapture('IMPORT', contextVersion, undefined, undefined, records)], suggestions: [],
        };
      }
      const record = records.find((entry) => entry.id === choice.recordId);
      if (!record) return unavailable('QUOTE_IMPORT_DOCUMENT_NOT_OFFERED', 'Choose a document from the list', 'That document is not one your whole household can see, or it is not a quote on file. Nothing has changed.');
      const earlier = await database.quoteHomeRecordSource.findMany({
        where: { workspaceId: workspace.id, propertyRecordId: record.id, supersededByQuoteId: null }, select: { quoteId: true, propertyRecordVersionId: true },
      }) as Array<{ quoteId: string; propertyRecordVersionId: string | null }>;
      if (earlier.some((entry) => entry.propertyRecordVersionId === record.currentVersionId)) {
        return unavailable('QUOTE_ALREADY_IMPORTED', 'That document is already in this comparison', 'Its current version is already one of your proposals. Nothing has changed.');
      }
      if (earlier.length && !choice.onNewerVersion) {
        return {
          status: 'NEEDS_CONTEXT', reasonCode: 'QUOTE_IMPORT_VERSION_CHOICE_REQUIRED', contextVersion, parameters: launchParameters,
          blocks: [{ type: 'SUMMARY', id: 'quote-import-choice', title: 'An earlier version is already here', body: 'Choose whether the new version replaces that proposal or sits beside it.', tone: 'CAUTION', actions: [] }],
          captureRequests: [formCapture('IMPORT', contextVersion, { recordId: record.id }, undefined, records, true)], suggestions: [],
        };
      }
      return {
        status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_IMPORT_CONFIRMATION_REQUIRED', contextVersion,
        parameters: { quoteImport: { recordId: record.id, onNewerVersion: earlier.length ? choice.onNewerVersion : null }, quoteCommand: { kind: 'IMPORT', entityId: workspace.id }, quoteCommandContextVersion: contextVersion, ...base },
        blocks: [{ type: 'SUMMARY', id: 'quote-import-review', title: `Add a proposal from ${record.title}?`, body: 'Nothing is read or saved until you confirm.', tone: 'DEFAULT', actions: [] }],
        confirmation: {
          confirmationId: `quote-import-${sha(`${propertyId}:${workspace.id}:${record.id}:${record.currentVersionId}`).slice(0, 12)}-1`, version: 1, title: `Add a proposal from ${record.title}?`,
          description: 'Ask reads this document and adds what it finds as a proposal. Nothing is confirmed: you review every value afterwards and confirm them yourself. If the document does not show a provider and a price, no proposal is made. Nobody is contacted.',
          fields: [{ label: 'Document', value: record.title }, { label: 'Kind', value: RECORD_TYPE_LABELS[record.recordType] ?? 'Document' },
            ...(earlier.length ? [{ label: 'Earlier version here', value: choice.onNewerVersion === 'REPLACE' ? 'Replace that proposal' : 'Keep both' }] : [])],
          editableFields: [], confirmLabel: 'Read and add', consentText: 'I authorize adding a proposal read from this document to the shared quote comparison.', expiresAt: expiresAt.toISOString(),
        },
        captureRequests: [formCapture('IMPORT', contextVersion, choice as unknown as Record<string, unknown>, undefined, records, earlier.length > 0)], suggestions: [],
      };
    }
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: kind === 'CLOSE' ? 'QUOTE_CLOSE_INPUT_REQUIRED' : 'QUOTE_ADD_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'quote-command-input', title: kind === 'CLOSE' ? 'Close this quote decision' : 'Add a proposal', body: 'Nothing has been saved yet. Enter the details, then review them before they are saved.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture(formKind, contextVersion)], suggestions: [],
      };
    }
    if (kind === 'CLOSE') {
      const closing = supplied as { outcome: 'DECLINED' | 'DEFERRED'; reason: string | null };
      return {
        status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_CLOSE_CONFIRMATION_REQUIRED', contextVersion,
        parameters: { quoteClose: closing, quoteCommand: { kind, entityId: workspace.id }, quoteCommandContextVersion: contextVersion, ...base },
        blocks: [{ type: 'SUMMARY', id: 'quote-close-review', title: 'Review closing this decision', body: 'Nothing is closed until you confirm.', tone: 'CAUTION', actions: [] }],
        confirmation: {
          confirmationId: `quote-close-${sha(`${propertyId}:${workspace.id}:${closing.outcome}`).slice(0, 12)}-1`, version: 1, title: 'Close this quote decision?',
          description: 'This ends the comparison. It does not cancel anything or contact any provider; revised quotes start a new comparison.',
          fields: [{ label: 'Outcome', value: QUOTE_CLOSE_OUTCOME_LABELS[closing.outcome] ?? closing.outcome }, ...detail('Why', closing.reason)],
          editableFields: [], confirmLabel: 'Close decision', consentText: 'I authorize closing this shared quote decision.', expiresAt: expiresAt.toISOString(),
        },
        captureRequests: [formCapture('CLOSE', contextVersion, closing)], suggestions: [],
      };
    }
    const proposal = supplied as QuoteAddInput;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_ADD_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { quoteAdd: proposal, quoteCommand: { kind: 'ADD', entityId: workspace.id }, quoteCommandContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'quote-add-review', title: 'Review this proposal', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `quote-add-${sha(`${propertyId}:${workspace.id}:${proposal.vendorName}:${proposal.quoteAmount}`).slice(0, 12)}-1`, version: 1,
        title: `Add ${proposal.vendorName}'s proposal?`,
        description: 'This records the proposal in the quote comparison. It does not select a provider, accept the quote or contact anyone.',
        fields: [
          { label: 'Provider', value: proposal.vendorName }, { label: 'Total quoted', value: money(proposal.quoteAmount) },
          ...detail('Covers', proposal.scopeSummary), ...detail('Quote date', date(proposal.quoteDate)), ...detail('Expires', date(proposal.expirationDate)),
          ...detail('Warranty', proposal.warranty), ...detail('Notes', proposal.notes),
        ],
        editableFields: [], confirmLabel: 'Add proposal', consentText: 'I authorize adding this proposal to the shared quote comparison.', expiresAt: expiresAt.toISOString(),
      },
      captureRequests: [formCapture('ADD', contextVersion, proposal as unknown as Record<string, unknown>)], suggestions: [],
    };
  }

  // ── the commands that target one proposal ───────────────────────────────────────────────────────────────────────────────────────────────────
  const loaded = await loadQuote(propertyId, launch.entityId);
  if (!loaded) return unavailable('QUOTE_NOT_FOUND', 'That proposal is no longer available', 'Ask could not find that proposal. It may have been removed. Nothing has changed.');
  const { quote, workspace } = loaded;
  if (workspace.outcome !== 'OPEN') return unavailable('QUOTE_WORKSPACE_CLOSED', 'This quote decision is closed', `${closedMessage} Nothing has changed.`);
  if (kind !== 'SELECT' && kind !== 'EDIT' && kind !== 'CONFIRM' && lockedStages.includes(workspace.journeyStage)) {
    return unavailable('QUOTE_PROPOSALS_LOCKED', 'Proposal controls are locked', 'Proposals cannot be changed after final-term review begins. Nothing has changed.');
  }
  const contextVersion = quoteCommandContextVersion(workspace, quote);
  const amount = Number(quote.quoteAmount);
  const fields = [{ label: 'Provider', value: quote.vendorName }, ...(Number.isFinite(amount) ? [{ label: 'Total quoted', value: money(amount) }] : [])];
  const confirmation = (title: string, description: string, confirmLabel: string, extra: Array<{ label: string; value: string }> = [], tone: 'DEFAULT' | 'CAUTION' = 'DEFAULT',
    parameters: Record<string, unknown> = {}, capture?: AskCaptureRequest): AskOperationResult => ({
    status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_COMMAND_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { quoteCommand: { kind, entityId: quote.id }, quoteCommandContextVersion: contextVersion, ...parameters, ...base },
    blocks: [{ type: 'SUMMARY', id: 'quote-command-review', title, body: description, tone, actions: [] }],
    confirmation: {
      confirmationId: `quote-command-${sha(`${propertyId}:${kind}:${quote.id}:${JSON.stringify(parameters)}`).slice(0, 12)}-1`, version: 1, title, description, fields: [...fields, ...extra],
      editableFields: [], confirmLabel, consentText: 'I authorize this change to the shared quote comparison.', expiresAt: expiresAt.toISOString(),
    },
    ...(capture ? { captureRequests: [capture] } : {}),
    suggestions: [],
  });

  if (kind === 'SELECT') {
    if (quote.readinessStage !== 'COMPARISON_READY') {
      return unavailable('QUOTE_NOT_COMPARISON_READY', 'This proposal cannot be selected yet',
        'Only a comparison-ready proposal can be selected: its scope facts must be confirmed first. Use Confirm the facts on the proposal once they are right. Nothing has changed.');
    }
    const comparability = await getWorkspaceComparability(propertyId, workspace.id);
    if (comparability.status !== 'COMPARABLE' || !comparability.eligibleQuoteIds.includes(quote.id)) {
      return unavailable('QUOTE_NOT_COMPARABLE', 'This proposal is not part of a comparable set yet',
        `${comparability.reasons.join(' ') || 'The recorded proposals are not safely comparable.'} Nothing has changed.`);
    }
    return confirmation(`Select ${quote.vendorName}'s proposal?`,
      'This records your choice for the next decision stage and clears any earlier choice. It does not accept the quote, book anyone or contact the provider.', 'Select proposal');
  }
  if (kind === 'REJECT') {
    return confirmation(`Reject ${quote.vendorName}'s proposal?`,
      quote.isSelected ? 'This is the selected proposal: rejecting it clears the selection. You can return it to consideration later.' : 'It stays in the record and can be returned to consideration later.',
      'Reject proposal', [], 'CAUTION');
  }
  if (kind === 'RESTORE') return confirmation(`Return ${quote.vendorName}'s proposal to consideration?`, 'The proposal is considered again with the others.', 'Return to consideration');
  if (kind === 'REMOVE') {
    return confirmation(`Remove ${quote.vendorName}'s proposal?`, 'The proposal and its recorded facts are deleted from this comparison. This cannot be undone.', 'Remove proposal', [], 'CAUTION');
  }
  if (kind === 'CONFIRM') {
    if (quote.homeownerConfirmedAt) {
      return unavailable('QUOTE_ALREADY_CONFIRMED', 'These facts are already confirmed', 'You confirmed this proposal’s facts earlier. Change the proposal to re-confirm it after a correction. Nothing has changed.');
    }
    // The confirmation contract (FRD v1.360): every value a confirmation would affirm is shown before it, and the request names exactly those values.
    const { review } = await getQuoteReview(propertyId, workspace.id, quote.id);
    if (review.lineItems.length > 100 || review.terms.length > 100) {
      return unavailable('QUOTE_TOO_LARGE_TO_REVIEW', 'This proposal is too long to review here',
        'It has more than 100 line items or terms, so Ask cannot show every value before you confirm. Nothing has changed.');
    }
    const result = confirmation(`Confirm ${quote.vendorName}'s facts?`,
      `You are saying every value listed below matches the quote you were given: ${review.counts.lineItems} line item${review.counts.lineItems === 1 ? '' : 's'}, ${review.counts.terms} term${review.counts.terms === 1 ? '' : 's'} and the headline facts. `
      + 'Nothing that is not listed is confirmed. Ask cannot change or remove a line item or term; if something listed is wrong, do not confirm, and change the proposal first. A proposal is compared only once its facts are confirmed.',
      'Confirm everything listed',
      [{ label: 'Line items', value: String(review.counts.lineItems) }, { label: 'Terms', value: String(review.counts.terms) },
        { label: 'Still as extracted', value: String(review.counts.unconfirmed) }, { label: 'Corrected by you', value: String(review.counts.corrected) }],
      'DEFAULT',
      { quoteReviewRequest: {
        reviewFingerprint: review.fingerprint, lineItemIds: review.lineItems.map((item) => item.id), termIds: review.terms.map((term) => term.id),
        factKeys: review.facts.map((fact) => fact.fieldKey), rejectedLineItemIds: [], rejectedTermIds: [],
      } });
    result.blocks.push(reviewValuesBlock(review));
    return result;
  }
  if (kind === 'CLARIFY') {
    const current = quote.clarifications.filter((entry) => entry.status === 'OPEN').length;
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'QUOTE_CLARIFY_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'quote-clarify-input', title: `Ask ${quote.vendorName} a question`, body: `${current ? `${current} question${current === 1 ? ' is' : 's are'} already open. ` : ''}The question is recorded with the proposal; it is not sent to the provider.`, tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('CLARIFY', contextVersion, undefined, quote)], suggestions: [],
      };
    }
    const { question } = supplied as { question: string };
    return confirmation(`Record a question for ${quote.vendorName}?`, 'The question is saved with the proposal for your household and the decision returns to scope review. Nothing is sent.', 'Record question',
      [{ label: 'Question', value: question }], 'DEFAULT', { quoteClarify: { question } }, formCapture('CLARIFY', contextVersion, { question }, quote));
  }
  if (kind === 'RESOLVE') {
    const open = openClarification(quote);
    if (!open) return unavailable('QUOTE_NO_OPEN_QUESTION', 'No open question on this proposal', 'There is no unanswered question to record an answer for. Nothing has changed.');
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'QUOTE_RESOLVE_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'quote-resolve-input', title: `Record ${quote.vendorName}'s answer`, body: `Question: ${open.question}`, tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('RESOLVE', contextVersion, undefined, quote)], suggestions: [],
      };
    }
    const { response } = supplied as { response: string };
    return confirmation(`Record the answer to this question?`, 'The answer is saved and the question is marked resolved.', 'Record answer',
      [{ label: 'Question', value: open.question }, { label: 'Answer', value: response }], 'DEFAULT', { quoteResolve: { response, clarificationId: open.id } },
      formCapture('RESOLVE', contextVersion, { response }, quote));
  }

  // EDIT
  const before = currentValues(quote);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'QUOTE_EDIT_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'quote-edit-input', title: `Change ${quote.vendorName}'s proposal`, body: 'The form shows what is recorded. Change what is wrong, then review the changes before they are saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture('EDIT', contextVersion, before as unknown as Record<string, unknown>, quote)], suggestions: [],
    };
  }
  const changes = quoteEditChanges(before, supplied as QuoteAddInput);
  if (!changes.length) {
    return unavailable('QUOTE_EDIT_NO_CHANGE', 'Nothing to change', 'The details match what is already recorded. Nothing has changed.');
  }
  const show = (change: { field: string; before: string | null; after: string | null }, side: 'before' | 'after') => {
    const raw = change[side];
    if (raw === null) return 'None';
    if (change.field === 'quoteAmount') return money(Number(raw));
    if (change.field === 'quoteDate' || change.field === 'expirationDate') return date(raw) ?? raw;
    return raw;
  };
  return confirmation(`Save these changes to ${quote.vendorName}'s proposal?`,
    'Saving clears the confirmed facts of this proposal and the selection and rejections across this comparison, so the proposals can be reviewed again together.', 'Save changes',
    changes.map((change) => ({ label: change.label, value: `${show(change, 'before')} → ${show(change, 'after')}` })), 'CAUTION',
    { quoteEdit: supplied }, formCapture('EDIT', contextVersion, supplied as unknown as Record<string, unknown>, quote));
}

registerCapabilityHandler('quote-comparison.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = quoteCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'QUOTE_COMPARISON_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  const entityType = quoteCommandTargetsWorkspace(kind) ? QUOTE_WORKSPACE_ENTITY_TYPE : QUOTE_ENTITY_TYPE;
  if (launch.entityType !== entityType) return notRoutable();
  return quoteCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

/** The partial update the canonical updateQuoteProposal takes: only the changed fields, and the whole terms list only when the warranty changed. */
function editUpdateInput(quote: QuoteRow, next: QuoteAddInput) {
  const before = currentValues(quote);
  const changed = new Set(quoteEditChanges(before, next).map((change) => change.field));
  const input: Record<string, unknown> = {};
  if (changed.has('vendorName')) input.vendorName = next.vendorName;
  if (changed.has('quoteAmount')) input.quoteAmount = next.quoteAmount;
  if (changed.has('scopeSummary')) input.scopeSummary = next.scopeSummary;
  if (changed.has('quoteDate')) input.quoteDate = next.quoteDate ? `${next.quoteDate}T12:00:00.000Z` : null;
  if (changed.has('expirationDate')) input.expirationDate = next.expirationDate ? `${next.expirationDate}T12:00:00.000Z` : null;
  if (changed.has('notes')) input.notes = next.notes;
  if (changed.has('warranty')) {
    const others = quote.terms.filter((term) => term.type !== 'WARRANTY').map((term) => ({ type: term.type, label: term.label, value: term.value, included: term.included }));
    input.terms = [...others, ...(next.warranty ? [{ type: 'WARRANTY', label: 'Warranty', value: next.warranty, included: null }] : [])];
  }
  return input;
}

async function confirmQuoteCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.quoteCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as QuoteCommandKind | undefined;
  if (!kind || !(kind in QUOTE_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = command.entityId;

  // Re-read the records the confirmation was prepared against; refuse if either changed while it was open.
  let workspace: WorkspaceRow | null;
  let quote: QuoteRow | null = null;
  if (quoteCommandTargetsWorkspace(kind)) {
    workspace = await loadWorkspace(propertyId, entityId);
  } else {
    const loaded = await loadQuote(propertyId, entityId);
    workspace = loaded?.workspace ?? null;
    quote = loaded?.quote ?? null;
    if (!quote) throw stale('That proposal is no longer available.');
  }
  if (!workspace) throw stale('That comparison is no longer available.');
  if (parameters.quoteCommandContextVersion !== quoteCommandContextVersion(workspace, quote)) {
    throw stale('This comparison changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }

  try {
    // The same applicability gate the desktop routes run before every change.
    await assertProjectComplianceDecisionsApplicable(propertyId, userId, 'QUOTE_COMPARISON',
      { serviceCategory: (workspace.serviceCategory ?? 'UNSPECIFIED') as never }, ['quoteComparison', 'providerBooking']);

    let title: string; let description: string; let artifactType = 'QUOTE_COMPARISON_QUOTE'; let artifactId = entityId;
    const details: Array<{ label: string; value: string }> = quote ? [{ label: 'Provider', value: quote.vendorName }] : [];
    if (kind === 'ADD') {
      const checked = parseQuoteAddAnswer(parameters.quoteAdd);
      if (!checked.success) throw stale('The proposal to add is invalid.');
      const created = await createQuoteProposal(propertyId, workspace.id, quoteAddProposalInput(checked.data) as never);
      emitServiceQuoteDecisionAnalytics({
        eventName: ServiceQuoteDecisionEvent.INTAKE_RECORDED, userId, propertyId, workspaceId: workspace.id,
        metadata: {
          intakeType: 'manual_quote', surface: 'ask', readinessStage: created.readinessStage, readinessScore: created.readinessScore,
          missingFactCount: Array.isArray(created.missingFactsJson) ? created.missingFactsJson.length : 0,
        },
      });
      artifactId = created.id;
      title = 'Proposal added';
      description = created.readinessStage === 'COMPARISON_READY'
        ? 'The proposal is comparison-ready.'
        : 'The proposal is saved. It is not compared until its scope facts are confirmed.';
      details.push({ label: 'Provider', value: checked.data.vendorName }, { label: 'Total quoted', value: money(checked.data.quoteAmount) });
    } else if (kind === 'IMPORT') {
      const stored = parameters.quoteImport as { recordId?: unknown; onNewerVersion?: unknown } | undefined;
      const checked = parseQuoteFormAnswer('IMPORT', stored);
      if (!checked.success) throw stale('The document to add is invalid.');
      const choice = checked.data as QuoteImportInput;
      // Loaded here, not at the top: the import pulls in the document analyzer, which needs its model key to load.
      const { createQuoteProposalFromRecord } = await import('../../quoteHomeRecordImport.service');
      const imported = await createQuoteProposalFromRecord({
        propertyId, workspaceId: workspace.id, userId, role: ctx.access.role as HouseholdRole, recordId: choice.recordId, onNewerVersion: choice.onNewerVersion,
      });
      artifactId = imported.quote.id;
      details.push({ label: 'Provider', value: imported.quote.vendorName });
      title = imported.alreadyImported ? 'That document was already in the comparison' : 'Proposal added from the document';
      description = imported.alreadyImported
        ? 'Its current version is already one of your proposals. Nothing was added.'
        : `${(imported.quote.lineItems ?? []).length} line item${(imported.quote.lineItems ?? []).length === 1 ? '' : 's'} and ${(imported.quote.terms ?? []).length} term${(imported.quote.terms ?? []).length === 1 ? '' : 's'} were read. Nothing is confirmed yet: use Confirm the facts on the proposal to review every value.`;
    } else if (kind === 'CONSENT') {
      const stored = parameters.quoteConsent as { consented?: unknown } | undefined;
      if (ctx.access.role !== HouseholdRole.OWNER) throw stale(SERVICE_QUOTE_OUTCOME_CONSENT_COPY.ownerOnly);
      if (typeof stored?.consented !== 'boolean') throw stale('The sharing choice is invalid.');
      if (stored.consented === await outcomeConsentOn(propertyId, workspace.id)) throw stale('Outcome sharing is already set that way. Review it again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      await setServiceQuoteOutcomeMeasurementConsent(propertyId, workspace.id, userId, { consented: stored.consented, ...SERVICE_QUOTE_OUTCOME_CONSENT_FIELDS, policyVersion: SERVICE_QUOTE_OUTCOME_POLICY_VERSION });
      artifactType = 'QUOTE_COMPARISON_WORKSPACE';
      title = stored.consented ? 'Outcome sharing is on' : 'Outcome sharing is off';
      description = stored.consented
        ? 'The final price and change-order totals will be captured after completed work. You can turn this off at any time.'
        : 'Future capture has stopped. Recommendations and booking are unaffected.';
      details.push({ label: 'Policy', value: SERVICE_QUOTE_OUTCOME_POLICY_VERSION });
    } else if (kind === 'CLOSE') {
      const checked = parseQuoteFormAnswer('CLOSE', parameters.quoteClose);
      if (!checked.success) throw stale('The way to close this decision is invalid.');
      const closing = checked.data as { outcome: 'DECLINED' | 'DEFERRED'; reason: string | null };
      await transitionQuoteDecision(propertyId, workspace.id, userId, { toStage: 'CLOSED', outcome: closing.outcome, reason: closing.reason });
      artifactType = 'QUOTE_COMPARISON_WORKSPACE';
      title = 'Quote decision closed'; description = 'The comparison is closed. Nothing was cancelled or sent; revised quotes start a new comparison.';
      details.push({ label: 'Outcome', value: QUOTE_CLOSE_OUTCOME_LABELS[closing.outcome] ?? closing.outcome });
    } else if (kind === 'SELECT') {
      await selectQuoteForDecision(propertyId, workspace.id, entityId, userId);
      title = 'Proposal selected'; description = 'Your choice is recorded for the next decision stage. Nothing was accepted or booked.';
    } else if (kind === 'REJECT' || kind === 'RESTORE') {
      await setQuoteProposalDisposition(propertyId, workspace.id, entityId, userId, kind === 'REJECT' ? 'REJECTED' : 'UNDECIDED');
      title = kind === 'REJECT' ? 'Proposal rejected' : 'Proposal returned to consideration';
      description = kind === 'REJECT' ? 'It stays in the record and can be returned later.' : 'It is considered with the others again.';
    } else if (kind === 'REMOVE') {
      await deleteQuoteProposal(propertyId, workspace.id, entityId, userId);
      title = 'Proposal removed'; description = 'The proposal was deleted from this comparison.';
    } else if (kind === 'CONFIRM') {
      const checkedRequest = confirmQuoteReviewSchema.safeParse(parameters.quoteReviewRequest);
      if (!checkedRequest.success) throw stale('What to confirm is no longer valid. Review the proposal again.');
      const confirmed = await confirmQuoteProposal(propertyId, workspace.id, entityId, userId, checkedRequest.data);
      emitServiceQuoteDecisionAnalytics({
        eventName: ServiceQuoteDecisionEvent.READINESS_ASSESSED, userId, propertyId, workspaceId: workspace.id,
        metadata: { readinessStage: confirmed.readinessStage, readinessScore: confirmed.readinessScore, homeownerConfirmed: true, surface: 'ask' },
      });
      title = 'Facts confirmed';
      description = confirmed.readinessStage === 'COMPARISON_READY'
        ? 'The proposal is comparison-ready.'
        : 'The facts are confirmed. The proposal still has facts missing before it can be compared.';
    } else if (kind === 'CLARIFY') {
      const checked = parseQuoteFormAnswer('CLARIFY', parameters.quoteClarify);
      if (!checked.success) throw stale('The question to record is invalid.');
      const created = await createQuoteClarification(propertyId, workspace.id, entityId, userId, (checked.data as { question: string }).question);
      emitServiceQuoteDecisionAnalytics({
        eventName: ServiceQuoteDecisionEvent.CLARIFICATION_REQUESTED, userId, propertyId, workspaceId: workspace.id,
        metadata: { quoteId: entityId, clarificationId: created.id, surface: 'ask' },
      });
      title = 'Question recorded'; description = 'It is saved with the proposal. Nothing was sent to the provider.';
      details.push({ label: 'Question', value: (checked.data as { question: string }).question });
    } else if (kind === 'RESOLVE') {
      const stored = parameters.quoteResolve as { response?: unknown; clarificationId?: unknown } | undefined;
      const checked = parseQuoteFormAnswer('RESOLVE', { response: stored?.response });
      if (!checked.success || typeof stored?.clarificationId !== 'string') throw stale('The answer to record is invalid.');
      await resolveQuoteClarification(propertyId, workspace.id, entityId, stored.clarificationId, userId, (checked.data as { response: string }).response);
      title = 'Answer recorded'; description = 'The question is marked resolved.';
      details.push({ label: 'Answer', value: (checked.data as { response: string }).response });
    } else {
      const checked = parseQuoteAddAnswer(parameters.quoteEdit);
      if (!checked.success) throw stale('The changes to save are invalid.');
      const update = editUpdateInput(quote!, checked.data);
      if (!Object.keys(update).length) throw stale('There is nothing to change.');
      const updated = await updateQuoteProposal(propertyId, workspace.id, entityId, userId, update as never);
      title = 'Proposal changed';
      description = updated.readinessStage === 'COMPARISON_READY'
        ? 'The changes are saved. Confirm the facts again before comparing.'
        : 'The changes are saved. The confirmed facts, selection and rejections in this comparison were cleared for review.';
    }

    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `QUOTE_COMMAND_${kind}_COMPLETED`,
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: `quote-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details,
        actions: [{ ...backToReview, label: 'See the comparison', style: 'PRIMARY' as const }],
      }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `quote-command-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    // The canonical service refuses with an APIError and a readable message (closed, locked, not comparable); carry it to the homeowner as is.
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('quote-comparison.command', confirmQuoteCommand);
