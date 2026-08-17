import { Prisma, type BuyerClosingDayWorkspace } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  BUYER_ACTION_KEYS,
  BUYER_MILESTONE_KEYS,
  type BuyerClosingDayConfirmInput,
  type BuyerClosingDayUpdateInput,
} from '../productFramework/buyerAcquisition.contract';
import { assertBuyerJourneyStageTransition } from '../productFramework/buyerJourneyLifecycle.contract';
import { HomeBuyerTaskService } from './HomeBuyerTask.service';
import { BuyerAcquisitionService } from './buyerAcquisition.service';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';

async function assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
  }
}

const inactiveStatuses: Array<'COMPLETED' | 'NOT_NEEDED' | 'CANCELLED'> = ['COMPLETED', 'NOT_NEEDED', 'CANCELLED'];
const itemStatuses = ['keysStatus', 'remotesStatus', 'accessCodesStatus', 'mailboxAccessStatus', 'warrantiesManualsStatus'] as const;

function serialize(workspace: BuyerClosingDayWorkspace | null) {
  if (!workspace) return null;
  return {
    ...workspace,
    professionalClosingConfirmedAt: workspace.professionalClosingConfirmedAt?.toISOString() ?? null,
    closeEffectiveAt: workspace.closeEffectiveAt?.toISOString() ?? null,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export class BuyerClosingDayService {
  static async get(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const [workspace, title, fundsTask, blockers] = await Promise.all([
      prisma.buyerClosingDayWorkspace.findUnique({ where: { propertyId } }),
      prisma.buyerTitleEscrowWorkspace.findUnique({
        where: { propertyId },
        include: { issues: { where: { blocking: true, status: { notIn: ['RESOLVED', 'WAIVED'] } }, orderBy: { createdAt: 'asc' } } },
      }),
      prisma.homeBuyerTask.findUnique({
        where: { checklistId_actionKey: { checklistId: checklist.id, actionKey: BUYER_ACTION_KEYS.FUNDS_READINESS_CONFIRM } },
        select: { id: true, status: true, statusReason: true },
      }),
      prisma.homeBuyerTask.findMany({
        where: {
          checklistId: checklist.id,
          actionKey: { not: BUYER_ACTION_KEYS.CLOSING_DAY_CONFIRM },
          status: { notIn: inactiveStatuses },
          OR: [{ status: 'BLOCKED' }, { blocking: true }],
        },
        select: { id: true, actionKey: true, title: true, status: true, statusReason: true, checklistSection: true },
        orderBy: [{ dueAt: 'asc' }, { sortOrder: 'asc' }],
      }),
    ]);
    const contact = title?.responsibleContactId
      ? await prisma.buyerJourneyContact.findFirst({
        where: { id: title.responsibleContactId, checklistId: checklist.id },
        select: { id: true, role: true, name: true, company: true, phone: true, email: true },
      })
      : null;
    const signedDocument = workspace?.signedClosingDocumentId
      ? await prisma.document.findFirst({
        where: { id: workspace.signedClosingDocumentId, propertyId, deletedAt: null },
        select: { id: true, name: true, type: true, verificationStatus: true, createdAt: true },
      })
      : null;
    return {
      workspace: serialize(workspace),
      appointment: title ? {
        scheduledAt: title.closingAppointmentAt?.toISOString() ?? null,
        format: title.closingAppointmentFormat,
        location: title.closingLocation,
        possessionAt: title.possessionAt?.toISOString() ?? null,
        trustedContact: contact,
      } : null,
      titleBlockingIssues: (title?.issues ?? []).map((issue) => ({ id: issue.id, title: issue.title, status: issue.status, notes: issue.notes })),
      fundsReadiness: fundsTask ?? null,
      blockers,
      signedDocument: signedDocument ? { ...signedDocument, createdAt: signedDocument.createdAt.toISOString() } : null,
      lifecycle: {
        stage: checklist.stage,
        targetCloseDate: checklist.targetCloseDate?.toISOString() ?? null,
        ownershipStartedAt: checklist.ownershipStartedAt?.toISOString() ?? null,
      },
      disclaimer: 'Closing Day records buyer preparation and an explicit report that the professional closing is complete. ContractToCozy does not interpret documents, determine legal effect, direct whether to close, or store identity secrets or full wire credentials.',
    };
  }

  static async update(userId: string, propertyId: string, input: BuyerClosingDayUpdateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    if (input.signedClosingDocumentId) {
      const document = await prisma.document.findFirst({ where: { id: input.signedClosingDocumentId, propertyId, deletedAt: null } });
      if (!document) throw new APIError('Signed closing document not found for this property.', 404, 'CLOSING_DAY_DOCUMENT_NOT_FOUND');
    }
    await prisma.$transaction(async (tx) => {
      const workspace = await tx.buyerClosingDayWorkspace.upsert({
        where: { propertyId },
        create: { checklistId: checklist.id, propertyId, ...input, lastUpdatedByUserId: userId },
        update: { ...input, lastUpdatedByUserId: userId },
      });
      await this.reconcile(tx, checklist.id, workspace, userId);
    });
    return this.get(userId, propertyId);
  }

  static async confirmProfessionalClose(userId: string, propertyId: string, input: BuyerClosingDayConfirmInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const [workspace, title] = await Promise.all([
      prisma.buyerClosingDayWorkspace.findUnique({ where: { propertyId } }),
      prisma.buyerTitleEscrowWorkspace.findUnique({ where: { propertyId } }),
    ]);
    if (!workspace) throw new APIError('Complete the Closing Day checklist before confirming close.', 409, 'CLOSING_DAY_PREPARATION_REQUIRED');
    if (workspace.professionalClosingConfirmedAt) return this.get(userId, propertyId);
    const missing = [
      ['identificationReady', workspace.identificationReady],
      ['requiredDocumentsReady', workspace.requiredDocumentsReady],
      ['fundsReadinessReviewed', workspace.fundsReadinessReviewed],
      ['blockersReviewed', workspace.blockersReviewed],
      ['questionsResolved', workspace.questionsResolved],
      ['signingCompleted', workspace.signingCompleted],
      ['copiesReceived', workspace.copiesReceived],
      ['signedClosingDocumentId', Boolean(workspace.signedClosingDocumentId)],
      ['possessionConfirmed', workspace.possessionConfirmed],
      ...itemStatuses.map((field) => [field, workspace[field] !== 'UNKNOWN'] as const),
    ].filter(([, complete]) => !complete).map(([field]) => field);
    if (missing.length) throw new APIError(`Complete required Closing Day confirmations: ${missing.join(', ')}.`, 409, 'CLOSING_DAY_INCOMPLETE');
    const [signedDocument, trustedContact] = await Promise.all([
      workspace.signedClosingDocumentId
        ? prisma.document.findFirst({ where: { id: workspace.signedClosingDocumentId, propertyId, deletedAt: null }, select: { id: true } })
        : null,
      title?.responsibleContactId
        ? prisma.buyerJourneyContact.findFirst({ where: { id: title.responsibleContactId, checklistId: checklist.id }, select: { id: true } })
        : null,
    ]);
    if (!signedDocument) throw new APIError('Attach a current signed closing record before confirming close.', 409, 'CLOSING_DAY_SIGNED_RECORD_REQUIRED');
    if (!title?.closingAppointmentAt || title.closingAppointmentFormat === 'UNKNOWN' || !trustedContact) {
      throw new APIError('Confirm the appointment time, method, and trusted title/escrow contact before recording close.', 409, 'CLOSING_DAY_APPOINTMENT_INCOMPLETE');
    }
    assertBuyerJourneyStageTransition(checklist.stage, 'CLOSED');
    const closedAt = new Date(input.closedAt);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const confirmed = await tx.buyerClosingDayWorkspace.update({
        where: { id: workspace.id },
        data: {
          professionalClosingConfirmedAt: now,
          professionalClosingConfirmedByUserId: userId,
          closeEffectiveAt: closedAt,
          confirmationNotes: input.confirmationNotes,
          lastUpdatedByUserId: userId,
        },
      });
      await BuyerAcquisitionService.applyConfirmedClose(tx, propertyId, checklist.id, closedAt, now);
      await this.reconcile(tx, checklist.id, confirmed, userId);
    });
    return this.get(userId, propertyId);
  }

  private static async reconcile(
    tx: Prisma.TransactionClient,
    checklistId: string,
    workspace: BuyerClosingDayWorkspace,
    userId: string,
  ) {
    const [title, blockers] = await Promise.all([
      tx.buyerTitleEscrowWorkspace.findUnique({ where: { checklistId } }),
      tx.homeBuyerTask.count({
        where: { checklistId, actionKey: { not: BUYER_ACTION_KEYS.CLOSING_DAY_CONFIRM }, status: { notIn: inactiveStatuses }, OR: [{ status: 'BLOCKED' }, { blocking: true }] },
      }),
    ]);
    const confirmed = Boolean(workspace.professionalClosingConfirmedAt);
    const hasProgress = workspace.identificationReady || workspace.requiredDocuments.length > 0 || workspace.attendees.length > 0;
    const status = confirmed ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'PENDING';
    const evidence = confirmed ? {
      workspaceId: workspace.id,
      signedClosingDocumentId: workspace.signedClosingDocumentId,
      professionalClosingConfirmedAt: workspace.professionalClosingConfirmedAt?.toISOString(),
      closeEffectiveAt: workspace.closeEffectiveAt?.toISOString(),
      disclaimer: 'Buyer explicitly reported professional closing completion; no legal-effect, signing, funds, or title certification.',
    } : Prisma.JsonNull;
    await tx.homeBuyerTask.upsert({
      where: { checklistId_actionKey: { checklistId, actionKey: BUYER_ACTION_KEYS.CLOSING_DAY_CONFIRM } },
      create: { checklistId, actionKey: BUYER_ACTION_KEYS.CLOSING_DAY_CONFIRM, templateKey: BUYER_ACTION_KEYS.CLOSING_DAY_CONFIRM, title: 'Prepare for and confirm the professional closing', description: 'Confirm appointment, identification, documents, funds readiness, blockers, signed copies, access items, possession, and explicit professional-close completion.', phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'MILESTONE_SUPPORT', checklistSection: 'CLOSING_DAY', evidenceRequirement: 'REQUIRED', applicability: 'APPLICABLE', required: true, blocking: true, sourceType: 'SYSTEM', sortOrder: 69, status, statusReason: confirmed ? 'The buyer explicitly recorded that the professional closing is complete.' : blockers ? `${blockers} recorded blocking item(s) must be reviewed with the responsible professional.` : 'Complete the Closing Day checklist and explicitly confirm professional close.', dueAt: title?.closingAppointmentAt, completedAt: workspace.professionalClosingConfirmedAt, completedByUserId: confirmed ? userId : null, completionMethod: confirmed ? 'USER_ATTESTATION' : null, completionDocumentId: confirmed ? workspace.signedClosingDocumentId : null, completionEvidenceJson: evidence },
      update: { applicability: 'APPLICABLE', status, statusReason: confirmed ? 'The buyer explicitly recorded that the professional closing is complete.' : blockers ? `${blockers} recorded blocking item(s) must be reviewed with the responsible professional.` : 'Complete the Closing Day checklist and explicitly confirm professional close.', dueAt: title?.closingAppointmentAt, completedAt: workspace.professionalClosingConfirmedAt, completedByUserId: confirmed ? userId : null, completionMethod: confirmed ? 'USER_ATTESTATION' : null, completionDocumentId: confirmed ? workspace.signedClosingDocumentId : null, completionEvidenceJson: evidence },
    });
    await tx.buyerJourneyMilestone.upsert({
      where: { checklistId_milestoneKey: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.CLOSING } },
      create: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.CLOSING, type: 'CLOSING', status: confirmed ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: title?.closingAppointmentAt, completedAt: workspace.professionalClosingConfirmedAt, sourceType: 'BUYER_CLOSING_DAY_WORKSPACE', sourceEntityId: workspace.id, sourceDocumentId: confirmed ? workspace.signedClosingDocumentId : null, confidence: 1, notes: confirmed ? 'Buyer explicitly reported that the professional closing process is complete.' : workspace.preparationNotes },
      update: { status: confirmed ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: title?.closingAppointmentAt, completedAt: workspace.professionalClosingConfirmedAt, sourceType: 'BUYER_CLOSING_DAY_WORKSPACE', sourceEntityId: workspace.id, sourceDocumentId: confirmed ? workspace.signedClosingDocumentId : null, confidence: 1, notes: confirmed ? 'Buyer explicitly reported that the professional closing process is complete.' : workspace.preparationNotes },
    });
  }
}
