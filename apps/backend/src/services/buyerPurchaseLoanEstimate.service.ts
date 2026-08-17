import {
  Prisma,
  type BuyerPurchaseLoanEstimateRevision,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  type BuyerPurchaseLoanEstimateCreateInput,
  type BuyerPurchaseLoanEstimateRevisionInput,
  type BuyerPurchaseLoanEstimateUpdateInput,
  type BuyerPurchaseLoanSelectionInput,
  BUYER_ACTION_KEYS,
} from '../productFramework/buyerAcquisition.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import {
  compareRefinanceLoanEstimates,
  type RefinanceLoanEstimateInput,
} from '../refinanceRadar/refinanceLoanEstimateComparison';
import {
  combineLoanEstimateExtractions,
  extractLoanEstimateFromUpload,
  type RefinanceLoanEstimateExtraction,
} from '../refinanceRadar/refinanceLoanEstimateExtraction.service';

type LoanEstimateFields = BuyerPurchaseLoanEstimateRevisionInput;

async function assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
  }
}

const dateValue = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : value;

function revisionData(
  input: LoanEstimateFields,
): Omit<Prisma.BuyerPurchaseLoanEstimateRevisionUncheckedCreateInput, 'offerId' | 'revisionNumber'> {
  const { extractionMetadata, ...fields } = input;
  return {
    ...fields,
    extractionMetadataJson: extractionMetadata === null
      ? Prisma.JsonNull
      : extractionMetadata as Prisma.InputJsonValue | undefined,
    issuedDate: dateValue(input.issuedDate),
    rateLockExpirationDate: dateValue(input.rateLockExpirationDate),
  };
}

const cents = (value: number | null) => value == null ? null : Math.round(value * 100);
const bps = (value: number | null) => value == null ? null : Math.round(value * 100);

export function mapPurchaseLoanEstimateExtraction(extraction: RefinanceLoanEstimateExtraction) {
  const fieldConfidence = Object.fromEntries(
    Object.entries(extraction.fields).map(([key, field]) => [key, {
      confidence: field.confidence,
      sourceLabel: field.sourceLabel,
    }]),
  );
  return {
    proposedInput: {
      sourceType: 'DOCUMENT_EXTRACTION' as const,
      loanAmountCents: cents(extraction.fields.loanAmountUsd.value),
      loanTermMonths: extraction.fields.loanTermYears.value == null ? null : Math.round(extraction.fields.loanTermYears.value * 12),
      loanType: extraction.fields.loanType.value,
      noteRateBps: bps(extraction.fields.noteRatePct.value),
      aprBps: bps(extraction.fields.aprPct.value),
      monthlyPrincipalAndInterestCents: cents(extraction.fields.monthlyPrincipalAndInterestUsd.value),
      monthlyMortgageInsuranceCents: cents(extraction.fields.monthlyMortgageInsuranceUsd.value),
      estimatedTotalMonthlyPaymentCents: cents(extraction.fields.estimatedTotalMonthlyPaymentUsd.value),
      loanCostsCents: cents(extraction.fields.loanCostsUsd.value),
      lenderCreditsCents: cents(extraction.fields.lenderCreditsUsd.value),
      discountPointsBps: bps(extraction.fields.discountPointsPct.value),
      discountPointsCents: cents(extraction.fields.discountPointsUsd.value),
      cashToCloseCents: cents(extraction.fields.cashToCloseUsd.value),
      cashToCloseDirection: extraction.fields.cashToCloseDirection.value ?? 'UNKNOWN' as const,
      fiveYearTotalPaidCents: cents(extraction.fields.fiveYearTotalPaidUsd.value),
      fiveYearPrincipalPaidCents: cents(extraction.fields.fiveYearPrincipalPaidUsd.value),
      issuedDate: extraction.fields.issuedDate.value,
      extractionMetadata: {
        method: extraction.extractionMethod,
        fieldConfidence,
        documentConfidencePct: extraction.documentConfidencePct,
        pageIntegrity: extraction.pageIntegrity,
        warnings: extraction.warnings,
      },
    },
    review: {
      required: true as const,
      extractedFieldCount: extraction.extractedFieldCount,
      requiredFieldCount: extraction.requiredFieldCount,
      requiredFieldsFound: extraction.requiredFieldsFound,
      extractionMethod: extraction.extractionMethod,
      pageIntegrity: extraction.pageIntegrity,
      warnings: extraction.warnings,
      fieldConfidence,
    },
  };
}

