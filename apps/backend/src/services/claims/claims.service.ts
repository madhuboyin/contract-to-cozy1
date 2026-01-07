// apps/backend/src/services/claims/claims.service.ts

import { prisma } from '../../lib/prisma';
import { AddClaimDocumentInput, 
    AddTimelineEventInput, 
    CreateClaimInput, 
    UpdateChecklistItemInput, 
    UpdateClaimInput,
    ClaimType
} from '../../types/claims.types';
import { CLAIM_CHECKLIST_TEMPLATES, ChecklistTemplateItem } from '../claims/claims.templates';
import { assertValidTransition } from './claims.transitions';
import { DomainEventsService } from '../domainEvents/domainEvents.service';
import { ClaimStatus } from '../../types/claims.types';


function mustHave(value: any, message: string) {
  if (!value) throw new Error(message);
}

function isoToDateOrNull(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function recomputeChecklistCompletionPct(claimId: string) {
  const items = await prisma.claimChecklistItem.findMany({
    where: { claimId },
    select: { status: true },
  });

  const applicable = items.filter((i) => i.status !== 'NOT_APPLICABLE');
  if (applicable.length === 0) {
    await prisma.claim.update({
      where: { id: claimId },
      data: { checklistCompletionPct: 0, lastActivityAt: new Date() },
    });
    return;
  }

  const done = applicable.filter((i) => i.status === 'DONE').length;
  const pct = Math.round((done / applicable.length) * 100);

  await prisma.claim.update({
    where: { id: claimId },
    data: { checklistCompletionPct: pct, lastActivityAt: new Date() },
  });
}

export class ClaimsService {
  static async listClaims(propertyId: string) {
    return prisma.claim.findMany({
      where: { propertyId },
      orderBy: { lastActivityAt: 'desc' },
      include: {
        checklistItems: true,
        documents: { include: { document: true } },
        timelineEvents: true,
      },
    });
  }

  static async getClaim(propertyId: string, claimId: string) {
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, propertyId },
      include: {
        checklistItems: { orderBy: { orderIndex: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' }, include: { document: true } },
        timelineEvents: { orderBy: { occurredAt: 'desc' }, include: { claimDocument: true } },
        insurancePolicy: true,
        warranty: true,
      },
    });
    if (!claim) throw new Error('Claim not found');
    return claim;
  }

  static async regenerateChecklist(
    propertyId: string,
    claimId: string,
    userId: string,
    opts: { type?: ClaimType; replaceExisting?: boolean }
  ) {
    const claim = await prisma.claim.findFirst({ where: { id: claimId, propertyId } });
    if (!claim) throw new Error('Claim not found');
  
    const replaceExisting = true; // enforce for V1 to avoid orderIndex conflicts
    const nextType: ClaimType = (opts.type ?? (claim.type as any)) as ClaimType;
  
    await prisma.$transaction(async (tx) => {
      if (opts.type && opts.type !== claim.type) {
        await tx.claim.update({
          where: { id: claimId },
          data: { type: nextType, lastActivityAt: new Date() },
        });
      }
  
      if (replaceExisting) {
        await tx.claimChecklistItem.deleteMany({ where: { claimId } });
      }
  
      const template = CLAIM_CHECKLIST_TEMPLATES[nextType] ?? CLAIM_CHECKLIST_TEMPLATES.OTHER;
  
      await tx.claimChecklistItem.createMany({
        data: template.map((t, idx) => ({
          claimId,
          orderIndex: idx + 1,
          title: t.title,
          description: t.description ?? null,
          required: Boolean(t.required),
          status: 'OPEN',
        })),
      });
  
      // recompute % outside template creation but inside transaction
      const items = await tx.claimChecklistItem.findMany({
        where: { claimId },
        select: { status: true },
      });
      const applicable = items.filter((i) => i.status !== 'NOT_APPLICABLE');
      const done = applicable.filter((i) => i.status === 'DONE').length;
      const pct = applicable.length === 0 ? 0 : Math.round((done / applicable.length) * 100);
  
      await tx.claim.update({
        where: { id: claimId },
        data: { checklistCompletionPct: pct, lastActivityAt: new Date() },
      });
  
      await tx.claimTimelineEvent.create({
        data: {
          claimId,
          propertyId,
          createdBy: userId,
          type: 'CHECKLIST_GENERATED',
          title: 'Checklist regenerated',
          description: `Checklist regenerated using template: ${nextType}`,
          occurredAt: new Date(),
          meta: { templateType: nextType, replaceExisting },
        },
      });
    });
  
    return this.getClaim(propertyId, claimId);
  }
  
  static async createClaim(propertyId: string, userId: string, input: CreateClaimInput) {
    mustHave(input.title, 'title is required');
    mustHave(input.type, 'type is required');

    const generateChecklist = input.generateChecklist !== false;

    const claim = await prisma.claim.create({
      data: {
        propertyId,
        createdBy: userId,
        title: input.title,
        description: input.description ?? null,
        type: input.type as any,
        status: 'DRAFT',

        sourceType: (input.sourceType ?? 'UNKNOWN') as any,
        providerName: input.providerName ?? null,
        claimNumber: input.claimNumber ?? null,
        externalUrl: input.externalUrl ?? null,

        insurancePolicyId: input.insurancePolicyId ?? null,
        warrantyId: input.warrantyId ?? null,

        incidentAt: isoToDateOrNull(input.incidentAt),
        lastActivityAt: new Date(),
      },
    });

    await prisma.claimTimelineEvent.create({
      data: {
        claimId: claim.id,
        propertyId,
        createdBy: userId,
        type: 'CREATED',
        title: 'Claim created',
        occurredAt: new Date(),
      },
    });

    if (generateChecklist) {
      const template = CLAIM_CHECKLIST_TEMPLATES[input.type] ?? CLAIM_CHECKLIST_TEMPLATES.OTHER;
      await prisma.claimChecklistItem.createMany({
        data: template.map((t, idx) => ({
          claimId: claim.id,
          orderIndex: idx + 1,
          title: t.title,
          description: t.description ?? null,
          required: Boolean(t.required),
          status: 'OPEN',
        })),
      });

      await prisma.claimTimelineEvent.create({
        data: {
          claimId: claim.id,
          propertyId,
          createdBy: userId,
          type: 'CHECKLIST_GENERATED',
          title: 'Checklist generated',
          occurredAt: new Date(),
          meta: { templateType: input.type },
        },
      });

      await recomputeChecklistCompletionPct(claim.id);
    }

    return this.getClaim(propertyId, claim.id);
  }

  static async updateClaim(
    propertyId: string,
    claimId: string,
    userId: string,
    input: UpdateClaimInput
  ) {
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, propertyId },
    });
    if (!claim) throw new Error('Claim not found');
  
    const now = new Date();
  
    // Determine intended next status
    const requestedStatus = input.status as ClaimStatus | undefined;
    const nextStatus: ClaimStatus = (requestedStatus ?? (claim.status as any)) as ClaimStatus;
  
    // ✅ Idempotency: if duplicate transition request, ignore
    // Example: sending SUBMITTED again should not re-emit events or rewrite timestamps
    const isDuplicateStatusUpdate = requestedStatus !== undefined && requestedStatus === claim.status;
  
    // ✅ Transition guards (unless no status provided)
    if (requestedStatus) {
      assertValidTransition(claim.status as any, requestedStatus);
    }
  
    // Auto timestamp transitions (only when actually transitioning)
    const isTransitioning = requestedStatus !== undefined && requestedStatus !== claim.status;
  
    const shouldSetOpenedAt =
      isTransitioning &&
      claim.status === 'DRAFT' &&
      nextStatus !== 'DRAFT' &&
      !claim.openedAt &&
      input.openedAt === undefined;
  
    const shouldSetSubmittedAt =
      isTransitioning &&
      nextStatus === 'SUBMITTED' &&
      !claim.submittedAt &&
      input.submittedAt === undefined;
  
    const shouldSetClosedAt =
      isTransitioning &&
      nextStatus === 'CLOSED' &&
      !claim.closedAt &&
      input.closedAt === undefined;
  
    // If it's a duplicate status update (SUBMITTED again), do nothing for status
    // but still allow updating other fields (providerName, claimNumber, etc.)
    const statusUpdateData =
      requestedStatus && !isDuplicateStatusUpdate
        ? {
            status: requestedStatus as any,
            openedAt: input.openedAt !== undefined ? isoToDateOrNull(input.openedAt) : shouldSetOpenedAt ? now : undefined,
            submittedAt:
              input.submittedAt !== undefined ? isoToDateOrNull(input.submittedAt) : shouldSetSubmittedAt ? now : undefined,
            closedAt: input.closedAt !== undefined ? isoToDateOrNull(input.closedAt) : shouldSetClosedAt ? now : undefined,
          }
        : {
            // No status update (either none requested, or duplicate)
            openedAt: input.openedAt !== undefined ? isoToDateOrNull(input.openedAt) : undefined,
            submittedAt: input.submittedAt !== undefined ? isoToDateOrNull(input.submittedAt) : undefined,
            closedAt: input.closedAt !== undefined ? isoToDateOrNull(input.closedAt) : undefined,
          };
  
    const updated = await prisma.claim.update({
      where: { id: claimId },
      data: {
        title: input.title ?? undefined,
        description: input.description ?? undefined,
  
        ...statusUpdateData,
  
        // Guard sourceType so it doesn’t get overwritten unintentionally
        sourceType: input.sourceType !== undefined ? (input.sourceType as any) : undefined,
        providerName: input.providerName ?? undefined,
        claimNumber: input.claimNumber ?? undefined,
        externalUrl: input.externalUrl ?? undefined,
  
        insurancePolicyId: input.insurancePolicyId ?? undefined,
        warrantyId: input.warrantyId ?? undefined,
  
        incidentAt: input.incidentAt !== undefined ? isoToDateOrNull(input.incidentAt) : undefined,
  
        deductibleAmount: input.deductibleAmount ?? undefined,
        estimatedLossAmount: input.estimatedLossAmount ?? undefined,
        settlementAmount: input.settlementAmount ?? undefined,
  
        nextFollowUpAt: input.nextFollowUpAt !== undefined ? isoToDateOrNull(input.nextFollowUpAt) : undefined,
  
        lastActivityAt: now,
      },
    });
  
    // Timeline entry only when a real status change happened
    if (requestedStatus && isTransitioning) {
      await prisma.claimTimelineEvent.create({
        data: {
          claimId,
          propertyId,
          createdBy: userId,
          type: 'NOTE',
          title: 'Status updated',
          description: `Status changed from ${claim.status} to ${requestedStatus}`,
          occurredAt: now,
          meta: {
            from: claim.status,
            to: requestedStatus,
            autoTimestamps: {
              openedAt: shouldSetOpenedAt || undefined,
              submittedAt: shouldSetSubmittedAt || undefined,
              closedAt: shouldSetClosedAt || undefined,
            },
          },
        },
      });
    }
  
    // ✅ Emit domain events (outbox) only for real transitions
    if (requestedStatus && isTransitioning) {
      if (requestedStatus === 'SUBMITTED') {
        // idempotencyKey prevents duplicates even if called twice in a race
        await DomainEventsService.emit({
          type: 'CLAIM_SUBMITTED',
          propertyId,
          userId,
          idempotencyKey: `claim:${claimId}:submitted`,
          payload: {
            claimId,
            propertyId,
            userId,
            submittedAt: updated.submittedAt ?? now,
            providerName: updated.providerName,
            claimNumber: updated.claimNumber,
          },
        });
      }
  
      if (requestedStatus === 'CLOSED') {
        await DomainEventsService.emit({
          type: 'CLAIM_CLOSED',
          propertyId,
          userId,
          idempotencyKey: `claim:${claimId}:closed`,
          payload: {
            claimId,
            propertyId,
            userId,
            closedAt: updated.closedAt ?? now,
            status: updated.status,
            settlementAmount: updated.settlementAmount,
          },
        });
      }
    }
  
    return updated;
  }
     
  static async addClaimDocument(propertyId: string, claimId: string, userId: string, input: AddClaimDocumentInput) {
    const claim = await prisma.claim.findFirst({ where: { id: claimId, propertyId } });
    if (!claim) throw new Error('Claim not found');

    mustHave(input.name, 'name is required');
    mustHave(input.fileUrl, 'fileUrl is required');
    mustHave(input.fileSize, 'fileSize is required');
    mustHave(input.mimeType, 'mimeType is required');
    mustHave(input.type, 'Document.type is required');

    // Create a Document (reusing your existing generic Document table)
    const doc = await prisma.document.create({
      data: {
        propertyId: claim.propertyId, // IMPORTANT: keep Property.documents consistent
        uploadedBy: userId,
        type: input.type as any,
        name: input.name,
        description: input.description ?? null,
        fileUrl: input.fileUrl,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        metadata: input.metadata ?? undefined,

        // optional: attach to claim-linked coverage objects too
        policyId: input.attachToPolicy ? (claim.insurancePolicyId ?? null) : null,
        warrantyId: input.attachToWarranty ? (claim.warrantyId ?? null) : null,
      },
    });

    const claimDoc = await prisma.claimDocument.create({
      data: {
        claimId,
        documentId: doc.id,
        type: (input.claimDocumentType ?? 'OTHER') as any,
        title: input.title ?? null,
        notes: input.notes ?? null,
      },
      include: { document: true },
    });

    await prisma.claimTimelineEvent.create({
      data: {
        claimId,
        propertyId,
        createdBy: userId,
        type: 'DOCUMENT_ADDED',
        title: 'Document added',
        description: input.title ?? input.name,
        occurredAt: new Date(),
        claimDocumentId: claimDoc.id,
        meta: { documentId: doc.id, claimDocumentType: claimDoc.type },
      },
    });

    await prisma.claim.update({
      where: { id: claimId },
      data: { lastActivityAt: new Date() },
    });

    return claimDoc;
  }

  static async addTimelineEvent(propertyId: string, claimId: string, userId: string, input: AddTimelineEventInput) {
    const claim = await prisma.claim.findFirst({ where: { id: claimId, propertyId } });
    if (!claim) throw new Error('Claim not found');

    const occurredAt = isoToDateOrNull(input.occurredAt) ?? new Date();

    const ev = await prisma.claimTimelineEvent.create({
      data: {
        claimId,
        propertyId,
        createdBy: userId,
        type: input.type as any,
        title: input.title ?? null,
        description: input.description ?? null,
        occurredAt,
        meta: input.meta ?? undefined,
        claimDocumentId: input.claimDocumentId ?? null,
      },
    });

    await prisma.claim.update({
      where: { id: claimId },
      data: { lastActivityAt: new Date() },
    });

    return ev;
  }

  static async updateChecklistItem(
    propertyId: string,
    claimId: string,
    itemId: string,
    userId: string,
    input: UpdateChecklistItemInput
  ) {
    const claim = await prisma.claim.findFirst({ where: { id: claimId, propertyId } });
    if (!claim) throw new Error('Claim not found');

    const item = await prisma.claimChecklistItem.findFirst({ where: { id: itemId, claimId } });
    if (!item) throw new Error('Checklist item not found');

    const nextStatus = input.status;

    await prisma.claimChecklistItem.update({
      where: { id: itemId },
      data: {
        status: nextStatus as any,
        completedAt: nextStatus === 'DONE' ? new Date() : null,
        completedBy: nextStatus === 'DONE' ? userId : null,
        primaryClaimDocumentId: input.primaryClaimDocumentId ?? undefined,
      },
    });

    await recomputeChecklistCompletionPct(claimId);

    await prisma.claimTimelineEvent.create({
      data: {
        claimId,
        propertyId,
        createdBy: userId,
        type: 'NOTE',
        title: 'Checklist updated',
        description: `Checklist item marked ${nextStatus}`,
        occurredAt: new Date(),
        meta: { itemId, status: nextStatus },
      },
    });

    return prisma.claimChecklistItem.findUnique({ where: { id: itemId } });
  }
}

async function generateChecklistForClaim(claimId: string, claimType: ClaimType) {
  const template =
    CLAIM_CHECKLIST_TEMPLATES[claimType] ?? CLAIM_CHECKLIST_TEMPLATES.OTHER;

  await prisma.claimChecklistItem.createMany({
    data: template.map((t: ChecklistTemplateItem, idx: number) => ({
      claimId,
      orderIndex: idx + 1,
      title: t.title,
      description: t.description ?? null,
      required: Boolean(t.required),
      status: 'OPEN',
    })),
  });

  await recomputeChecklistCompletionPct(claimId);
}

