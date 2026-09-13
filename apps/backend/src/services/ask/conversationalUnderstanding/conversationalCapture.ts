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
import type { AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { evaluateExtractionPreFilter } from './extractionPreFilter';
import { runStructuredExtraction, type RecentHomeEventContext } from './extractionContract';
import { filterCandidatesPreservingWarrantyLinks } from './extractionCandidateSchema';
import type { EventExtractionCandidate, ExtractionCandidate, FactExtractionCandidate, WarrantyExtractionCandidate } from './extractionCandidateSchema';

const DOMAIN_EVENT_LEASE_MS = 15 * 60_000;
// FRD §10: "Step 8's synchronous portion has a strict timeout (~1.5s...)".
const INLINE_EXTRACTION_BUDGET_MS = 1_500;
const CONFIRMATION_WINDOW_MS = 30 * 60_000;
const CAPTURE_CHANNEL = 'ASK_CONVERSATIONAL_CAPTURE';

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
// rather than reading the clock itself). `linkedEventCandidate` is only
// relevant for a WARRANTY candidate (its paired EVENT sibling, for
// resolveWarrantyDates's startDate fallback) -- always undefined/omitted
// for FACT/EVENT.
export function buildChildExecutionData(
  candidate: ExtractionCandidate,
  index: number,
  input: ConversationalCaptureInput,
  now: Date,
  linkedEventCandidate?: EventExtractionCandidate | null,
): Prisma.AskExecutionCreateInput {
  const expiresAt = confirmationExpiry(now);
  const confirmationVersion = 1;

  let operationId: 'CAPTURE_FACT_CONFIRM' | 'CAPTURE_EVENT_CONFIRM' | 'CAPTURE_WARRANTY_CONFIRM';
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
  } else {
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
      : [warrantyEditCaptureRequest(parameters, editContextVersion)];

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

// Code review finding (2026-09-13): a FACT candidate's value was never
// checked before being turned into a confirmation card -- filtering it here
// (before persistCandidates opens its transaction) means an invalid value
// never reaches the homeowner as a Save card that would only fail once
// confirmed.
// Exported for direct unit testing (pure, no I/O).
export function filterValidCandidates(candidates: ExtractionCandidate[]): ExtractionCandidate[] {
  // filterCandidatesPreservingWarrantyLinks, not a plain .filter(): dropping
  // an invalid FACT candidate shifts every later candidate's array
  // position, which would otherwise silently invalidate a WARRANTY
  // candidate's linkedEventCandidateIndex elsewhere in this same batch.
  return filterCandidatesPreservingWarrantyLinks(
    candidates,
    (candidate) => candidate.category !== 'FACT' || isValidFactCandidateValue(candidate),
  );
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
): Promise<PersistedCaptureExecution[]> {
  const candidates = filterValidCandidates(rawCandidates);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
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
      const linkedEventCandidate = candidate.category === 'WARRANTY'
        ? candidates[candidate.linkedEventCandidateIndex] as EventExtractionCandidate
        : undefined;
      const data = buildChildExecutionData(candidate, index, input, now, linkedEventCandidate);
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
    // gap Phase 2's review left open). Wires each WARRANTY child's
    // linkedExecutionId to its paired EVENT child's, bidirectionally, in
    // the SAME transaction that created both rows -- captureLinkReconciliation.ts's
    // own linkSiblingCaptureExecutions can't be called here directly (it
    // opens its own top-level prisma.$transaction), so the two updates are
    // inlined against this transaction's own `tx` instead. Guarded on
    // linkedExecutionId still being unset so a replay (both children
    // resolved via the `existing` branch above) is a harmless no-op rather
    // than clobbering an already-reconciled pair.
    for (const [index, candidate] of candidates.entries()) {
      if (candidate.category !== 'WARRANTY') continue;
      const warrantyExecution = created[index];
      const eventExecution = created[candidate.linkedEventCandidateIndex];
      if (!warrantyExecution || !eventExecution) continue;
      if (warrantyExecution.linkedExecutionId || eventExecution.linkedExecutionId) continue;
      await tx.askExecution.update({ where: { id: eventExecution.id }, data: { linkedExecutionId: warrantyExecution.id } });
      await tx.askExecution.update({ where: { id: warrantyExecution.id }, data: { linkedExecutionId: eventExecution.id } });
    }

    await tx.domainEvent.update({
      where: { id: domainEventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        processingStartedAt: null,
        leaseExpiresAt: null,
        payload: { processingOutcome: { candidateCount: created.length } },
      },
    });
    return created;
  });
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
  const attempt = (async () => {
    try {
      const recentHomeEvents = await fetchRecentHomeEventContext(input.propertyId);
      const { candidates } = await runStructuredExtraction(input.message, recentHomeEvents);
      return await persistCandidates(domainEventId, claimedAttempts, candidates, input);
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
    setTimeout(() => resolve([]), INLINE_EXTRACTION_BUDGET_MS);
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

  const recentHomeEvents = await fetchRecentHomeEventContext(event.propertyId);
  const { candidates } = await runStructuredExtraction(message, recentHomeEvents);
  const created = await persistCandidates(event.id, claimedAttempts, candidates, {
    userId: event.userId,
    sessionId: parent.sessionId,
    propertyId: event.propertyId,
    parentExecutionId,
    message,
    contextVersion: parent.contextVersion,
    skipDueToRoutedCapture: false,
  });
  return { candidateCount: created.length };
}