function serializeRevision(revision: BuyerPurchaseLoanEstimateRevision) {
  return {
    ...revision,
    issuedDate: revision.issuedDate?.toISOString().slice(0, 10) ?? null,
    rateLockExpirationDate: revision.rateLockExpirationDate?.toISOString().slice(0, 10) ?? null,
    confirmedAt: revision.confirmedAt?.toISOString() ?? null,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
  };
}

function comparisonInput(
  lenderName: string,
  revision: BuyerPurchaseLoanEstimateRevision,
): RefinanceLoanEstimateInput {
  return {
    id: revision.id,
    lenderName,
    loanAmountUsd: revision.loanAmountCents! / 100,
    loanTermYears: revision.loanTermMonths! / 12,
    loanType: revision.loanType!,
    noteRatePct: revision.noteRateBps! / 100,
    aprPct: revision.aprBps! / 100,
    monthlyPrincipalAndInterestUsd: revision.monthlyPrincipalAndInterestCents! / 100,
    monthlyMortgageInsuranceUsd: revision.monthlyMortgageInsuranceCents == null
      ? undefined : revision.monthlyMortgageInsuranceCents / 100,
    estimatedTotalMonthlyPaymentUsd: revision.estimatedTotalMonthlyPaymentCents == null
      ? undefined : revision.estimatedTotalMonthlyPaymentCents / 100,
    loanCostsUsd: revision.loanCostsCents! / 100,
    lenderCreditsUsd: revision.lenderCreditsCents! / 100,
    discountPointsPct: revision.discountPointsBps == null ? undefined : revision.discountPointsBps / 100,
    discountPointsUsd: revision.discountPointsCents == null ? undefined : revision.discountPointsCents / 100,
    cashToCloseUsd: revision.cashToCloseCents! / 100,
    cashToCloseDirection: revision.cashToCloseDirection,
    fiveYearTotalPaidUsd: revision.fiveYearTotalPaidCents == null ? undefined : revision.fiveYearTotalPaidCents / 100,
    fiveYearPrincipalPaidUsd: revision.fiveYearPrincipalPaidCents == null ? undefined : revision.fiveYearPrincipalPaidCents / 100,
    issuedDate: revision.issuedDate?.toISOString().slice(0, 10),
    rateLockStatus: revision.rateLockStatus,
    rateLockExpirationDate: revision.rateLockExpirationDate?.toISOString().slice(0, 10),
  };
}

const CONFIRMATION_FIELDS: Array<keyof BuyerPurchaseLoanEstimateRevision> = [
  'loanAmountCents',
  'loanTermMonths',
  'loanType',
  'noteRateBps',
  'aprBps',
  'monthlyPrincipalAndInterestCents',
  'loanCostsCents',
  'lenderCreditsCents',
  'cashToCloseCents',
];

export class BuyerPurchaseLoanEstimateService {
  static async list(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const plan = await prisma.buyerPurchaseFinancingPlan.findUnique({
      where: { propertyId },
      include: {
        loanOffers: {
          orderBy: { createdAt: 'asc' },
          include: { revisions: { orderBy: { revisionNumber: 'desc' } } },
        },
      },
    });
    const comparableOffers = (plan?.loanOffers ?? []).flatMap((offer) => {
      const revision = offer.revisions.find((item) => item.status === 'CONFIRMED');
      return revision ? [comparisonInput(offer.lenderName, revision)] : [];
    });
    return {
      purchasePath: plan?.purchasePath ?? 'UNKNOWN',
      selection: plan?.selectedLoanOfferId && plan.selectedLoanEstimateRevisionId ? {
        offerId: plan.selectedLoanOfferId,
        revisionId: plan.selectedLoanEstimateRevisionId,
        intentToProceedAt: plan.intentToProceedAt?.toISOString() ?? null,
        recordedAt: plan.lenderSelectionRecordedAt?.toISOString() ?? null,
        recordedByUserId: plan.lenderSelectionRecordedByUserId,
      } : null,
      offers: (plan?.loanOffers ?? []).map((offer) => ({
        id: offer.id,
        lenderName: offer.lenderName,
        revisions: offer.revisions.map(serializeRevision),
        createdAt: offer.createdAt.toISOString(),
        updatedAt: offer.updatedAt.toISOString(),
      })),
      comparison: comparableOffers.length >= 2
        ? compareRefinanceLoanEstimates(comparableOffers)
        : null,
    };
  }

