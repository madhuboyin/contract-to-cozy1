// apps/backend/src/services/homeRecordsExtraction.service.ts
//
// Turns AI document analysis into reviewable ExtractedFactCandidate rows
// instead of writing canonical records directly. WARRANTY and RECEIPT have
// implemented promotion contracts today (see promoteWarranty/promoteExpense)
// — WARRANTY is the exact domain the audit flagged for automatic, unreviewed
// warranty creation (HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// §1.1). No field is ever written to a canonical record until its candidate
// has been explicitly CONFIRMED or CORRECTED by a homeowner.
import type { ExpenseCategory, ExtractedFactCandidate, ExtractedFactReviewStatus, WarrantyCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { downloadObjectBuffer } from './storage/reportStorage';
import { documentIntelligenceService, type DocumentInsights } from './documentIntelligence.service';

// Purely informational — the AI's overall document classification, kept
// distinct from field-level candidates so a future extractor can report
// per-field confidence without a schema change. Never eligible for review
// actions or promotion.
const DOCUMENT_TYPE_FIELD_KEY = '_documentType';

const WARRANTY_REQUIRED_FIELD_KEYS = ['providerName', 'startDate', 'expiryDate'] as const;
const WARRANTY_OPTIONAL_FIELD_KEYS = ['category', 'coverageDetails', 'cost'] as const;
type WarrantyFieldKey =
  | (typeof WARRANTY_REQUIRED_FIELD_KEYS)[number]
  | (typeof WARRANTY_OPTIONAL_FIELD_KEYS)[number];

const WARRANTY_CATEGORY_VALUES = new Set<WarrantyCategory>([
  'APPLIANCE', 'HVAC', 'ROOFING', 'PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'HOME_WARRANTY_PLAN', 'OTHER',
]);

const EXPENSE_REQUIRED_FIELD_KEYS = ['description', 'amount', 'transactionDate'] as const;
const EXPENSE_OPTIONAL_FIELD_KEYS = ['category'] as const;
type ExpenseFieldKey =
  | (typeof EXPENSE_REQUIRED_FIELD_KEYS)[number]
  | (typeof EXPENSE_OPTIONAL_FIELD_KEYS)[number];

const EXPENSE_CATEGORY_VALUES = new Set<ExpenseCategory>([
  'REPAIR_SERVICE', 'PROPERTY_TAX', 'HOA_FEE', 'UTILITY', 'APPLIANCE', 'MATERIALS', 'OTHER',
]);

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function warrantyCandidatesFromInsights(
  insights: DocumentInsights,
): { fieldKey: WarrantyFieldKey; proposedValue: string }[] {
  const { extractedData } = insights;
  const candidates: { fieldKey: WarrantyFieldKey; proposedValue: string }[] = [];

  // Field, not document classification, confidence would ideally differ per
  // value — today's extractor only returns one overall number, so every row
  // shares it. Deliberately not synthesized further apart than that.
  const providerName = extractedData.manufacturer || extractedData.vendor;
  if (providerName) candidates.push({ fieldKey: 'providerName', proposedValue: providerName });

  if (extractedData.purchaseDate) {
    candidates.push({ fieldKey: 'startDate', proposedValue: toIsoDate(extractedData.purchaseDate) });
  }
  if (extractedData.warrantyExpiration) {
    candidates.push({ fieldKey: 'expiryDate', proposedValue: toIsoDate(extractedData.warrantyExpiration) });
  }
  if (extractedData.category) {
    const normalized = extractedData.category.trim().toUpperCase().replace(/[^A-Z_]/g, '_') as WarrantyCategory;
    candidates.push({
      fieldKey: 'category',
      proposedValue: WARRANTY_CATEGORY_VALUES.has(normalized) ? normalized : 'OTHER',
    });
  }
  const detailParts = [
    extractedData.productName ? `Product: ${extractedData.productName}` : null,
    extractedData.modelNumber ? `Model: ${extractedData.modelNumber}` : null,
    extractedData.serialNumber ? `Serial: ${extractedData.serialNumber}` : null,
  ].filter((part): part is string => Boolean(part));
  if (detailParts.length > 0) {
    candidates.push({ fieldKey: 'coverageDetails', proposedValue: detailParts.join(' · ') });
  }
  if (extractedData.amount != null) {
    candidates.push({ fieldKey: 'cost', proposedValue: String(extractedData.amount) });
  }

  return candidates;
}

function receiptCandidatesFromInsights(
  insights: DocumentInsights,
): { fieldKey: ExpenseFieldKey; proposedValue: string }[] {
  const { extractedData } = insights;
  const candidates: { fieldKey: ExpenseFieldKey; proposedValue: string }[] = [];

  const description = extractedData.vendor || extractedData.productName;
  if (description) candidates.push({ fieldKey: 'description', proposedValue: description });

  if (extractedData.amount != null) {
    candidates.push({ fieldKey: 'amount', proposedValue: String(extractedData.amount) });
  }
  if (extractedData.purchaseDate) {
    candidates.push({ fieldKey: 'transactionDate', proposedValue: toIsoDate(extractedData.purchaseDate) });
  }
  if (extractedData.category) {
    const normalized = extractedData.category.trim().toUpperCase().replace(/[^A-Z_]/g, '_') as ExpenseCategory;
    candidates.push({
      fieldKey: 'category',
      proposedValue: EXPENSE_CATEGORY_VALUES.has(normalized) ? normalized : 'OTHER',
    });
  }

  return candidates;
}

export class HomeRecordsExtractionService {
  async runExtraction(input: {
    propertyId: string;
    recordId: string;
    versionId: string;
  }): Promise<ExtractedFactCandidate[]> {
    const version = await prisma.propertyRecordVersion.findFirst({
      where: { id: input.versionId, recordId: input.recordId, record: { propertyId: input.propertyId } },
      include: { record: true },
    });
    if (!version) throw new APIError('Record version not found.', 404, 'PROPERTY_RECORD_VERSION_NOT_FOUND');
    if (version.record.lifecycleStatus === 'TRASHED') {
      throw new APIError('Restore the record before analyzing it.', 409, 'PROPERTY_RECORD_TRASHED');
    }
    if (version.scanStatus !== 'CLEAN') {
      throw new APIError(
        'This file has not passed content validation yet.',
        409,
        'PROPERTY_RECORD_VERSION_NOT_CLEAN',
      );
    }
    // Only WARRANTY and RECEIPT have a promotion contract implemented — see file header.
    if (version.record.recordType !== 'WARRANTY' && version.record.recordType !== 'RECEIPT') {
      throw new APIError(
        'AI review is available for warranty and receipt records in this release.',
        422,
        'PROPERTY_RECORD_EXTRACTION_UNSUPPORTED_TYPE',
      );
    }
    const targetDomain = version.record.recordType === 'WARRANTY' ? 'WARRANTY' as const : 'EXPENSE' as const;

    // Idempotent: re-running analysis on an already-analyzed version would
    // either duplicate candidates or silently discard homeowner review
    // decisions already recorded against the existing ones. Re-analysis
    // after a correction is a later-slice concern (would need explicit
    // versioning of the candidate set itself).
    const existing = await prisma.extractedFactCandidate.findMany({
      where: { propertyRecordVersionId: version.id },
      orderBy: { createdAt: 'asc' },
    });
    if (existing.length > 0) return existing;

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new APIError('Storage is not configured.', 503, 'PROPERTY_RECORD_STORAGE_UNAVAILABLE');
    }

    const buffer = await downloadObjectBuffer(bucket, version.storageKey);
    const insights = await documentIntelligenceService.analyzeDocument(buffer, version.mimeType);

    const citation = `AI extraction from "${version.originalFileName}"`;
    const confidence = insights.confidence ?? 0;
    const fieldCandidates = targetDomain === 'WARRANTY'
      ? warrantyCandidatesFromInsights(insights)
      : receiptCandidatesFromInsights(insights);
    const rows = [
      {
        propertyRecordVersionId: version.id,
        targetDomain,
        fieldKey: DOCUMENT_TYPE_FIELD_KEY,
        proposedValue: insights.documentType,
        sourceCitation: citation,
        confidence,
      },
      ...fieldCandidates.map((candidate) => ({
        propertyRecordVersionId: version.id,
        targetDomain,
        fieldKey: candidate.fieldKey,
        proposedValue: candidate.proposedValue,
        sourceCitation: citation,
        confidence,
      })),
    ];

    await prisma.extractedFactCandidate.createMany({ data: rows });
    return prisma.extractedFactCandidate.findMany({
      where: { propertyRecordVersionId: version.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async reviewCandidate(input: {
    propertyId: string;
    recordId: string;
    candidateId: string;
    userId: string;
    action: 'CONFIRM' | 'CORRECT' | 'REJECT';
    reviewedValue?: string | null;
  }): Promise<ExtractedFactCandidate> {
    const candidate = await prisma.extractedFactCandidate.findFirst({
      where: {
        id: input.candidateId,
        version: { recordId: input.recordId, record: { propertyId: input.propertyId } },
      },
    });
    if (!candidate) {
      throw new APIError('Extraction candidate not found.', 404, 'EXTRACTED_FACT_CANDIDATE_NOT_FOUND');
    }
    if (candidate.fieldKey === DOCUMENT_TYPE_FIELD_KEY) {
      throw new APIError(
        'The document classification is informational and cannot be reviewed.',
        422,
        'EXTRACTED_FACT_CANDIDATE_NOT_REVIEWABLE',
      );
    }
    if (candidate.promotedEntityId) {
      throw new APIError(
        'This field was already used to create a record and cannot be re-reviewed.',
        409,
        'EXTRACTED_FACT_CANDIDATE_ALREADY_PROMOTED',
      );
    }

    let reviewStatus: ExtractedFactReviewStatus;
    let reviewedValue: string | null;
    if (input.action === 'CONFIRM') {
      reviewStatus = 'CONFIRMED';
      reviewedValue = candidate.proposedValue;
    } else if (input.action === 'CORRECT') {
      if (!input.reviewedValue?.trim()) {
        throw new APIError('A corrected value is required.', 400, 'EXTRACTED_FACT_CANDIDATE_VALUE_REQUIRED');
      }
      reviewStatus = 'CORRECTED';
      reviewedValue = input.reviewedValue.trim();
    } else {
      reviewStatus = 'REJECTED';
      reviewedValue = null;
    }

    return prisma.extractedFactCandidate.update({
      where: { id: candidate.id },
      data: { reviewStatus, reviewedValue, reviewedByUserId: input.userId, reviewedAt: new Date() },
    });
  }

  async promoteWarranty(input: {
    propertyId: string;
    recordId: string;
    versionId: string;
    userId: string;
  }) {
    const version = await prisma.propertyRecordVersion.findFirst({
      where: { id: input.versionId, recordId: input.recordId, record: { propertyId: input.propertyId } },
    });
    if (!version) throw new APIError('Record version not found.', 404, 'PROPERTY_RECORD_VERSION_NOT_FOUND');

    const candidates = await prisma.extractedFactCandidate.findMany({
      where: {
        propertyRecordVersionId: version.id,
        targetDomain: 'WARRANTY',
        fieldKey: { not: DOCUMENT_TYPE_FIELD_KEY },
      },
    });
    const byField = new Map(candidates.map((candidate) => [candidate.fieldKey, candidate]));

    const missing = WARRANTY_REQUIRED_FIELD_KEYS.filter((key) => {
      const candidate = byField.get(key);
      return (
        !candidate
        || !candidate.reviewedValue
        || (candidate.reviewStatus !== 'CONFIRMED' && candidate.reviewStatus !== 'CORRECTED')
      );
    });
    if (missing.length > 0) {
      throw new APIError(
        `Confirm ${missing.join(', ')} before creating a warranty.`,
        409,
        'PROPERTY_RECORD_EXTRACTION_PROMOTION_INCOMPLETE',
        { missingFields: missing },
      );
    }
    if (candidates.some((candidate) => candidate.promotedEntityId)) {
      throw new APIError(
        'A warranty was already created from this analysis.',
        409,
        'PROPERTY_RECORD_EXTRACTION_ALREADY_PROMOTED',
      );
    }

    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
      select: { homeownerProfileId: true },
    });
    if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');

    const providerName = byField.get('providerName')!.reviewedValue!;
    const startDate = new Date(byField.get('startDate')!.reviewedValue!);
    const expiryDate = new Date(byField.get('expiryDate')!.reviewedValue!);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(expiryDate.getTime())) {
      throw new APIError(
        'Start date and expiration date must be valid dates.',
        422,
        'PROPERTY_RECORD_EXTRACTION_INVALID_DATE',
      );
    }

    const categoryCandidate = byField.get('category');
    const category = categoryCandidate?.reviewedValue && WARRANTY_CATEGORY_VALUES.has(categoryCandidate.reviewedValue as WarrantyCategory)
      ? (categoryCandidate.reviewedValue as WarrantyCategory)
      : undefined;
    const coverageDetails = byField.get('coverageDetails')?.reviewedValue ?? null;
    const costValue = byField.get('cost')?.reviewedValue;
    const cost = costValue && !Number.isNaN(Number(costValue)) ? Number(costValue) : null;

    const usedCandidateIds = WARRANTY_REQUIRED_FIELD_KEYS.map((key) => byField.get(key)!.id)
      .concat(WARRANTY_OPTIONAL_FIELD_KEYS.filter((key) => byField.get(key)).map((key) => byField.get(key)!.id));

    const warranty = await prisma.$transaction(async (tx) => {
      const created = await tx.warranty.create({
        data: {
          homeownerProfileId: property.homeownerProfileId,
          propertyId: input.propertyId,
          providerName,
          startDate,
          expiryDate,
          ...(category ? { category } : {}),
          ...(coverageDetails ? { coverageDetails } : {}),
          ...(cost != null ? { cost } : {}),
        },
      });

      await tx.extractedFactCandidate.updateMany({
        where: { id: { in: usedCandidateIds } },
        data: { promotedEntityType: 'WARRANTY', promotedEntityId: created.id },
      });

      await tx.propertyRecordLink.create({
        data: {
          recordId: input.recordId,
          versionId: version.id,
          entityType: 'WARRANTY',
          entityId: created.id,
          purpose: 'WARRANTY',
          createdByUserId: input.userId,
        },
      });

      return created;
    });

    return warranty;
  }

  async promoteExpense(input: {
    propertyId: string;
    recordId: string;
    versionId: string;
    userId: string;
  }) {
    const version = await prisma.propertyRecordVersion.findFirst({
      where: { id: input.versionId, recordId: input.recordId, record: { propertyId: input.propertyId } },
    });
    if (!version) throw new APIError('Record version not found.', 404, 'PROPERTY_RECORD_VERSION_NOT_FOUND');

    const candidates = await prisma.extractedFactCandidate.findMany({
      where: {
        propertyRecordVersionId: version.id,
        targetDomain: 'EXPENSE',
        fieldKey: { not: DOCUMENT_TYPE_FIELD_KEY },
      },
    });
    const byField = new Map(candidates.map((candidate) => [candidate.fieldKey, candidate]));

    const missing = EXPENSE_REQUIRED_FIELD_KEYS.filter((key) => {
      const candidate = byField.get(key);
      return (
        !candidate
        || !candidate.reviewedValue
        || (candidate.reviewStatus !== 'CONFIRMED' && candidate.reviewStatus !== 'CORRECTED')
      );
    });
    if (missing.length > 0) {
      throw new APIError(
        `Confirm ${missing.join(', ')} before creating an expense.`,
        409,
        'PROPERTY_RECORD_EXTRACTION_PROMOTION_INCOMPLETE',
        { missingFields: missing },
      );
    }
    if (candidates.some((candidate) => candidate.promotedEntityId)) {
      throw new APIError(
        'An expense was already created from this analysis.',
        409,
        'PROPERTY_RECORD_EXTRACTION_ALREADY_PROMOTED',
      );
    }

    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
      select: { homeownerProfileId: true },
    });
    if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');

    const description = byField.get('description')!.reviewedValue!;
    const amountValue = byField.get('amount')!.reviewedValue!;
    const amount = Number(amountValue);
    if (Number.isNaN(amount)) {
      throw new APIError('Amount must be a valid number.', 422, 'PROPERTY_RECORD_EXTRACTION_INVALID_AMOUNT');
    }
    const transactionDate = new Date(byField.get('transactionDate')!.reviewedValue!);
    if (Number.isNaN(transactionDate.getTime())) {
      throw new APIError('Transaction date must be a valid date.', 422, 'PROPERTY_RECORD_EXTRACTION_INVALID_DATE');
    }

    const categoryCandidate = byField.get('category');
    const category = categoryCandidate?.reviewedValue && EXPENSE_CATEGORY_VALUES.has(categoryCandidate.reviewedValue as ExpenseCategory)
      ? (categoryCandidate.reviewedValue as ExpenseCategory)
      : 'OTHER';

    const usedCandidateIds = EXPENSE_REQUIRED_FIELD_KEYS.map((key) => byField.get(key)!.id)
      .concat(EXPENSE_OPTIONAL_FIELD_KEYS.filter((key) => byField.get(key)).map((key) => byField.get(key)!.id));

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          homeownerProfileId: property.homeownerProfileId,
          propertyId: input.propertyId,
          description,
          category,
          amount,
          transactionDate,
        },
      });

      await tx.extractedFactCandidate.updateMany({
        where: { id: { in: usedCandidateIds } },
        data: { promotedEntityType: 'EXPENSE', promotedEntityId: created.id },
      });

      await tx.propertyRecordLink.create({
        data: {
          recordId: input.recordId,
          versionId: version.id,
          entityType: 'EXPENSE',
          entityId: created.id,
          purpose: 'RECEIPT',
          createdByUserId: input.userId,
        },
      });

      return created;
    });

    return expense;
  }
}

export const homeRecordsExtractionService = new HomeRecordsExtractionService();
