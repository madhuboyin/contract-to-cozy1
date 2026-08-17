import { Prisma, type BuyerClosingDisclosureRevision } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  BUYER_ACTION_KEYS,
  BUYER_MILESTONE_KEYS,
  type BuyerClosingDisclosureInput,
  type BuyerClosingDisclosureUpdateInput,
  type BuyerClosingFundsReadinessUpdateInput,
} from '../productFramework/buyerAcquisition.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';

async function assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
  }
}

const dateOnly = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : value;

function revisionData(input: BuyerClosingDisclosureInput | BuyerClosingDisclosureUpdateInput) {
  const { extractionMetadata, ...fields } = input;
  return {
    ...fields,
    issuedDate: dateOnly(input.issuedDate),
    extractionMetadataJson: extractionMetadata === null
      ? Prisma.JsonNull
      : extractionMetadata as Prisma.InputJsonValue | undefined,
  };
}

function serializeRevision(revision: BuyerClosingDisclosureRevision) {
  return {
    ...revision,
    issuedDate: revision.issuedDate?.toISOString().slice(0, 10) ?? null,
    extractionMetadata: revision.extractionMetadataJson,
    extractionMetadataJson: undefined,
    confirmedAt: revision.confirmedAt?.toISOString() ?? null,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
  };
}

const COMPARISON_FIELDS = [
  'loanAmountCents', 'noteRateBps', 'aprBps', 'estimatedTotalMonthlyPaymentCents',
  'loanCostsCents', 'lenderCreditsCents', 'prepaidAndEscrowCents', 'cashToCloseCents',
] as const;

const CONFIRMATION_FIELDS: Array<keyof BuyerClosingDisclosureRevision> = [
  'issuedDate', 'loanAmountCents', 'noteRateBps', 'aprBps',
  'estimatedTotalMonthlyPaymentCents', 'loanCostsCents', 'lenderCreditsCents',
  'prepaidAndEscrowCents', 'sellerCreditsCents', 'cashToCloseCents',
];

export class BuyerClosingDisclosureService {
  private static async context(propertyId: string) {
    const plan = await prisma.buyerPurchaseFinancingPlan.findUnique({
      where: { propertyId },
      include: { checklist: { select: { id: true } } },
    });
    const selectedLoanEstimateRevision = plan?.selectedLoanEstimateRevisionId
      ? await prisma.buyerPurchaseLoanEstimateRevision.findFirst({
        where: { id: plan.selectedLoanEstimateRevisionId, status: 'CONFIRMED', offer: { propertyId } },
        include: { offer: { select: { lenderName: true } } },
      })
      : null;
    if (!plan || plan.purchasePath !== 'FINANCED' || !selectedLoanEstimateRevision) {
      throw new APIError('Select a current confirmed Loan Estimate before reviewing a Closing Disclosure.', 409, 'CLOSING_DISCLOSURE_REQUIRES_SELECTED_LOAN_ESTIMATE');
    }
    return { ...plan, selectedLoanEstimateRevision };
  }

  private static async assertSourceDocument(propertyId: string, documentId?: string | null) {
    if (!documentId) return;
    const document = await prisma.document.findFirst({ where: { id: documentId, propertyId, deletedAt: null } });
    if (!document) throw new APIError('Closing Disclosure source document not found.', 404, 'CLOSING_DISCLOSURE_SOURCE_NOT_FOUND');
  }

