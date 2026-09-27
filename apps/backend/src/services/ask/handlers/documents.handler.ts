// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate } from '../askFormatting';
import { ensurePropertyAccess, exactEntityMatch } from '../askHandlerSupport';
import { listPropertyDocuments, type PropertyDocument } from '../../propertyDocuments/propertyDocumentInventory.service';

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
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/documents`;
  if (candidates.length === 0) return { status: 'ANSWERED', reasonCode: 'NO_DOCUMENT_PROMOTIONS_PENDING', blocks: [{ type: 'EMPTY_STATE', id: 'document-promotion-empty', title: 'No document-derived records await review', body: 'Ask found no pending material extraction or inspection-report promotion gate.', actions: [{ id: 'open-documents', label: 'Open Documents', href, style: 'PRIMARY' }] }], suggestions: [] };
  return { status: 'ANSWERED', reasonCode: 'DOCUMENT_PROMOTIONS_PENDING', blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'document-promotions', title: 'Document-derived records awaiting review', description: 'Nothing listed here becomes trusted canonical data until you confirm the exact candidate.', sections: [{ id: 'pending', title: 'Needs homeowner review', count: candidates.length, items: candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, description: candidate.description, meta: [`Source kind: ${candidate.kind.toLowerCase().replace(/_/g, ' ')}`], status: 'NEEDS_REVIEW', href })) }], actions: [{ id: 'open-documents', label: 'Open Documents', href, style: 'SECONDARY' }] }, { type: 'EVIDENCE', id: 'document-promotion-provenance', title: 'Promotion boundary', items: [{ label: 'Review gate', source: 'Canonical domain-specific review records', observedAt: new Date().toISOString() }] }], suggestions: candidates.slice(0, 2).map((candidate) => `Confirm document candidate ${candidate.id}`) };
}

async function documentPromotionConfirmResult(propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const candidates = await pendingDocumentPromotionCandidates(propertyId);
  const selected = exactEntityMatch(candidates, message, launchContext);
  const decision = /\breject|discard\b/i.test(message) ? 'REJECT' : /\bconfirm|promote|apply\b/i.test(message) ? 'CONFIRM' : null;
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/documents`;
  if (!selected || !decision) return { status: 'NEEDS_ENTITY', reasonCode: 'DOCUMENT_PROMOTION_TARGET_REQUIRED', blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'document-promotion-targets', title: 'Choose an exact candidate and decision', description: 'Use the candidate id or exact title and say confirm or reject.', sections: [{ id: 'pending', title: 'Pending candidates', count: candidates.length, items: candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, description: candidate.description, meta: [], status: 'NEEDS_REVIEW', href })) }], actions: [{ id: 'open-documents', label: 'Review Documents', href, style: 'SECONDARY' }] }], suggestions: [] };
  if (selected.kind === 'INSPECTION_REPORT' && decision === 'REJECT') return { status: 'BLOCKED', reasonCode: 'INSPECTION_REPORT_REJECTION_REQUIRES_REVIEW_UI', blocks: [{ type: 'BOUNDARY', id: 'inspection-report-rejection-boundary', title: 'Review corrections in Inspection Hub', severity: 'INFO', body: 'Ask can confirm the reviewed report, but rejecting or correcting individual extracted findings requires the report review screen so the exact edits and evidence remain visible.', suggestions: [] }], suggestions: [] };
  const contextVersion = createHash('sha256').update(`${selected.kind}:${selected.id}:${selected.updatedAt.toISOString()}`).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'DOCUMENT_PROMOTION_CONFIRMATION_REQUIRED', contextVersion, parameters: { documentPromotionKind: selected.kind, documentPromotionId: selected.id, documentPromotionParentId: selected.parentId, documentPromotionDecision: decision, documentPromotionCandidateFields: selected.candidateFields ?? null, documentPromotionContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() }, blocks: [{ type: 'SUMMARY', id: 'document-promotion-confirm-review', title: `Review document ${decision.toLowerCase()}`, body: decision === 'CONFIRM' ? 'Confirming writes the reviewed candidate through its canonical domain adapter and records the promotion outcome.' : 'Rejecting preserves the source evidence but prevents these candidate values from becoming canonical facts.', tone: 'CAUTION', actions: [{ id: 'open-documents', label: 'Review source', href, style: 'SECONDARY' }] }], confirmation: { confirmationId: `document-promotion-${selected.id}-1`, version: 1, title: `${decision === 'CONFIRM' ? 'Confirm' : 'Reject'} ${selected.title}?`, description: selected.description, fields: [{ label: 'Candidate', value: selected.title }, { label: 'Decision', value: decision.toLowerCase() }], editableFields: [], confirmLabel: decision === 'CONFIRM' ? 'Confirm and promote' : 'Reject candidate', consentText: 'I reviewed this exact document-derived candidate and authorize the selected decision.', expiresAt: expiresAt.toISOString() }, suggestions: [] };
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