  static async createOffer(
    userId: string,
    propertyId: string,
    input: BuyerPurchaseLoanEstimateCreateInput,
  ) {
    await assertAccess(userId, propertyId);
    const plan = await prisma.buyerPurchaseFinancingPlan.findUnique({ where: { propertyId } });
    if (!plan || plan.purchasePath !== 'FINANCED') {
      throw new APIError('Confirm purchase financing before adding Loan Estimates.', 409, 'PURCHASE_FINANCING_REQUIRED');
    }
    const { lenderName, ...fields } = input;
    await this.assertSourceDocument(propertyId, fields.sourceDocumentId);
    await prisma.buyerPurchaseLoanOffer.create({
      data: {
        planId: plan.id,
        propertyId,
        lenderName,
        revisions: { create: { ...revisionData(fields), revisionNumber: 1 } },
      },
    });
    return this.list(userId, propertyId);
  }

  static async addRevision(
    userId: string,
    propertyId: string,
    offerId: string,
    input: BuyerPurchaseLoanEstimateRevisionInput,
  ) {
    await assertAccess(userId, propertyId);
    await this.assertSourceDocument(propertyId, input.sourceDocumentId);
    const offer = await prisma.buyerPurchaseLoanOffer.findFirst({
      where: { id: offerId, propertyId, plan: { purchasePath: 'FINANCED' } },
      include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
    });
    if (!offer) throw new APIError('Purchase loan offer not found.', 404, 'PURCHASE_LOAN_OFFER_NOT_FOUND');
    await prisma.buyerPurchaseLoanEstimateRevision.create({
      data: {
        ...revisionData(input),
        offerId,
        revisionNumber: (offer.revisions[0]?.revisionNumber ?? 0) + 1,
      },
    });
    return this.list(userId, propertyId);
  }

  static async updateDraft(
    userId: string,
    propertyId: string,
    revisionId: string,
    input: BuyerPurchaseLoanEstimateUpdateInput,
  ) {
    await assertAccess(userId, propertyId);
    await this.assertSourceDocument(propertyId, input.sourceDocumentId);
    const revision = await prisma.buyerPurchaseLoanEstimateRevision.findFirst({
      where: { id: revisionId, offer: { propertyId }, status: 'DRAFT' },
    });
    if (!revision) throw new APIError('Editable Loan Estimate draft not found.', 404, 'PURCHASE_LOAN_ESTIMATE_DRAFT_NOT_FOUND');
    const data = revisionData(input);
    await prisma.buyerPurchaseLoanEstimateRevision.update({ where: { id: revisionId }, data });
    return this.list(userId, propertyId);
  }

