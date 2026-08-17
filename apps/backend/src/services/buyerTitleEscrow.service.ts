import { Prisma, type BuyerTitleEscrowWorkspace } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  BUYER_ACTION_KEYS,
  BUYER_MILESTONE_KEYS,
  type BuyerTitleEscrowIssueCreateInput,
  type BuyerTitleEscrowIssueUpdateInput,
  type BuyerTitleEscrowWorkspaceUpdateInput,
} from '../productFramework/buyerAcquisition.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { HomeBuyerTaskService } from './HomeBuyerTask.service';

async function assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
  }
}

const dateValue = (value: string | null | undefined) => value === undefined ? undefined : value === null ? null : new Date(value);
const dateText = (value: Date | null) => value?.toISOString() ?? null;

type WorkspaceWithIssues = BuyerTitleEscrowWorkspace & {
  issues: Array<{
    id: string;
    category: string;
    status: string;
    title: string;
    notes: string | null;
    dueAt: Date | null;
    blocking: boolean;
    resolvedAt: Date | null;
    recordedByUserId: string | null;
    lastUpdatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

function serializeWorkspace(workspace: WorkspaceWithIssues) {
  return {
    ...workspace,
    earnestMoneyConfirmedAt: dateText(workspace.earnestMoneyConfirmedAt),
    associationReviewedAt: dateText(workspace.associationReviewedAt),
    closingAppointmentAt: dateText(workspace.closingAppointmentAt),
    possessionAt: dateText(workspace.possessionAt),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    issues: workspace.issues.map((issue) => ({
      ...issue,
      dueAt: dateText(issue.dueAt),
      resolvedAt: dateText(issue.resolvedAt),
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    })),
  };
}

const TASK_DEFINITIONS = {
  [BUYER_ACTION_KEYS.TITLE_CONTACT_CONFIRM]: {
    title: 'Confirm the title or closing professional',
    description: 'Record the attorney, title company, settlement agent, or escrow contact responsible for the transaction.',
    taskType: 'ACTION' as const,
    evidenceRequirement: 'NONE' as const,
    blocking: false,
  },
  [BUYER_ACTION_KEYS.TITLE_DOCUMENT_REVIEW]: {
    title: 'Review title, survey, and association documents',
    description: 'Track receipt and professional review without representing that ContractToCozy cleared title or legal exceptions.',
    taskType: 'DOCUMENT' as const,
    evidenceRequirement: 'REQUIRED' as const,
    blocking: true,
  },
  [BUYER_ACTION_KEYS.TITLE_ISSUE_RESOLUTION]: {
    title: 'Resolve recorded title and closing questions',
    description: 'Route user-recorded exceptions, survey, association, municipal, or vesting questions to the responsible professional.',
    taskType: 'ACTION' as const,
    evidenceRequirement: 'OPTIONAL' as const,
    blocking: true,
  },
} as const;

export class BuyerTitleEscrowService {
  static async get(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const workspace = await prisma.buyerTitleEscrowWorkspace.findUnique({
      where: { propertyId },
      include: { issues: { orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!workspace) return { workspace: null, contact: null, documents: [] };
    const documentIds = [
      workspace.titleCommitmentDocumentId,
      workspace.surveyDocumentId,
      workspace.associationDocumentId,
    ].filter((value): value is string => Boolean(value));
    const [contact, documents] = await Promise.all([
      workspace.responsibleContactId
        ? prisma.buyerJourneyContact.findFirst({ where: { id: workspace.responsibleContactId, checklistId: workspace.checklistId } })
        : null,
      documentIds.length
        ? prisma.document.findMany({
            where: { id: { in: documentIds }, propertyId, deletedAt: null },
            select: { id: true, name: true, type: true, verificationStatus: true, createdAt: true },
          })
        : [],
    ]);
    return {
      workspace: serializeWorkspace(workspace),
      contact: contact ? { ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() } : null,
      documents: documents.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
    };
  }

  static async update(
    userId: string,
    propertyId: string,
    input: BuyerTitleEscrowWorkspaceUpdateInput,
  ) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const existing = await prisma.buyerTitleEscrowWorkspace.findUnique({ where: { propertyId } });
    await this.assertDocuments(propertyId, [
      input.titleCommitmentDocumentId,
      input.surveyDocumentId,
      input.associationDocumentId,
    ]);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      let responsibleContactId = existing?.responsibleContactId ?? null;
      if (input.contact === null) {
        responsibleContactId = null;
      } else if (input.contact) {
        const contactData = {
          role: input.contact.role,
          name: input.contact.name,
          company: input.contact.company,
          email: input.contact.email,
          phone: input.contact.phone,
          notes: input.contact.notes,
        };
        const currentContact = responsibleContactId
          ? await tx.buyerJourneyContact.findFirst({ where: { id: responsibleContactId, checklistId: checklist.id } })
          : null;
        if (currentContact) {
          await tx.buyerJourneyContact.update({ where: { id: currentContact.id }, data: contactData });
        } else {
          const created = await tx.buyerJourneyContact.create({ data: { checklistId: checklist.id, ...contactData } });
          responsibleContactId = created.id;
        }
      }
      const workspace = await tx.buyerTitleEscrowWorkspace.upsert({
        where: { propertyId },
        create: {
          checklistId: checklist.id,
          propertyId,
          responsibleContactId,
          earnestMoneyConfirmedAt: input.earnestMoneyConfirmed ? now : null,
          titleCommitmentDocumentId: input.titleCommitmentDocumentId,
          titleReviewStatus: input.titleReviewStatus,
          surveyRequirement: input.surveyRequirement,
          surveyDocumentId: input.surveyDocumentId,
          associationRequirement: input.associationRequirement,
          associationDocumentId: input.associationDocumentId,
          associationReviewedAt: input.associationReviewed ? now : null,
          localRequirementsNotes: input.localRequirementsNotes,
          closingAppointmentAt: dateValue(input.closingAppointmentAt),
          closingAppointmentFormat: input.closingAppointmentFormat,
          closingLocation: input.closingLocation,
          possessionAt: dateValue(input.possessionAt),
          lastUpdatedByUserId: userId,
        },
        update: {
          responsibleContactId,
          ...(input.earnestMoneyConfirmed === undefined ? {} : { earnestMoneyConfirmedAt: input.earnestMoneyConfirmed ? existing?.earnestMoneyConfirmedAt ?? now : null }),
          titleCommitmentDocumentId: input.titleCommitmentDocumentId,
          titleReviewStatus: input.titleReviewStatus,
          surveyRequirement: input.surveyRequirement,
          surveyDocumentId: input.surveyDocumentId,
          associationRequirement: input.associationRequirement,
          associationDocumentId: input.associationDocumentId,
          ...(input.associationReviewed === undefined ? {} : { associationReviewedAt: input.associationReviewed ? existing?.associationReviewedAt ?? now : null }),
          localRequirementsNotes: input.localRequirementsNotes,
          closingAppointmentAt: dateValue(input.closingAppointmentAt),
          closingAppointmentFormat: input.closingAppointmentFormat,
          closingLocation: input.closingLocation,
          possessionAt: dateValue(input.possessionAt),
          lastUpdatedByUserId: userId,
        },
      });
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async createIssue(userId: string, propertyId: string, input: BuyerTitleEscrowIssueCreateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const workspace = await tx.buyerTitleEscrowWorkspace.upsert({
        where: { propertyId },
        create: { checklistId: checklist.id, propertyId, lastUpdatedByUserId: userId },
        update: { lastUpdatedByUserId: userId },
      });
      await tx.buyerTitleEscrowIssue.create({
        data: {
          workspaceId: workspace.id,
          propertyId,
          category: input.category,
          title: input.title,
          notes: input.notes,
          dueAt: dateValue(input.dueAt),
          blocking: input.blocking,
          recordedByUserId: userId,
          lastUpdatedByUserId: userId,
        },
      });
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async updateIssue(
    userId: string,
    propertyId: string,
    issueId: string,
    input: BuyerTitleEscrowIssueUpdateInput,
  ) {
    await assertAccess(userId, propertyId);
    const issue = await prisma.buyerTitleEscrowIssue.findFirst({ where: { id: issueId, propertyId } });
    if (!issue) throw new APIError('Title or escrow issue not found.', 404, 'BUYER_TITLE_ISSUE_NOT_FOUND');
    const status = input.status ?? issue.status;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerTitleEscrowIssue.update({
        where: { id: issueId },
        data: {
          ...input,
          dueAt: dateValue(input.dueAt),
          resolvedAt: ['RESOLVED', 'WAIVED'].includes(status) ? issue.resolvedAt ?? now : null,
          lastUpdatedByUserId: userId,
        },
      });
      await this.reconcile(tx, issue.workspaceId, (await tx.buyerTitleEscrowWorkspace.findUniqueOrThrow({ where: { id: issue.workspaceId } })).checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  private static async assertDocuments(propertyId: string, ids: Array<string | null | undefined>) {
    const requested = [...new Set(ids.filter((value): value is string => Boolean(value)))];
    if (!requested.length) return;
    const count = await prisma.document.count({ where: { id: { in: requested }, propertyId, deletedAt: null } });
    if (count !== requested.length) throw new APIError('A linked title document was not found for this property.', 404, 'DOCUMENT_NOT_FOUND');
  }

  private static async upsertTask(
    tx: Prisma.TransactionClient,
    checklistId: string,
    actionKey: keyof typeof TASK_DEFINITIONS,
    status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'NOT_NEEDED',
    statusReason: string,
    userId: string,
    now: Date,
    evidence: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull,
  ) {
    const definition = TASK_DEFINITIONS[actionKey];
    await tx.homeBuyerTask.upsert({
      where: { checklistId_actionKey: { checklistId, actionKey } },
      create: {
        checklistId,
        actionKey,
        templateKey: actionKey,
        title: definition.title,
        description: definition.description,
        phase: 'DUE_DILIGENCE',
        priority: 'SOON',
        taskType: definition.taskType,
        checklistSection: 'TITLE_ESCROW_HOA',
        evidenceRequirement: definition.evidenceRequirement,
        applicability: 'APPLICABLE',
        required: true,
        blocking: definition.blocking,
        sourceType: 'SYSTEM',
        sortOrder: 45,
        status,
        statusReason,
        completedAt: status === 'COMPLETED' ? now : null,
        completedByUserId: status === 'COMPLETED' ? userId : null,
        completionMethod: status === 'COMPLETED' ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: evidence,
      },
      update: {
        status,
        statusReason,
        completedAt: status === 'COMPLETED' ? now : null,
        completedByUserId: status === 'COMPLETED' ? userId : null,
        completionMethod: status === 'COMPLETED' ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: evidence,
      },
    });
  }

  private static async reconcile(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    checklistId: string,
    userId: string,
    now: Date,
  ) {
    const workspace = await tx.buyerTitleEscrowWorkspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { issues: true },
    });
    const unresolved = workspace.issues.filter((issue) => ['OPEN', 'PROFESSIONAL_REVIEW'].includes(issue.status));
    const blockers = unresolved.filter((issue) => issue.blocking || Boolean(issue.dueAt && issue.dueAt < now));
    const titleReviewed = workspace.titleReviewStatus === 'REVIEWED_WITH_PROFESSIONAL';
    const titleReady = Boolean(workspace.titleCommitmentDocumentId) && titleReviewed;
    const surveyReady = workspace.surveyRequirement === 'NOT_REQUIRED'
      || (workspace.surveyRequirement === 'REQUIRED' && Boolean(workspace.surveyDocumentId));
    const associationReady = workspace.associationRequirement === 'NOT_REQUIRED'
      || (workspace.associationRequirement === 'REQUIRED' && Boolean(workspace.associationDocumentId) && Boolean(workspace.associationReviewedAt));
    const documentsReady = titleReady && surveyReady && associationReady && unresolved.length === 0;
    const hasProgress = workspace.titleReviewStatus !== 'NOT_RECEIVED'
      || Boolean(workspace.titleCommitmentDocumentId || workspace.surveyDocumentId || workspace.associationDocumentId);

    await this.upsertTask(
      tx, checklistId, BUYER_ACTION_KEYS.TITLE_CONTACT_CONFIRM,
      workspace.responsibleContactId ? 'COMPLETED' : 'PENDING',
      workspace.responsibleContactId
        ? 'The responsible attorney, title, settlement, or escrow contact is recorded.'
        : 'Record the professional responsible for title and closing questions.',
      userId, now,
      workspace.responsibleContactId ? { responsibleContactId: workspace.responsibleContactId, recordedAt: now.toISOString() } : Prisma.JsonNull,
    );
    const documentStatus = blockers.length || workspace.titleReviewStatus === 'QUESTIONS_OPEN'
      ? 'BLOCKED'
      : documentsReady ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'PENDING';
    await this.upsertTask(
      tx, checklistId, BUYER_ACTION_KEYS.TITLE_DOCUMENT_REVIEW,
      documentStatus,
      blockers.length
        ? `${blockers.length} title or closing issue(s) need professional follow-up.`
        : workspace.titleReviewStatus === 'QUESTIONS_OPEN'
          ? 'The buyer recorded open questions for the title or closing professional.'
          : documentsReady
            ? 'The buyer recorded professional review and dispositioned applicable survey and association preparation.'
            : 'Collect and review the applicable title, survey, and association records.',
      userId, now,
      documentsReady ? {
        workspaceId: workspace.id,
        titleCommitmentDocumentId: workspace.titleCommitmentDocumentId,
        surveyDocumentId: workspace.surveyDocumentId,
        associationDocumentId: workspace.associationDocumentId,
        reviewedWithProfessional: true,
        disclaimer: 'Preparation recorded; this is not a certification of clear title.',
      } : Prisma.JsonNull,
    );
    await this.upsertTask(
      tx, checklistId, BUYER_ACTION_KEYS.TITLE_ISSUE_RESOLUTION,
      blockers.length ? 'BLOCKED' : unresolved.length ? 'IN_PROGRESS' : workspace.issues.length ? 'COMPLETED' : 'NOT_NEEDED',
      blockers.length
        ? `${blockers.length} user-recorded title or closing issue(s) are blocking readiness.`
        : unresolved.length
          ? `${unresolved.length} title or closing question(s) remain with the professional.`
          : workspace.issues.length ? 'All recorded title and closing questions are dispositioned.' : 'No title or closing issues are currently recorded.',
      userId, now,
      unresolved.length === 0 && workspace.issues.length
        ? { workspaceId: workspace.id, issueIds: workspace.issues.map((issue) => issue.id), dispositionedAt: now.toISOString() }
        : Prisma.JsonNull,
    );

    if (hasProgress) {
      await tx.homeBuyerTask.updateMany({
        where: { checklistId, actionKey: BUYER_ACTION_KEYS.CLOSING_DOCUMENTS, status: 'PENDING' },
        data: {
        status: 'IN_PROGRESS',
        statusReason: 'Title or closing source documents are being collected; final signed records remain outstanding.',
        },
      });
    }
    await tx.homeBuyerTask.updateMany({
      where: { checklistId, actionKey: 'buyer:phase:association-records-review' },
      data: workspace.associationRequirement === 'NOT_REQUIRED' ? {
        status: 'NOT_NEEDED',
        statusReason: 'The buyer recorded that association documents are not required for this transaction.',
      } : associationReady ? {
        status: 'COMPLETED',
        completedAt: now,
        completedByUserId: userId,
        completionMethod: 'USER_ATTESTATION',
        completionEvidenceJson: { associationDocumentId: workspace.associationDocumentId, reviewedAt: workspace.associationReviewedAt?.toISOString() },
        statusReason: 'Association records were attached and the buyer recorded professional review.',
      } : {
        status: 'IN_PROGRESS',
        statusReason: 'Association records are required and still being collected or reviewed.',
      },
    });

    const milestoneStatus = documentsReady ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED';
    await tx.buyerJourneyMilestone.upsert({
      where: { checklistId_milestoneKey: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.TITLE_SURVEY } },
      create: {
        checklistId,
        milestoneKey: BUYER_MILESTONE_KEYS.TITLE_SURVEY,
        type: 'TITLE_SURVEY',
        status: milestoneStatus,
        dueAt: workspace.closingAppointmentAt,
        completedAt: documentsReady ? now : null,
        sourceType: 'BUYER_TITLE_ESCROW_WORKSPACE',
        sourceEntityId: workspace.id,
        confidence: 1,
        notes: documentsReady
          ? 'Buyer recorded professional review and applicable document preparation; no title clearance is certified.'
          : workspace.localRequirementsNotes,
      },
      update: {
        status: milestoneStatus,
        dueAt: workspace.closingAppointmentAt,
        completedAt: documentsReady ? now : null,
        sourceType: 'BUYER_TITLE_ESCROW_WORKSPACE',
        sourceEntityId: workspace.id,
        confidence: 1,
        notes: documentsReady
          ? 'Buyer recorded professional review and applicable document preparation; no title clearance is certified.'
          : workspace.localRequirementsNotes,
      },
    });
  }
}
