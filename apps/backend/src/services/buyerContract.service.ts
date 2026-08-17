import { Prisma, type BuyerContractRevision } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  BUYER_ACTION_KEYS,
  BUYER_CONTRACT_FIELD_KEYS,
  BUYER_MILESTONE_KEYS,
  type BuyerContractRevisionConfirmInput,
  type BuyerContractRevisionCreateInput,
  type BuyerContractRevisionUpdateInput,
} from '../productFramework/buyerAcquisition.contract';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { HomeBuyerTaskService } from './HomeBuyerTask.service';

const DAY_MS = 24 * 60 * 60 * 1_000;

async function assertAccess(userId: string, propertyId: string, minimum: 'VIEWER' | 'CONTRIBUTOR' = 'CONTRIBUTOR') {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK[minimum]) {
    throw new APIError('Property not found or access denied.', 404, 'PROPERTY_NOT_FOUND');
  }
}

const dateOnly = (value: string | null | undefined) => value === undefined ? undefined : value === null ? null : new Date(`${value}T00:00:00.000Z`);
const dateTime = (value: string | null | undefined) => value === undefined ? undefined : value === null ? null : new Date(value);
const sameInstant = (left: Date | null | undefined, right: Date | null | undefined) => left?.getTime() === right?.getTime();

function revisionData(input: BuyerContractRevisionCreateInput | BuyerContractRevisionUpdateInput) {
  const { extractionMetadata, contingencies: _contingencies, ...fields } = input;
  return {
    ...fields,
    acceptedAt: dateOnly(input.acceptedAt),
    targetClosingDate: dateOnly(input.targetClosingDate),
    possessionAt: dateTime(input.possessionAt),
    extractionMetadataJson: extractionMetadata === undefined
      ? undefined
      : extractionMetadata === null ? Prisma.JsonNull : extractionMetadata as Prisma.InputJsonValue,
  };
}

function contingencyData(propertyId: string, input: BuyerContractRevisionCreateInput['contingencies'][number]) {
  return {
    propertyId,
    contingencyKey: input.contingencyKey,
    type: input.type,
    label: input.label,
    status: input.status,
    dueAt: dateTime(input.dueAt),
    notes: input.notes,
    sourceDocumentId: input.sourceDocumentId,
    sourcePage: input.sourcePage,
    confidence: input.confidence,
  };
}