  static async confirm(userId: string, propertyId: string, revisionId: string) {
    await assertAccess(userId, propertyId);
    const revision = await prisma.buyerPurchaseLoanEstimateRevision.findFirst({
      where: { id: revisionId, offer: { propertyId, plan: { purchasePath: 'FINANCED' } } },
      include: { offer: { include: { plan: { select: { checklistId: true } } } } },
    });
    if (!revision) throw new APIError('Loan Estimate revision not found.', 404, 'PURCHASE_LOAN_ESTIMATE_NOT_FOUND');
    const missing = CONFIRMATION_FIELDS.filter((field) => revision[field] == null);
    if (missing.length) {
      throw new APIError(`Complete required Loan Estimate fields: ${missing.join(', ')}.`, 409, 'PURCHASE_LOAN_ESTIMATE_INCOMPLETE');
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerPurchaseLoanEstimateRevision.updateMany({
        where: { offerId: revision.offerId, status: 'CONFIRMED', id: { not: revision.id } },
        data: { status: 'SUPERSEDED' },
      });
      await tx.buyerPurchaseLoanEstimateRevision.update({
        where: { id: revision.id },
        data: { status: 'CONFIRMED', confirmedAt: now },
      });
      await tx.buyerPurchaseFinancingPlan.updateMany({
        where: {
          id: revision.offer.planId,
          selectedLoanOfferId: revision.offerId,
          selectedLoanEstimateRevisionId: { not: revision.id },
        },
        data: {
          selectedLoanOfferId: null,
          selectedLoanEstimateRevisionId: null,
          intentToProceedAt: null,
          lenderSelectionRecordedAt: null,
          lenderSelectionRecordedByUserId: null,
        },
      });
      const confirmed = await tx.buyerPurchaseLoanEstimateRevision.findMany({
        where: { offer: { planId: revision.offer.planId }, status: 'CONFIRMED' },
        select: { id: true },
      });
      await tx.homeBuyerTask.updateMany({
        where: { checklistId: revision.offer.plan.checklistId, actionKey: BUYER_ACTION_KEYS.LOAN_ESTIMATES },
        data: confirmed.length >= 2 ? {
          status: 'COMPLETED',
          completedAt: now,
          completedByUserId: userId,
          completionMethod: 'USER_ATTESTATION',
          completionEvidenceJson: { confirmedRevisionIds: confirmed.map((item) => item.id), comparedAt: now.toISOString() },
        } : {
          status: 'IN_PROGRESS',
          statusReason: 'One confirmed Loan Estimate is saved; add another current offer to compare.',
        },
      });
    });
    return this.list(userId, propertyId);
  }

  static async extractPrefill(
    userId: string,
    propertyId: string,
    files: Array<{ buffer: Buffer; mimetype: string }>,
  ) {
    await assertAccess(userId, propertyId);
    const plan = await prisma.buyerPurchaseFinancingPlan.findUnique({ where: { propertyId } });
    if (!plan || plan.purchasePath !== 'FINANCED') {
      throw new APIError('Confirm purchase financing before extracting a Loan Estimate.', 409, 'PURCHASE_FINANCING_REQUIRED');
    }
    if (!files.length) throw new APIError('At least one Loan Estimate file is required.', 400, 'LOAN_ESTIMATE_FILE_REQUIRED');
    if (files.some((file) => file.mimetype === 'application/pdf') && files.length > 1) {
      throw new APIError('Upload one PDF or up to three image pages, not a mixed batch.', 400, 'LOAN_ESTIMATE_MIXED_UPLOAD');
    }
    const extractions = [];
    for (const file of files) extractions.push(await extractLoanEstimateFromUpload(file.buffer, file.mimetype));
    return mapPurchaseLoanEstimateExtraction(combineLoanEstimateExtractions(extractions));
  }

  static async selectOffer(
    userId: string,
    propertyId: string,
    input: BuyerPurchaseLoanSelectionInput,
  ) {
    await assertAccess(userId, propertyId);
    const revision = await prisma.buyerPurchaseLoanEstimateRevision.findFirst({
      where: {
        id: input.revisionId,
        status: 'CONFIRMED',
        offer: { propertyId, plan: { purchasePath: 'FINANCED' } },
      },
      include: { offer: { include: { plan: true } } },
    });
    if (!revision) {
      throw new APIError('Select a current confirmed Loan Estimate.', 409, 'PURCHASE_LOAN_SELECTION_REQUIRES_CONFIRMED_REVISION');
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerPurchaseFinancingPlan.update({
        where: { id: revision.offer.planId },
        data: {
          selectedLoanOfferId: revision.offerId,
          selectedLoanEstimateRevisionId: revision.id,
          intentToProceedAt: input.intentToProceed ? now : null,
          lenderSelectionRecordedAt: now,
          lenderSelectionRecordedByUserId: userId,
        },
      });
      await tx.homeBuyerTask.updateMany({
        where: { checklistId: revision.offer.plan.checklistId, actionKey: BUYER_ACTION_KEYS.LOAN_ESTIMATES },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          completedByUserId: userId,
          completionMethod: 'USER_ATTESTATION',
          statusReason: input.intentToProceed
            ? 'Buyer recorded an intent to proceed with a confirmed lender offer.'
            : 'Buyer recorded a selected offer for planning without recording intent to proceed.',
          completionEvidenceJson: {
            selectedOfferId: revision.offerId,
            selectedRevisionId: revision.id,
            intentToProceed: input.intentToProceed,
            recordedAt: now.toISOString(),
          },
        },
      });
      await tx.homeBuyerTask.updateMany({
        where: {
          checklistId: revision.offer.plan.checklistId,
          actionKey: BUYER_ACTION_KEYS.APPRAISAL_TRACKING,
          status: 'PENDING',
        },
        data: {
          status: 'IN_PROGRESS',
          statusReason: 'A lender offer is selected; record lender appraisal timing and conditions next.',
        },
      });
    });
    return this.list(userId, propertyId);
  }

  private static async assertSourceDocument(propertyId: string, sourceDocumentId?: string | null) {
    if (!sourceDocumentId) return;
    const document = await prisma.document.findFirst({
      where: { id: sourceDocumentId, propertyId, deletedAt: null },
      select: { id: true },
    });
    if (!document) throw new APIError('Loan Estimate source document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }
}
