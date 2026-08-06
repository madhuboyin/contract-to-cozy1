// apps/backend/src/services/homeRecordsExtraction.service.ts
//
// Turns AI document analysis into reviewable ExtractedFactCandidate rows
// instead of writing canonical records directly. WARRANTY, RECEIPT, and
// INSURANCE_POLICY have implemented promotion contracts today (see
// promoteWarranty/promoteExpense/promoteInsurancePolicy) — WARRANTY is the
// exact domain the audit flagged for automatic, unreviewed warranty creation
// (HOME_CONTINUITY_AND_RECORDS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// §1.1). No field is ever written to a canonical record until its candidate
// has been explicitly CONFIRMED or CORRECTED by a homeowner.
import type { ExpenseCategory, ExtractedFactCandidate, ExtractedFactReviewStatus, WarrantyCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { auditLog, logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { downloadObjectBuffer } from './storage/reportStorage';
import { documentIntelligenceService, type DocumentInsights } from './documentIntelligence.service';
import { homeRecordsService } from './homeRecords.service';
import { syncPropertyRecordWorkItem } from '../modules/homeOperations/adapters/propertyRecord.adapter';
import { stageExtractedPolicyTerm } from './insurancePolicyRecord.service';

// Best-effort bridge into Home Operations (Slice 4 of the continuity
// plan) — re-reads the record's freshly recomputed needsReview/
// expiryStatus after a mutation and syncs its Home Action candidate.
// Never throws: a sync failure must never block the Home Records write
// that triggered it.
async function syncRecordWorkItem(propertyId: string, recordId: string): Promise<void> {
  try {
    const record = await homeRecordsService.get(propertyId, recordId, 'OWNER');
    await syncPropertyRecordWorkItem(propertyId, {
      id: record.id,
      title: record.title,
      recordType: record.recordType,
      sensitivity: record.sensitivity,
      needsReview: record.needsReview,
      expiryStatus: record.expiryStatus,
      effectiveTo: record.effectiveTo,
    });
  } catch (err) {
    logger.warn({ err, propertyId, recordId }, 'Home Operations record-review sync failed after a Home Records write');
  }
}

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

// Required fields mirror stageExtractedPolicyTerm's own required params
// (insurancePolicyRecord.service.ts) — promotion calls straight into that
// existing staging function rather than re-implementing insurance-record
// creation, so the two must agree on what's mandatory.
const INSURANCE_POLICY_REQUIRED_FIELD_KEYS = ['carrierName', 'policyNumber'] as const;
const INSURANCE_POLICY_OPTIONAL_FIELD_KEYS = [
  'coverageType', 'premiumAmount', 'deductibleAmount', 'dwellingLimit',
  'personalPropertyLimit', 'liabilityLimit', 'valuationBasis', 'termStart', 'termEnd',
] as const;
type InsurancePolicyFieldKey =
  | (typeof INSURANCE_POLICY_REQUIRED_FIELD_KEYS)[number]
  | (typeof INSURANCE_POLICY_OPTIONAL_FIELD_KEYS)[number];

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

function insurancePolicyCandidatesFromInsights(
  insights: DocumentInsights,
): { fieldKey: InsurancePolicyFieldKey; proposedValue: string }[] {
  const { extractedData } = insights;
  const candidates: { fieldKey: InsurancePolicyFieldKey; proposedValue: string }[] = [];

  if (extractedData.carrierName) candidates.push({ fieldKey: 'carrierName', proposedValue: extractedData.carrierName });
  if (extractedData.policyNumber) candidates.push({ fieldKey: 'policyNumber', proposedValue: extractedData.policyNumber });
  if (extractedData.coverageType) candidates.push({ fieldKey: 'coverageType', proposedValue: extractedData.coverageType });
  if (extractedData.premiumAmount != null) {
    candidates.push({ fieldKey: 'premiumAmount', proposedValue: String(extractedData.premiumAmount) });
  }
  if (extractedData.deductible != null) {
    candidates.push({ fieldKey: 'deductibleAmount', proposedValue: String(extractedData.deductible) });
  }
  if (extractedData.dwellingLimit != null) {
    candidates.push({ fieldKey: 'dwellingLimit', proposedValue: String(extractedData.dwellingLimit) });
  }
  if (extractedData.personalPropertyLimit != null) {
    candidates.push({ fieldKey: 'personalPropertyLimit', proposedValue: String(extractedData.personalPropertyLimit) });
  }
  if (extractedData.liabilityLimit != null) {
    candidates.push({ fieldKey: 'liabilityLimit', proposedValue: String(extractedData.liabilityLimit) });
  }
  if (extractedData.valuationBasis) {
    candidates.push({ fieldKey: 'valuationBasis', proposedValue: extractedData.valuationBasis });
  }
  if (extractedData.startDate) candidates.push({ fieldKey: 'termStart', proposedValue: toIsoDate(extractedData.startDate) });
  if (extractedData.expiryDate) candidates.push({ fieldKey: 'termEnd', proposedValue: toIsoDate(extractedData.expiryDate) });

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
    // Only WARRANTY, RECEIPT, and INSURANCE_POLICY have a promotion contract
    // implemented — see file header.
    if (
      version.record.recordType !== 'WARRANTY'
      && version.record.recordType !== 'RECEIPT'
      && version.record.recordType !== 'INSURANCE_POLICY'
    ) {
      throw new APIError(
        'AI review is available for warranty, receipt, and insurance policy records in this release.',
        422,
        'PROPERTY_RECORD_EXTRACTION_UNSUPPORTED_TYPE',
      );
    }
    const targetDomain = version.record.recordType === 'WARRANTY'
      ? 'WARRANTY' as const
      : version.record.recordType === 'RECEIPT'
        ? 'EXPENSE' as const
        : 'INSURANCE_POLICY' as const;

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
      : targetDomain === 'EXPENSE'
        ? receiptCandidatesFromInsights(insights)
        : insurancePolicyCandidatesFromInsights(insights);
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
    const created = await prisma.extractedFactCandidate.findMany({
      where: { propertyRecordVersionId: version.id },
      orderBy: { createdAt: 'asc' },
    });
    await syncRecordWorkItem(input.propertyId, input.recordId);
    return created;
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

    const updated = await prisma.extractedFactCandidate.update({
      where: { id: candidate.id },
      data: { reviewStatus, reviewedValue, reviewedByUserId: input.userId, reviewedAt: new Date() },
    });
    await syncRecordWorkItem(input.propertyId, input.recordId);
    return updated;
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
      auditLog('HOME_RECORD_UNREVIEWED_PROMOTION_BLOCKED', input.userId, {
        propertyId: input.propertyId,
        recordId: input.recordId,
        versionId: input.versionId,
        targetDomain: 'WARRANTY',
        missingFields: missing,
      });
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

      // The real historical fact is "warranty coverage began," not "a file
      // was uploaded" — Slice 6 of the plan (§8) calls this out explicitly:
      // promote reviewed facts into Timeline instead of a generic
      // document-upload event. occurredAt is the coverage start date, not
      // today, since that's when the fact actually happened.
      const event = await tx.homeEvent.create({
        data: {
          propertyId: input.propertyId,
          createdById: input.userId,
          type: 'MILESTONE',
          title: `Warranty registered: ${providerName}`,
          summary: `Coverage ${startDate.toISOString().slice(0, 10)} to ${expiryDate.toISOString().slice(0, 10)}, evidenced by "${version.originalFileName}".`,
          occurredAt: startDate,
          datePrecision: 'EXACT_DATE',
          observationKind: 'EVIDENCE_DERIVED',
          verificationStatus: 'EVIDENCE_VERIFIED',
          sourceType: 'DOCUMENT',
          sourceEntityType: 'WARRANTY',
          sourceEntityId: created.id,
          sourceBadge: 'DOCUMENT_BACKED',
          idempotencyKey: `home-records-warranty:${created.id}`,
        },
      });

      // Reverse pointer so homeRecords.service.ts's trash() evidence-impact
      // gate (an active PropertyRecordLink blocks trashing without an
      // explicit KEEP_LINKS/REMOVE_LINKS decision) actually protects this
      // record now that it evidences a Timeline event, not just the Warranty.
      await tx.propertyRecordLink.create({
        data: {
          recordId: input.recordId,
          versionId: version.id,
          entityType: 'HOME_EVENT',
          entityId: event.id,
          purpose: 'EVIDENCE',
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
      auditLog('HOME_RECORD_UNREVIEWED_PROMOTION_BLOCKED', input.userId, {
        propertyId: input.propertyId,
        recordId: input.recordId,
        versionId: input.versionId,
        targetDomain: 'EXPENSE',
        missingFields: missing,
      });
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

      // Same reasoning as promoteWarranty: the receipt evidences a real
      // purchase, not just a file upload — record it on Timeline.
      // HomeEvent.expenseId is a typed 1:1 FK, so no sourceEntityType/Id
      // pointer is needed here (unlike warranty, which has no such column).
      const event = await tx.homeEvent.create({
        data: {
          propertyId: input.propertyId,
          createdById: input.userId,
          type: 'PURCHASE',
          title: `Expense logged: ${description}`,
          summary: `Evidenced by "${version.originalFileName}".`,
          occurredAt: transactionDate,
          datePrecision: 'EXACT_DATE',
          amount,
          expenseId: created.id,
          observationKind: 'EVIDENCE_DERIVED',
          verificationStatus: 'EVIDENCE_VERIFIED',
          sourceType: 'DOCUMENT',
          sourceEntityType: 'EXPENSE',
          sourceEntityId: created.id,
          sourceBadge: 'DOCUMENT_BACKED',
          idempotencyKey: `home-records-expense:${created.id}`,
        },
      });

      await tx.propertyRecordLink.create({
        data: {
          recordId: input.recordId,
          versionId: version.id,
          entityType: 'HOME_EVENT',
          entityId: event.id,
          purpose: 'EVIDENCE',
          createdByUserId: input.userId,
        },
      });

      return created;
    });

    return expense;
  }

  async promoteInsurancePolicy(input: {
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
        targetDomain: 'INSURANCE_POLICY',
        fieldKey: { not: DOCUMENT_TYPE_FIELD_KEY },
      },
    });
    const byField = new Map(candidates.map((candidate) => [candidate.fieldKey, candidate]));

    const missing = INSURANCE_POLICY_REQUIRED_FIELD_KEYS.filter((key) => {
      const candidate = byField.get(key);
      return (
        !candidate
        || !candidate.reviewedValue
        || (candidate.reviewStatus !== 'CONFIRMED' && candidate.reviewStatus !== 'CORRECTED')
      );
    });
    if (missing.length > 0) {
      auditLog('HOME_RECORD_UNREVIEWED_PROMOTION_BLOCKED', input.userId, {
        propertyId: input.propertyId,
        recordId: input.recordId,
        versionId: input.versionId,
        targetDomain: 'INSURANCE_POLICY',
        missingFields: missing,
      });
      throw new APIError(
        `Confirm ${missing.join(', ')} before staging this insurance policy.`,
        409,
        'PROPERTY_RECORD_EXTRACTION_PROMOTION_INCOMPLETE',
        { missingFields: missing },
      );
    }
    if (candidates.some((candidate) => candidate.promotedEntityId)) {
      throw new APIError(
        'An insurance policy was already staged from this analysis.',
        409,
        'PROPERTY_RECORD_EXTRACTION_ALREADY_PROMOTED',
      );
    }

    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
      select: { homeownerProfileId: true },
    });
    if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');

    const carrierName = byField.get('carrierName')!.reviewedValue!;
    const policyNumber = byField.get('policyNumber')!.reviewedValue!;

    const numberField = (key: InsurancePolicyFieldKey): number | undefined => {
      const raw = byField.get(key)?.reviewedValue;
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isNaN(parsed) ? undefined : parsed;
    };
    const dateField = (key: InsurancePolicyFieldKey): Date | undefined => {
      const raw = byField.get(key)?.reviewedValue;
      if (!raw) return undefined;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    };

    const usedCandidateIds = INSURANCE_POLICY_REQUIRED_FIELD_KEYS.map((key) => byField.get(key)!.id)
      .concat(
        INSURANCE_POLICY_OPTIONAL_FIELD_KEYS.filter((key) => byField.get(key)).map((key) => byField.get(key)!.id),
      );

    // Reuses the existing InsurancePolicyTerm/Fact staging pipeline
    // (insurancePolicyRecord.service.ts) instead of writing a canonical
    // insurance record directly — that system already has its own richer
    // confirmation workflow (confirmPolicyFact) that these facts still need
    // to go through per-field. This call runs in its own transaction (see
    // stageExtractedPolicyTerm), so it's deliberately not nested inside a
    // second one here — it's already idempotent on (policyId, sourceDocumentId)
    // if the candidate-marking step below were to fail and this got retried.
    const staged = await stageExtractedPolicyTerm({
      homeownerProfileId: property.homeownerProfileId,
      userId: input.userId,
      propertyId: input.propertyId,
      carrierName,
      policyNumber,
      coverageType: byField.get('coverageType')?.reviewedValue ?? undefined,
      premiumAmount: numberField('premiumAmount'),
      deductibleAmount: numberField('deductibleAmount'),
      dwellingLimit: numberField('dwellingLimit'),
      personalPropertyLimit: numberField('personalPropertyLimit'),
      liabilityLimit: numberField('liabilityLimit'),
      valuationBasis: byField.get('valuationBasis')?.reviewedValue ?? undefined,
      termStart: dateField('termStart'),
      termEnd: dateField('termEnd'),
      sourceText: `Reviewed in Home Records from "${version.originalFileName}"`,
    });

    await prisma.$transaction(async (tx) => {
      await tx.extractedFactCandidate.updateMany({
        where: { id: { in: usedCandidateIds } },
        data: { promotedEntityType: 'INSURANCE_POLICY_TERM', promotedEntityId: staged.term.id },
      });

      await tx.propertyRecordLink.create({
        data: {
          recordId: input.recordId,
          versionId: version.id,
          entityType: 'INSURANCE_POLICY',
          entityId: staged.policy.id,
          purpose: 'EVIDENCE',
          createdByUserId: input.userId,
        },
      });

      // Unlike promoteWarranty/promoteExpense, no HomeEvent is created here:
      // the staged term and its facts are still UNVERIFIED/PENDING until a
      // homeowner confirms each one via confirmPolicyFact (the insurance
      // domain's own review workflow). Posting a Timeline milestone now would
      // assert coverage is verified when it isn't yet — that would repeat the
      // exact "invented certainty" failure mode the audit flagged. Once that
      // per-fact confirmation lands, the coverage/insurance surfaces already
      // reflect it directly.
    });

    return staged;
  }
}

export const homeRecordsExtractionService = new HomeRecordsExtractionService();
