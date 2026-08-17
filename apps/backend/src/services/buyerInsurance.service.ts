import { Prisma, type BuyerInsuranceWorkspace } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  BUYER_ACTION_KEYS,
  BUYER_MILESTONE_KEYS,
  type BuyerInsuranceBindInput,
  type BuyerInsuranceQuoteCreateInput,
  type BuyerInsuranceQuoteUpdateInput,
  type BuyerInsuranceRequirementCreateInput,
  type BuyerInsuranceRequirementUpdateInput,
  type BuyerInsuranceWorkspaceUpdateInput,
} from '../productFramework/buyerAcquisition.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { HomeBuyerTaskService } from './HomeBuyerTask.service';
import { createInsurancePolicy } from './home-management.service';

async function assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
  }
}

const dateValue = (value: string | null | undefined) => value === undefined ? undefined : value === null ? null : new Date(value);
const dateText = (value: Date | null | undefined) => value?.toISOString() ?? null;

function serialize(workspace: any) {
  return {
    ...workspace,
    requiredEffectiveAt: dateText(workspace.requiredEffectiveAt),
    lenderProofDeliveredAt: dateText(workspace.lenderProofDeliveredAt),
    closingProofDeliveredAt: dateText(workspace.closingProofDeliveredAt),
    boundRecordedAt: dateText(workspace.boundRecordedAt),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    quotes: workspace.quotes.map((quote: any) => ({
      ...quote,
      validUntil: dateText(quote.validUntil),
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
    })),
    requirements: workspace.requirements.map((item: any) => ({
      ...item,
      dueAt: dateText(item.dueAt),
      resolvedAt: dateText(item.resolvedAt),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

export class BuyerInsuranceService {
  static async get(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const workspace = await prisma.buyerInsuranceWorkspace.findUnique({
      where: { propertyId },
      include: {
        quotes: { orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] },
        requirements: { orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!workspace) return { workspace: null, contact: null, policy: null, documents: [] };
    const documentIds = [workspace.binderDocumentId, ...workspace.quotes.map((quote) => quote.sourceDocumentId)]
      .filter((value): value is string => Boolean(value));
    const [contact, policy, documents] = await Promise.all([
      workspace.insuranceContactId
        ? prisma.buyerJourneyContact.findFirst({ where: { id: workspace.insuranceContactId, checklistId: workspace.checklistId } })
        : null,
      workspace.boundPolicyId
        ? prisma.insurancePolicy.findFirst({
            where: { id: workspace.boundPolicyId, propertyId },
            select: { id: true, carrierName: true, policyNumber: true, coverageType: true, premiumAmount: true, deductibleCents: true, personalPropertyLimitCents: true, startDate: true, expiryDate: true },
          })
        : null,
      documentIds.length
        ? prisma.document.findMany({
            where: { id: { in: documentIds }, propertyId, deletedAt: null },
            select: { id: true, name: true, type: true, verificationStatus: true, createdAt: true },
          })
        : [],
    ]);
    return {
      workspace: serialize(workspace),
      contact: contact ? { ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() } : null,
      policy: policy ? { ...policy, premiumAmount: policy.premiumAmount?.toString() ?? null, startDate: dateText(policy.startDate), expiryDate: dateText(policy.expiryDate) } : null,
      documents: documents.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
    };
  }

  static async update(userId: string, propertyId: string, input: BuyerInsuranceWorkspaceUpdateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const existing = await prisma.buyerInsuranceWorkspace.findUnique({ where: { propertyId } });
    await this.assertDocuments(propertyId, [input.binderDocumentId]);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      let insuranceContactId = existing?.insuranceContactId ?? null;
      if (input.contact === null) insuranceContactId = null;
      else if (input.contact) {
        const data = { role: 'INSURANCE' as const, ...input.contact };
        const current = insuranceContactId
          ? await tx.buyerJourneyContact.findFirst({ where: { id: insuranceContactId, checklistId: checklist.id } })
          : null;
        if (current) await tx.buyerJourneyContact.update({ where: { id: current.id }, data });
        else insuranceContactId = (await tx.buyerJourneyContact.create({ data: { checklistId: checklist.id, ...data } })).id;
      }
      const workspace = await tx.buyerInsuranceWorkspace.upsert({
        where: { propertyId },
        create: {
          checklistId: checklist.id,
          propertyId,
          insuranceContactId,
          requiredEffectiveAt: dateValue(input.requiredEffectiveAt),
          binderDocumentId: input.binderDocumentId,
          lenderProofStatus: input.lenderProofStatus,
          lenderProofDeliveredAt: input.lenderProofStatus === 'DELIVERED' ? now : null,
          closingProofStatus: input.closingProofStatus,
          closingProofDeliveredAt: input.closingProofStatus === 'DELIVERED' ? now : null,
          riskAndEligibilityNotes: input.riskAndEligibilityNotes,
          lastUpdatedByUserId: userId,
        },
        update: {
          insuranceContactId,
          requiredEffectiveAt: dateValue(input.requiredEffectiveAt),
          binderDocumentId: input.binderDocumentId,
          lenderProofStatus: input.lenderProofStatus,
          ...(input.lenderProofStatus === undefined ? {} : { lenderProofDeliveredAt: input.lenderProofStatus === 'DELIVERED' ? existing?.lenderProofDeliveredAt ?? now : null }),
          closingProofStatus: input.closingProofStatus,
          ...(input.closingProofStatus === undefined ? {} : { closingProofDeliveredAt: input.closingProofStatus === 'DELIVERED' ? existing?.closingProofDeliveredAt ?? now : null }),
          riskAndEligibilityNotes: input.riskAndEligibilityNotes,
          lastUpdatedByUserId: userId,
        },
      });
      if (input.binderDocumentId && workspace.boundPolicyId) {
        await tx.document.update({ where: { id: input.binderDocumentId }, data: { policyId: workspace.boundPolicyId } });
      }
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async createQuote(userId: string, propertyId: string, input: BuyerInsuranceQuoteCreateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    await this.assertDocuments(propertyId, [input.sourceDocumentId]);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const workspace = await tx.buyerInsuranceWorkspace.upsert({
        where: { propertyId },
        create: { checklistId: checklist.id, propertyId, lastUpdatedByUserId: userId },
        update: { lastUpdatedByUserId: userId },
      });
      await tx.buyerInsuranceQuote.create({
        data: { workspaceId: workspace.id, propertyId, ...input, validUntil: dateValue(input.validUntil), recordedByUserId: userId, lastUpdatedByUserId: userId },
      });
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async updateQuote(userId: string, propertyId: string, quoteId: string, input: BuyerInsuranceQuoteUpdateInput) {
    await assertAccess(userId, propertyId);
    await this.assertDocuments(propertyId, [input.sourceDocumentId]);
    const quote = await prisma.buyerInsuranceQuote.findFirst({ where: { id: quoteId, propertyId } });
    if (!quote) throw new APIError('Insurance quote not found.', 404, 'BUYER_INSURANCE_QUOTE_NOT_FOUND');
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerInsuranceQuote.update({ where: { id: quoteId }, data: { ...input, validUntil: dateValue(input.validUntil), lastUpdatedByUserId: userId } });
      const workspace = await tx.buyerInsuranceWorkspace.findUniqueOrThrow({ where: { id: quote.workspaceId } });
      await this.reconcile(tx, workspace.id, workspace.checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async selectQuote(userId: string, propertyId: string, quoteId: string) {
    await assertAccess(userId, propertyId);
    const quote = await prisma.buyerInsuranceQuote.findFirst({ where: { id: quoteId, propertyId }, include: { workspace: true } });
    if (!quote) throw new APIError('Insurance quote not found.', 404, 'BUYER_INSURANCE_QUOTE_NOT_FOUND');
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerInsuranceQuote.updateMany({ where: { workspaceId: quote.workspaceId, status: 'SELECTED' }, data: { status: 'REVIEWED' } });
      await tx.buyerInsuranceQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED', lastUpdatedByUserId: userId } });
      const workspace = await tx.buyerInsuranceWorkspace.update({ where: { id: quote.workspaceId }, data: { selectedQuoteId: quoteId, lastUpdatedByUserId: userId } });
      await this.reconcile(tx, workspace.id, workspace.checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async bind(userId: string, propertyId: string, input: BuyerInsuranceBindInput) {
    await assertAccess(userId, propertyId);
    const workspace = await prisma.buyerInsuranceWorkspace.findUnique({ where: { propertyId }, include: { quotes: true } });
    const quote = workspace?.quotes.find((item) => item.id === input.quoteId);
    if (!workspace || !quote || workspace.selectedQuoteId !== quote.id || quote.status !== 'SELECTED') {
      throw new APIError('Select the reviewed quote before recording binding.', 409, 'BUYER_INSURANCE_SELECTION_REQUIRED');
    }
    if (workspace.boundPolicyId) return this.get(userId, propertyId);
    if (quote.annualPremiumCents == null) {
      throw new APIError('Annual premium is required before recording a bound policy.', 409, 'BUYER_INSURANCE_PREMIUM_REQUIRED');
    }
    if (quote.validUntil && quote.validUntil < new Date()) {
      throw new APIError('The selected quote is expired. Review a current quote before recording binding.', 409, 'BUYER_INSURANCE_QUOTE_EXPIRED');
    }
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } });
    if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
    let policy = workspace.boundPolicyId
      ? await prisma.insurancePolicy.findFirst({ where: { id: workspace.boundPolicyId, propertyId } })
      : await prisma.insurancePolicy.findFirst({
          where: { propertyId, carrierName: quote.carrierName, policyNumber: input.policyNumber, startDate: new Date(input.effectiveAt) },
        });
    if (!policy) {
      policy = await createInsurancePolicy(property.homeownerProfileId, {
        propertyId,
        carrierName: quote.carrierName,
        policyNumber: input.policyNumber,
        coverageType: 'Homeowners',
        premiumAmount: quote.annualPremiumCents / 100,
        personalPropertyLimitCents: quote.personalPropertyLimitCents,
        deductibleCents: quote.deductibleCents,
        startDate: new Date(input.effectiveAt),
        expiryDate: new Date(input.expiresAt),
      }, userId) as any;
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.buyerInsuranceWorkspace.update({
        where: { id: workspace.id },
        data: { boundPolicyId: policy!.id, boundRecordedAt: now, boundRecordedByUserId: userId, lastUpdatedByUserId: userId },
      });
      if (updated.binderDocumentId) await tx.document.update({ where: { id: updated.binderDocumentId }, data: { policyId: policy!.id } });
      await this.reconcile(tx, updated.id, updated.checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async createRequirement(userId: string, propertyId: string, input: BuyerInsuranceRequirementCreateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const workspace = await tx.buyerInsuranceWorkspace.upsert({ where: { propertyId }, create: { checklistId: checklist.id, propertyId, lastUpdatedByUserId: userId }, update: { lastUpdatedByUserId: userId } });
      await tx.buyerInsuranceRequirement.create({ data: { workspaceId: workspace.id, propertyId, ...input, dueAt: dateValue(input.dueAt), recordedByUserId: userId, lastUpdatedByUserId: userId } });
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async updateRequirement(userId: string, propertyId: string, requirementId: string, input: BuyerInsuranceRequirementUpdateInput) {
    await assertAccess(userId, propertyId);
    const item = await prisma.buyerInsuranceRequirement.findFirst({ where: { id: requirementId, propertyId } });
    if (!item) throw new APIError('Insurance requirement not found.', 404, 'BUYER_INSURANCE_REQUIREMENT_NOT_FOUND');
    const status = input.status ?? item.status;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerInsuranceRequirement.update({ where: { id: requirementId }, data: { ...input, dueAt: dateValue(input.dueAt), resolvedAt: ['RESOLVED', 'WAIVED'].includes(status) ? item.resolvedAt ?? now : null, lastUpdatedByUserId: userId } });
      const workspace = await tx.buyerInsuranceWorkspace.findUniqueOrThrow({ where: { id: item.workspaceId } });
      await this.reconcile(tx, workspace.id, workspace.checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  private static async assertDocuments(propertyId: string, ids: Array<string | null | undefined>) {
    const requested = [...new Set(ids.filter((value): value is string => Boolean(value)))];
    if (!requested.length) return;
    const count = await prisma.document.count({ where: { id: { in: requested }, propertyId, deletedAt: null } });
    if (count !== requested.length) throw new APIError('An insurance document was not found for this property.', 404, 'DOCUMENT_NOT_FOUND');
  }

  private static async reconcile(tx: Prisma.TransactionClient, workspaceId: string, checklistId: string, userId: string, now: Date) {
    const workspace = await tx.buyerInsuranceWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { quotes: true, requirements: true } });
    const policy = workspace.boundPolicyId ? await tx.insurancePolicy.findFirst({ where: { id: workspace.boundPolicyId, propertyId: workspace.propertyId } }) : null;
    const unresolved = workspace.requirements.filter((item) => ['OPEN', 'SUBMITTED'].includes(item.status));
    const blockers = unresolved.filter((item) => item.blocking || Boolean(item.dueAt && item.dueAt < now));
    const effectiveReady = Boolean(policy?.startDate)
      && (!workspace.requiredEffectiveAt || policy!.startDate! <= workspace.requiredEffectiveAt);
    const proofReady = workspace.lenderProofStatus !== 'PENDING' && workspace.closingProofStatus !== 'PENDING';
    const complete = Boolean(policy && workspace.binderDocumentId && effectiveReady && proofReady && unresolved.length === 0);
    const hasProgress = workspace.quotes.length > 0 || Boolean(workspace.insuranceContactId || workspace.selectedQuoteId || policy);
    const status = blockers.length ? 'BLOCKED' : complete ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'PENDING';
    await tx.homeBuyerTask.upsert({
      where: { checklistId_actionKey: { checklistId, actionKey: BUYER_ACTION_KEYS.COVERAGE_BIND } },
      create: {
        checklistId, actionKey: BUYER_ACTION_KEYS.COVERAGE_BIND, templateKey: BUYER_ACTION_KEYS.COVERAGE_BIND,
        title: 'Prepare and confirm homeowners insurance',
        description: 'Compare recorded quote assumptions, select with the insurer or agent, and record binding and proof delivery.',
        phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'SERVICE', checklistSection: 'INSURANCE',
        evidenceRequirement: 'REQUIRED', applicability: 'APPLICABLE', required: true, blocking: true,
        sourceType: 'SYSTEM', sortOrder: 55, status,
        statusReason: this.statusReason({ blockers: blockers.length, complete, policy: Boolean(policy), selected: Boolean(workspace.selectedQuoteId) }),
        completedAt: complete ? now : null, completedByUserId: complete ? userId : null,
        completionMethod: complete ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: complete ? { workspaceId, quoteId: workspace.selectedQuoteId, policyId: policy!.id, binderDocumentId: workspace.binderDocumentId, disclaimer: 'Buyer-recorded binding and delivery; ContractToCozy did not recommend or bind coverage.' } : Prisma.JsonNull,
      },
      update: {
        status,
        statusReason: this.statusReason({ blockers: blockers.length, complete, policy: Boolean(policy), selected: Boolean(workspace.selectedQuoteId) }),
        completedAt: complete ? now : null, completedByUserId: complete ? userId : null,
        completionMethod: complete ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: complete ? { workspaceId, quoteId: workspace.selectedQuoteId, policyId: policy!.id, binderDocumentId: workspace.binderDocumentId, disclaimer: 'Buyer-recorded binding and delivery; ContractToCozy did not recommend or bind coverage.' } : Prisma.JsonNull,
      },
    });
    await tx.buyerJourneyMilestone.upsert({
      where: { checklistId_milestoneKey: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.INSURANCE_EFFECTIVE } },
      create: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.INSURANCE_EFFECTIVE, type: 'INSURANCE_EFFECTIVE', status: complete ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: workspace.requiredEffectiveAt, completedAt: complete ? now : null, sourceType: 'BUYER_INSURANCE_WORKSPACE', sourceEntityId: workspace.id, confidence: 1, notes: complete ? 'Buyer recorded a bound canonical policy, effective-date readiness, and required proof delivery.' : workspace.riskAndEligibilityNotes },
      update: { status: complete ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: workspace.requiredEffectiveAt, completedAt: complete ? now : null, sourceType: 'BUYER_INSURANCE_WORKSPACE', sourceEntityId: workspace.id, confidence: 1, notes: complete ? 'Buyer recorded a bound canonical policy, effective-date readiness, and required proof delivery.' : workspace.riskAndEligibilityNotes },
    });
  }

  private static statusReason(input: { blockers: number; complete: boolean; policy: boolean; selected: boolean }) {
    if (input.blockers) return `${input.blockers} insurance requirement(s) need insurer, agent, or lender follow-up.`;
    if (input.complete) return 'The buyer recorded binding, effective-date readiness, and required proof delivery.';
    if (input.policy) return 'A bound policy is recorded; attach the binder and confirm required proof delivery.';
    if (input.selected) return 'A quote is selected; binding must still be confirmed with the insurer or agent.';
    return 'Collect and compare quote assumptions without treating a quote as bound coverage.';
  }
}
