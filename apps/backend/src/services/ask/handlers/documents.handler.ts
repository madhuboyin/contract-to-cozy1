// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate } from '../askFormatting';
import { ensurePropertyAccess, exactEntityMatch } from '../askHandlerSupport';
import { listPropertyDocuments, type PropertyDocument } from '../../propertyDocuments/propertyDocumentInventory.service';
import { type AskViewState } from '../support/executionState';
import { loadAskViewState } from './maintenance.handler';
import { containsFilterContinuation } from '../askFollowUpContext';

type DocumentPromotionCandidate = { id: string; kind: 'MATERIAL_EXTRACTION_REVIEW' | 'INSPECTION_REPORT' | 'INSURANCE_POLICY_FACT'; title: string; description: string; updatedAt: Date; parentId: string; candidateFields?: Record<string, unknown> };

async function pendingDocumentPromotionCandidates(propertyId: string): Promise<DocumentPromotionCandidate[]> {
  const [materialReviews, inspectionReports, policyFacts] = await Promise.all([
    prisma.materialExtractionReview.findMany({ where: { propertyId, status: 'NEEDS_REVIEW' }, orderBy: { updatedAt: 'desc' }, take: 25, include: { materialSpec: { select: { id: true, label: true } } } }),
    prisma.inspectionReport.findMany({ where: { propertyId, status: 'REVIEW_PENDING' }, orderBy: { updatedAt: 'desc' }, take: 25, select: { id: true, reportType: true, inspectionDate: true, totalFindings: true, updatedAt: true } }),
    prisma.insurancePolicyFact.findMany({ where: { confirmationStatus: 'PENDING', policyTerm: { propertyId } }, orderBy: { updatedAt: 'desc' }, take: 25, include: { policyTerm: { include: { insurancePolicy: { select: { id: true, carrierName: true, homeownerProfileId: true } } } } } }),
  ]);
  return [
    ...materialReviews.map((review): DocumentPromotionCandidate => ({ id: review.id, kind: 'MATERIAL_EXTRACTION_REVIEW', title: `Material review: ${review.materialSpec.label}`, description: `${Object.keys(review.candidateFields as Record<string, unknown>).length} extracted fields awaiting review`, updatedAt: review.updatedAt, parentId: review.materialSpecId, candidateFields: review.candidateFields as Record<string, unknown> })),
    ...inspectionReports.map((report): DocumentPromotionCandidate => ({ id: report.id, kind: 'INSPECTION_REPORT', title: `${String(report.reportType).toLowerCase().replace(/_/g, ' ')} inspection report`, description: `${report.totalFindings} extracted findings · ${humanDate(report.inspectionDate) ?? 'date unavailable'}`, updatedAt: report.updatedAt, parentId: report.id })),
    ...policyFacts.map((fact): DocumentPromotionCandidate => {
      const value = fact.amountValue?.toString() ?? fact.textValue ?? (fact.booleanValue == null ? 'extracted value' : String(fact.booleanValue));
      return { id: fact.id, kind: 'INSURANCE_POLICY_FACT', title: `${fact.policyTerm.insurancePolicy.carrierName}: ${fact.factKey.toLowerCase().replace(/_/g, ' ')}`, description: `Candidate value: ${value}`, updatedAt: fact.updatedAt, parentId: fact.policyTerm.insurancePolicy.id, candidateFields: { homeownerProfileId: fact.policyTerm.insurancePolicy.homeownerProfileId, factKey: fact.factKey } };
    }),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

async function documentPromotionReviewResult(propertyId: string): Promise<AskOperationResult> {
  const candidates = await pendingDocumentPromotionCandidates(propertyId);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-records`;
  if (candidates.length === 0) return { status: 'ANSWERED', reasonCode: 'NO_DOCUMENT_PROMOTIONS_PENDING', blocks: [{ type: 'EMPTY_STATE', id: 'document-promotion-empty', title: 'No document-derived records await review', body: 'Ask found no pending material extraction or inspection-report promotion gate.', actions: [{ id: 'open-documents', label: 'Open Documents', href, style: 'PRIMARY' }] }], suggestions: [] };
  return { status: 'ANSWERED', reasonCode: 'DOCUMENT_PROMOTIONS_PENDING', blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'document-promotions', title: 'Document-derived records awaiting review', description: 'Nothing listed here becomes trusted canonical data until you confirm the exact candidate.', sections: [{ id: 'pending', title: 'Needs homeowner review', count: candidates.length, items: candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, description: candidate.description, meta: [`Source kind: ${candidate.kind.toLowerCase().replace(/_/g, ' ')}`], status: 'NEEDS_REVIEW', href })) }], actions: [{ id: 'open-documents', label: 'Open Documents', href, style: 'SECONDARY' }] }, { type: 'EVIDENCE', id: 'document-promotion-provenance', title: 'Promotion boundary', items: [{ label: 'Review gate', source: 'Canonical domain-specific review records', observedAt: new Date().toISOString() }] }], suggestions: [] };
}

async function documentPromotionConfirmResult(propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const candidates = await pendingDocumentPromotionCandidates(propertyId);
  const selected = exactEntityMatch(candidates, message, launchContext);
  const decision = /\breject|discard\b/i.test(message) ? 'REJECT' : /\bconfirm|promote|apply\b/i.test(message) ? 'CONFIRM' : null;
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-records`;
  if (!selected || !decision) return { status: 'NEEDS_ENTITY', reasonCode: 'DOCUMENT_PROMOTION_TARGET_REQUIRED', blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'document-promotion-targets', title: 'Choose an exact candidate and decision', description: 'Use the candidate id or exact title and say confirm or reject.', sections: [{ id: 'pending', title: 'Pending candidates', count: candidates.length, items: candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, description: candidate.description, meta: [], status: 'NEEDS_REVIEW', href })) }], actions: [{ id: 'open-documents', label: 'Review Documents', href, style: 'SECONDARY' }] }], suggestions: [] };
  if (selected.kind === 'INSPECTION_REPORT' && decision === 'REJECT') return { status: 'BLOCKED', reasonCode: 'INSPECTION_REPORT_REJECTION_REQUIRES_REVIEW_UI', blocks: [{ type: 'BOUNDARY', id: 'inspection-report-rejection-boundary', title: 'Review corrections in Inspection Hub', severity: 'INFO', body: 'Ask can confirm the reviewed report, but rejecting or correcting individual extracted findings requires the report review screen so the exact edits and evidence remain visible.', suggestions: [] }], suggestions: [] };
  const contextVersion = createHash('sha256').update(`${selected.kind}:${selected.id}:${selected.updatedAt.toISOString()}`).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'DOCUMENT_PROMOTION_CONFIRMATION_REQUIRED', contextVersion, parameters: { documentPromotionKind: selected.kind, documentPromotionId: selected.id, documentPromotionParentId: selected.parentId, documentPromotionDecision: decision, documentPromotionCandidateFields: selected.candidateFields ?? null, documentPromotionContextVersion: contextVersion, ...(launchContext?.sourceExecutionId ? { sourceExecutionId: launchContext.sourceExecutionId } : {}), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() }, blocks: [{ type: 'SUMMARY', id: 'document-promotion-confirm-review', title: `Review document ${decision.toLowerCase()}`, body: decision === 'CONFIRM' ? 'Confirming writes the reviewed candidate through its canonical domain adapter and records the promotion outcome.' : 'Rejecting preserves the source evidence but prevents these candidate values from becoming canonical facts.', tone: 'CAUTION', actions: [{ id: 'open-documents', label: 'Review source', href, style: 'SECONDARY' }] }], confirmation: { confirmationId: `document-promotion-${selected.id}-1`, version: 1, title: `${decision === 'CONFIRM' ? 'Confirm' : 'Reject'} ${selected.title}?`, description: selected.description, fields: [{ label: 'Candidate', value: selected.title }, { label: 'Decision', value: decision.toLowerCase() }], editableFields: [], confirmLabel: decision === 'CONFIRM' ? 'Confirm and promote' : 'Reject candidate', consentText: 'I reviewed this exact document-derived candidate and authorize the selected decision.', expiresAt: expiresAt.toISOString() }, suggestions: [] };
}

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 "documents" candidate). The document lookup reads the canonical property
// document inventory (Home Records authoritative, the legacy Document vault projected as transitional; see
// propertyDocuments/propertyDocumentInventory.service.ts) -- distinct from documentPromotionReviewResult/documentPromotionConfirmResult above,
// which only ever read pendingDocumentPromotionCandidates (a queue of pending extraction candidates).
const documentCount = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Documents D-1 (FRD v1.135), extended for the canonical inventory (FRD v1.136): the calm answer for the document lookup, as one counted
 * sentence, one supporting line and answer chips, from the recorded rows only (no model, no document contents). Each chip states a fact the
 * row's OWN store records: a Home Record can need review or be expiring; a transitional legacy document has a recorded verification status.
 * Nothing here says what a document means, whether it is complete, or whether anyone outside the record accepts it.
 */
