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

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 "documents"
// candidate). Reads the Document vault itself (prisma.document, grouped
// by type and verification status) -- distinct from
// documentPromotionReviewResult/documentPromotionConfirmResult above,
// which only ever read pendingDocumentPromotionCandidates (a queue of
// pending extraction candidates), never prisma.document directly
// (confirmed by reading both handlers before writing this one).
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  INSPECTION_REPORT: 'Inspection reports', ESTIMATE: 'Estimates', INVOICE: 'Invoices', CONTRACT: 'Contracts',
  PERMIT: 'Permits', PHOTO: 'Photos', VIDEO: 'Videos', INSURANCE_CERTIFICATE: 'Insurance certificates',
  LICENSE: 'Licenses', HOME_REPORT_PDF: 'Home report PDFs', OTHER: 'Other',
};

async function documentLookupResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/documents`;
  const documents = await prisma.document.findMany({
    where: { propertyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (documents.length === 0) {
    return {
      status: 'ANSWERED',
      reasonCode: 'NO_DOCUMENTS_ON_FILE',
      blocks: [{ type: 'EMPTY_STATE', id: 'document-lookup-empty', title: 'No documents on file for this property', body: 'Ask found no uploaded documents recorded for this home yet.', actions: [{ id: 'open-documents', label: 'Open Documents', href, style: 'PRIMARY' }] }],
      suggestions: [],
    };
  }

  const grouped = new Map<string, typeof documents>();
  for (const document of documents) {
    const existing = grouped.get(document.type) ?? [];
    existing.push(document);
    grouped.set(document.type, existing);
  }
  const unverifiedCount = documents.filter((document) => document.verificationStatus === 'UNVERIFIED' || document.verificationStatus === 'PENDING').length;

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'document-lookup-summary',
    title: `${documents.length} document${documents.length === 1 ? '' : 's'} on file`,
    body: unverifiedCount ? `${unverifiedCount} not yet verified.` : 'All recorded documents are verified.',
    tone: unverifiedCount ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-documents', label: 'Open Documents', href, style: 'SECONDARY' }],
  }, {
    // ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: entityType lets
    // GroupedListBlock.tsx route this block through DocumentResultList
    // instead of the generic renderer's bare href. Detail is fetched via
    // GET /api/documents/property/:propertyId/:documentId
    // (propertyAuthMiddleware, VIEWER floor matching this operation's own
    // floor) -- deliberately NOT the existing GET /api/documents/:id
    // (requireDocumentOwnership, CONTRIBUTOR floor for a non-uploaded
    // document), which would 404 for every VIEWER-role household member
    // opening a document they didn't personally upload.
    type: 'GROUPED_LIST', filters: [],
    id: 'document-lookup-groups',
    title: 'Documents by type',
    description: 'Uploaded documents recorded for this property, grouped by type.',
    sections: [...grouped.entries()].sort(([left], [right]) => (DOCUMENT_TYPE_LABELS[left] ?? left).localeCompare(DOCUMENT_TYPE_LABELS[right] ?? right)).map(([type, docs]) => ({
      id: `document-lookup-${type.toLowerCase()}`,
      title: DOCUMENT_TYPE_LABELS[type] ?? type,
      count: docs.length,
      items: docs.slice(0, 20).map((document) => ({
        id: document.id,
        title: document.name,
        entityType: 'DOCUMENT',
        description: document.description ?? null,
        meta: [document.verificationStatus.toLowerCase().replace(/_/g, ' '), humanDate(document.createdAt)].filter((value): value is string => Boolean(value)),
        status: document.verificationStatus,
        href,
      })),
    })),
    actions: [],
  }];

  return {
    status: 'ANSWERED',
    reasonCode: unverifiedCount ? 'DOCUMENTS_INCLUDE_UNVERIFIED' : 'DOCUMENTS_ALL_VERIFIED',
    contextVersion: createHash('sha256').update(JSON.stringify(documents.map((document) => ({ id: document.id, verificationStatus: document.verificationStatus, updatedAt: document.updatedAt })))).digest('hex'),
    blocks,
    suggestions: ['Open Documents'],
  };
}

registerCapabilityHandler('document-promotion.review', async (envelope) => documentPromotionReviewResult(envelope.propertyId!));

registerCapabilityHandler('document-promotion.confirm', async (envelope) => documentPromotionConfirmResult(envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('documents.lookup', async (envelope) => documentLookupResult(envelope.userId, envelope.propertyId!));
