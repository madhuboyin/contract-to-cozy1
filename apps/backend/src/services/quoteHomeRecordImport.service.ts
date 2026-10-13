// Import a quote from a Home Record version into a Quote Comparison workspace (design: docs/architecture/QUOTE_COMPARISON_HOME_RECORD_IMPORT_DESIGN.md
// §3.1 to §3.9). Quote, provenance, record link, journey context and journey stage are written in one transaction; the same version imported into the
// same workspace twice returns the existing quote; a missing provider or price refuses rather than producing an empty quote; a newer version of a
// record already imported asks the person to replace or keep both. The quote is created unconfirmed: the review in the workspace is the affirmation
// (quoteReview.ts).
import type { HouseholdRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { visibleRecordWhere } from './homeRecordsAccess';
import { homeRecordsExtractionService } from './homeRecordsExtraction.service';
import { assembleImportedProposal, type ImportCandidate } from './quoteHomeRecordImport';
import { assertReviewMutable, getWorkspaceOrThrow, proposalCreateData, quoteInclude, type QuoteProposalInput } from './quoteComparison.service';
import {
  advanceServiceQuoteDecisionInTransaction,
  emitServiceQuoteDecisionAdvanceAnalytics,
  type AdvanceServiceQuoteDecisionInput,
} from './serviceQuoteDecisionJourney.service';
import { SERVICE_QUOTE_EXTRACTOR_ID, SERVICE_QUOTE_EXTRACTOR_VERSION, SERVICE_QUOTE_SCHEMA_VERSION } from './serviceQuoteExtraction';

const database = prisma as any;

/** Record types a quote may be imported from. An invoice is billed work, not a proposal (D-Q3). */
const IMPORTABLE_RECORD_TYPES = new Set(['QUOTE', 'CONTRACT', 'OTHER']);

export type NewerVersionChoice = 'REPLACE' | 'RETAIN_BOTH';

export interface ImportQuoteFromRecordInput {
  propertyId: string;
  workspaceId: string;
  userId: string;
  role: HouseholdRole;
  recordId: string;
  versionId?: string | null;
  onNewerVersion?: NewerVersionChoice | null;
}

export async function createQuoteProposalFromRecord(input: ImportQuoteFromRecordInput) {
  const workspace = await getWorkspaceOrThrow(input.propertyId, input.workspaceId);
  assertReviewMutable(workspace);

  // §3.1: the record is visible to the actor, shared with the household, active, of an importable type, with a validated version.
  const record = await database.propertyRecord.findFirst({
    where: { id: input.recordId, propertyId: input.propertyId, lifecycleStatus: 'ACTIVE', ...visibleRecordWhere(input.role) },
    select: { id: true, title: true, recordType: true, visibility: true, currentVersionId: true },
  });
  if (!record) throw new APIError('That document was not found.', 404, 'QUOTE_SOURCE_NOT_FOUND');
  if (record.visibility !== 'HOUSEHOLD') {
    throw new APIError('Only a document shared with your household can be imported into a shared quote comparison.', 409, 'QUOTE_SOURCE_NOT_SHARED');
  }
  if (record.recordType === 'INVOICE') {
    throw new APIError('An invoice is a bill for work already done, not a quote. Add the proposal for the work instead.', 409, 'QUOTE_SOURCE_IS_INVOICE');
  }
  if (!IMPORTABLE_RECORD_TYPES.has(record.recordType)) {
    throw new APIError('This kind of document is not a quote. Add it as a quote or estimate first.', 409, 'QUOTE_SOURCE_TYPE_NOT_SUPPORTED');
  }
  const versionId: string | null = input.versionId ?? record.currentVersionId;
  const version = versionId
    ? await database.propertyRecordVersion.findFirst({ where: { id: versionId, recordId: record.id }, select: { id: true, scanStatus: true } })
    : null;
  if (!version) throw new APIError('That version of the document was not found.', 404, 'QUOTE_SOURCE_VERSION_NOT_FOUND');
  if (version.scanStatus !== 'CLEAN') {
    throw new APIError('This file has not passed content validation yet. Try again shortly.', 409, 'QUOTE_SOURCE_NOT_CLEAN');
  }

  // §3.9(1): the same version into the same workspace is the same import.
  const alreadyImported = await database.quoteHomeRecordSource.findUnique({
    where: { workspaceId_propertyRecordVersionId: { workspaceId: input.workspaceId, propertyRecordVersionId: version.id } },
    include: { quote: { include: quoteInclude } },
  });
  if (alreadyImported) return { quote: alreadyImported.quote, alreadyImported: true, replacedQuoteId: null as string | null };

  // The extraction is run once per version (idempotent) and refuses a file that is not a quote or cannot be read.
  let candidates = await loadCandidates(version.id);
  if (!candidates.length) {
    await homeRecordsExtractionService.runExtraction({ propertyId: input.propertyId, recordId: record.id, versionId: version.id, role: input.role });
    candidates = await loadCandidates(version.id);
  }
  const assembled = assembleImportedProposal(candidates);
  if (assembled.status === 'INCOMPLETE') {
    // §3.9(3): no zero-dollar quote and no file-name provider. The person is told exactly what the document did not give us.
    throw new APIError(
      `This document does not show ${assembled.missing.join(' and ')}, so a quote cannot be made from it yet. Add the proposal by hand.`,
      422,
      'QUOTE_SOURCE_INCOMPLETE',
      { missing: assembled.missing },
    );
  }
  const proposal = assembled.proposal;
  const proposalInput: QuoteProposalInput = {
    vendorName: proposal.vendorName, quoteAmount: proposal.quoteAmount, currency: proposal.currency, quoteDate: proposal.quoteDate, expirationDate: proposal.expirationDate,
    serviceCategory: proposal.serviceCategory as never, serviceLocation: proposal.serviceLocation, scopeKind: proposal.scopeKind, scopeSummary: proposal.scopeSummary,
    notes: proposal.notes, sourceType: 'UPLOADED_QUOTE', providerLicenseNumber: proposal.providerLicenseNumber,
    lineItems: proposal.lineItems.map((item) => ({ ...item, kind: item.kind as never })),
    terms: proposal.terms.map((term) => ({ ...term, type: term.type as never })),
  };
  const extractedAt = candidates.reduce<Date>((earliest, c) => (c.createdAt < earliest ? c.createdAt : earliest), candidates[0].createdAt);

  const advance: AdvanceServiceQuoteDecisionInput = {
    propertyId: input.propertyId, workspaceId: input.workspaceId, actorUserId: input.userId, toStage: 'SCOPE_REVIEW',
    relatedEntityType: 'HOME_RECORD', relatedEntityId: record.id, reason: 'A quote document was extracted for homeowner review.',
  };
  const done = await database.$transaction(async (tx: any) => {
    // Re-check inside the transaction: a concurrent identical import wins, and this one returns its quote.
    const concurrent = await tx.quoteHomeRecordSource.findUnique({
      where: { workspaceId_propertyRecordVersionId: { workspaceId: input.workspaceId, propertyRecordVersionId: version.id } },
      include: { quote: { include: quoteInclude } },
    });
    if (concurrent) return { quote: concurrent.quote, existing: true as const };

    // §3.9(4): a newer version of a document already imported here is a choice, not a silent second active quote.
    const earlier = await tx.quoteHomeRecordSource.findMany({
      where: { workspaceId: input.workspaceId, propertyRecordId: record.id, supersededByQuoteId: null, propertyRecordVersionId: { not: version.id } },
      select: { id: true, quoteId: true, propertyRecordVersionId: true },
    });
    if (earlier.length && !input.onNewerVersion) {
      throw new APIError(
        'An earlier version of this document is already in this comparison. Replace that proposal with this version, or keep both.',
        409,
        'QUOTE_SOURCE_VERSION_CHOICE_REQUIRED',
        { existingQuoteIds: earlier.map((entry: any) => entry.quoteId) },
      );
    }

    const created = await tx.quoteComparisonQuote.create({
      data: {
        workspaceId: input.workspaceId,
        ...proposalCreateData(proposalInput),
        factConfirmations: {
          create: proposal.facts.map((fact) => ({
            fieldKey: fact.fieldKey, extractedValueJson: fact.extractedValue, confirmedValueJson: fact.confirmedValue,
            status: fact.status, confidence: fact.confidence, sourceText: fact.sourceText,
          })),
        },
        homeRecordSource: {
          create: {
            workspaceId: input.workspaceId, propertyId: input.propertyId, propertyRecordId: record.id, propertyRecordVersionId: version.id,
            extractorId: SERVICE_QUOTE_EXTRACTOR_ID, extractorVersion: SERVICE_QUOTE_EXTRACTOR_VERSION, schemaVersion: SERVICE_QUOTE_SCHEMA_VERSION,
            modelId: null, extractedAt, importedByUserId: input.userId,
          },
        },
      },
      include: quoteInclude,
    });

    // Deleting the source record shows up in its deletion impact (design §3.5).
    await tx.propertyRecordLink.upsert({
      where: { recordId_entityType_entityId_purpose: { recordId: record.id, entityType: 'SERVICE_QUOTE', entityId: created.id, purpose: 'SOURCE' } },
      create: { recordId: record.id, versionId: version.id, entityType: 'SERVICE_QUOTE', entityId: created.id, purpose: 'SOURCE', label: proposal.vendorName, createdByUserId: input.userId },
      update: { versionId: version.id, label: proposal.vendorName },
    });

    let replacedQuoteId: string | null = null;
    if (earlier.length && input.onNewerVersion === 'REPLACE') {
      for (const entry of earlier as Array<{ id: string; quoteId: string }>) {
        await tx.quoteHomeRecordSource.update({ where: { id: entry.id }, data: { supersededByQuoteId: created.id } });
        await tx.quoteComparisonQuote.update({ where: { id: entry.quoteId }, data: { decision: 'REJECTED', isSelected: false } });
        await tx.quoteComparisonWorkspace.updateMany({
          where: { id: input.workspaceId, selectedQuoteId: entry.quoteId },
          data: { selectedQuoteId: null, selectedVendorName: null, selectedQuoteAmount: null, status: 'DRAFT' },
        });
        replacedQuoteId = entry.quoteId;
      }
    }
    const advanced = await advanceServiceQuoteDecisionInTransaction(tx, advance);
    return { quote: created, existing: false as const, replacedQuoteId, advanced };
  });
  if (done.existing) return { quote: done.quote, alreadyImported: true, replacedQuoteId: null as string | null };
  emitServiceQuoteDecisionAdvanceAnalytics(advance, done.advanced.result, done.advanced.transitionRecorded);
  return { quote: done.quote, alreadyImported: false, replacedQuoteId: done.replacedQuoteId ?? null };
}

async function loadCandidates(versionId: string): Promise<Array<ImportCandidate & { createdAt: Date }>> {
  const rows = await database.extractedFactCandidate.findMany({
    where: { propertyRecordVersionId: versionId, targetDomain: 'SERVICE_QUOTE', fieldKey: { not: '_documentType' } },
    orderBy: { createdAt: 'asc' },
  }) as Array<{ fieldKey: string; proposedValue: string | null; reviewStatus: ImportCandidate['reviewStatus']; reviewedValue: string | null; confidence: number | null; sourceCitation: string | null; createdAt: Date }>;
  return rows.map((row) => ({ ...row }));
}