export function documentsCalmCopy(input: {
  total: number; needsReview?: number; expired?: number; expiringSoon?: number; unverified?: number; verified?: number; rejected?: number;
  legacy?: number; newest: { name: string; addedOn: string | null } | null; truncatedKinds: number;
}): { headline: string; supportLine?: string; chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> } {
  const { total, newest, truncatedKinds } = input;
  const needsReview = input.needsReview ?? 0; const expired = input.expired ?? 0; const expiringSoon = input.expiringSoon ?? 0;
  const unverified = input.unverified ?? 0; const verified = input.verified ?? 0; const rejected = input.rejected ?? 0; const legacy = input.legacy ?? 0;
  const headline = total === 0 ? 'No documents on file.' : `${documentCount(total, 'document', 'documents')} on file.`;
  const notes = [
    newest ? `Most recent: ${newest.name}${newest.addedOn ? `, added ${newest.addedOn}` : ''}.` : null,
    // Transitional: these live in the older Documents vault until their area moves to Home Records.
    legacy > 0 ? `${legacy} ${legacy === 1 ? 'is' : 'are'} still in the older Documents vault.` : null,
    truncatedKinds > 0 ? 'Showing the most recent of each type; open Home Records for the full record.' : null,
  ].filter((note): note is string => Boolean(note));
  const chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> = [
    ...(needsReview > 0 ? [{ label: `${needsReview} need review`, tone: 'CAUTION' as const }] : []),
    ...(expired > 0 ? [{ label: `${expired} expired`, tone: 'CAUTION' as const }] : []),
    ...(expiringSoon > 0 ? [{ label: `${expiringSoon} expiring soon`, tone: 'CAUTION' as const }] : []),
    ...(unverified > 0 ? [{ label: `${unverified} not yet verified`, tone: 'CAUTION' as const }] : []),
    ...(rejected > 0 ? [{ label: `${rejected} rejected`, tone: 'CAUTION' as const }] : []),
    ...(verified > 0 ? [{ label: `${verified} verified`, tone: 'DEFAULT' as const }] : []),
  ];
  return notes.length ? { headline, supportLine: notes.join(' '), chips } : { headline, chips };
}

