// Ask Cozy Stage 3, Phase 3 (implementation plan §9/§14 vertical-slice
// template; FRD §10 Turn Processing Contract, §14, §22).
//
// Orchestrates one turn's conversational-capture attempt: pre-filter →
// persist-first DomainEvent → bounded synchronous extraction attempt →
// claim-token-guarded candidate persistence → child AskExecution rows in
// NEEDS_CONFIRMATION. Deliberately imports nothing from
// askOrchestrator.service.ts (that file imports this module, one
// directionally, matching Phase 1's own CommonJS-circular-import
// precedent) -- it returns plain AskExecution rows; askOrchestrator.service.ts
// maps them to AskExecutionResponse with its own existing mapPersistedExecution.
//
// The "persist-first, then claim, then verify-before-commit" shape mirrors
// domainEventClaimToken.ts (apps/workers/src/lib/), which this module cannot
// import directly (that file lives in the workers app, not the shared
// backend code workers pulls in via @worker-shared) -- verifyClaimStillOwned
// below is a small, deliberate duplicate of that same one function, not a
// reimplementation of the whole claim/lease loop.
import { AskCaptureAttribution, AskExecutionStatus, HomeEventType, Prisma, WarrantyCategory } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { normalizeCaptureValue } from '../../../modules/propertyContext/application/capturePropertyFact';
import { FINANCING_CAPTURE_FACT_KEY } from '../../../modules/propertyContext/application/capturePropertyFinancingFact';
import type { AskCaptureRequest, AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { evaluateExtractionPreFilter } from './extractionPreFilter';
import { runStructuredExtraction, type ActiveDecisionThreadContext, type RecentDocumentContext, type RecentHomeEventContext } from './extractionContract';
import { ExtractionAttributionSchema, filterCandidatesPreservingWarrantyLinks, splitGoalCandidates } from './extractionCandidateSchema';
import type { CaptureConfirmExtractionCandidate, EventExtractionCandidate, EvidenceExtractionCandidate, ExtractionCandidate, FactExtractionCandidate, GoalExtractionCandidate, WarrantyExtractionCandidate } from './extractionCandidateSchema';
// Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21). None of
// these three create a circular import: SellHoldRentService,
// sellHoldRentDecisionFamilyAdapter, and PropertySaleCaseService all live
// outside services/ask/ and import nothing from it (verified by grep before
// wiring this in), so this file's own one-directional-import discipline
// (see this file's header) is preserved.
import { SellHoldRentService } from '../../sellHoldRent.service';
import { sellHoldRentDecisionFamilyAdapter } from '../../decisionPlatform/domainSnapshotAdapters';
import { PropertySaleCaseService } from '../../propertySaleCase.service';
import { decisionProgressBlock, whyNowBlock } from '../decisionThreadPresentationBlocks';
import { notifyDelayedCaptureCandidatesReady } from '../askNotificationContinuation.service';

const DOMAIN_EVENT_LEASE_MS = 15 * 60_000;
// FRD §10: "Step 8's synchronous portion has a strict timeout (~1.5s...)".
const INLINE_EXTRACTION_BUDGET_MS = 1_500;
const CONFIRMATION_WINDOW_MS = 30 * 60_000;
const CAPTURE_CHANNEL = 'ASK_CONVERSATIONAL_CAPTURE';
// Ask Cozy Stage 3, Phase 6 (implementation plan §12). Shared instance, same
// as askOrchestrator.service.ts's own module-level sellHoldRentService --
// this class's only constructor dependency (FinancialAssumptionService)
// defaults itself, so a plain instance is equivalent to a singleton here.
const sellHoldRentService = new SellHoldRentService();

export type PersistedCaptureExecution = Awaited<ReturnType<typeof prisma.askExecution.create>>;

export interface ConversationalCaptureInput {
  userId: string;
  sessionId: string;
  propertyId: string;
  parentExecutionId: string;
  message: string;
  contextVersion: string | null;
  // Stage 2's dedup rule (implementation plan §9's Work list; FRD §8.3),
  // narrowed for this slice: the caller passes true when the turn's own
  // routed operation already performed a material write this same turn
  // (e.g. MAINTENANCE_TASK_COMPLETE capturing its own cost field) -- full
  // per-field dedup across all 69 operations is not attempted here; see the
  // implementation plan's Phase 3 status section for what this narrower
  // rule deliberately does not cover.
  skipDueToRoutedCapture: boolean;
}

function confirmationExpiry(now: Date): Date {
  return new Date(now.getTime() + CONFIRMATION_WINDOW_MS);
}

// Code review finding (2026-09-13, [P1]): every edit previously rebuilt the
// confirmation card with a hardcoded `version: 1` -- identical to the
// version already stored from BEFORE the edit (and to every prior edit's
// own card), since `confirmAskExecution`'s only defense against a stale
// confirmation attempt is `expectedVersion !== input.confirmationVersion`
// (askOrchestrator.service.ts) with no separate confirmationId check in
// `SubmitAskConfirmationSchema`. A homeowner with an old, pre-edit card
// still rendered (a stale tab, a race with their own edit) could therefore
// submit that old card's `confirmationVersion` and have it accepted against
// the NEW, edited parameters -- authorizing values they never actually
// reviewed. Every edit now increments this past whatever was last stored,
// so a stale confirmationVersion is provably rejected by that existing
// check rather than trivially matching by coincidence.
function nextConfirmationVersion(parameters: Record<string, unknown>): number {
  const current = typeof parameters.confirmationVersion === 'number' ? parameters.confirmationVersion : 0;
  return current + 1;
}

// Code review finding (2026-09-13): a correction statement had nothing to
// resolve against -- extraction received no prior events at all. Bounded to
// a handful of the property's most recent CURRENT events, matching the
// "no unbounded context" convention used elsewhere in this program (FRD
// §26). Read-only, no write side effect, safe to call from both the inline
// and worker paths.
const RECENT_HOME_EVENT_CONTEXT_LIMIT = 8;

async function fetchRecentHomeEventContext(propertyId: string): Promise<RecentHomeEventContext[]> {
  const events = await prisma.homeEvent.findMany({
    where: { propertyId, isCurrent: true, deletedAt: null },
    orderBy: { occurredAt: 'desc' },
    take: RECENT_HOME_EVENT_CONTEXT_LIMIT,
    select: { id: true, title: true, occurredAt: true, amount: true },
  });
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    occurredAt: event.occurredAt.toISOString(),
    amount: event.amount != null ? Number(event.amount) : null,
  }));
}

// Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
// FRD §23's UPLOAD_EVIDENCE resolution). Same bounded-context shape as
// fetchRecentHomeEventContext above -- an EVIDENCE candidate's documentId
// must name one of these, never an invented id (extractionContract.ts's
// withValidDocumentReferences). Not filtered to "not yet attached to any
// event": a document already used as evidence elsewhere is still a valid
// thing to also cite for a newly-reported event (e.g. one invoice covering
// two repairs mentioned in the same message).
const RECENT_DOCUMENT_CONTEXT_LIMIT = 8;