  static async get(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const plan = await this.context(propertyId);
    const [workspace, credits] = await Promise.all([
      prisma.buyerClosingDisclosureWorkspace.findUnique({
        where: { propertyId },
        include: { revisions: { orderBy: { revisionNumber: 'desc' } } },
      }),
      prisma.negotiationShieldBuyerFinding.findMany({
        where: { finding: { propertyId }, outcome: 'ACCEPTED_CREDIT', agreedCreditCents: { not: null } },
        select: { id: true, agreedCreditCents: true, outcome: true, outcomeNotes: true },
      }),
    ]);
    const selected = plan.selectedLoanEstimateRevision;
    const current = workspace?.revisions.find((item) => item.id === workspace.currentRevisionId)
      ?? workspace?.revisions.find((item) => item.status === 'CONFIRMED')
      ?? null;
    const comparison = current ? COMPARISON_FIELDS.map((field) => ({
      field,
      loanEstimateValue: selected[field],
      closingDisclosureValue: current[field],
      delta: selected[field] == null || current[field] == null ? null : current[field] - selected[field],
    })) : [];
    const contractCreditsCents = credits.reduce((sum, item) => sum + (item.agreedCreditCents ?? 0), 0);
    return {
      workspace: workspace ? {
        ...workspace,
        fundsExpectedAt: workspace.fundsExpectedAt?.toISOString() ?? null,
        instructionsVerifiedAt: workspace.instructionsVerifiedAt?.toISOString() ?? null,
        questions: Array.isArray(workspace.questionsJson) ? workspace.questionsJson : [],
        questionsJson: undefined,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
        revisions: workspace.revisions.map(serializeRevision),
      } : null,
      selectedLoanEstimate: {
        id: selected.id,
        lenderName: selected.offer.lenderName,
        revisionNumber: selected.revisionNumber,
        issuedDate: selected.issuedDate?.toISOString().slice(0, 10) ?? null,
        ...Object.fromEntries(COMPARISON_FIELDS.map((field) => [field, selected[field]])),
      },
      comparison,
      contractCredits: { totalCents: contractCreditsCents, outcomes: credits },
      sellerCreditDeltaCents: current?.sellerCreditsCents == null ? null : current.sellerCreditsCents - contractCreditsCents,
      disclaimer: 'This workspace compares buyer-recorded figures only. Confirm discrepancies and all transfer instructions with the lender or settlement professional through a trusted channel. ContractToCozy never stores full account, routing, or wire credentials.',
    };
  }

  static async createRevision(userId: string, propertyId: string, input: BuyerClosingDisclosureInput) {
    await assertAccess(userId, propertyId);
    await this.context(propertyId);
    await this.assertSourceDocument(propertyId, input.sourceDocumentId);
    let workspace = await prisma.buyerClosingDisclosureWorkspace.findUnique({
      where: { propertyId }, include: { revisions: { orderBy: { revisionNumber: 'desc' } } },
    });
    const draft = workspace?.revisions.find((item) => item.status === 'DRAFT');
    if (draft) throw new APIError('Resume the existing Closing Disclosure draft before adding a revision.', 409, 'CLOSING_DISCLOSURE_REVISION_CONFLICT');
    if (!workspace) workspace = await prisma.buyerClosingDisclosureWorkspace.create({ data: { propertyId }, include: { revisions: true } });
    await prisma.buyerClosingDisclosureRevision.create({
      data: { ...revisionData(input), workspaceId: workspace.id, revisionNumber: (workspace.revisions[0]?.revisionNumber ?? 0) + 1 },
    });
    await this.reconcile(userId, propertyId, workspace.id);
    return this.get(userId, propertyId);
  }

  static async updateDraft(userId: string, propertyId: string, revisionId: string, input: BuyerClosingDisclosureUpdateInput) {
    await assertAccess(userId, propertyId);
    await this.context(propertyId);
    await this.assertSourceDocument(propertyId, input.sourceDocumentId);
    const revision = await prisma.buyerClosingDisclosureRevision.findFirst({ where: { id: revisionId, workspace: { propertyId }, status: 'DRAFT' } });
    if (!revision) throw new APIError('Editable Closing Disclosure draft not found.', 404, 'CLOSING_DISCLOSURE_DRAFT_NOT_FOUND');
    await prisma.buyerClosingDisclosureRevision.update({ where: { id: revisionId }, data: revisionData(input) });
    await this.reconcile(userId, propertyId, revision.workspaceId);
    return this.get(userId, propertyId);
  }

  static async confirm(userId: string, propertyId: string, revisionId: string) {
    await assertAccess(userId, propertyId);
    await this.context(propertyId);
    const revision = await prisma.buyerClosingDisclosureRevision.findFirst({ where: { id: revisionId, workspace: { propertyId } } });
    if (!revision) throw new APIError('Closing Disclosure revision not found.', 404, 'CLOSING_DISCLOSURE_NOT_FOUND');
    const missing = CONFIRMATION_FIELDS.filter((field) => revision[field] == null);
    if (missing.length) throw new APIError(`Complete required Closing Disclosure fields: ${missing.join(', ')}.`, 409, 'CLOSING_DISCLOSURE_INCOMPLETE');
    const now = new Date();
    await prisma.$transaction([
      prisma.buyerClosingDisclosureRevision.updateMany({ where: { workspaceId: revision.workspaceId, status: 'CONFIRMED', id: { not: revisionId } }, data: { status: 'SUPERSEDED' } }),
      prisma.buyerClosingDisclosureRevision.update({ where: { id: revisionId }, data: { status: 'CONFIRMED', confirmedAt: now, confirmedByUserId: userId } }),
      prisma.buyerClosingDisclosureWorkspace.update({ where: { id: revision.workspaceId }, data: { currentRevisionId: revisionId } }),
    ]);
    await this.reconcile(userId, propertyId, revision.workspaceId);
    return this.get(userId, propertyId);
  }