function serializeRevision(revision: BuyerContractRevision & { fieldConfirmations: any[]; contingencies: any[] }) {
  return {
    ...revision,
    acceptedAt: revision.acceptedAt?.toISOString().slice(0, 10) ?? null,
    targetClosingDate: revision.targetClosingDate?.toISOString().slice(0, 10) ?? null,
    possessionAt: revision.possessionAt?.toISOString() ?? null,
    extractionMetadata: revision.extractionMetadataJson,
    extractionMetadataJson: undefined,
    confirmedAt: revision.confirmedAt?.toISOString() ?? null,
    createdAt: revision.createdAt.toISOString(),
    updatedAt: revision.updatedAt.toISOString(),
    fieldConfirmations: revision.fieldConfirmations.map((item) => ({
      ...item,
      confirmedAt: item.confirmedAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
    })),
    contingencies: revision.contingencies.map((item) => ({
      ...item,
      dueAt: item.dueAt?.toISOString() ?? null,
      confirmedAt: item.confirmedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

const FIELD_VALUES: Record<(typeof BUYER_CONTRACT_FIELD_KEYS)[number], keyof BuyerContractRevision> = {
  PROPERTY_ADDRESS: 'propertyAddress', BUYER_NAMES: 'buyerNames', SELLER_NAMES: 'sellerNames',
  ACCEPTANCE_DATE: 'acceptedAt', TARGET_CLOSING_DATE: 'targetClosingDate', POSSESSION_DATE: 'possessionAt',
  POSSESSION_TERMS: 'possessionTerms', EARNEST_MONEY_AMOUNT: 'earnestMoneyAmountCents',
  EARNEST_MONEY_RECIPIENT: 'earnestMoneyRecipient', EARNEST_MONEY_METHOD: 'earnestMoneyMethod',
  SELLER_CREDITS: 'sellerCreditsCents', INCLUDED_ITEMS: 'includedItems', EXCLUDED_ITEMS: 'excludedItems',
  AGREED_REPAIRS: 'agreedRepairs', SPECIAL_CONDITIONS: 'specialConditions',
};

const REQUIRED_FIELDS = new Set<(typeof BUYER_CONTRACT_FIELD_KEYS)[number]>([
  'PROPERTY_ADDRESS',
]);

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

const MILESTONE_BY_CONTINGENCY: Record<string, { key: string; type: any; label?: string }> = {
  EARNEST_MONEY: { key: BUYER_MILESTONE_KEYS.EARNEST_MONEY_DUE, type: 'EARNEST_MONEY_DUE' },
  INSPECTION: { key: BUYER_MILESTONE_KEYS.INSPECTION_CONTINGENCY, type: 'INSPECTION_CONTINGENCY' },
  ATTORNEY_REVIEW: { key: BUYER_MILESTONE_KEYS.ATTORNEY_REVIEW, type: 'ATTORNEY_REVIEW' },
  FINANCING: { key: BUYER_MILESTONE_KEYS.FINANCING_CONTINGENCY, type: 'FINANCING_CONTINGENCY' },
  APPRAISAL: { key: BUYER_MILESTONE_KEYS.APPRAISAL, type: 'APPRAISAL' },
  TITLE: { key: BUYER_MILESTONE_KEYS.TITLE_SURVEY, type: 'TITLE_SURVEY' },
  HOA_DOCUMENTS: { key: 'buyer:milestone:hoa-documents', type: 'CUSTOM', label: 'HOA and association document deadline' },
  SALE_OF_HOME: { key: 'buyer:milestone:sale-of-home-contingency', type: 'CUSTOM', label: 'Sale-of-home contingency' },
};

export class BuyerContractService {
  static async get(userId: string, propertyId: string) {
    await assertAccess(userId, propertyId, 'VIEWER');
    const [workspace, property, documents, checklist] = await Promise.all([
      prisma.buyerContractWorkspace.findUnique({
        where: { propertyId },
        include: { revisions: { include: { fieldConfirmations: true, contingencies: { orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }] } }, orderBy: { revisionNumber: 'desc' } } },
      }),
      prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { address: true, city: true, state: true, zipCode: true } }),
      prisma.document.findMany({ where: { propertyId, deletedAt: null, type: { in: ['CONTRACT', 'OTHER'] } }, select: { id: true, name: true, type: true, verificationStatus: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.homeBuyerChecklist.findUnique({ where: { propertyId }, include: { milestones: true } }),
    ]);
    const revisions = workspace?.revisions.map(serializeRevision) ?? [];
    const current = revisions.find((item) => item.id === workspace?.currentRevisionId) ?? revisions.find((item) => item.status === 'CONFIRMED') ?? null;
    const conflicts: string[] = [];
    if (current?.targetClosingDate && checklist?.targetCloseDate && current.targetClosingDate !== checklist.targetCloseDate.toISOString().slice(0, 10)) {
      conflicts.push('The confirmed contract closing date differs from the current Buyer Plan target date.');
    }
    return {
      workspace: workspace ? { id: workspace.id, checklistId: workspace.checklistId, propertyId, currentRevisionId: workspace.currentRevisionId, createdAt: workspace.createdAt.toISOString(), updatedAt: workspace.updatedAt.toISOString(), revisions } : null,
      propertyAddress: [property.address, property.city, property.state, property.zipCode].filter(Boolean).join(', '),
      documents: documents.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
      conflicts,
      disclaimer: 'ContractToCozy organizes buyer-recorded contract facts. It does not provide legal review, determine compliance, or waive a contingency. Confirm every date and term with the current signed source and your real-estate or legal professional.',
    };
  }

  static async createRevision(userId: string, propertyId: string, input: BuyerContractRevisionCreateInput) {
    await assertAccess(userId, propertyId);
    await this.assertDocuments(propertyId, input);
    const checklist = await HomeBuyerTaskService.getOrCreateChecklist(userId, propertyId);
    const workspace = await prisma.buyerContractWorkspace.upsert({
      where: { propertyId }, create: { propertyId, checklistId: checklist.id }, update: {},
      include: { revisions: { orderBy: { revisionNumber: 'desc' } } },
    });
    if (workspace.revisions.some((item) => item.status === 'DRAFT')) {
      throw new APIError('Resume the existing contract draft before adding a revision.', 409, 'BUYER_CONTRACT_REVISION_CONFLICT');
    }
    await prisma.buyerContractRevision.create({
      data: {
        ...revisionData(input), workspaceId: workspace.id,
        revisionNumber: (workspace.revisions[0]?.revisionNumber ?? 0) + 1,
        contingencies: { create: input.contingencies.map((item) => contingencyData(propertyId, item)) },
      },
    });
    return this.get(userId, propertyId);
  }

  static async updateDraft(userId: string, propertyId: string, revisionId: string, input: BuyerContractRevisionUpdateInput) {
    await assertAccess(userId, propertyId);
    await this.assertDocuments(propertyId, input);
    const revision = await prisma.buyerContractRevision.findFirst({ where: { id: revisionId, status: 'DRAFT', workspace: { propertyId } } });
    if (!revision) throw new APIError('Editable contract draft not found.', 404, 'BUYER_CONTRACT_DRAFT_NOT_FOUND');
    await prisma.$transaction(async (tx) => {
      await tx.buyerContractRevision.update({ where: { id: revisionId }, data: revisionData(input) });
      if (input.contingencies !== undefined) {
        await tx.buyerContractContingency.deleteMany({ where: { revisionId } });
        if (input.contingencies.length) await tx.buyerContractContingency.createMany({ data: input.contingencies.map((item) => ({ revisionId, ...contingencyData(propertyId, item) })) });
      }
    });
    return this.get(userId, propertyId);
  }

  static async confirm(userId: string, propertyId: string, revisionId: string, input: BuyerContractRevisionConfirmInput) {
    await assertAccess(userId, propertyId);
    const revision = await prisma.buyerContractRevision.findFirst({
      where: { id: revisionId, workspace: { propertyId } },
      include: { workspace: { include: { checklist: true } }, contingencies: true },
    });
    if (!revision) throw new APIError('Contract revision not found.', 404, 'BUYER_CONTRACT_REVISION_NOT_FOUND');
    if (revision.status === 'CONFIRMED' && revision.workspace.currentRevisionId === revisionId) return this.get(userId, propertyId);
    if (revision.status !== 'DRAFT') throw new APIError('Only the current contract draft can be confirmed.', 409, 'BUYER_CONTRACT_REVISION_NOT_EDITABLE');

    const requiredMissing = [...REQUIRED_FIELDS].filter((key) => !hasValue(revision[FIELD_VALUES[key]]));
    if (requiredMissing.length) throw new APIError(`Complete required contract fields: ${requiredMissing.join(', ')}.`, 409, 'BUYER_CONTRACT_INCOMPLETE');
    const confirmedFields = new Set(input.fieldConfirmations.map((item) => item.fieldKey));
    if (!confirmedFields.has('PROPERTY_ADDRESS')) {
      throw new APIError('Confirm the property address before updating this closing plan.', 409, 'BUYER_CONTRACT_PROPERTY_UNCONFIRMED');
    }
    await this.assertDocumentIds(propertyId, [revision.sourceDocumentId, ...input.fieldConfirmations.map((item) => item.sourceDocumentId)]);

    const previous = revision.workspace.currentRevisionId
      ? await prisma.buyerContractRevision.findUnique({ where: { id: revision.workspace.currentRevisionId } })
      : null;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.buyerContractRevision.updateMany({ where: { workspaceId: revision.workspaceId, status: 'CONFIRMED', id: { not: revisionId } }, data: { status: 'SUPERSEDED' } });
      await tx.buyerContractFieldConfirmation.deleteMany({ where: { revisionId } });
      await tx.buyerContractFieldConfirmation.createMany({ data: input.fieldConfirmations.map((item) => ({ ...item, revisionId, confirmedAt: now, confirmedByUserId: userId })) });
      await tx.buyerContractContingency.updateMany({ where: { revisionId }, data: { confirmedAt: now, confirmedByUserId: userId } });
      await tx.buyerContractRevision.update({ where: { id: revisionId }, data: { status: 'CONFIRMED', confirmedAt: now, confirmedByUserId: userId } });
      await tx.buyerContractWorkspace.update({ where: { id: revision.workspaceId }, data: { currentRevisionId: revisionId } });
      await this.reconcile(tx, revision, previous, userId, now, confirmedFields);
    });
    return this.get(userId, propertyId);
  }

  private static async reconcile(tx: Prisma.TransactionClient, revision: any, previous: BuyerContractRevision | null, userId: string, now: Date, confirmedFields: Set<string>) {
    const checklist = revision.workspace.checklist;
    const targetCanMove = !checklist.targetCloseDate || sameInstant(checklist.targetCloseDate, previous?.targetClosingDate);
    if (confirmedFields.has('TARGET_CLOSING_DATE') && targetCanMove && revision.targetClosingDate) {
      await tx.homeBuyerChecklist.update({ where: { id: checklist.id }, data: { targetCloseDate: revision.targetClosingDate } });
      const tasks = await tx.homeBuyerTask.findMany({
        where: { checklistId: checklist.id, anchorOffsetDays: { not: null }, userEditedAt: null, status: { notIn: ['COMPLETED', 'NOT_NEEDED', 'CANCELLED'] } },
        select: { id: true, phase: true, anchorOffsetDays: true },
      });
      for (const task of tasks) {
        const anchor = ['MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90', 'RECURRING_HOME'].includes(task.phase)
          ? checklist.moveInDate ?? revision.targetClosingDate : revision.targetClosingDate;
        await tx.homeBuyerTask.update({ where: { id: task.id }, data: { dueAt: new Date(anchor.getTime() + (task.anchorOffsetDays ?? 0) * DAY_MS) } });
      }
    }

    if (confirmedFields.has('ACCEPTANCE_DATE')) await this.upsertMilestone(tx, checklist.id, BUYER_MILESTONE_KEYS.CONTRACT_ACCEPTED, 'CONTRACT_ACCEPTED', revision.acceptedAt, 'COMPLETED', revision, now);
    if (confirmedFields.has('TARGET_CLOSING_DATE')) await this.upsertMilestone(tx, checklist.id, BUYER_MILESTONE_KEYS.CLOSING, 'CLOSING', revision.targetClosingDate, 'IN_PROGRESS', revision, null);
    if (confirmedFields.has('POSSESSION_DATE') && revision.possessionAt) await this.upsertMilestone(tx, checklist.id, 'buyer:milestone:possession', 'CUSTOM', revision.possessionAt, 'IN_PROGRESS', revision, null, 'Possession');
    for (const contingency of revision.contingencies) {
      const definition = MILESTONE_BY_CONTINGENCY[contingency.type];
      if (!definition || !contingency.dueAt) continue;
      const status = contingency.status === 'SATISFIED' ? 'COMPLETED' : contingency.status === 'WAIVED' ? 'WAIVED' : contingency.status === 'EXPIRED' ? 'MISSED' : 'IN_PROGRESS';
      await this.upsertMilestone(tx, checklist.id, definition.key, definition.type, contingency.dueAt, status, revision, ['COMPLETED', 'WAIVED'].includes(status) ? now : null, definition.label ?? contingency.label);
    }

    const overdue = revision.contingencies.filter((item: any) => item.status === 'EXPIRED' || (item.status === 'ACTIVE' && item.dueAt && item.dueAt < now));
    const open = revision.contingencies.filter((item: any) => item.status === 'ACTIVE');
    await tx.homeBuyerTask.upsert({
      where: { checklistId_actionKey: { checklistId: checklist.id, actionKey: BUYER_ACTION_KEYS.CONTRACT_REVISION_CONFIRM } },
      create: { checklistId: checklist.id, actionKey: BUYER_ACTION_KEYS.CONTRACT_REVISION_CONFIRM, templateKey: BUYER_ACTION_KEYS.CONTRACT_REVISION_CONFIRM, title: 'Confirm the current accepted contract revision', description: 'Record and confirm the current signed contract dates and terms with field-level source references.', phase: 'OFFER_CONTRACT', priority: 'NOW', taskType: 'DOCUMENT', checklistSection: 'CONTRACT_CONTINGENCIES', evidenceRequirement: 'REQUIRED', applicability: 'APPLICABLE', required: true, blocking: true, sourceType: 'DOCUMENT', sourceEntityType: 'BUYER_CONTRACT_REVISION', sourceEntityId: revision.id, sortOrder: 10, status: 'COMPLETED', statusReason: `Contract revision ${revision.revisionNumber} was confirmed against its source.`, completedAt: now, completedByUserId: userId, completionMethod: revision.sourceDocumentId ? 'DOCUMENT' : 'USER_ATTESTATION', completionDocumentId: revision.sourceDocumentId, completionEvidenceJson: { revisionId: revision.id, fieldConfirmationCount: confirmedFields.size, disclaimer: 'Buyer-confirmed record; not legal review.' } },
      update: { sourceEntityId: revision.id, status: 'COMPLETED', statusReason: `Contract revision ${revision.revisionNumber} was confirmed against its source.`, completedAt: now, completedByUserId: userId, completionMethod: revision.sourceDocumentId ? 'DOCUMENT' : 'USER_ATTESTATION', completionDocumentId: revision.sourceDocumentId, completionEvidenceJson: { revisionId: revision.id, fieldConfirmationCount: confirmedFields.size, disclaimer: 'Buyer-confirmed record; not legal review.' } },
    });
    await tx.homeBuyerTask.upsert({
      where: { checklistId_actionKey: { checklistId: checklist.id, actionKey: BUYER_ACTION_KEYS.CONTRACT_CONTINGENCIES_REVIEW } },
      create: { checklistId: checklist.id, actionKey: BUYER_ACTION_KEYS.CONTRACT_CONTINGENCIES_REVIEW, templateKey: BUYER_ACTION_KEYS.CONTRACT_CONTINGENCIES_REVIEW, title: 'Review contract contingencies and deadline conflicts', description: 'Track every recorded contingency and route expired or conflicting deadlines to the appropriate professional.', phase: 'OFFER_CONTRACT', priority: 'NOW', taskType: 'DECISION', checklistSection: 'CONTRACT_CONTINGENCIES', evidenceRequirement: 'OPTIONAL', applicability: 'APPLICABLE', required: true, blocking: true, sourceType: 'DOCUMENT', sourceEntityType: 'BUYER_CONTRACT_REVISION', sourceEntityId: revision.id, sortOrder: 11, status: overdue.length ? 'BLOCKED' : open.length ? 'IN_PROGRESS' : 'COMPLETED', statusReason: overdue.length ? `${overdue.length} contingency deadline(s) are expired or overdue and require professional follow-up.` : open.length ? `${open.length} confirmed contingency deadline(s) remain active.` : 'All recorded contingencies are dispositioned.', completedAt: open.length || overdue.length ? null : now, completedByUserId: open.length || overdue.length ? null : userId, completionMethod: open.length || overdue.length ? null : 'USER_ATTESTATION', completionEvidenceJson: { revisionId: revision.id, contingencyCount: revision.contingencies.length } },
      update: { sourceEntityId: revision.id, status: overdue.length ? 'BLOCKED' : open.length ? 'IN_PROGRESS' : 'COMPLETED', statusReason: overdue.length ? `${overdue.length} contingency deadline(s) are expired or overdue and require professional follow-up.` : open.length ? `${open.length} confirmed contingency deadline(s) remain active.` : 'All recorded contingencies are dispositioned.', completedAt: open.length || overdue.length ? null : now, completedByUserId: open.length || overdue.length ? null : userId, completionMethod: open.length || overdue.length ? null : 'USER_ATTESTATION', completionEvidenceJson: { revisionId: revision.id, contingencyCount: revision.contingencies.length } },
    });
  }

  private static async upsertMilestone(tx: Prisma.TransactionClient, checklistId: string, milestoneKey: string, type: any, dueAt: Date | null, status: any, revision: any, completedAt: Date | null, customLabel?: string) {
    const existing = await tx.buyerJourneyMilestone.findUnique({ where: { checklistId_milestoneKey: { checklistId, milestoneKey } } });
    if (existing && existing.sourceType && existing.sourceType !== 'BUYER_CONTRACT_REVISION' && !['NOT_STARTED', 'IN_PROGRESS'].includes(existing.status)) return;
    const data = { type, customLabel, dueAt, status, completedAt, sourceType: 'BUYER_CONTRACT_REVISION', sourceEntityId: revision.id, sourceDocumentId: revision.sourceDocumentId, confidence: 1, notes: `Buyer confirmed contract revision ${revision.revisionNumber}; verify legal effect with the responsible professional.` };
    await tx.buyerJourneyMilestone.upsert({ where: { checklistId_milestoneKey: { checklistId, milestoneKey } }, create: { checklistId, milestoneKey, ...data }, update: data });
  }

  private static async assertDocuments(propertyId: string, input: BuyerContractRevisionCreateInput | BuyerContractRevisionUpdateInput) {
    await this.assertDocumentIds(propertyId, [input.sourceDocumentId, ...(input.contingencies ?? []).map((item) => item.sourceDocumentId)]);
  }

  private static async assertDocumentIds(propertyId: string, ids: Array<string | null | undefined>) {
    const requested = [...new Set(ids.filter((value): value is string => Boolean(value)))];
    if (!requested.length) return;
    const count = await prisma.document.count({ where: { id: { in: requested }, propertyId, deletedAt: null } });
    if (count !== requested.length) throw new APIError('A linked contract source document was not found for this property.', 404, 'BUYER_CONTRACT_SOURCE_NOT_FOUND');
  }
}