async function fetchRecentDocumentContext(propertyId: string): Promise<RecentDocumentContext[]> {
  const documents = await prisma.document.findMany({
    where: { propertyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: RECENT_DOCUMENT_CONTEXT_LIMIT,
    select: { id: true, name: true, type: true },
  });
  return documents.map((document) => ({
    id: document.id,
    name: document.name,
    documentType: document.type,
  }));
}

// External review, 2026-09-13 (FRD §26; this file's own Phase 6 header
// comment on activeSellHoldRentGoalRelatedCapabilityIds-equivalent lookups
// -- see askNextActions.ts). Same bounded-context shape as
// fetchRecentHomeEventContext/fetchRecentDocumentContext above, reusing the
// SAME canonical, read-only, activeIdentityKey-backed lookup
// askNextActions.ts's own active-thread ranking bias already relies on
// (sellHoldRentDecisionFamilyAdapter.selectThread, confirmed read-only
// there). Returns null (not an error) when no active thread exists for this
// property, or on any lookup failure -- this is optional prompt context,
// never load-bearing for extraction to function. Scoped to the
// sell-hold-rent family only, matching every other Phase 6 GOAL-capture
// mechanism today.
async function fetchActiveDecisionThreadContext(propertyId: string): Promise<ActiveDecisionThreadContext | null> {
  try {
    const selection = await sellHoldRentDecisionFamilyAdapter.selectThread(propertyId, propertyId);
    if (selection.kind !== 'UNIQUE') return null;
    const thread = await prisma.decisionThread.findUnique({
      where: { id: selection.thread.decisionThreadId },
      select: {
        goalCode: true,
        factReferences: { select: { canonicalEntityType: true, canonicalFieldPath: true } },
        assumptions: { select: { assumptionKey: true, valueJson: true } },
        options: { select: { label: true } },
        questions: { where: { status: 'OPEN' }, select: { questionCode: true } },
      },
    });
    if (!thread) return null;
    return {
      goalCode: thread.goalCode,
      factReferences: thread.factReferences.map((reference) => reference.canonicalFieldPath ?? reference.canonicalEntityType),
      assumptions: thread.assumptions.map((assumption) => ({ key: assumption.assumptionKey, value: assumption.valueJson })),
      options: thread.options.map((option) => option.label),
      openQuestions: thread.questions.map((question) => question.questionCode),
    };
  } catch (error) {
    logger.warn({ error, propertyId }, '[ask-conversational-capture] active decision thread context lookup failed');
    return null;
  }
}

// Code review finding (2026-09-13): a FACT candidate's value was never
// validated before being proposed for confirmation -- an invalid number or
// enum value would pass through to a Save card that fails only when the
// homeowner confirms it, with no editing path to recover. Validate/normalize
// with the exact same per-factKey logic the confirm-time writer itself uses,
// so a candidate that would fail there is dropped here instead of proposed.
// Exported for direct unit testing (pure, no I/O).
export function isValidFactCandidateValue(candidate: FactExtractionCandidate): boolean {
  try {
    if (candidate.factKey === FINANCING_CAPTURE_FACT_KEY) {
      return typeof candidate.value === 'number' && candidate.value >= 0 && candidate.value <= 100;
    }
    normalizeCaptureValue(candidate.factKey, candidate.value);
    return true;
  } catch {
    return false;
  }
}

// Ask Cozy Stage 3, Phase 3 edit-before-confirm (implementation plan §22/
// FRD §22's own line: "candidate payload is editable via the existing
// captureRequests/suppliedInput mechanism before the confirm call, not a
// separate edit endpoint"). One captureRequest is attached to every capture
// candidate's own resultJson at creation time (below, in buildChildExecutionData)
// -- the SAME generic submitAskCapture()/AskCaptureReceipt plumbing every
// other operation's inline-capture edit already uses (askOrchestrator.service.ts),
// just newly extended to cover these three operations. Deliberately built
// off the STORED PARAMETERS SHAPE (the exact object persisted to
// parametersJson), not the ExtractionCandidate type -- this lets the exact
// same builder run both at creation time and after every edit, since an
// edited execution no longer has its original ExtractionCandidate object,
// only its (now updated) parameters.
//
// Scope decision, explicit not silent: date/date-precision fields (EVENT's
// occurredAt/datePrecision/dateRangeStart/dateRangeEnd, WARRANTY's
// startDate/expiryDate/durationMonths) are NOT editable in this pass --
// each has cross-field validation dependencies (a RANGE needs two
// consistent dates; a warranty's expiry is derived from either an explicit
// date or a duration) that would multiply this feature's surface
// considerably for comparatively low value against the FRD's own
// representative examples (which are cost/provider/value corrections, not
// date corrections). Left open for a follow-up pass.
function asParameterRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function factEditCaptureRequest(parameters: Record<string, unknown>, contextVersion: string): AskCaptureRequest {
  const value = parameters.value;
  const valueType = typeof value;
  const inputSchema = valueType === 'boolean'
    ? { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No' }
    : valueType === 'number'
      ? { type: 'DECIMAL' }
      : { type: 'SHORT_TEXT', maxLength: 500 };
  return {
    requirementId: 'capture-fact-edit',
    captureKey: 'CAPTURE_FACT_EDIT',
    classification: 'SCENARIO_INPUT',
    state: 'KNOWN',
    title: 'Edit before saving',
    question: `Is "${parameters.factKey}" correct?`,
    helpText: 'Change the value below, then confirm to save the corrected version.',
    inputSchema: { type: 'GROUP', fields: [{ key: 'value', label: 'Value', required: true, inputSchema }] },
    currentAnswer: { value },
    allowNotSure: false,
    sensitivity: 'STANDARD',
    destinationLabel: 'Used to correct this pending property-record entry before you confirm it',
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

const EVENT_EDITABLE_FIELD_DEFS: Record<'type' | 'title' | 'summary' | 'amount' | 'providerName', {
  label: string; required: boolean; inputSchema: unknown;
}> = {
  type: { label: 'Type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: Object.values(HomeEventType).map((value) => ({ label: value, value })) } },
  title: { label: 'Title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
  summary: { label: 'Details', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 500 } },
  amount: { label: 'Amount', required: false, inputSchema: { type: 'DECIMAL', min: 0, max: 10_000_000, unit: 'USD' } },
  providerName: { label: 'Provider', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
};
const EVENT_EDITABLE_KEYS = Object.keys(EVENT_EDITABLE_FIELD_DEFS) as Array<keyof typeof EVENT_EDITABLE_FIELD_DEFS>;

// null for a correction execution whose only corrected field(s) are outside
// this pass's editable set (e.g. correctedFields: ['date'] alone) -- there
// is nothing left to offer editing on, so no captureRequest is attached
// rather than one with an empty field list.
function eventEditCaptureRequest(parameters: Record<string, unknown>, contextVersion: string): AskCaptureRequest | null {
  const editableKeys = EVENT_EDITABLE_KEYS.filter((key) => key in parameters);
  if (editableKeys.length === 0) return null;
  const fields = editableKeys.map((key) => ({ key, label: EVENT_EDITABLE_FIELD_DEFS[key].label, required: EVENT_EDITABLE_FIELD_DEFS[key].required, inputSchema: EVENT_EDITABLE_FIELD_DEFS[key].inputSchema }));
  const currentAnswer = Object.fromEntries(editableKeys.map((key) => [key, parameters[key] ?? null]));
  return {
    requirementId: 'capture-event-edit',
    captureKey: 'CAPTURE_EVENT_EDIT',
    classification: 'SCENARIO_INPUT',
    state: 'KNOWN',
    title: 'Edit before saving',
    question: parameters.correctingEventId ? 'Is this correction accurate?' : 'Is this timeline entry accurate?',
    helpText: 'Change any field below, then confirm to save the corrected version. Date is not editable here.',
    inputSchema: { type: 'GROUP', fields },
    currentAnswer,
    allowNotSure: false,
    sensitivity: 'STANDARD',
    destinationLabel: 'Used to correct this pending home-timeline entry before you confirm it',
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

// Code review finding (2026-09-13, [P1]): startDate/expiryDate are now
// editable (previously excluded entirely, leaving no way to correct
// resolveWarrantyDates's own manufactured guess -- see its header). When
// `startDateApproximate` is set, the question/helpText call this out
// directly so the homeowner notices there's a guess to review, not just an
// optional field to leave alone.
function warrantyEditCaptureRequest(parameters: Record<string, unknown>, contextVersion: string): AskCaptureRequest {
  const startDateApproximate = Boolean(parameters.startDateApproximate);
  return {
    requirementId: 'capture-warranty-edit',
    captureKey: 'CAPTURE_WARRANTY_EDIT',
    classification: 'SCENARIO_INPUT',
    state: 'KNOWN',
    title: 'Edit before saving',
    question: startDateApproximate ? 'Is this warranty information accurate? The start date is an estimate -- please check it.' : 'Is this warranty information accurate?',
    helpText: 'Change any field below, then confirm to save the corrected version.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'providerName', label: 'Provider', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
      { key: 'category', label: 'Coverage type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: Object.values(WarrantyCategory).map((value) => ({ label: value, value })) } },
      { key: 'policyNumber', label: 'Policy number', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
      { key: 'coverageDetails', label: 'Coverage details', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 2000 } },
      { key: 'cost', label: 'Cost', required: false, inputSchema: { type: 'DECIMAL', min: 0, max: 10_000_000, unit: 'USD' } },
      { key: 'startDate', label: startDateApproximate ? 'Start date (estimated)' : 'Start date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
      { key: 'expiryDate', label: 'Expiration date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
    ] },
    currentAnswer: {
      providerName: parameters.providerName,
      category: parameters.category,
      policyNumber: parameters.policyNumber ?? null,
      coverageDetails: parameters.coverageDetails ?? null,
      cost: parameters.cost ?? null,
      startDate: typeof parameters.startDate === 'string' ? parameters.startDate.slice(0, 10) : null,
      expiryDate: typeof parameters.expiryDate === 'string' ? parameters.expiryDate.slice(0, 10) : null,
    },
    allowNotSure: false,
    sensitivity: 'STANDARD',
    destinationLabel: 'Used to correct this pending property-record entry before you confirm it',
    confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

function factConfirmationBlocksAndCard(candidate: FactExtractionCandidate, expiresAt: Date, index: number, version: number) {
  const confirmationId = `capture-fact-${candidate.factKey}-${index}-${expiresAt.getTime()}`;
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: `capture-fact-preview-${index}`,
      title: 'Save this to your property record?',
      body: `Cozy noticed you mentioned: "${candidate.sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version,
      title: 'Save this to your property record?',
      description: `Cozy noticed you mentioned: "${candidate.sourceSentence}". No change is saved until you confirm.`,
      fields: [
        { label: 'Fact', value: candidate.factKey },
        { label: 'Value', value: String(candidate.value) },
      ],
      confirmLabel: 'Save to property record',
      consentText: 'I confirm this is accurate and authorize ContractToCozy to save it to my property record.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

function eventConfirmationBlocksAndCard(candidate: EventExtractionCandidate, expiresAt: Date, index: number, version: number) {
  const confirmationId = `capture-event-${index}-${expiresAt.getTime()}`;
  // Code review finding (2026-09-13): a correction's card previously read
  // identically to a brand-new event, with no indication it would replace
  // an existing record -- matching confirmCaptureEvent's own new-vs-
  // corrected distinction (captureEventResult) at proposal time too.
  const isCorrection = Boolean(candidate.correctingEventId);
  const title = isCorrection ? 'Update this home timeline event?' : 'Add this to your home timeline?';
  // Code review finding (2026-09-13): a correction card now shows ONLY the
  // field(s) actually being changed, matching the sparse patch itself
  // (buildChildExecutionData) -- showing a generic "Event"/"Amount" summary
  // here would misleadingly imply the whole record was being restated.
  const fields: Array<{ label: string; value: string }> = [];
  if (isCorrection) {
    const corrected = new Set(candidate.correctedFields ?? []);
    if (corrected.has('title')) fields.push({ label: 'New title', value: candidate.title });
    if (corrected.has('amount') && candidate.amount != null) fields.push({ label: 'New amount', value: `$${candidate.amount.toLocaleString()}` });
    if (corrected.has('currency') && candidate.currency) fields.push({ label: 'New currency', value: candidate.currency });
    if (corrected.has('providerName') && candidate.providerName) fields.push({ label: 'New provider', value: candidate.providerName });
    if (corrected.has('date')) fields.push({ label: 'New date', value: candidate.occurredAt ?? candidate.dateRangeStart ?? 'Unknown' });
    if (corrected.has('summary') && candidate.summary) fields.push({ label: 'New details', value: candidate.summary });
    if (corrected.has('eventType')) fields.push({ label: 'New type', value: candidate.eventType });
    if (fields.length === 0) fields.push({ label: 'Event', value: candidate.title });
  } else {
    fields.push({ label: 'Event', value: candidate.title });
    if (candidate.amount != null) fields.push({ label: 'Amount', value: `$${candidate.amount.toLocaleString()}` });
    if (candidate.providerName) fields.push({ label: 'Provider', value: candidate.providerName });
  }
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: `capture-event-preview-${index}`,
      title,
      body: `Cozy noticed you mentioned: "${candidate.sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version,
      title,
      description: isCorrection
        ? `Cozy noticed you mentioned: "${candidate.sourceSentence}". This replaces the existing entry with a corrected revision; the original is kept as history. No change is saved until you confirm.`
        : `Cozy noticed you mentioned: "${candidate.sourceSentence}". No change is saved until you confirm.`,
      fields,
      confirmLabel: isCorrection ? 'Update timeline entry' : 'Add to timeline',
      consentText: isCorrection
        ? 'I confirm this correction is accurate and authorize ContractToCozy to update my home timeline.'
        : 'I confirm this is accurate and authorize ContractToCozy to add it to my home timeline.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22). resolvedStartDate/resolvedExpiryDate are passed in already
// resolved (buildChildExecutionData computes them, since defaulting
// startDate from the paired EVENT candidate needs that sibling's data, not
// just this candidate's own fields).
function warrantyConfirmationBlocksAndCard(
  candidate: WarrantyExtractionCandidate,
  expiresAt: Date,
  index: number,
  resolvedStartDate: Date,
  resolvedExpiryDate: Date,
  version: number,
  startDateApproximate: boolean,
) {
  const confirmationId = `capture-warranty-${index}-${expiresAt.getTime()}`;
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Provider', value: candidate.providerName },
    { label: 'Coverage', value: candidate.warrantyCategory },
    // Code review finding (2026-09-13, [P1]): never present a manufactured
    // guess (e.g. a RANGE-precision event's own dateRangeStart) as a stated
    // fact -- label it as an estimate instead of a plain "Start date".
    { label: startDateApproximate ? 'Start date (estimated -- please confirm)' : 'Start date', value: resolvedStartDate.toLocaleDateString() },
    { label: 'Expires', value: resolvedExpiryDate.toLocaleDateString() },
  ];
  if (candidate.policyNumber) fields.push({ label: 'Policy number', value: candidate.policyNumber });
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: `capture-warranty-preview-${index}`,
      title: 'Save this warranty to your property record?',
      body: `Cozy noticed you mentioned: "${candidate.sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version,
      title: 'Save this warranty to your property record?',
      description: `Cozy noticed you mentioned: "${candidate.sourceSentence}". No change is saved until you confirm.`,
      fields,
      confirmLabel: 'Save warranty',
      consentText: 'I confirm this is accurate and authorize ContractToCozy to save it to my property record.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

// Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
// FRD §23's UPLOAD_EVIDENCE resolution). documentName/linkedEventTitle are
// passed in already resolved -- mirrors warrantyConfirmationBlocksAndCard's
// own resolvedStartDate/resolvedExpiryDate pattern -- since describing what
// the evidence attaches to needs the paired EVENT candidate's own title, not
// just this candidate's fields. No edit support (deliberate, same scoping
// as GOAL candidates): there is nothing meaningful to edit about which
// already-uploaded document a stated fact refers to, only confirm or
// decline it.
function evidenceConfirmationBlocksAndCard(
  candidate: EvidenceExtractionCandidate,
  expiresAt: Date,
  index: number,
  documentName: string,
  linkedEventTitle: string,
  version: number,
) {
  const confirmationId = `capture-evidence-${index}-${expiresAt.getTime()}`;
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Document', value: documentName },
    { label: 'Attach to', value: linkedEventTitle },
  ];
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: `capture-evidence-preview-${index}`,
      title: 'Attach this document as evidence?',
      body: `Cozy noticed you mentioned: "${candidate.sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version,
      title: 'Attach this document as evidence?',
      description: `Cozy noticed you mentioned: "${candidate.sourceSentence}". No change is saved until you confirm.`,
      fields,
      confirmLabel: 'Attach document',
      consentText: 'I confirm this document is evidence for this home record entry.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

// Ask Cozy Stage 3, Phase 3 edit-before-confirm. Rebuilds the confirmation
// card after an edit directly from the MERGED parameters object (not a
// reconstructed ExtractionCandidate) -- an edited execution's original
// candidate object no longer exists, only its (now updated) parameters.
// isCorrection is read straight from parameters.correctingEventId, so the
// new-vs-corrected title/copy distinction (eventConfirmationBlocksAndCard's
// own design) still holds after an edit.
function eventEditConfirmationBlocksAndCard(mergedParameters: Record<string, unknown>, sourceSentence: string, expiresAt: Date, version: number) {
  const isCorrection = Boolean(mergedParameters.correctingEventId);
  const title = isCorrection ? 'Update this home timeline event?' : 'Add this to your home timeline?';
  const fields: Array<{ label: string; value: string }> = [];
  if (typeof mergedParameters.title === 'string') fields.push({ label: isCorrection ? 'New title' : 'Event', value: mergedParameters.title });
  if (typeof mergedParameters.type === 'string') fields.push({ label: isCorrection ? 'New type' : 'Type', value: mergedParameters.type });
  if (typeof mergedParameters.amount === 'number') fields.push({ label: isCorrection ? 'New amount' : 'Amount', value: `$${mergedParameters.amount.toLocaleString()}` });
  if (typeof mergedParameters.providerName === 'string' && mergedParameters.providerName) fields.push({ label: isCorrection ? 'New provider' : 'Provider', value: mergedParameters.providerName });
  if (typeof mergedParameters.summary === 'string' && mergedParameters.summary) fields.push({ label: isCorrection ? 'New details' : 'Details', value: mergedParameters.summary });
  if (fields.length === 0) fields.push({ label: 'Event', value: typeof mergedParameters.title === 'string' ? mergedParameters.title : 'Event' });
  const confirmationId = `capture-event-edit-${expiresAt.getTime()}`;
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: 'capture-event-edit-preview',
      title,
      body: `Cozy noticed you mentioned: "${sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version,
      title,
      description: isCorrection
        ? `Cozy noticed you mentioned: "${sourceSentence}". This replaces the existing entry with a corrected revision; the original is kept as history. No change is saved until you confirm.`
        : `Cozy noticed you mentioned: "${sourceSentence}". No change is saved until you confirm.`,
      fields,
      confirmLabel: isCorrection ? 'Update timeline entry' : 'Add to timeline',
      consentText: isCorrection
        ? 'I confirm this correction is accurate and authorize ContractToCozy to update my home timeline.'
        : 'I confirm this is accurate and authorize ContractToCozy to add it to my home timeline.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

// Code review finding (2026-09-13, [P1]): dates were previously read-only
// here (out of this pass's editable scope) with no way to correct a
// manufactured guess -- see resolveWarrantyDates's own header. Now
// editable; `startDateApproximate` is read straight off `mergedParameters`
// (set `false` by `editCaptureWarrantyCandidate` whenever the homeowner has
// just supplied/confirmed the date explicitly, so the estimate label
// disappears the moment it's no longer a guess).
function warrantyEditConfirmationBlocksAndCard(mergedParameters: Record<string, unknown>, sourceSentence: string, expiresAt: Date, version: number) {
  const startDateApproximate = Boolean(mergedParameters.startDateApproximate);
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Provider', value: typeof mergedParameters.providerName === 'string' ? mergedParameters.providerName : '' },
    { label: 'Coverage', value: typeof mergedParameters.category === 'string' ? mergedParameters.category : '' },
  ];
  if (typeof mergedParameters.policyNumber === 'string' && mergedParameters.policyNumber) fields.push({ label: 'Policy number', value: mergedParameters.policyNumber });
  if (typeof mergedParameters.cost === 'number') fields.push({ label: 'Cost', value: `$${mergedParameters.cost.toLocaleString()}` });
  if (typeof mergedParameters.startDate === 'string') fields.push({ label: startDateApproximate ? 'Start date (estimated -- please confirm)' : 'Start date', value: new Date(mergedParameters.startDate).toLocaleDateString() });
  if (typeof mergedParameters.expiryDate === 'string') fields.push({ label: 'Expires', value: new Date(mergedParameters.expiryDate).toLocaleDateString() });
  const confirmationId = `capture-warranty-edit-${expiresAt.getTime()}`;
  return {
    blocks: [{
      type: 'SUMMARY' as const,
      id: 'capture-warranty-edit-preview',
      title: 'Save this warranty to your property record?',
      body: `Cozy noticed you mentioned: "${sourceSentence}"`,
      tone: 'DEFAULT' as const,
      actions: [],
    }],
    confirmation: {
      confirmationId,
      version,
      title: 'Save this warranty to your property record?',
      description: `Cozy noticed you mentioned: "${sourceSentence}". No change is saved until you confirm.`,
      fields,
      confirmLabel: 'Save warranty',
      consentText: 'I confirm this is accurate and authorize ContractToCozy to save it to my property record.',
      expiresAt: expiresAt.toISOString(),
    },
  };
}

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22). Warranty.startDate/expiryDate are both required, non-nullable
// columns -- resolved here, once, from whichever the candidate stated
// directly plus the paired EVENT candidate's own date as the startDate
// fallback (a warranty is implicitly dated to when the covered item was
// installed/replaced, absent a separately-stated warranty start date).
// Exported for direct unit testing (pure, no I/O).
// Code review finding (2026-09-13, [P1]): this used to treat EVERY resolved
// startDate as equally trustworthy, including a RANGE-precision event's own
// `dateRangeStart` (e.g. "last summer" -> a fabricated exact "June 1")  or
// the `now` fallback -- silently manufacturing precision the homeowner
// never stated, contradicting the exact-date requirement `Warranty.startDate`
// (a required, non-nullable `DateTime` with no precision/uncertainty field
// of its own) is held to. `Warranty` has no way to STORE "approximate," so
// this can't be fixed by preserving imprecision the way `HomeEvent`'s own
// `datePrecision` does -- instead, `startDateApproximate` tells the
// confirmation card to say so honestly (never present a guess as a stated
// fact) and the edit form to let the homeowner correct it before
// confirming (previously not editable at all -- the second half of the
// same finding).
export interface ResolvedWarrantyDates {
  startDate: Date;
  expiryDate: Date;
  startDateApproximate: boolean;
}

export function resolveWarrantyDates(
  candidate: WarrantyExtractionCandidate,
  linkedEventCandidate: EventExtractionCandidate | null | undefined,
  now: Date,
): ResolvedWarrantyDates {
  let startDateIso: string;
  let startDateApproximate: boolean;
  if (candidate.startDate) {
    // Explicitly stated by the homeowner for the warranty itself -- exact.
    startDateIso = candidate.startDate;
    startDateApproximate = false;
  } else if (linkedEventCandidate?.occurredAt && linkedEventCandidate.datePrecision === 'EXACT_DATE') {
    // The paired event's own genuinely exact date -- not a guess.
    startDateIso = linkedEventCandidate.occurredAt;
    startDateApproximate = false;
  } else if (linkedEventCandidate?.occurredAt) {
    // MONTH/YEAR precision: occurredAt is only a best-guess anchor within
    // that month/year (per EventExtractionCandidateSchema's own prompt
    // convention), not a homeowner-stated exact day.
    startDateIso = linkedEventCandidate.occurredAt;
    startDateApproximate = true;
  } else if (linkedEventCandidate?.dateRangeStart) {
    startDateIso = linkedEventCandidate.dateRangeStart;
    startDateApproximate = true;
  } else {
    startDateIso = now.toISOString();
    startDateApproximate = true;
  }
  const startDate = new Date(startDateIso);
  if (candidate.expiryDate) return { startDate, expiryDate: new Date(candidate.expiryDate), startDateApproximate };
  // Schema refinement guarantees at least one of expiryDate/durationMonths
  // is present, so durationMonths is trusted here without a further guard.
  const expiryDate = new Date(startDate);
  expiryDate.setMonth(expiryDate.getMonth() + (candidate.durationMonths ?? 0));
  return { startDate, expiryDate, startDateApproximate };
}

// Code review finding (2026-09-13): a correction previously built a FULL
// new-event payload (every field explicitly set, often to a placeholder
// like datePrecision: UNKNOWN or providerName: null since the model must
// fill the schema's other required fields somehow) -- updateHomeEvent
// treats every explicitly-set field as an intentional change, so a
// $15,000-amount correction silently wiped the event's real date, provider,
// and summary back to defaults. For a NEW event (correctingEventId null),
// every content field is included, as before. For a CORRECTION, ONLY the
// field group(s) the model named in correctedFields are included; every
// other field is OMITTED (not set to null), so updateHomeEvent's own
// `patch.X !== undefined ? patch.X : existing.X` fallback preserves the
// original record's value untouched. Exported for direct unit testing.
export function buildEventContentParameters(candidate: EventExtractionCandidate, now: Date): Record<string, unknown> {
  const dateFields = () => ({
    // HomeEvent.occurredAt is a required, non-nullable column -- even a
    // RANGE/UNKNOWN-precision candidate needs a best-guess anchor.
    // datePrecision is what tells a reader not to trust this to the day.
    occurredAt: candidate.occurredAt ?? candidate.dateRangeStart ?? now.toISOString(),
    datePrecision: candidate.datePrecision,
    dateRangeStart: candidate.dateRangeStart ?? null,
    dateRangeEnd: candidate.dateRangeEnd ?? null,
  });

  if (!candidate.correctingEventId) {
    return {
      type: candidate.eventType,
      title: candidate.title,
      summary: candidate.summary ?? null,
      ...dateFields(),
      amount: candidate.amount ?? null,
      currency: candidate.amount != null ? (candidate.currency ?? 'USD') : null,
      providerName: candidate.providerName ?? null,
    };
  }

  const corrected = new Set(candidate.correctedFields ?? []);
  const sparse: Record<string, unknown> = {};
  if (corrected.has('eventType')) sparse.type = candidate.eventType;
  if (corrected.has('title')) sparse.title = candidate.title;
  if (corrected.has('summary')) sparse.summary = candidate.summary ?? null;
  if (corrected.has('date')) Object.assign(sparse, dateFields());
  if (corrected.has('amount')) sparse.amount = candidate.amount ?? null;
  if (corrected.has('currency')) sparse.currency = candidate.currency ?? null;
  if (corrected.has('providerName')) sparse.providerName = candidate.providerName ?? null;
  return sparse;
}

// Exported for direct unit testing (pure, no I/O -- takes `now` as a param
// rather than reading the clock itself). `linkedEventCandidate` is relevant
// for a WARRANTY candidate (its paired EVENT sibling, for
// resolveWarrantyDates's startDate fallback) and for an EVIDENCE candidate
// (its paired EVENT sibling's own title, for the confirmation card) --
// always undefined/omitted for FACT/EVENT. `recentDocuments` is only read
// for EVIDENCE, to resolve the confirmed document's own display name
// (this function stays pure/no-I/O, so the caller resolves it from the same
// bounded context already fetched for the extraction call itself).
export function buildChildExecutionData(
  candidate: CaptureConfirmExtractionCandidate,
  index: number,
  input: ConversationalCaptureInput,
  now: Date,
  linkedEventCandidate?: EventExtractionCandidate | null,
  recentDocuments?: readonly RecentDocumentContext[],
): Prisma.AskExecutionCreateInput {
  const expiresAt = confirmationExpiry(now);
  const confirmationVersion = 1;

  let operationId: 'CAPTURE_FACT_CONFIRM' | 'CAPTURE_EVENT_CONFIRM' | 'CAPTURE_WARRANTY_CONFIRM' | 'CAPTURE_EVIDENCE_CONFIRM';
  let reasonCode: string;
  let cards: { blocks: unknown[]; confirmation: unknown };
  let parameters: Record<string, unknown>;

  if (candidate.category === 'FACT') {
    operationId = 'CAPTURE_FACT_CONFIRM';
    reasonCode = 'FACT_CAPTURE_CONFIRMATION_REQUIRED';
    cards = factConfirmationBlocksAndCard(candidate, expiresAt, index, confirmationVersion);
    parameters = {
      factKey: candidate.factKey,
      value: candidate.value,
      sourceType: 'USER_REPORTED',
      attribution: candidate.attribution,
      captureChannel: CAPTURE_CHANNEL,
      extractionConfidence: candidate.extractionConfidence,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    };
  } else if (candidate.category === 'EVENT') {
    operationId = 'CAPTURE_EVENT_CONFIRM';
    reasonCode = 'EVENT_CAPTURE_CONFIRMATION_REQUIRED';
    cards = eventConfirmationBlocksAndCard(candidate, expiresAt, index, confirmationVersion);
    parameters = {
      // Code review finding (2026-09-13): threaded through so
      // confirmCaptureEvent's existing correctingEventId branch (already
      // built for this exact purpose since Phase 2) is actually reachable
      // from a conversationally-extracted correction, not just a
      // hand-constructed candidate.
      correctingEventId: candidate.correctingEventId ?? null,
      ...buildEventContentParameters(candidate, now),
      attribution: candidate.attribution,
      captureChannel: CAPTURE_CHANNEL,
      extractionConfidence: candidate.extractionConfidence,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    };
  } else if (candidate.category === 'WARRANTY') {
    operationId = 'CAPTURE_WARRANTY_CONFIRM';
    reasonCode = 'WARRANTY_CAPTURE_CONFIRMATION_REQUIRED';
    const { startDate, expiryDate, startDateApproximate } = resolveWarrantyDates(candidate, linkedEventCandidate, now);
    cards = warrantyConfirmationBlocksAndCard(candidate, expiresAt, index, startDate, expiryDate, confirmationVersion, startDateApproximate);
    parameters = {
      providerName: candidate.providerName,
      category: candidate.warrantyCategory,
      policyNumber: candidate.policyNumber ?? null,
      coverageDetails: candidate.coverageDetails ?? null,
      cost: candidate.cost ?? null,
      startDate: startDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      startDateApproximate,
      attribution: candidate.attribution,
      captureChannel: CAPTURE_CHANNEL,
      extractionConfidence: candidate.extractionConfidence,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    };
  } else {
    operationId = 'CAPTURE_EVIDENCE_CONFIRM';
    reasonCode = 'EVIDENCE_CAPTURE_CONFIRMATION_REQUIRED';
    const documentName = recentDocuments?.find((document) => document.id === candidate.documentId)?.name ?? 'this document';
    const linkedEventTitle = linkedEventCandidate?.title ?? 'the related home timeline event';
    cards = evidenceConfirmationBlocksAndCard(candidate, expiresAt, index, documentName, linkedEventTitle, confirmationVersion);
    parameters = {
      documentId: candidate.documentId,
      attribution: candidate.attribution,
      captureChannel: CAPTURE_CHANNEL,
      extractionConfidence: candidate.extractionConfidence,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    };
  }
  const { blocks, confirmation } = cards;

  // Ask Cozy Stage 3, Phase 3 edit-before-confirm (FRD §22). Every capture
  // candidate carries its own edit captureRequest from the moment it's
  // proposed, using the SAME contextVersion snapshot as the candidate
  // itself -- 'unversioned' covers the (rare) case where the parent turn's
  // own contextVersion is null, matching the placeholder used symmetrically
  // in submitAskCapture's freshness check for these three operations.
  const editContextVersion = input.contextVersion ?? 'unversioned';
  const captureRequests: AskCaptureRequest[] = candidate.category === 'FACT'
    ? [factEditCaptureRequest(parameters, editContextVersion)]
    : candidate.category === 'EVENT'
      ? (() => { const request = eventEditCaptureRequest(parameters, editContextVersion); return request ? [request] : []; })()
      : candidate.category === 'WARRANTY'
        ? [warrantyEditCaptureRequest(parameters, editContextVersion)]
        // EVIDENCE deliberately has no edit affordance (same scoping as
        // GOAL candidates): there is nothing meaningful to edit about which
        // already-uploaded document a stated fact refers to.
        : [];

  return {
    session: { connect: { id: input.sessionId } },
    user: { connect: { id: input.userId } },
    property: { connect: { id: input.propertyId } },
    // Deterministic per (parent execution, candidate index): a retried
    // extraction attempt for the same parent turn resolves to the same
    // child row via the existing @@unique([userId, clientRequestId])
    // constraint, rather than creating a duplicate proposal (FRD §14's "no
    // duplicate candidate proposals reach the user").
    clientRequestId: `ask-extraction:${input.parentExecutionId}:${index}`,
    message: candidate.sourceSentence,
    parentExecution: { connect: { id: input.parentExecutionId } },
    operationId,
    operationVersion: '1.0',
    intentFamily: 'COMMAND',
    status: 'NEEDS_CONFIRMATION' as AskExecutionStatus,
    reasonCode,
    contextVersion: input.contextVersion,
    parametersJson: parameters as Prisma.InputJsonValue,
    resultJson: {
      schemaVersion: '1.0',
      blocks,
      captureRequests,
      confirmation,
      clarification: null,
      suggestions: [],
    } as unknown as Prisma.InputJsonValue,
    expiresAt,
  };
}

// Ask Cozy Stage 3, Phase 3 edit-before-confirm (FRD §22). The submit-time
// half of the mechanism above: askOrchestrator.service.ts's submitAskCapture
// calls one of these three once it has verified the captureKey is active
// and the execution's own stored contextVersion still matches the
// submitted expectedContextVersion. Each takes the execution's CURRENTLY
// STORED parametersJson (not the original ExtractionCandidate, which no
// longer exists once the execution is persisted) plus the submitted answer,
// re-validates with the exact same per-field logic used at proposal time,
// and rebuilds a fresh AskOperationResult -- status stays NEEDS_CONFIRMATION,
// never writes to any domain model directly (only an actual confirm does
// that). Returns null for any invalid submission; the caller is responsible
// for turning that into an ASK_CAPTURE_VALIDATION_ERROR.

export function editCaptureFactCandidate(
  storedParameters: unknown,
  sourceSentence: string,
  contextVersion: string,
  answer: unknown,
  now: Date,
): AskOperationResult | null {
  const parameters = asParameterRecord(storedParameters);
  const factKey = typeof parameters.factKey === 'string' ? parameters.factKey : null;
  if (!factKey) return null;
  const parsedAnswer = z.object({ value: z.unknown() }).strict().safeParse(answer);
  if (!parsedAnswer.success) return null;
  const candidate: FactExtractionCandidate = {
    category: 'FACT',
    factKey,
    value: parsedAnswer.data.value,
    extractionConfidence: typeof parameters.extractionConfidence === 'number' ? parameters.extractionConfidence : 1,
    attribution: (typeof parameters.attribution === 'string' ? parameters.attribution : 'FIRSTHAND') as AskCaptureAttribution,
    sourceSentence,
  };
  if (!isValidFactCandidateValue(candidate)) return null;
  // Code review finding (2026-09-13, [P1]): every edit must invalidate any
  // confirmation the homeowner has not yet re-reviewed -- see
  // nextConfirmationVersion's own header. Both the card's `version` and the
  // stored `parameters.confirmationVersion` below use this same
  // incremented number, so a stale confirmationVersion submitted against
  // this execution is provably rejected by confirmAskExecution's existing
  // `expectedVersion !== input.confirmationVersion` check.
  const confirmationVersion = nextConfirmationVersion(parameters);
  const mergedParameters = { ...parameters, value: candidate.value };
  const expiresAt = confirmationExpiry(now);
  const { blocks, confirmation } = factConfirmationBlocksAndCard(candidate, expiresAt, 0, confirmationVersion);
  return {
    status: 'NEEDS_CONFIRMATION',
    reasonCode: 'FACT_CAPTURE_CONFIRMATION_REQUIRED',
    blocks, confirmation, suggestions: [],
    captureRequests: [factEditCaptureRequest(mergedParameters, contextVersion)],
    parameters: { ...mergedParameters, confirmationVersion, confirmationExpiresAt: expiresAt.toISOString() },
  };
}

const EVENT_EDIT_ANSWER_SCHEMAS: Record<keyof typeof EVENT_EDITABLE_FIELD_DEFS, z.ZodTypeAny> = {
  type: z.nativeEnum(HomeEventType),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(500).nullable(),
  amount: z.number().nonnegative().max(10_000_000).nullable(),
  providerName: z.string().trim().max(160).nullable(),
};

export function editCaptureEventCandidate(
  storedParameters: unknown,
  sourceSentence: string,
  contextVersion: string,
  answer: unknown,
  now: Date,
): AskOperationResult | null {
  const parameters = asParameterRecord(storedParameters);
  // Only fields already present on this execution are editable -- a
  // correction execution only ever has the field(s) it actually corrects
  // (buildEventContentParameters's sparse patch), so this naturally offers
  // exactly those fields, never a field the original correction didn't
  // touch.
  const editableKeys = EVENT_EDITABLE_KEYS.filter((key) => key in parameters);
  if (editableKeys.length === 0) return null;
  const answerShape = Object.fromEntries(editableKeys.map((key) => [key, EVENT_EDIT_ANSWER_SCHEMAS[key]]));
  const parsedAnswer = z.object(answerShape).strict().safeParse(answer);
  if (!parsedAnswer.success) return null;
  const merged: Record<string, unknown> = { ...parameters, ...parsedAnswer.data };
  if ('amount' in parsedAnswer.data) {
    merged.currency = merged.amount != null ? (typeof parameters.currency === 'string' ? parameters.currency : 'USD') : null;
  }
  // Code review finding (2026-09-13, [P1]): see editCaptureFactCandidate's
  // own comment -- every edit invalidates any not-yet-re-reviewed
  // confirmation by incrementing this past whatever was last stored.
  const confirmationVersion = nextConfirmationVersion(parameters);
  const expiresAt = confirmationExpiry(now);
  const { blocks, confirmation } = eventEditConfirmationBlocksAndCard(merged, sourceSentence, expiresAt, confirmationVersion);
  const editRequest = eventEditCaptureRequest(merged, contextVersion);
  return {
    status: 'NEEDS_CONFIRMATION',
    reasonCode: 'EVENT_CAPTURE_CONFIRMATION_REQUIRED',
    blocks, confirmation, suggestions: [],
    captureRequests: editRequest ? [editRequest] : [],
    parameters: { ...merged, confirmationVersion, confirmationExpiresAt: expiresAt.toISOString() },
  };
}

const WARRANTY_DATE_STRING = z.string().trim().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'Enter a valid date' });

// Code review finding (2026-09-13, [P1]): startDate/expiryDate are now
// editable -- previously read-only, with no way to correct
// resolveWarrantyDates's own manufactured guess (see its header comment).
// Cross-field validated the same way captureWarranty.ts's actual
// confirm-time writer validates them, so an edit can never propose a card
// that would fail once confirmed.
const WARRANTY_EDIT_ANSWER_SCHEMA = z.object({
  providerName: z.string().trim().min(1).max(160),
  category: z.nativeEnum(WarrantyCategory),
  policyNumber: z.string().trim().max(160).nullable(),
  coverageDetails: z.string().trim().max(2000).nullable(),
  cost: z.number().nonnegative().max(10_000_000).nullable(),
  startDate: WARRANTY_DATE_STRING,
  expiryDate: WARRANTY_DATE_STRING,
}).strict().refine(
  (value) => new Date(value.expiryDate) > new Date(value.startDate),
  { message: 'Expiration date must be after the start date', path: ['expiryDate'] },
);

export function editCaptureWarrantyCandidate(
  storedParameters: unknown,
  sourceSentence: string,
  contextVersion: string,
  answer: unknown,
  now: Date,
): AskOperationResult | null {
  const parameters = asParameterRecord(storedParameters);
  const parsedAnswer = WARRANTY_EDIT_ANSWER_SCHEMA.safeParse(answer);
  if (!parsedAnswer.success) return null;
  // Code review finding (2026-09-13, [P1]): see editCaptureFactCandidate's
  // own comment on confirmationVersion. `startDateApproximate: false`
  // because the homeowner just explicitly supplied/confirmed this date --
  // it is no longer resolveWarrantyDates's own guess, whatever it was
  // before this edit.
  const confirmationVersion = nextConfirmationVersion(parameters);
  const merged = {
    ...parameters,
    ...parsedAnswer.data,
    startDate: new Date(parsedAnswer.data.startDate).toISOString(),
    expiryDate: new Date(parsedAnswer.data.expiryDate).toISOString(),
    startDateApproximate: false,
  };
  const expiresAt = confirmationExpiry(now);
  const { blocks, confirmation } = warrantyEditConfirmationBlocksAndCard(merged, sourceSentence, expiresAt, confirmationVersion);
  return {
    status: 'NEEDS_CONFIRMATION',
    reasonCode: 'WARRANTY_CAPTURE_CONFIRMATION_REQUIRED',
    blocks, confirmation, suggestions: [],
    captureRequests: [warrantyEditCaptureRequest(merged, contextVersion)],
    parameters: { ...merged, confirmationVersion, confirmationExpiresAt: expiresAt.toISOString() },
  };
}

/**
 * Re-verifies, inside the same transaction that persists what this attempt
 * produced, that this attempt's claim token still matches the DomainEvent
 * row's current attempts value -- mirroring
 * apps/workers/src/lib/domainEventClaimToken.ts's verifyDomainEventClaimToken
 * exactly (see this file's header for why that utility can't be imported
 * directly from here). Throws (rolling back the whole transaction, per
 * Prisma's standard uncaught-error behavior) if a later attempt has since
 * reclaimed the lease.
 */
async function verifyClaimStillOwned(tx: Prisma.TransactionClient, domainEventId: string, claimedAttempts: number): Promise<void> {
  const stillOwned = await tx.domainEvent.updateMany({
    where: { id: domainEventId, attempts: claimedAttempts },
    data: { processingStartedAt: new Date() },
  });
  if (stillOwned.count !== 1) {
    throw new Error(`ASK_EXTRACTION_REQUESTED ${domainEventId}'s claim (attempts=${claimedAttempts}) was reclaimed by a later attempt`);
  }
}

// External review, Phase 6 [P1] (FRD §21): "a GOAL candidate only
// creates/attaches a thread when the pre-filter+extraction combination
// reaches its normal confidence bar for the GOAL category" -- verified no
// such bar existed anywhere before this fix: a GOAL candidate with
// `extractionConfidence: 0` passed schema validation
// (GoalExtractionCandidateSchema only bounds it to [0, 1]) and
// `filterValidCandidates` below, straight through to
// `processGoalCandidate` creating/attaching a real `DecisionThread`.
// `extractionConfidence` is captured and stored for every category
// (parametersJson, audit-only today) but was never gated against for
// FACT/EVENT/WARRANTY either, so there was no existing numeric convention
// to reuse. This bar is scoped to GOAL specifically because GOAL is the
// one category exempt from the confirmation gate entirely (§21's own
// "reversible at zero cost" materiality carve-out) -- for FACT/EVENT/
// WARRANTY, a low-confidence candidate still reaches a homeowner-reviewed
// Save card before anything is written; for GOAL, this bar is the ONLY
// safeguard standing between a casual mention and a real write.
// `MIN_GOAL_EXTRACTION_CONFIDENCE` is a deliberate, documented choice (not
// derived from an existing evaluated number, since none exists in this
// codebase) -- majority-confidence, consistent with "avoid one thread per
// casual mention."
export const MIN_GOAL_EXTRACTION_CONFIDENCE = 0.6;

// Exported for direct unit testing (pure, no I/O).
export function isValidGoalCandidate(candidate: GoalExtractionCandidate): boolean {
  return candidate.extractionConfidence >= MIN_GOAL_EXTRACTION_CONFIDENCE;
}

// Code review finding (2026-09-13): a FACT candidate's value was never
// checked before being turned into a confirmation card -- filtering it here
// (before persistCandidates opens its transaction) means an invalid value
// never reaches the homeowner as a Save card that would only fail once
// confirmed.
// Exported for direct unit testing (pure, no I/O).
export function filterValidCandidates(candidates: ExtractionCandidate[]): ExtractionCandidate[] {
  // filterCandidatesPreservingWarrantyLinks, not a plain .filter(): dropping
  // an invalid FACT/GOAL candidate shifts every later candidate's array
  // position, which would otherwise silently invalidate a WARRANTY
  // candidate's linkedEventCandidateIndex elsewhere in this same batch.
  return filterCandidatesPreservingWarrantyLinks(
    candidates,
    (candidate) => {
      if (candidate.category === 'FACT') return isValidFactCandidateValue(candidate);
      if (candidate.category === 'GOAL') return isValidGoalCandidate(candidate);
      return true;
    },
  );
}

// Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21 "Goal
// Capture"). GOAL candidates are handled entirely separately from
// FACT/EVENT/WARRANTY: no NEEDS_CONFIRMATION state, no captureRequests, no
// confirm-time writer -- creating/resuming a DecisionThread happens
// immediately, per Stage 2's materiality carve-out ("a thread is workflow
// state... reversible at zero cost"). Each candidate is processed and
// persisted independently (its own try/catch, its own idempotent
// clientRequestId lookup) so one candidate's failure -- or the whole
// property having no computable Sell/Hold/Rent analysis yet -- can never
// affect another candidate or the FACT/EVENT/WARRANTY captures already
// committed by persistCandidates's own transaction. Deliberately NOT run
// inside that transaction: sellHoldRentDecisionFamilyAdapter.createOrResumeThread
// opens its own separate prisma.$transaction internally (domainSnapshotAdapters.ts),
// and nesting that (plus the estimate() call before it) inside an
// already-open outer transaction would hold a DB connection for the
// duration of both, for zero atomicity benefit -- these writes have no
// correctness dependency on the FACT/EVENT/WARRANTY rows created alongside
// them in the same turn.
//
// External review, Phase 6 [P2]: this function (processGoalCandidate) does
// the actual thread-attachment work for exactly one candidate and stays
// unchanged in shape -- what changed is HOW it gets called. It used to be
// invoked directly, outside persistCandidates's transaction, with failures
// logged and dropped ("accepted, precedented loss") -- but by the time it
// ran, the triggering ASK_EXTRACTION_REQUESTED event was ALREADY marked
// PROCESSED and its own payload (the message needed to re-extract) already
// overwritten, so a crash or DB error here had no retry path at all, not
// even the whole-turn re-extraction fallback every other failure in this
// pipeline gets. Fixed with the same durable-DomainEvent pattern this
// program already uses for exactly this class of problem
// (radarNotificationMaterializationReconciliation.service.ts's own header
// comment documents the identical rationale): a new
// ASK_GOAL_CANDIDATE_ATTACH_REQUESTED event, carrying the already-parsed
// candidate content (no re-extraction needed), is created ATOMICALLY inside
// persistCandidates's own transaction -- see requestGoalCandidateAttachment
// below -- so the durable INTENT to attach this goal is committed in the
// same all-or-nothing unit as the FACT/EVENT/WARRANTY rows and the
// ASK_EXTRACTION_REQUESTED completion write, never lost even if everything
// after that transaction crashes. processGoalCandidateAttachEvent (below)
// is the new entry point that actually calls this function and only marks
// its OWN event PROCESSED once thread attachment and this candidate's
// child AskExecution both fully succeed -- a failure leaves that event
// PENDING/FAILED, picked up by the worker's own standard backoff/retry
// poller exactly like every other DomainEvent type, never silently lost.
// FACT/EVENT/WARRANTY rows remain independently, atomically committed by
// the transaction above regardless of what happens to any goal-attach
// event afterward -- unchanged from before this fix.

const SELL_HOLD_RENT_WORKSPACE_HREF = (propertyId: string) => `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/sell-hold-rent`;
const SELLER_PREP_HREF = (propertyId: string) => `/dashboard/properties/${encodeURIComponent(propertyId)}/seller-prep`;

// Best-effort, read-mostly: PropertySaleCaseService.getCase's own
// syncReadinessItems only runs (and only writes) when a PropertySaleCase
// already exists for this property, exactly the same as if the homeowner
// had opened the Seller Prep page themselves -- calling it here creates no
// new side effect beyond what that existing, already-reviewed service
// already does on every read. Never throws: a failure here must not cost
// the homeowner the DecisionThread attachment this candidate already
// produced.
async function buildSellerPrepInlineBlock(userId: string, propertyId: string): Promise<AskPresentationBlock | null> {
  try {
    const overview = await PropertySaleCaseService.getCase(userId, propertyId);
    const href = SELLER_PREP_HREF(propertyId);
    if (!overview.saleCase) {
      return {
        type: 'GROUPED_LIST',
        id: 'sell-hold-rent-goal-seller-prep',
        title: 'Getting ready to sell',
        description: 'A seller-prep checklist can personalize which repairs, records, and cosmetic work to prioritize whenever you are ready to start.',
        sections: [],
        actions: [{ id: 'open-seller-prep', label: 'Open seller prep', href, style: 'SECONDARY' }],
      };
    }
    const openItems = overview.readinessItems.filter((item) => item.status === 'OPEN' && !item.waivedAt).slice(0, 5);
    return {
      type: 'GROUPED_LIST',
      id: 'sell-hold-rent-goal-seller-prep',
      title: 'Seller prep checklist',
      description: openItems.length
        ? 'Open items from your seller-prep checklist.'
        : 'Your seller-prep checklist has no open items right now.',
      sections: openItems.length ? [{
        id: 'open-items',
        title: 'Open items',
        count: openItems.length,
        items: openItems.map((item) => ({ id: item.id, title: item.title, description: item.detail ?? null, meta: [], status: item.status, href })),
      }] : [],
      actions: [{ id: 'open-seller-prep', label: 'Open seller prep', href, style: 'SECONDARY' }],
    };
  } catch (error) {
    logger.warn({ error, propertyId }, '[ask-conversational-capture] seller-prep inline block failed');
    return null;
  }
}

// sellHoldRentService.estimate() persists the canonical SellHoldRentAnalysis
// row on every non-scenario call (domainSnapshotAdapters.ts's own header
// comment: "the same record loadSellHoldRentSourceState... reads"). Calling
// it here guarantees the generic adapter's loadSourceState has something to
// snapshot even when the homeowner has never opened the Sell/Hold/Rent tool
// themselves -- otherwise createOrResumeThread throws "No current
// recommendation available" for a property with no prior analysis.
async function ensureCanonicalSellHoldRentAnalysis(propertyId: string, userId: string): Promise<void> {
  await sellHoldRentService.estimate(propertyId, { years: 5 }, userId);
}

async function processGoalCandidate(
  candidate: GoalExtractionCandidate,
  index: number,
  input: ConversationalCaptureInput,
): Promise<PersistedCaptureExecution> {
  // Deterministic per (parent execution, candidate index), same convention
  // as buildChildExecutionData's own clientRequestId -- a retried extraction
  // attempt for the same parent turn resolves to the already-created row
  // rather than re-running createOrResumeThread (itself idempotent-safe, but
  // re-running it needlessly on every retry is still wasted work).
  const clientRequestId = `ask-extraction:${input.parentExecutionId}:goal:${index}`;
  const existing = await prisma.askExecution.findUnique({
    where: { userId_clientRequestId: { userId: input.userId, clientRequestId } },
  });
  if (existing) return existing;

  await ensureCanonicalSellHoldRentAnalysis(input.propertyId, input.userId);
  // decisionDefinitionId is a schema-level z.literal('SELL_HOLD_RENT') --
  // this vertical slice's own deliberate scope, see extractionCandidateSchema.ts.
  // primaryEntityId is the propertyId itself, matching
  // sellHoldRentDecisionFamilyAdapter's own primaryEntityType: 'Property'.
  const lineage = await sellHoldRentDecisionFamilyAdapter.createOrResumeThread({
    propertyId: input.propertyId,
    userId: input.userId,
    primaryEntityId: input.propertyId,
  });
  // The generic adapter's own return type (DecisionFamilyThreadLineage)
  // carries only currentRecommendationSnapshotId, not the full snapshot
  // fields decisionProgressBlock/whyNowBlock need, nor the thread's own
  // contextIssueCodes -- one extra query, mirroring exactly the shape
  // hvacDecisionStartResult already fetches (a DecisionThread row with its
  // currentRecommendationSnapshot nested), not a redesign.
  const thread = await prisma.decisionThread.findUniqueOrThrow({
    where: { id: lineage.decisionThreadId },
    include: { currentRecommendationSnapshot: true },
  });

  const blocks: AskPresentationBlock[] = [decisionProgressBlock(
    'sell-hold-rent-goal-progress',
    'Sell, hold, or rent this home',
    thread,
    thread.currentRecommendationSnapshot,
    [{ id: 'open-sell-hold-rent', label: 'Explore and adjust scenarios', href: SELL_HOLD_RENT_WORKSPACE_HREF(input.propertyId), style: 'PRIMARY' }],
  )];
  if (thread.currentRecommendationSnapshot) blocks.push(whyNowBlock('sell-hold-rent-goal-why-now', thread.currentRecommendationSnapshot, []));
  const sellerPrepBlock = await buildSellerPrepInlineBlock(input.userId, input.propertyId);
  if (sellerPrepBlock) blocks.push(sellerPrepBlock);

  // FRD §21: "AskSession.activeDecisionThreadId is a same-session cache
  // only." The real cross-session resumption mechanism is
  // DecisionThread.activeIdentityKey, already exercised (independent of
  // this cache) by createOrResumeThread's own selectThread call above --
  // this is a same-turn UX nicety (e.g. a follow-up message in the SAME
  // session can reference "that decision" without repeating the goal
  // statement), never load-bearing for resumption itself. Best-effort: a
  // failure here must not cost the homeowner the thread attachment above.
  await prisma.askSession.update({
    where: { id: input.sessionId },
    data: { activeDecisionThreadId: lineage.decisionThreadId },
  }).catch((error) => {
    logger.warn({ error, sessionId: input.sessionId }, '[ask-conversational-capture] failed to cache activeDecisionThreadId on session');
  });

  const timeframeNote = candidate.timeframeLabel ? ` (${candidate.timeframeLabel})` : '';
  return prisma.askExecution.create({
    data: {
      session: { connect: { id: input.sessionId } },
      user: { connect: { id: input.userId } },
      property: { connect: { id: input.propertyId } },
      clientRequestId,
      message: candidate.sourceSentence,
      parentExecution: { connect: { id: input.parentExecutionId } },
      operationId: 'SELL_HOLD_RENT_GOAL_CAPTURE',
      operationVersion: '1.0',
      intentFamily: 'COMMAND',
      status: 'COMPLETED' as AskExecutionStatus,
      completedAt: new Date(),
      reasonCode: 'SELL_HOLD_RENT_GOAL_THREAD_ATTACHED',
      resultJson: {
        schemaVersion: '1.0',
        blocks: [{
          type: 'SUMMARY' as const,
          id: 'sell-hold-rent-goal-preview',
          title: 'Noted -- tracking this as a decision you can pick back up any time',
          body: `Cozy noticed you mentioned: "${candidate.sourceSentence}"${timeframeNote}. Nothing was listed or sold -- this just keeps the sell/hold/rent comparison up to date and easy to return to.`,
          tone: 'DEFAULT' as const,
          actions: [],
        }, ...blocks],
        captureRequests: [],
        confirmation: null,
        clarification: null,
        suggestions: ['Open Sell / Hold / Rent', 'What would help me get ready to sell?'],
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

// External review, Phase 6 [P2]: the durable payload for
// ASK_GOAL_CANDIDATE_ATTACH_REQUESTED -- deliberately a bare, already-parsed
// copy of the exact fields processGoalCandidate needs (never a live
// GoalExtractionCandidate object, which cannot survive a JSON round-trip
// through DomainEvent.payload as-is), so processing this event never needs
// to re-run extraction. Mirrors radarNotificationMaterializationReconciliation
// .service.ts's own payload-schema convention (a plain, versioned Zod
// object, parsed defensively on read).
export const GoalCandidateAttachPayloadSchema = z.object({
  payloadVersion: z.literal(1),
  parentExecutionId: z.string().trim().min(1),
  index: z.number().int().nonnegative(),
  userId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  propertyId: z.string().trim().min(1),
  contextVersion: z.string().trim().min(1).nullable(),
  candidate: z.object({
    decisionDefinitionId: z.literal('SELL_HOLD_RENT'),
    timeframeLabel: z.string().trim().min(1).max(60).nullable(),
    sourceSentence: z.string().trim().min(1).max(500),
    extractionConfidence: z.number().min(0).max(1),
    attribution: ExtractionAttributionSchema,
  }),
});

/**
 * Creates the durable ASK_GOAL_CANDIDATE_ATTACH_REQUESTED event for one
 * GOAL candidate, inside the caller's own transaction -- called from
 * persistCandidates's transaction, so this event's existence is committed
 * atomically with the FACT/EVENT/WARRANTY rows and the triggering
 * ASK_EXTRACTION_REQUESTED completion write. Idempotent on
 * (parentExecutionId, index), the same deterministic-identity convention
 * every other candidate-derived row in this file already uses.
 */
async function requestGoalCandidateAttachment(
  tx: Prisma.TransactionClient,
  candidate: GoalExtractionCandidate,
  index: number,
  input: ConversationalCaptureInput,
): Promise<{ id: string }> {
  const idempotencyKey = `ask-goal-attach:${input.parentExecutionId}:${index}`;
  const payload: z.infer<typeof GoalCandidateAttachPayloadSchema> = {
    payloadVersion: 1,
    parentExecutionId: input.parentExecutionId,
    index,
    userId: input.userId,
    sessionId: input.sessionId,
    propertyId: input.propertyId,
    contextVersion: input.contextVersion,
    candidate: {
      decisionDefinitionId: candidate.decisionDefinitionId,
      timeframeLabel: candidate.timeframeLabel ?? null,
      sourceSentence: candidate.sourceSentence,
      extractionConfidence: candidate.extractionConfidence,
      attribution: candidate.attribution,
    },
  };
  return tx.domainEvent.upsert({
    where: { idempotencyKey },
    create: {
      type: 'ASK_GOAL_CANDIDATE_ATTACH_REQUESTED' as any,
      status: 'PENDING',
      propertyId: input.propertyId,
      userId: input.userId,
      idempotencyKey,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
}

/**
 * The actual attachment work for one ASK_GOAL_CANDIDATE_ATTACH_REQUESTED
 * event -- exported for the workers app's own consumer
 * (processDomainEvents.job.ts), mirroring processAskExtractionRequestedEvent's
 * own dual-path shape exactly: this function does the real work given an
 * ALREADY-CLAIMED event (claimedAttempts supplied by the caller's own claim
 * step), and marks it PROCESSED itself -- self-completing, like
 * processAskExtractionRequestedEvent's own handler -- rather than relying
 * on a generic post-handler write, so both the inline caller below and the
 * worker's generic dispatch loop (whose own completion write is guarded on
 * status still being PROCESSING, so it naturally no-ops here exactly like
 * it already does for ASK_EXTRACTION_REQUESTED) converge safely. Retrying
 * this event after a partial prior attempt is safe without any extra claim-
 * token machinery: processGoalCandidate is itself idempotent on
 * clientRequestId (its own existing-row check), and
 * sellHoldRentDecisionFamilyAdapter.createOrResumeThread already recovers
 * from a concurrent-create race via its own P2002 catch (confirmed by
 * reading domainSnapshotAdapters.ts before relying on it here) -- so two
 * concurrent attempts at the same event converge on the same thread and the
 * same child execution rather than duplicating either.
 */
export async function processGoalCandidateAttachEvent(
  event: { id: string; payload: unknown },
  claimedAttempts: number,
): Promise<PersistedCaptureExecution> {
  const payload = GoalCandidateAttachPayloadSchema.parse(event.payload);
  const candidate: GoalExtractionCandidate = {
    category: 'GOAL',
    decisionDefinitionId: payload.candidate.decisionDefinitionId,
    timeframeLabel: payload.candidate.timeframeLabel,
    sourceSentence: payload.candidate.sourceSentence,
    extractionConfidence: payload.candidate.extractionConfidence,
    attribution: payload.candidate.attribution,
  };
  const input: ConversationalCaptureInput = {
    userId: payload.userId,
    sessionId: payload.sessionId,
    propertyId: payload.propertyId,
    parentExecutionId: payload.parentExecutionId,
    // processGoalCandidate never reads input.message (it uses the
    // candidate's own sourceSentence for the child execution's message/
    // preview text) -- filled in only to satisfy ConversationalCaptureInput's
    // shape, which other candidate categories do need this for.
    message: candidate.sourceSentence,
    contextVersion: payload.contextVersion,
    skipDueToRoutedCapture: false,
  };
  const execution = await processGoalCandidate(candidate, payload.index, input);
  await prisma.domainEvent.updateMany({
    where: { id: event.id, attempts: claimedAttempts },
    data: { status: 'PROCESSED', processedAt: new Date(), processingStartedAt: null, leaseExpiresAt: null },
  });
  return execution;
}

/**
 * The inline half of the goal-attachment durability fix: claims and
 * attempts one ASK_GOAL_CANDIDATE_ATTACH_REQUESTED event right after
 * persistCandidates's own transaction commits -- a pure responsiveness
 * optimization (the homeowner sees the thread-attachment result in this
 * same turn when it succeeds within budget), never a correctness
 * dependency. A lost claim race, a failure, or simply running out of the
 * outer ~1.5s budget (runConversationalCaptureForTurn's own Promise.race)
 * all leave the event PENDING/PROCESSING for the worker's own poller to
 * pick up later via the standard backoff/dead-letter contract -- never
 * silently dropped. Returns `null` rather than throwing so one event's
 * failure can never prevent another's inline attempt in the same turn.
 */
async function claimAndProcessGoalAttachEvent(eventId: string): Promise<PersistedCaptureExecution | null> {
  const now = new Date();
  const claimed = await prisma.domainEvent.updateMany({
    where: { id: eventId, status: 'PENDING', availableAt: { lte: now } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, processingStartedAt: now, leaseExpiresAt: new Date(now.getTime() + DOMAIN_EVENT_LEASE_MS) },
  });
  if (claimed.count !== 1) return null;
  const claimedRow = await prisma.domainEvent.findUnique({ where: { id: eventId }, select: { attempts: true, payload: true } });
  if (!claimedRow) return null;
  const claimedAttempts = claimedRow.attempts;
  try {
    return await processGoalCandidateAttachEvent({ id: eventId, payload: claimedRow.payload }, claimedAttempts);
  } catch (error) {
    logger.warn({ error, eventId }, '[ask-conversational-capture] inline goal-candidate attach attempt failed; leaving for worker retry');
    await prisma.domainEvent.updateMany({
      where: { id: eventId, attempts: claimedAttempts },
      data: {
        status: 'FAILED',
        lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error',
        availableAt: new Date(Date.now() + 60_000),
        processingStartedAt: null,
        leaseExpiresAt: null,
      },
    }).catch(() => undefined);
    return null;
  }
}

// External review, 2026-09-14 (FRD §10/§29): the durable payload for
// ASK_CAPTURE_NOTIFICATION_REQUESTED -- same shape/rationale as
// GoalCandidateAttachPayloadSchema above (a plain, already-resolved copy of
// exactly what notifyDelayedCaptureCandidatesReady needs, not a live object
// that can't survive a JSON round-trip through DomainEvent.payload).
// `triggerKey` is the SAME value the pre-durable-event version of this
// notification already used as its deduplicationKey (the triggering
// ASK_EXTRACTION_REQUESTED event's own id) -- preserved here so switching to
// this durable mechanism doesn't change the notification's own dedup
// identity for anything already sent under the old, non-durable call.
export const CaptureNotificationRequestPayloadSchema = z.object({
  payloadVersion: z.literal(1),
  userId: z.string().trim().min(1),
  propertyId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  triggerKey: z.string().trim().min(1),
  // Bounded to MAX_EXTRACTION_CANDIDATES_PER_TURN (3) -- the same per-turn
  // cap the candidates array these ids are drawn from already enforces.
  executionIds: z.array(z.string().trim().min(1)).min(1).max(3),
});

/**
 * Creates the durable ASK_CAPTURE_NOTIFICATION_REQUESTED event, inside the
 * caller's own transaction -- called from persistCandidates's transaction,
 * so this event's existence is committed atomically with the FACT/EVENT/
 * WARRANTY/EVIDENCE rows and the triggering ASK_EXTRACTION_REQUESTED
 * completion write. Idempotent on the triggering event's own id (one
 * notification-intent per extraction attempt, matching every other
 * candidate-derived row in this file's own deterministic-identity
 * convention). Returns null without creating anything when there is nothing
 * to notify about (no NEEDS_CONFIRMATION rows this turn) -- a GOAL-only or
 * empty extraction has no pending confirmation for the homeowner to miss.
 */
async function requestCaptureNotification(
  tx: Prisma.TransactionClient,
  input: ConversationalCaptureInput,
  triggerKey: string,
  executionIds: readonly string[],
): Promise<{ id: string } | null> {
  if (executionIds.length === 0) return null;
  const idempotencyKey = `ask-capture-notify-request:${triggerKey}`;
  const payload: z.infer<typeof CaptureNotificationRequestPayloadSchema> = {
    payloadVersion: 1,
    userId: input.userId,
    propertyId: input.propertyId,
    sessionId: input.sessionId,
    triggerKey,
    executionIds: [...executionIds],
  };
  return tx.domainEvent.upsert({
    where: { idempotencyKey },
    create: {
      type: 'ASK_CAPTURE_NOTIFICATION_REQUESTED' as any,
      status: 'PENDING',
      propertyId: input.propertyId,
      userId: input.userId,
      idempotencyKey,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
}

/**
 * The actual notification-send work for one ASK_CAPTURE_NOTIFICATION_REQUESTED
 * event -- exported for the workers app's own consumer
 * (processDomainEvents.job.ts). Self-completing (marks its own event
 * PROCESSED), mirroring processGoalCandidateAttachEvent's own shape exactly.
 * Re-resolves current execution status rather than trusting the payload's
 * own executionIds blindly -- a homeowner may have already confirmed (or a
 * concurrent request already resolved) one of these between persistCandidates
 * committing and this event being processed, and an already-resolved
 * execution should not get a "come confirm this" nudge. Never throws when
 * there is nothing left to notify about (correctly marks PROCESSED, not an
 * error); DOES throw (leaving the event PENDING/FAILED for retry) when the
 * actual send fails, per notifyDelayedCaptureCandidatesReady's own updated
 * contract.
 */
export async function processCaptureNotificationEvent(
  event: { id: string; payload: unknown },
  claimedAttempts: number,
): Promise<void> {
  const payload = CaptureNotificationRequestPayloadSchema.parse(event.payload);
  const executions = await prisma.askExecution.findMany({
    where: { id: { in: payload.executionIds }, status: 'NEEDS_CONFIRMATION' },
    select: { id: true },
  });
  await notifyDelayedCaptureCandidatesReady({
    userId: payload.userId,
    propertyId: payload.propertyId,
    sessionId: payload.sessionId,
    triggerKey: payload.triggerKey,
    executions,
  });
  await prisma.domainEvent.updateMany({
    where: { id: event.id, attempts: claimedAttempts },
    data: { status: 'PROCESSED', processedAt: new Date(), processingStartedAt: null, leaseExpiresAt: null },
  });
}

/**
 * The inline half of the notification-durability fix: claims and attempts
 * one ASK_CAPTURE_NOTIFICATION_REQUESTED event right after persistCandidates's
 * own transaction commits, for the async-fallback tail ONLY (a slow
 * extraction attempt past its inline budget, or the worker's own
 * crash-recovery consumer) -- mirrors claimAndProcessGoalAttachEvent's own
 * shape exactly. A lost claim race, a send failure, or a crash here all
 * leave the event PENDING/FAILED for the worker's own poller to retry via
 * the standard backoff/dead-letter contract -- never silently dropped, which
 * is precisely the gap this whole mechanism exists to close. Never throws,
 * so one notification event's failure can never affect the turn it came
 * from.
 */
async function claimAndProcessCaptureNotificationEvent(eventId: string): Promise<void> {
  const now = new Date();
  const claimed = await prisma.domainEvent.updateMany({
    where: { id: eventId, status: 'PENDING', availableAt: { lte: now } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, processingStartedAt: now, leaseExpiresAt: new Date(now.getTime() + DOMAIN_EVENT_LEASE_MS) },
  });
  if (claimed.count !== 1) return;
  const claimedRow = await prisma.domainEvent.findUnique({ where: { id: eventId }, select: { attempts: true, payload: true } });
  if (!claimedRow) return;
  const claimedAttempts = claimedRow.attempts;
  try {
    await processCaptureNotificationEvent({ id: eventId, payload: claimedRow.payload }, claimedAttempts);
  } catch (error) {
    logger.warn({ error, eventId }, '[ask-conversational-capture] inline capture-notification attempt failed; leaving for worker retry');
    await prisma.domainEvent.updateMany({
      where: { id: eventId, attempts: claimedAttempts },
      data: {
        status: 'FAILED',
        lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error',
        availableAt: new Date(Date.now() + 60_000),
        processingStartedAt: null,
        leaseExpiresAt: null,
      },
    }).catch(() => undefined);
  }
}

/**
 * The fast, within-budget path's counterpart to claimAndProcessCaptureNotificationEvent:
 * this turn's capture candidates were already delivered inline via the
 * response's own childExecutions field, so the separately-requested
 * proactive notification would be pure noise -- cancels it as a no-op
 * rather than leaving it PENDING for the worker's poller to eventually fire
 * a redundant "come confirm this" nudge for something the homeowner already
 * saw this same turn. Guarded on the event still being PENDING (a
 * compare-and-swap, not an unconditional write) so this can never race a
 * genuine in-flight claim/send -- if something else already claimed it, this
 * is a harmless no-op and that attempt's own outcome stands.
 */
async function cancelRedundantCaptureNotification(eventId: string): Promise<void> {
  await prisma.domainEvent.updateMany({
    where: { id: eventId, status: 'PENDING' },
    data: { status: 'PROCESSED', processedAt: new Date(), processingStartedAt: null, leaseExpiresAt: null },
  }).catch((error) => {
    logger.warn({ error, eventId }, '[ask-conversational-capture] failed to cancel a redundant, already-delivered-inline capture notification');
  });
}

/**
 * Code review finding (2026-09-13): this used to take a markProcessed flag
 * and, for the worker path, rely on processDomainEvents.job.ts's own
 * generic post-handler write to mark the event PROCESSED -- a SEPARATE,
 * non-atomic write from the one that created the candidates. A crash
 * between the two left the candidates durably committed but the event
 * still PROCESSING; once its lease expired, the event was reclaimed and
 * extraction ran again, and the retried attempt's OWN candidates would
 * reuse the first attempt's already-created rows purely by clientRequestId
 * index position -- silently mixing an old candidate's content with a
 * different new extraction result at the same index. Always marking
 * PROCESSED inside this SAME transaction (both paths) closes that window:
 * a crash before this transaction commits means nothing was created at
 * all (safe to fully retry); a crash after means the row is already both
 * populated AND PROCESSED (safe, nothing to retry). The workers' own
 * generic post-handler write still runs afterward for the worker path and
 * is now a harmless no-op re-write of the same already-PROCESSED status.
 */
async function persistCandidates(
  domainEventId: string,
  claimedAttempts: number,
  rawCandidates: ExtractionCandidate[],
  input: ConversationalCaptureInput,
  recentDocuments: readonly RecentDocumentContext[] = [],
): Promise<{ executions: PersistedCaptureExecution[]; notificationEventId: string | null }> {
  const validCandidates = filterValidCandidates(rawCandidates);
  // Ask Cozy Stage 3, Phase 6: GOAL candidates are split out here, before
  // the transaction below, and given their own durable
  // ASK_GOAL_CANDIDATE_ATTACH_REQUESTED events INSIDE that same transaction
  // (requestGoalCandidateAttachment, below) rather than being processed
  // directly against a live DecisionThread write -- see
  // processGoalCandidateAttachEvent's own header comment for the full
  // rationale (a durable-event fix for a real "goal work lost on crash"
  // gap). filterCandidatesPreservingWarrantyLinks (used for the non-GOAL
  // side, via splitGoalCandidates) keeps every remaining WARRANTY's
  // linkedEventCandidateIndex correct against the array the existing loop
  // below actually iterates -- a plain filter would silently break that
  // index if a GOAL candidate happened to sit before a WARRANTY/EVENT pair
  // in the same extraction batch.
  const { nonGoalCandidates: candidates, goalCandidates: rawGoalCandidates } = splitGoalCandidates(validCandidates);
  // Ask Cozy Stage 3, Phase 6: a second, dedicated flag on top of
  // askConversationalCaptureEnabled (already gating this whole pipeline's
  // entry point, runConversationalCaptureForTurn, below) -- GOAL processing
  // performs a real DecisionThread write, materially different from
  // FACT/EVENT/WARRANTY's confirmation-gated captures, so it can be rolled
  // out or killed independently. Gated here, the single choke point both
  // the inline (runConversationalCaptureForTurn) and worker-fallback
  // (processAskExtractionRequestedEvent) paths funnel through, rather than
  // at either call site individually.
  const goalCandidates = readAskOperationalControls().askGoalCaptureEnabled ? rawGoalCandidates : [];
  const now = new Date();
  const { created, goalAttachEvents, notificationEvent } = await prisma.$transaction(async (tx) => {
    // Applied even for zero candidates (code review finding, 2026-09-13):
    // a stale attempt whose claim was already reclaimed must not mark the
    // event PROCESSED out from under the attempt that reclaimed it.
    await verifyClaimStillOwned(tx, domainEventId, claimedAttempts);
    const created: PersistedCaptureExecution[] = [];
    for (const [index, candidate] of candidates.entries()) {
      // filterValidCandidates has already remapped linkedEventCandidateIndex
      // to this same `candidates` array's own indices (see
      // filterCandidatesPreservingWarrantyLinks), so this lookup is always
      // the correct sibling, and always a real EVENT candidate (the same
      // filter drops any WARRANTY whose target didn't survive).
      const linkedEventCandidate = candidate.category === 'WARRANTY' || candidate.category === 'EVIDENCE'
        ? candidates[candidate.linkedEventCandidateIndex] as EventExtractionCandidate
        : undefined;
      const data = buildChildExecutionData(candidate, index, input, now, linkedEventCandidate, recentDocuments);
      // A retried attempt for the same parent turn resolves to the
      // already-created child via clientRequestId's own uniqueness rather
      // than erroring the whole batch.
      const existing = await tx.askExecution.findUnique({
        where: { userId_clientRequestId: { userId: input.userId, clientRequestId: data.clientRequestId as string } },
      });
      created.push(existing ?? await tx.askExecution.create({ data }));
    }

    // Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
    // §9/§22, closing the "paired-confirmation scenario has no producer"
    // gap Phase 2's review left open), extended for the Phase 2 external
    // review's EVIDENCE category (same pairing shape exactly). Wires each
    // WARRANTY/EVIDENCE child's linkedExecutionId to its paired EVENT
    // child's, bidirectionally, in the SAME transaction that created both
    // rows -- captureLinkReconciliation.ts's own linkSiblingCaptureExecutions
    // can't be called here directly (it opens its own top-level
    // prisma.$transaction), so the two updates are inlined against this
    // transaction's own `tx` instead. Guarded on linkedExecutionId still
    // being unset so a replay (both children resolved via the `existing`
    // branch above) is a harmless no-op rather than clobbering an
    // already-reconciled pair. Unlike WARRANTY, EVIDENCE's own confirm
    // handler reads this link SYNCHRONOUSLY at confirm time (it needs the
    // sibling's real HomeEvent id, and HomeEventEvidence.eventId is a
    // required column with no reconciliation-friendly nullable slot the way
    // HomeEvent.warrantyId has) -- captureLinkReconciliation.ts's own
    // ASK_CAPTURE_LINK_RECONCILE path is not used for this pairing.
    //
    // Known, disclosed scope limitation: linkedExecutionId is a single
    // scalar field, a strict 1:1 pairing. If one message states BOTH a
    // warranty AND evidence for the SAME new event (rare, not the shape
    // either the WARRANTY or EVIDENCE Phase 0 decision was scoped around),
    // only the first candidate encountered here links to the event -- the
    // second is still created as its own confirmable execution, just
    // without an automatic cross-reference (confirmCaptureEvidence's own
    // missing-link branch surfaces this as a clear, recoverable message
    // rather than failing unexplained). The `created` array is mutated
    // in-memory after each link, not just written to the DB, so a third
    // candidate later in this same loop correctly sees an already-linked
    // event and also skips, instead of racing against stale in-memory state.
    for (const [index, candidate] of candidates.entries()) {
      if (candidate.category !== 'WARRANTY' && candidate.category !== 'EVIDENCE') continue;
      const pairedExecution = created[index];
      const eventExecution = created[candidate.linkedEventCandidateIndex];
      if (!pairedExecution || !eventExecution) continue;
      if (pairedExecution.linkedExecutionId || eventExecution.linkedExecutionId) continue;
      await tx.askExecution.update({ where: { id: eventExecution.id }, data: { linkedExecutionId: pairedExecution.id } });
      await tx.askExecution.update({ where: { id: pairedExecution.id }, data: { linkedExecutionId: eventExecution.id } });
      eventExecution.linkedExecutionId = pairedExecution.id;
      pairedExecution.linkedExecutionId = eventExecution.id;
    }

    // External review, Phase 6 [P2]: each GOAL candidate's own durable
    // attachment intent is created HERE, inside this same transaction --
    // committed atomically with the FACT/EVENT/WARRANTY rows above and the
    // ASK_EXTRACTION_REQUESTED completion write below, so a crash after
    // this transaction commits can never lose a goal candidate outright
    // (see requestGoalCandidateAttachment's own header comment).
    const goalAttachEvents: { id: string }[] = [];
    for (const [index, candidate] of goalCandidates.entries()) {
      goalAttachEvents.push(await requestGoalCandidateAttachment(tx, candidate, index, input));
    }

    // External review, 2026-09-14 (FRD §10/§29): the durable INTENT to
    // proactively notify is created here, inside this same transaction --
    // committed atomically with the FACT/EVENT/WARRANTY/EVIDENCE rows above
    // and the triggering event's own PROCESSED marking below, so a crash
    // after this transaction commits can never lose the notification outright
    // (see requestCaptureNotification's own header comment). Only for rows
    // that actually need a homeowner nudge -- NEEDS_CONFIRMATION only, same
    // filter the old, non-durable notifyCaptureCandidatesDelivered used.
    const notificationEvent = await requestCaptureNotification(
      tx,
      input,
      domainEventId,
      created.filter((execution) => execution.status === 'NEEDS_CONFIRMATION').map((execution) => execution.id),
    );

    await tx.domainEvent.update({
      where: { id: domainEventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        processingStartedAt: null,
        leaseExpiresAt: null,
        payload: { processingOutcome: { candidateCount: created.length + goalAttachEvents.length } },
      },
    });
    return { created, goalAttachEvents, notificationEvent };
  });

  // Outside the transaction above, deliberately (see processGoalCandidate's
  // own header comment for why the actual thread-attachment work -- as
  // opposed to the durable intent to do it, created inside the transaction
  // above -- must not run inside it). This is now a pure responsiveness
  // optimization, not the only chance this goal candidate gets: each
  // event's own claim/complete/fail lifecycle (claimAndProcessGoalAttachEvent)
  // means a failure or a crash here leaves it PENDING/FAILED for the
  // worker's own poller to retry per the standard backoff/dead-letter
  // contract, never silently lost -- unlike this function's previous
  // design, where the triggering event was already PROCESSED (its payload
  // already overwritten) by the time this ran.
  const goalExecutions: PersistedCaptureExecution[] = [];
  for (const event of goalAttachEvents) {
    const execution = await claimAndProcessGoalAttachEvent(event.id);
    if (execution) goalExecutions.push(execution);
  }
  return { executions: [...created, ...goalExecutions], notificationEventId: notificationEvent?.id ?? null };
}

/**
 * The extraction-trigger call site's one entry point, called inline from
 * createAskExecution's success path (askOrchestrator.service.ts). Never
 * throws -- any failure here must never affect the routed answer that
 * already succeeded this turn (FRD §10: "Steps 6 and 8 are independent").
 * Returns the child AskExecution rows created within the synchronous
 * ~1.5s budget; an empty array covers three cases indistinguishable to the
 * caller (flag off, pre-filter didn't fire, or extraction is still running
 * past budget) -- distinguishing them is diagnostic, not behavioral, so
 * callers should not infer anything from an empty result beyond "nothing to
 * show inline this turn."
 */
export async function runConversationalCaptureForTurn(input: ConversationalCaptureInput): Promise<PersistedCaptureExecution[]> {
  const controls = readAskOperationalControls();
  if (!controls.askConversationalCaptureEnabled) return [];
  if (input.skipDueToRoutedCapture) return [];

  const preFilter = evaluateExtractionPreFilter(input.message);
  if (!preFilter.shouldExtract) return [];

  const idempotencyKey = `ask-extraction:${input.parentExecutionId}`;
  const now = new Date();
  let domainEventId: string;
  try {
    const event = await prisma.domainEvent.upsert({
      where: { idempotencyKey },
      create: {
        type: 'ASK_EXTRACTION_REQUESTED',
        status: 'PENDING',
        propertyId: input.propertyId,
        userId: input.userId,
        idempotencyKey,
        payload: { executionId: input.parentExecutionId, message: input.message },
        availableAt: now,
      },
      update: {},
    });
    domainEventId = event.id;
  } catch (error) {
    logger.warn({ error, parentExecutionId: input.parentExecutionId }, '[ask-conversational-capture] failed to persist durable extraction intent; skipping this turn');
    return [];
  }

  // Claim it inline, same predicate the worker's own poller uses -- this is
  // the "attempt," not a separate bookkeeping step. A lost race (someone
  // else claimed it first) is vanishingly unlikely for a row just created
  // in this same call, but handled the same safe way either way: skip
  // silently, since whoever claimed it owns completing it.
  const claimed = await prisma.domainEvent.updateMany({
    where: { id: domainEventId, status: 'PENDING', availableAt: { lte: now } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, processingStartedAt: now, leaseExpiresAt: new Date(now.getTime() + DOMAIN_EVENT_LEASE_MS) },
  });
  if (claimed.count !== 1) return [];
  const claimedRow = await prisma.domainEvent.findUnique({ where: { id: domainEventId }, select: { attempts: true } });
  const claimedAttempts = claimedRow?.attempts ?? 1;

  // The attempt itself: extraction, then claim-verified persistence. Not
  // cancelled on timeout below -- JS has no true promise cancellation, so
  // this keeps running in the background and will still commit (or
  // correctly no-op via verifyClaimStillOwned) once it finishes. Its own
  // rejection is always caught here so a slow-then-failing attempt never
  // becomes an unhandled rejection.
  // External review, 2026-09-13: set only by the timeout below, the moment
  // it actually fires first -- the one reliable signal that this turn's
  // response has already gone out without whatever `attempt` eventually
  // produces (Promise.race's own resolution doesn't tell either branch which
  // one "won," and setting this after `await`ing the race would run too
  // late to be read from inside `attempt`'s own still-pending body). If
  // `attempt` instead finishes first, this stays false and no notification
  // fires -- correct, since the caller's childExecutions field already
  // delivers the result inline in that same case.
  let timedOut = false;
  const attempt = (async () => {
    try {
      const [recentHomeEvents, recentDocuments, activeDecisionThread] = await Promise.all([
        fetchRecentHomeEventContext(input.propertyId),
        fetchRecentDocumentContext(input.propertyId),
        fetchActiveDecisionThreadContext(input.propertyId),
      ]);
      const { candidates } = await runStructuredExtraction(input.message, recentHomeEvents, recentDocuments, activeDecisionThread);
      const { executions: created, notificationEventId } = await persistCandidates(domainEventId, claimedAttempts, candidates, input, recentDocuments);
      // External review, 2026-09-14: the durable notification-intent event
      // (requestCaptureNotification, inside persistCandidates's own
      // transaction) always exists now if there's anything to notify about --
      // `timedOut` decides only whether THIS turn actually delivers it
      // (the async-fallback tail) or cancels it as redundant (the fast,
      // within-budget case already covered by this same response's own
      // childExecutions). Either way the event is resolved here-and-now on
      // the happy path; the worker's own poller remains the backstop if this
      // attempt itself fails or the process crashes before reaching here.
      //
      // External review, 2026-09-14 (second round): a prior version of this
      // code AWAITED the deliver/cancel call before returning `created` --
      // that await gave the sibling `timeout` promise below a real window to
      // fire while this attempt was still busy (Promise.race had not yet
      // resolved, since this async body had not yet reached its own return
      // statement), so a response that should have won the race could still
      // lose it to the timeout, while cancelRedundantCaptureNotification had
      // ALREADY marked the notification resolved -- neither inline delivery
      // nor a notification. Fixed by reading `timedOut` and dispatching the
      // deliver/cancel call WITHOUT awaiting it, then returning `created`
      // immediately: `attempt`'s own promise now resolves on the very next
      // microtask after persistCandidates settles, with no further `await`
      // in between for the timeout's macrotask-queued callback to preempt --
      // microtask callbacks (including this function's own resolution) are
      // always drained before the next pending macrotask (`setTimeout`) can
      // run, so `timedOut`'s value at the point it's read here is exactly
      // the value `Promise.race` itself will honor. The dispatched call is
      // still tracked to completion (errors logged, never left as an
      // unhandled rejection) -- it simply no longer gates this turn's own
      // response.
      if (notificationEventId) {
        const resolveNotification = timedOut
          ? claimAndProcessCaptureNotificationEvent(notificationEventId)
          : cancelRedundantCaptureNotification(notificationEventId);
        resolveNotification.catch((error) => {
          logger.warn({ error, parentExecutionId: input.parentExecutionId, notificationEventId }, '[ask-conversational-capture] capture-notification resolution failed');
        });
      }
      return created;
    } catch (error) {
      logger.warn({ error, parentExecutionId: input.parentExecutionId }, '[ask-conversational-capture] extraction attempt failed');
      // Release the claim promptly (rather than holding a 15-minute lease
      // uselessly) so the worker's own poller can retry per its existing
      // backoff convention.
      await prisma.domainEvent.updateMany({
        where: { id: domainEventId, attempts: claimedAttempts },
        data: { status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error', availableAt: new Date(Date.now() + 60_000), processingStartedAt: null, leaseExpiresAt: null },
      }).catch(() => undefined);
      return [] as PersistedCaptureExecution[];
    }
  })();

  const timeout = new Promise<PersistedCaptureExecution[]>((resolve) => {
    setTimeout(() => { timedOut = true; resolve([]); }, INLINE_EXTRACTION_BUDGET_MS);
  });
  return Promise.race([attempt, timeout]);
}

/**
 * The async-fallback path: called by the workers app's ASK_EXTRACTION_REQUESTED
 * consumer (processDomainEvents.job.ts) after its own generic claim loop has
 * already claimed the event (crash recovery / cold retry -- the inline
 * attempt above either finished, is still running past this event's lease,
 * or the whole backend process restarted before it could finish).
 * claimedAttempts is the event's own post-claim attempts value, matching
 * domainEventClaimToken.ts's documented contract.
 */
export async function processAskExtractionRequestedEvent(
  event: { id: string; propertyId: string | null; userId: string | null; payload: unknown },
  claimedAttempts: number,
): Promise<{ candidateCount: number }> {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
  const parentExecutionId = typeof payload.executionId === 'string' ? payload.executionId : null;
  const message = typeof payload.message === 'string' ? payload.message : null;
  if (!parentExecutionId || !message || !event.propertyId || !event.userId) {
    throw new Error('ASK_EXTRACTION_REQUESTED event missing executionId/message/propertyId/userId');
  }
  const parent = await prisma.askExecution.findUnique({ where: { id: parentExecutionId }, select: { sessionId: true, contextVersion: true } });
  if (!parent) throw new Error(`ASK_EXTRACTION_REQUESTED event's parent execution ${parentExecutionId} no longer exists`);

  const [recentHomeEvents, recentDocuments, activeDecisionThread] = await Promise.all([
    fetchRecentHomeEventContext(event.propertyId),
    fetchRecentDocumentContext(event.propertyId),
    fetchActiveDecisionThreadContext(event.propertyId),
  ]);
  const { candidates } = await runStructuredExtraction(message, recentHomeEvents, recentDocuments, activeDecisionThread);
  const captureInput: ConversationalCaptureInput = {
    userId: event.userId,
    sessionId: parent.sessionId,
    propertyId: event.propertyId,
    parentExecutionId,
    message,
    contextVersion: parent.contextVersion,
    skipDueToRoutedCapture: false,
  };
  const { executions: created, notificationEventId } = await persistCandidates(event.id, claimedAttempts, candidates, captureInput, recentDocuments);
  // External review, 2026-09-13/2026-09-14: this function only ever runs on
  // the async-fallback tail by construction (the workers app's own consumer
  // calls it after ITS claim loop already won the event -- see this
  // function's own header comment) -- unlike runConversationalCaptureForTurn's
  // inline attempt, there is no "delivered via this turn's response" case to
  // distinguish here, so this always attempts delivery rather than checking
  // a timed-out flag. The durable notification-intent event (created inside
  // persistCandidates's own transaction) means a failure here is no longer a
  // permanent loss -- it leaves the event PENDING/FAILED for the worker's
  // own generic poller to retry via the standard backoff/dead-letter
  // contract, same as every other DomainEvent type.
  if (notificationEventId) {
    await claimAndProcessCaptureNotificationEvent(notificationEventId);
  }
  return { candidateCount: created.length };
}
