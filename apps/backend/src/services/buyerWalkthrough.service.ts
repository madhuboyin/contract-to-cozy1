import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  BUYER_ACTION_KEYS,
  BUYER_MILESTONE_KEYS,
  type BuyerWalkthroughIssueCreateInput,
  type BuyerWalkthroughIssueUpdateInput,
  type BuyerWalkthroughObservationCreateInput,
  type BuyerWalkthroughObservationUpdateInput,
  type BuyerWalkthroughWorkspaceUpdateInput,
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
const dateText = (value: Date | null | undefined) => value?.toISOString() ?? null;

function serialize(workspace: any) {
  return {
    ...workspace,
    scheduledAt: dateText(workspace.scheduledAt),
    startedAt: dateText(workspace.startedAt),
    completedAt: dateText(workspace.completedAt),
    accessConfirmedAt: dateText(workspace.accessConfirmedAt),
    utilitiesConfirmedAt: dateText(workspace.utilitiesConfirmedAt),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    observations: workspace.observations.map((item: any) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
    issues: workspace.issues.map((item: any) => ({
      ...item,
      routedAt: dateText(item.routedAt),
      resolvedAt: dateText(item.resolvedAt),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

export class BuyerWalkthroughService {
  static async get(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const [workspace, findings, contractDocuments] = await Promise.all([
      prisma.buyerWalkthroughWorkspace.findUnique({
        where: { propertyId },
        include: {
          observations: { orderBy: [{ area: 'asc' }, { category: 'asc' }, { createdAt: 'asc' }] },
          issues: { orderBy: [{ status: 'asc' }, { blocking: 'desc' }, { createdAt: 'asc' }] },
        },
      }),
      prisma.inspectionFinding.findMany({
        where: {
          propertyId,
          OR: [{ buyerDisposition: 'PRE_CLOSE_NEGOTIATION' }, { negotiationCaseLinks: { some: {} } }],
        },
        select: {
          id: true, homeSystem: true, subsystem: true, location: true, severity: true,
          inspectorDescription: true, status: true, resolutionMethod: true, resolutionNotes: true,
          buyerDisposition: true, buyerOutcomeDocumentId: true,
          negotiationCaseLinks: {
            select: {
              id: true, sellerResponse: true, sellerResponseNotes: true, outcome: true,
              outcomeNotes: true, agreedCreditCents: true, outcomeDocumentId: true,
              outcomeDocument: { select: { id: true, name: true, verificationStatus: true } },
              negotiationCase: { select: { id: true } },
            },
          },
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.document.findMany({
        where: { propertyId, type: 'CONTRACT', deletedAt: null },
        select: { id: true, name: true, type: true, verificationStatus: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const evidenceIds = workspace
      ? [...workspace.observations.map((item) => item.evidenceDocumentId), ...workspace.issues.map((item) => item.evidenceDocumentId)].filter((value): value is string => Boolean(value))
      : [];
    const evidenceDocuments = evidenceIds.length
      ? await prisma.document.findMany({ where: { id: { in: evidenceIds }, propertyId, deletedAt: null }, select: { id: true, name: true, type: true, verificationStatus: true, createdAt: true } })
      : [];
    return {
      workspace: workspace ? serialize(workspace) : null,
      context: {
        findings,
        contractDocuments: contractDocuments.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
      },
      evidenceDocuments: evidenceDocuments.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
    };
  }

  static async update(userId: string, propertyId: string, input: BuyerWalkthroughWorkspaceUpdateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const existing = await prisma.buyerWalkthroughWorkspace.findUnique({ where: { propertyId } });
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const workspace = await tx.buyerWalkthroughWorkspace.upsert({
        where: { propertyId },
        create: {
          checklistId: checklist.id, propertyId, scheduledAt: dateValue(input.scheduledAt), attendees: input.attendees,
          accessConfirmedAt: input.accessConfirmed ? now : null,
          utilitiesConfirmedAt: input.utilitiesConfirmed ? now : null,
          startedAt: input.started ? now : null,
          generalNotes: input.generalNotes, lastUpdatedByUserId: userId,
        },
        update: {
          scheduledAt: dateValue(input.scheduledAt), attendees: input.attendees,
          ...(input.accessConfirmed === undefined ? {} : { accessConfirmedAt: input.accessConfirmed ? existing?.accessConfirmedAt ?? now : null }),
          ...(input.utilitiesConfirmed === undefined ? {} : { utilitiesConfirmedAt: input.utilitiesConfirmed ? existing?.utilitiesConfirmedAt ?? now : null }),
          ...(input.started === undefined ? {} : { startedAt: input.started ? existing?.startedAt ?? now : null }),
          generalNotes: input.generalNotes, lastUpdatedByUserId: userId,
        },
      });
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async createObservation(userId: string, propertyId: string, input: BuyerWalkthroughObservationCreateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    await this.assertDocuments(propertyId, [input.evidenceDocumentId]);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const workspace = await tx.buyerWalkthroughWorkspace.upsert({ where: { propertyId }, create: { checklistId: checklist.id, propertyId, startedAt: now, lastUpdatedByUserId: userId }, update: { completedAt: null, completedByUserId: null, lastUpdatedByUserId: userId } });
      await tx.buyerWalkthroughObservation.create({ data: { workspaceId: workspace.id, propertyId, ...input, recordedByUserId: userId, lastUpdatedByUserId: userId } });
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async updateObservation(userId: string, propertyId: string, observationId: string, input: BuyerWalkthroughObservationUpdateInput) {
    await assertAccess(userId, propertyId);
    await this.assertDocuments(propertyId, [input.evidenceDocumentId]);
    const observation = await prisma.buyerWalkthroughObservation.findFirst({ where: { id: observationId, propertyId } });
    if (!observation) throw new APIError('Walkthrough observation not found.', 404, 'BUYER_WALKTHROUGH_OBSERVATION_NOT_FOUND');
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerWalkthroughObservation.update({ where: { id: observationId }, data: { ...input, lastUpdatedByUserId: userId } });
      const workspace = await tx.buyerWalkthroughWorkspace.update({ where: { id: observation.workspaceId }, data: { completedAt: null, completedByUserId: null, lastUpdatedByUserId: userId } });
      await this.reconcile(tx, workspace.id, workspace.checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async createIssue(userId: string, propertyId: string, input: BuyerWalkthroughIssueCreateInput) {
    await assertAccess(userId, propertyId);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    await this.assertDocuments(propertyId, [input.evidenceDocumentId]);
    await this.assertLinks(propertyId, input);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const workspace = await tx.buyerWalkthroughWorkspace.upsert({ where: { propertyId }, create: { checklistId: checklist.id, propertyId, startedAt: now, lastUpdatedByUserId: userId }, update: { completedAt: null, completedByUserId: null, lastUpdatedByUserId: userId } });
      if (input.sourceObservationId) {
        const observation = await tx.buyerWalkthroughObservation.findFirst({ where: { id: input.sourceObservationId, workspaceId: workspace.id } });
        if (!observation) throw new APIError('Source observation not found for this walkthrough.', 404, 'BUYER_WALKTHROUGH_OBSERVATION_NOT_FOUND');
      }
      await tx.buyerWalkthroughIssue.create({ data: { workspaceId: workspace.id, propertyId, ...input, recordedByUserId: userId, lastUpdatedByUserId: userId } });
      await this.reconcile(tx, workspace.id, checklist.id, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async updateIssue(userId: string, propertyId: string, issueId: string, input: BuyerWalkthroughIssueUpdateInput) {
    await assertAccess(userId, propertyId);
    await this.assertDocuments(propertyId, [input.evidenceDocumentId]);
    const issue = await prisma.buyerWalkthroughIssue.findFirst({ where: { id: issueId, propertyId } });
    if (!issue) throw new APIError('Walkthrough issue not found.', 404, 'BUYER_WALKTHROUGH_ISSUE_NOT_FOUND');
    const status = input.status ?? issue.status;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerWalkthroughIssue.update({
        where: { id: issueId },
        data: {
          ...input,
          routedAt: status === 'ROUTED_TO_PROFESSIONAL' ? issue.routedAt ?? now : issue.routedAt,
          resolvedAt: ['RESOLVED', 'ACCEPTED_AS_IS'].includes(status) ? issue.resolvedAt ?? now : null,
          lastUpdatedByUserId: userId,
        },
      });
      const workspace = await tx.buyerWalkthroughWorkspace.update({ where: { id: issue.workspaceId }, data: { ...(status === 'OPEN' ? { completedAt: null, completedByUserId: null } : {}), lastUpdatedByUserId: userId } });
      await this.reconcile(tx, workspace.id, workspace.checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  static async complete(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId);
    const workspace = await prisma.buyerWalkthroughWorkspace.findUnique({ where: { propertyId }, include: { observations: true, issues: true } });
    if (!workspace || workspace.observations.length === 0) throw new APIError('Record at least one walkthrough observation before completing.', 409, 'BUYER_WALKTHROUGH_OBSERVATION_REQUIRED');
    if (workspace.observations.some((item) => item.status === 'NOT_REVIEWED')) throw new APIError('Review every recorded walkthrough observation before completing.', 409, 'BUYER_WALKTHROUGH_REVIEW_INCOMPLETE');
    const issueObservationIds = new Set(workspace.issues.map((item) => item.sourceObservationId).filter(Boolean));
    if (workspace.observations.some((item) => item.status === 'ISSUE' && !issueObservationIds.has(item.id))) throw new APIError('Every issue observation must have a recorded escalation item.', 409, 'BUYER_WALKTHROUGH_ISSUE_REQUIRED');
    if (workspace.issues.some((item) => item.status === 'OPEN')) throw new APIError('Route or disposition every walkthrough issue before completing.', 409, 'BUYER_WALKTHROUGH_ISSUE_ROUTING_REQUIRED');
    if (workspace.completedAt) return this.get(userId, propertyId);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.buyerWalkthroughWorkspace.update({ where: { id: workspace.id }, data: { completedAt: now, completedByUserId: userId, lastUpdatedByUserId: userId } });
      await this.reconcile(tx, updated.id, updated.checklistId, userId, now);
    });
    return this.get(userId, propertyId);
  }

  private static async assertDocuments(propertyId: string, ids: Array<string | null | undefined>) {
    const requested = [...new Set(ids.filter((value): value is string => Boolean(value)))];
    if (!requested.length) return;
    const count = await prisma.document.count({ where: { id: { in: requested }, propertyId, deletedAt: null } });
    if (count !== requested.length) throw new APIError('A walkthrough evidence document was not found for this property.', 404, 'DOCUMENT_NOT_FOUND');
  }

  private static async assertLinks(propertyId: string, input: BuyerWalkthroughIssueCreateInput) {
    if (input.inspectionFindingId) {
      const finding = await prisma.inspectionFinding.findFirst({ where: { id: input.inspectionFindingId, propertyId }, select: { id: true } });
      if (!finding) throw new APIError('Inspection finding not found for this property.', 404, 'INSPECTION_FINDING_NOT_FOUND');
    }
    if (input.negotiationFindingId) {
      const linked = await prisma.negotiationShieldBuyerFinding.findFirst({ where: { id: input.negotiationFindingId, finding: { propertyId } }, select: { id: true } });
      if (!linked) throw new APIError('Negotiation outcome not found for this property.', 404, 'BUYER_NEGOTIATION_FINDING_NOT_FOUND');
    }
  }

  private static async reconcile(tx: Prisma.TransactionClient, workspaceId: string, checklistId: string, userId: string, now: Date) {
    const workspace = await tx.buyerWalkthroughWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { observations: true, issues: true } });
    const open = workspace.issues.filter((item) => ['OPEN', 'ROUTED_TO_PROFESSIONAL'].includes(item.status));
    const blockers = open.filter((item) => item.blocking);
    const hasProgress = Boolean(workspace.startedAt || workspace.observations.length || workspace.issues.length);
    const processStatus = workspace.completedAt ? 'COMPLETED' : blockers.length ? 'BLOCKED' : hasProgress ? 'IN_PROGRESS' : 'PENDING';
    await tx.homeBuyerTask.upsert({
      where: { checklistId_actionKey: { checklistId, actionKey: BUYER_ACTION_KEYS.WALKTHROUGH_PREP } },
      create: {
        checklistId, actionKey: BUYER_ACTION_KEYS.WALKTHROUGH_PREP, templateKey: BUYER_ACTION_KEYS.WALKTHROUGH_PREP,
        title: 'Prepare the final walkthrough', description: 'Review recorded agreement context, observe accessible areas, document issues, and route professional questions.',
        phase: 'CLOSING_PREP', priority: 'SOON', taskType: 'ACTION', checklistSection: 'FINAL_WALKTHROUGH', evidenceRequirement: 'OPTIONAL', applicability: 'APPLICABLE', required: true, blocking: false, sourceType: 'SYSTEM', sortOrder: 65,
        status: processStatus, statusReason: workspace.completedAt ? 'The buyer completed the walkthrough record and routed every issue.' : blockers.length ? `${blockers.length} blocking walkthrough issue(s) need professional follow-up.` : hasProgress ? 'Walkthrough observations are in progress.' : 'Schedule and prepare the final walkthrough.',
        completedAt: workspace.completedAt, completedByUserId: workspace.completedByUserId, completionMethod: workspace.completedAt ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: workspace.completedAt ? { workspaceId, observationIds: workspace.observations.map((item) => item.id), issueIds: workspace.issues.map((item) => item.id), disclaimer: 'Buyer-recorded observations; no condition, repair, safety, or legal certification.' } : Prisma.JsonNull,
      },
      update: {
        status: processStatus, statusReason: workspace.completedAt ? 'The buyer completed the walkthrough record and routed every issue.' : blockers.length ? `${blockers.length} blocking walkthrough issue(s) need professional follow-up.` : hasProgress ? 'Walkthrough observations are in progress.' : 'Schedule and prepare the final walkthrough.',
        completedAt: workspace.completedAt, completedByUserId: workspace.completedByUserId, completionMethod: workspace.completedAt ? 'USER_ATTESTATION' : null,
        completionEvidenceJson: workspace.completedAt ? { workspaceId, observationIds: workspace.observations.map((item) => item.id), issueIds: workspace.issues.map((item) => item.id), disclaimer: 'Buyer-recorded observations; no condition, repair, safety, or legal certification.' } : Prisma.JsonNull,
      },
    });
    const issueStatus = blockers.length ? 'BLOCKED' : open.length ? 'IN_PROGRESS' : workspace.issues.length ? 'COMPLETED' : 'NOT_NEEDED';
    await tx.homeBuyerTask.upsert({
      where: { checklistId_actionKey: { checklistId, actionKey: BUYER_ACTION_KEYS.WALKTHROUGH_ISSUES } },
      create: { checklistId, actionKey: BUYER_ACTION_KEYS.WALKTHROUGH_ISSUES, templateKey: BUYER_ACTION_KEYS.WALKTHROUGH_ISSUES, title: 'Resolve final walkthrough issues', description: 'Keep unresolved walkthrough observations routed to the buyer representative or closing professional.', phase: 'CLOSING_PREP', priority: 'NOW', taskType: 'ACTION', checklistSection: 'FINAL_WALKTHROUGH', evidenceRequirement: 'OPTIONAL', applicability: workspace.issues.length ? 'APPLICABLE' : 'NOT_APPLICABLE', required: true, blocking: true, sourceType: 'SYSTEM', sortOrder: 66, status: issueStatus, statusReason: blockers.length ? `${blockers.length} blocking issue(s) remain unresolved.` : open.length ? `${open.length} issue(s) remain with a professional.` : workspace.issues.length ? 'All walkthrough issues are dispositioned.' : 'No walkthrough issues are recorded.', completedAt: issueStatus === 'COMPLETED' ? now : null, completedByUserId: issueStatus === 'COMPLETED' ? userId : null, completionMethod: issueStatus === 'COMPLETED' ? 'USER_ATTESTATION' : null },
      update: { applicability: workspace.issues.length ? 'APPLICABLE' : 'NOT_APPLICABLE', status: issueStatus, statusReason: blockers.length ? `${blockers.length} blocking issue(s) remain unresolved.` : open.length ? `${open.length} issue(s) remain with a professional.` : workspace.issues.length ? 'All walkthrough issues are dispositioned.' : 'No walkthrough issues are recorded.', completedAt: issueStatus === 'COMPLETED' ? now : null, completedByUserId: issueStatus === 'COMPLETED' ? userId : null, completionMethod: issueStatus === 'COMPLETED' ? 'USER_ATTESTATION' : null },
    });
    await tx.buyerJourneyMilestone.upsert({
      where: { checklistId_milestoneKey: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.FINAL_WALKTHROUGH } },
      create: { checklistId, milestoneKey: BUYER_MILESTONE_KEYS.FINAL_WALKTHROUGH, type: 'FINAL_WALKTHROUGH', status: workspace.completedAt ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: workspace.scheduledAt, completedAt: workspace.completedAt, sourceType: 'BUYER_WALKTHROUGH_WORKSPACE', sourceEntityId: workspace.id, confidence: 1, notes: workspace.completedAt ? 'Buyer recorded completion and routed every issue; no property-condition certification.' : workspace.generalNotes },
      update: { status: workspace.completedAt ? 'COMPLETED' : hasProgress ? 'IN_PROGRESS' : 'NOT_STARTED', dueAt: workspace.scheduledAt, completedAt: workspace.completedAt, sourceType: 'BUYER_WALKTHROUGH_WORKSPACE', sourceEntityId: workspace.id, confidence: 1, notes: workspace.completedAt ? 'Buyer recorded completion and routed every issue; no property-condition certification.' : workspace.generalNotes },
    });
  }
}