const DOCUMENT_LOOKUP_BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'document-lookup-boundary', title: 'Recorded information only',
  body: 'This shows what is recorded about each document in your Home Record: its type, when it was added and its review or verification status. Ask has not read or interpreted the documents themselves.',
  severity: 'INFO', suggestions: [],
};

// Kinds are shown in one vocabulary whichever store holds the document; a legacy row keeps its own facts and is marked as transitional.
async function documentLookupResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  // Home Records is the canonical page for documents; the legacy vault is reachable only for the rows still in it.
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-records`;
  const legacyHref = `/dashboard/documents?propertyId=${encodeURIComponent(propertyId)}`;
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

  const grouped = new Map<string, { label: string; docs: PropertyDocument[] }>();
  for (const document of documents) {
    const existing = grouped.get(document.kind) ?? { label: document.kindLabel, docs: [] };
    existing.docs.push(document);
    grouped.set(document.kind, existing);
  }
  const count = (predicate: (document: PropertyDocument) => boolean) => documents.filter(predicate).length;
  const unverifiedCount = count((document) => document.verification === 'UNVERIFIED' || document.verification === 'PENDING');
  const needsReviewCount = count((document) => document.needsReview === true);

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'document-lookup-summary',
    title: `${documents.length} document${documents.length === 1 ? '' : 's'} on file`,
    body: needsReviewCount || unverifiedCount ? `${needsReviewCount + unverifiedCount} need attention.` : 'Nothing recorded needs review.',
    tone: needsReviewCount || unverifiedCount ? 'CAUTION' : 'DEFAULT',
    ...documentsCalmCopy({
      total: documents.length,
      needsReview: needsReviewCount,
      expired: count((document) => document.expiry === 'EXPIRED'),
      expiringSoon: count((document) => document.expiry === 'EXPIRING_SOON'),
      unverified: unverifiedCount,
      verified: count((document) => document.verification === 'VERIFIED'),
      rejected: count((document) => document.verification === 'REJECTED'),
      legacy: inventory.totals.legacy,
      newest: { name: documents[0].title, addedOn: humanDate(documents[0].addedAt) || null },
      truncatedKinds: [...grouped.values()].filter((group) => group.docs.length > 20).length,
    }),
    actions: [{ id: 'open-documents', label: 'Open Home Records', href, style: 'SECONDARY' }],
  }, {
    // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: entityType routes each row to its own inline detail. A Home Record is read through the record
    // route (record-level visibility applies); a transitional legacy document through the legacy property-scoped document route.
    type: 'GROUPED_LIST', filters: [],
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
        href: document.transitional ? legacyHref : href,
      })),
    })),
    // Documents D-1: the record page is a quiet text link in the calm answer only (the summary shows the same link in the previous shell).
    actions: [{ id: 'open-documents-list', label: 'Open Home Records', href, style: 'SECONDARY' }],
  }, DOCUMENT_LOOKUP_BOUNDARY];

  return {
    status: 'ANSWERED',
    reasonCode: needsReviewCount || unverifiedCount ? 'DOCUMENTS_INCLUDE_UNVERIFIED' : 'DOCUMENTS_ALL_VERIFIED',
    contextVersion: createHash('sha256').update(JSON.stringify(documents.map((document) => ({ id: document.id, source: document.source, verification: document.verification, needsReview: document.needsReview, updatedAt: document.updatedAt })))).digest('hex'),
    blocks,
    suggestions: ['Open Home Records'],
  };
}

registerCapabilityHandler('document-promotion.review', async (envelope) => documentPromotionReviewResult(envelope.propertyId!));

registerCapabilityHandler('document-promotion.confirm', async (envelope) => documentPromotionConfirmResult(envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('documents.lookup', async (envelope) => documentLookupResult(envelope.userId, envelope.propertyId!));