// D-2 (FRD v1.153): filters as a governed viewState refinement, the same continuity model as Maintenance, Buyer Deadlines and Warranties. A
// declared chip is a fresh authoritative read over every recorded document; it keeps the result identity, increments the revision and
// replaces only the dimension it names. Two independent dimensions: a verification status and a type (kind, present-in-this-home only).
export type DocumentVerificationFilter = 'ALL' | 'VERIFIED' | 'UNVERIFIED' | 'PENDING' | 'REJECTED';
const VERIFICATION_FILTERS: ReadonlySet<string> = new Set(['ALL', 'VERIFIED', 'UNVERIFIED', 'PENDING', 'REJECTED']);
// Each declared chip message begins with a phrase askFollowUpContext's FILTER_CONTINUATION_PATTERN accepts (asserted in tests).
const CLEAR_MESSAGE = 'Now show all documents with no filters';
const CLEAR_PATTERN = /^\s*now show all documents with no filters\b/i;
const ALL_STATUS_PATTERN = /^\s*now show all documents\b/i;
const ALL_TYPES_PATTERN = /^\s*now show all document types\b/i;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A kind key from what this question names, matched only against kinds this home actually has (never guessed from a fixed list). */
function matchDocumentKind(message: string, presentKinds: ReadonlyArray<{ kind: string; label: string }>): string | null {
  for (const entry of presentKinds) {
    const singular = entry.label.toLowerCase().replace(/s$/, '');
    if (new RegExp(`\\b${escapeRegExp(singular)}s?\\b`, 'i').test(message)) return entry.kind;
  }
  return null;
}
function documentVerificationFocus(message: string): DocumentVerificationFilter {
  if (/\brejected\b/i.test(message)) return 'REJECTED';
  if (/\bpending\b/i.test(message)) return 'PENDING';
  if (/\bunverified\b/i.test(message)) return 'UNVERIFIED';
  if (/\bverified\b/i.test(message)) return 'VERIFIED';
  return 'ALL';
}