  static async updateFundsReadiness(userId: string, propertyId: string, input: BuyerClosingFundsReadinessUpdateInput) {
    await assertAccess(userId, propertyId);
    await this.context(propertyId);
    const workspace = await prisma.buyerClosingDisclosureWorkspace.findUnique({ where: { propertyId } });
    if (!workspace) throw new APIError('Save a Closing Disclosure draft before recording funds readiness.', 409, 'CLOSING_DISCLOSURE_REQUIRED');
    const { questions, fundsExpectedAt, ...fields } = input;
    await prisma.buyerClosingDisclosureWorkspace.update({
      where: { id: workspace.id },
      data: {
        ...fields,
        fundsExpectedAt: fundsExpectedAt === undefined ? undefined : fundsExpectedAt ? new Date(fundsExpectedAt) : null,
        questionsJson: questions === undefined ? undefined : questions,
        instructionsVerifiedAt: input.instructionsVerified === undefined ? undefined : input.instructionsVerified ? new Date() : null,
        instructionsVerifiedByUserId: input.instructionsVerified === undefined ? undefined : input.instructionsVerified ? userId : null,
      },
    });
    await this.reconcile(userId, propertyId, workspace.id);
    return this.get(userId, propertyId);
  }

  private static async reconcile(userId: string, propertyId: string, workspaceId: string) {
    const plan = await this.context(propertyId);
    const workspace = await prisma.buyerClosingDisclosureWorkspace.findUniqueOrThrow({
      where: { id: workspaceId }, include: { revisions: true },
    });
    const confirmed = workspace.revisions.find((item) => item.id === workspace.currentRevisionId && item.status === 'CONFIRMED');
    const hasProgress = workspace.revisions.length > 0;
    const fundsComplete = Boolean(
      confirmed && workspace.fundsMethod !== 'UNKNOWN' && workspace.fundsExpectedAt && workspace.fundsReady
      && workspace.instructionsVerified && workspace.verificationChannel !== 'UNKNOWN' && workspace.questionsResolved,
    );
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.homeBuyerTask.upsert({
        where: { checklistId_actionKey: { checklistId: plan.checklistId, actionKey: BUYER_ACTION_KEYS.CLOSING_DISCLOSURE_REVIEW } },
        create: { checklistId: plan.checklistId, actionKey: BUYER_ACTION_KEYS.CLOSING_DISCLOSURE_REVIEW, templateKey: BUYER_ACTION_KEYS.CLOSING_DISCLOSURE_REVIEW, title: 'Review the current Closing Disclosure', description: 'Confirm the current revision and compare recorded loan, payment, fee, credit, and cash-to-close figures with the selected Loan Estimate.', phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'DOCUMENT', checklistSection: 'CLOSING_DISCLOSURE_FUNDS', evidenceRequirement: 'OPTIONAL', applicability: 'APPLICABLE', required: true, blocking: true, sourceType: 'SYSTEM', sortOrder: 67, status: confirmed ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'PENDING', statusReason: confirmed ? 'A current Closing Disclosure revision is confirmed.' : 'Complete and confirm the current Closing Disclosure revision.', completedAt: confirmed?.confirmedAt, completedByUserId: confirmed?.confirmedByUserId, completionMethod: confirmed ? 'USER_ATTESTATION' : null, completionEvidenceJson: confirmed ? { workspaceId, revisionId: confirmed.id, selectedLoanEstimateRevisionId: plan.selectedLoanEstimateRevisionId, disclaimer: 'Buyer-confirmed comparison; no lending, settlement, or legal certification.' } : Prisma.JsonNull },
        update: { status: confirmed ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'PENDING', statusReason: confirmed ? 'A current Closing Disclosure revision is confirmed.' : 'Complete and confirm the current Closing Disclosure revision.', completedAt: confirmed?.confirmedAt, completedByUserId: confirmed?.confirmedByUserId, completionMethod: confirmed ? 'USER_ATTESTATION' : null, completionEvidenceJson: confirmed ? { workspaceId, revisionId: confirmed.id, selectedLoanEstimateRevisionId: plan.selectedLoanEstimateRevisionId, disclaimer: 'Buyer-confirmed comparison; no lending, settlement, or legal certification.' } : Prisma.JsonNull },
      });
      await tx.homeBuyerTask.upsert({
        where: { checklistId_actionKey: { checklistId: plan.checklistId, actionKey: BUYER_ACTION_KEYS.FUNDS_READINESS_CONFIRM } },
        create: { checklistId: plan.checklistId, actionKey: BUYER_ACTION_KEYS.FUNDS_READINESS_CONFIRM, templateKey: BUYER_ACTION_KEYS.FUNDS_READINESS_CONFIRM, title: 'Confirm closing funds readiness and trusted instructions', description: 'Record the required funds method and independent verification of instructions without storing bank or wire credentials.', phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'ACTION', checklistSection: 'CLOSING_DISCLOSURE_FUNDS', evidenceRequirement: 'NONE', applicability: 'APPLICABLE', required: true, blocking: true, sourceType: 'SYSTEM', sortOrder: 68, status: fundsComplete ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'PENDING', statusReason: fundsComplete ? 'Funds timing, method, readiness, questions, and trusted-channel verification are recorded.' : 'Confirm the final disclosure, funds timing and method, resolve questions, and independently verify instructions.', completedAt: fundsComplete ? now : null, completedByUserId: fundsComplete ? userId : null, completionMethod: fundsComplete ? 'USER_ATTESTATION' : null, completionEvidenceJson: fundsComplete ? { workspaceId, revisionId: confirmed!.id, fundsMethod: workspace.fundsMethod, verificationChannel: workspace.verificationChannel, verifiedAt: workspace.instructionsVerifiedAt?.toISOString(), disclaimer: 'No account, routing, or wire credentials are stored.' } : Prisma.JsonNull },
        update: { applicability: 'APPLICABLE', status: fundsComplete ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'PENDING', statusReason: fundsComplete ? 'Funds timing, method, readiness, questions, and trusted-channel verification are recorded.' : 'Confirm the final disclosure, funds timing and method, resolve questions, and independently verify instructions.', completedAt: fundsComplete ? now : null, completedByUserId: fundsComplete ? userId : null, completionMethod: fundsComplete ? 'USER_ATTESTATION' : null, completionEvidenceJson: fundsComplete ? { workspaceId, revisionId: confirmed!.id, fundsMethod: workspace.fundsMethod, verificationChannel: workspace.verificationChannel, verifiedAt: workspace.instructionsVerifiedAt?.toISOString(), disclaimer: 'No account, routing, or wire credentials are stored.' } : Prisma.JsonNull },
      });
      await tx.buyerJourneyMilestone.upsert({
        where: { checklistId_milestoneKey: { checklistId: plan.checklistId, milestoneKey: BUYER_MILESTONE_KEYS.CLOSING_DISCLOSURE } },
        create: { checklistId: plan.checklistId, milestoneKey: BUYER_MILESTONE_KEYS.CLOSING_DISCLOSURE, type: 'CLOSING_DISCLOSURE', status: confirmed ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: confirmed?.issuedDate, completedAt: confirmed?.confirmedAt, sourceType: 'BUYER_CLOSING_DISCLOSURE_WORKSPACE', sourceEntityId: workspaceId, confidence: 1, notes: confirmed ? 'Buyer confirmed the current recorded Closing Disclosure revision.' : 'Closing Disclosure review is in progress.' },
        update: { status: confirmed ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: confirmed?.issuedDate, completedAt: confirmed?.confirmedAt, sourceType: 'BUYER_CLOSING_DISCLOSURE_WORKSPACE', sourceEntityId: workspaceId, confidence: 1, notes: confirmed ? 'Buyer confirmed the current recorded Closing Disclosure revision.' : 'Closing Disclosure review is in progress.' },
      });
    });
  }
}
