import type {
  BuyerPurchaseLoanEstimateRevision,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  type BuyerPurchaseLoanEstimateCreateInput,
  type BuyerPurchaseLoanEstimateRevisionInput,
  type BuyerPurchaseLoanEstimateUpdateInput,
  BUYER_ACTION_KEYS,
} from '../productFramework/buyerAcquisition.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import {
  compareRefinanceLoanEstimates,
  type RefinanceLoanEstimateInput,
} from '../refinanceRadar/refinanceLoanEstimateComparison';

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
  return {
    ...input,
    issuedDate: dateValue(input.issuedDate),
    rateLockExpirationDate: dateValue(input.rateLockExpirationDate),
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

  private static async assertSourceDocument(propertyId: string, sourceDocumentId?: string | null) {
    if (!sourceDocumentId) return;
    const document = await prisma.document.findFirst({
      where: { id: sourceDocumentId, propertyId, deletedAt: null },
      select: { id: true },
    });
    if (!document) throw new APIError('Loan Estimate source document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }
}