/** What a fresh (non-continuation) question asks about, from its own words. Nothing is remembered between questions (continuation is below). */
export function documentFocus(message: string, presentKinds: ReadonlyArray<{ kind: string; label: string }>): { verification: DocumentVerificationFilter; kind: string | null } {
  return { verification: documentVerificationFocus(message), kind: matchDocumentKind(message, presentKinds) };
}

/** A declared chip or a typed filter phrase that continues the prior document-lookup result; an ordinary question is answered on its own. */
export function resolveDocumentRefinement(
  message: string, prior: AskViewState | null | undefined, presentKinds: ReadonlyArray<{ kind: string; label: string }>,
): { verification: DocumentVerificationFilter; kind: string | null } | null {
  if (!prior || !VERIFICATION_FILTERS.has(prior.statusFilter)) return null;
  if (!containsFilterContinuation(message)) return null;
  const priorKind = prior.domainScopePhrase && presentKinds.some((entry) => entry.kind === prior.domainScopePhrase) ? prior.domainScopePhrase : null;
  if (CLEAR_PATTERN.test(message)) return { verification: 'ALL', kind: null };
  const allTypes = ALL_TYPES_PATTERN.test(message);
  const verification: DocumentVerificationFilter | null = /\brejected\b/i.test(message) ? 'REJECTED'
    : /\bpending\b/i.test(message) ? 'PENDING'
      : /\bunverified\b/i.test(message) ? 'UNVERIFIED'
        : /\bverified\b/i.test(message) ? 'VERIFIED'
          : ALL_STATUS_PATTERN.test(message) ? 'ALL' : null;
  const kind = allTypes ? null : matchDocumentKind(message, presentKinds);
  if (!verification && !kind && !allTypes) return null;
  return { verification: verification ?? prior.statusFilter as DocumentVerificationFilter, kind: allTypes ? null : kind ?? priorKind };
}

export function buildDocumentViewState(prior: AskViewState | null | undefined, verification: DocumentVerificationFilter, kind: string | null): AskViewState {
  return {
    resultId: prior?.resultId ?? randomUUID(),
    // Documents reuse the generic fields: the kind key rides in domainScopePhrase, the verification filter in statusFilter.
    domainScopePhrase: kind, dateScopePhrase: null, statusFilter: verification, selectedTaskId: null, revision: (prior?.revision ?? 0) + 1,
  };
}

/** The declared chips: type chips only for kinds this home actually has, and a way back once a filter is applied. */
export function documentFilterChips(
  verification: DocumentVerificationFilter, kind: string | null, present: { kinds: ReadonlyArray<{ kind: string; label: string }>; pending: boolean; rejected: boolean },
) {
  return [
    { id: 'status-all', label: 'All', message: 'Now show all documents', active: verification === 'ALL' },
    { id: 'status-verified', label: 'Verified', message: 'Only show verified documents', active: verification === 'VERIFIED' },
    { id: 'status-unverified', label: 'Unverified', message: 'Only show unverified documents', active: verification === 'UNVERIFIED' },
    ...(present.pending || verification === 'PENDING' ? [{ id: 'status-pending', label: 'Pending', message: 'Only show documents pending verification', active: verification === 'PENDING' }] : []),
    ...(present.rejected || verification === 'REJECTED' ? [{ id: 'status-rejected', label: 'Rejected', message: 'Only show rejected documents', active: verification === 'REJECTED' }] : []),
    ...(present.kinds.length > 1 || kind ? [
      { id: 'type-all', label: 'All types', message: 'Now show all document types', active: kind === null },
      ...present.kinds.map((entry) => ({ id: `type-${entry.kind.toLowerCase()}`, label: entry.label, message: `Only show ${entry.label}`, active: kind === entry.kind })),
    ] : []),
    ...(verification !== 'ALL' || kind ? [{ id: 'clear-all', label: 'Clear filters', message: CLEAR_MESSAGE, active: false }] : []),
  ];
}

/** The prior view only when the source execution really was a document lookup (another domain's view state must never be continued). */
async function loadDocumentViewState(sourceExecutionId: string | null | undefined, userId: string): Promise<AskViewState | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId }, select: { operationId: true } });
  return source?.operationId === 'DOCUMENT_LOOKUP' ? loadAskViewState(sourceExecutionId, userId) : null;
}

const DOCUMENT_LOOKUP_BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'document-lookup-boundary', title: 'Recorded information only',
  body: 'This shows what is recorded about each document in your Home Record: its type, when it was added and its review or verification status. Ask has not read or interpreted the documents themselves.',
  severity: 'INFO', suggestions: [],
};

// Kinds are shown in one vocabulary whichever store holds the document; a legacy row keeps its own facts and is marked as transitional.
async function documentLookupResult(userId: string, propertyId: string, message: string, priorViewState?: AskViewState | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  // Home Records is the canonical page for documents; the legacy vault is reachable only for the rows still in it.
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-records`;
  // The transitional legacy branch is requested by name: it is removed once no domain still needs it.
  const inventory = await listPropertyDocuments({ propertyId, role: access.role, includeLegacy: true });
  const documents = inventory.items;

  if (documents.length === 0) {
    return {
      status: 'ANSWERED',
      reasonCode: 'NO_DOCUMENTS_ON_FILE',
      blocks: [{ type: 'EMPTY_STATE', id: 'document-lookup-empty', title: 'No documents on file for this property', body: 'Ask found no documents recorded for this home yet.', actions: [{ id: 'open-documents', label: 'Open Home Records', href, style: 'PRIMARY' }] }, DOCUMENT_LOOKUP_BOUNDARY],
      suggestions: [],
    };
  }

  // D-2: the chips reflect every recorded document (never the filtered subset), so a filter can always be widened or cleared.
  const presentKinds = [...new Map(documents.map((document) => [document.kind, document.kindLabel] as const)).entries()]
    .map(([kind, label]) => ({ kind, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const refinement = resolveDocumentRefinement(message, priorViewState, presentKinds);
  const focus = refinement ?? documentFocus(message, presentKinds);
  const verificationFilter = focus.verification;
  const kindFilter = focus.kind;
  const isFiltered = verificationFilter !== 'ALL' || kindFilter !== null;
  const matched = documents.filter((document) => (!kindFilter || document.kind === kindFilter) && (verificationFilter === 'ALL' || (document.verification ?? 'UNVERIFIED') === verificationFilter));
  const present = { kinds: presentKinds, pending: documents.some((document) => document.verification === 'PENDING'), rejected: documents.some((document) => document.verification === 'REJECTED') };
  const viewState = buildDocumentViewState(priorViewState, verificationFilter, kindFilter);
  const chips = documentFilterChips(verificationFilter, kindFilter, present);

  if (matched.length === 0 && refinement) {
    // A filter that matches nothing still continues the result and keeps every chip, so it can be widened or cleared.
    return {
      status: 'ANSWERED', reasonCode: 'DOCUMENT_FILTER_NO_MATCH', parameters: { viewState },
      blocks: [{
        type: 'SUMMARY', id: 'document-lookup-summary', title: 'No recorded documents match these filters', headline: 'No documents match these filters.',
        supportLine: `This home has ${documents.length} recorded ${documents.length === 1 ? 'document' : 'documents'}. Widen or clear a filter to see them.`,
        body: `This home has ${documents.length} recorded ${documents.length === 1 ? 'document' : 'documents'}, but none match the selected filters.`, tone: 'DEFAULT',
        actions: [{ id: 'open-documents', label: 'Open Home Records', href, style: 'SECONDARY' }],
      }, {
        type: 'GROUPED_LIST', filters: chips, id: 'document-lookup-groups', title: 'Documents by type',
        sections: [{ id: 'documents', title: 'Documents', count: 0, items: [] }],
        actions: [{ id: 'open-documents-list', label: 'Open Home Records', href, style: 'SECONDARY' }],
      }, DOCUMENT_LOOKUP_BOUNDARY],
      suggestions: [],
    };
  }

  if (matched.length === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'DOCUMENT_MATCH_NOT_FOUND',
      blocks: [{
        type: 'SUMMARY', id: 'document-lookup-no-match', title: 'No recorded document matches this request',
        body: `This home has ${documents.length} recorded ${documents.length === 1 ? 'document' : 'documents'}, but none match this request.`,
        tone: 'DEFAULT', actions: [{ id: 'open-documents', label: 'Open Home Records', href, style: 'SECONDARY' }],
      }, DOCUMENT_LOOKUP_BOUNDARY],
      suggestions: [],
    };
  }

  const grouped = new Map<string, { label: string; docs: PropertyDocument[] }>();
  for (const document of matched) {
    const existing = grouped.get(document.kind) ?? { label: document.kindLabel, docs: [] };
    existing.docs.push(document);
    grouped.set(document.kind, existing);
  }
  const count = (predicate: (document: PropertyDocument) => boolean) => matched.filter(predicate).length;
  const unverifiedCount = count((document) => document.verification === 'UNVERIFIED' || document.verification === 'PENDING');
  const needsReviewCount = count((document) => document.needsReview === true);
  const matchWord = matched.length === 1 ? 'matches' : 'match';

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'document-lookup-summary',
    title: isFiltered ? `${matched.length} document${matched.length === 1 ? '' : 's'} ${matchWord} this request` : `${documents.length} document${documents.length === 1 ? '' : 's'} on file`,
    body: needsReviewCount || unverifiedCount ? `${needsReviewCount + unverifiedCount} need attention.` : 'Nothing recorded needs review.',
    tone: needsReviewCount || unverifiedCount ? 'CAUTION' : 'DEFAULT',
    ...documentsCalmCopy({
      total: matched.length,
      needsReview: needsReviewCount,
      expired: count((document) => document.expiry === 'EXPIRED'),
      expiringSoon: count((document) => document.expiry === 'EXPIRING_SOON'),
      unverified: unverifiedCount,
      verified: count((document) => document.verification === 'VERIFIED'),
      rejected: count((document) => document.verification === 'REJECTED'),
      legacy: count((document) => document.transitional),
      newest: { name: matched[0].title, addedOn: humanDate(matched[0].addedAt) || null },
      truncatedKinds: [...grouped.values()].filter((group) => group.docs.length > 20).length,
    }),
    actions: [{ id: 'open-documents', label: 'Open Home Records', href, style: 'SECONDARY' }],
  }, {
    // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: entityType routes each row to its own inline detail. A Home Record is read through the record
    // route (record-level visibility applies); a transitional legacy document through the legacy property-scoped document route.
    type: 'GROUPED_LIST', filters: chips,
    id: 'document-lookup-groups',
    title: 'Documents by type',
    description: 'Documents recorded for this property, grouped by type.',
    sections: [...grouped.entries()].sort(([, left], [, right]) => left.label.localeCompare(right.label)).map(([kind, group]) => ({
      id: `document-lookup-${kind.toLowerCase()}`,
      title: group.label,
      count: group.docs.length,
      items: group.docs.slice(0, 20).map((document) => ({
        id: document.id,
        title: document.title,
        entityType: document.source === 'HOME_RECORD' ? 'PROPERTY_RECORD' : 'DOCUMENT',
        description: document.description,
        meta: [
          document.verification ? document.verification.toLowerCase().replace(/_/g, ' ') : null,
          document.needsReview ? 'needs review' : null,
          document.expiry === 'EXPIRED' ? 'expired' : document.expiry === 'EXPIRING_SOON' ? 'expiring soon' : null,
          humanDate(document.addedAt),
          document.transitional ? 'older vault' : null,
        ].filter((value): value is string => Boolean(value)),
        status: document.verification ?? (document.needsReview ? 'NEEDS_REVIEW' : document.expiry === 'EXPIRED' ? 'EXPIRED' : null),
        // A transitional legacy document has no page of its own any more (the legacy Documents workspace is retired); its inline detail still works.
        href: document.transitional ? null : href,
      })),
    })),
    // Documents D-1: the record page is a quiet text link in the calm answer only (the summary shows the same link in the previous shell).
    actions: [{ id: 'open-documents-list', label: 'Open Home Records', href, style: 'SECONDARY' }],
  }, DOCUMENT_LOOKUP_BOUNDARY];

  return {
    status: 'ANSWERED',
    reasonCode: needsReviewCount || unverifiedCount ? 'DOCUMENTS_INCLUDE_UNVERIFIED' : 'DOCUMENTS_ALL_VERIFIED',
    contextVersion: createHash('sha256').update(JSON.stringify(documents.map((document) => ({ id: document.id, source: document.source, verification: document.verification, needsReview: document.needsReview, updatedAt: document.updatedAt })))).digest('hex'),
    parameters: { viewState },
    blocks,
    suggestions: [],
  };
}

registerCapabilityHandler('document-promotion.review', async (envelope) => documentPromotionReviewResult(envelope.propertyId!));

registerCapabilityHandler('document-promotion.confirm', async (envelope) => documentPromotionConfirmResult(envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('documents.lookup', async (envelope) => documentLookupResult(
  envelope.userId, envelope.propertyId!, envelope.message,
  await loadDocumentViewState(envelope.launchContext?.sourceExecutionId, envelope.userId),
));
