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
import { markCoverageAnalysisStale } from '../coverageAnalysis.service';
import { ClaimStatus } from '../../types/claims.types';

import { ClaimDocumentType, ClaimTimelineEventType} from '@prisma/client';
import { HomeEventsAutoGen } from '../homeEvents/homeEvents.autogen';


type UploadAndAttachArgs = {
  propertyId: string;
  claimId: string;
  itemId: string;
  userId: string;
  file: Express.Multer.File;

  claimDocumentType?: ClaimDocumentType;
  title: string | null;
  notes: string | null;
};

type BulkUploadClaimDocumentInput = {
  file: Express.Multer.File;
  claimDocumentType?: ClaimDocumentType; // claim doc type enum
  title?: string | null;
  notes?: string | null;

  // Optional: if you want claim docs also visible on policy/warranty
  attachToPolicy?: boolean;
  attachToWarranty?: boolean;
};

type BulkUploadChecklistItemDocumentInput = {
  itemId: string;
  file: Express.Multer.File;

  claimDocumentType?: ClaimDocumentType;
  title?: string | null;
  notes?: string | null;

  // Optional: set as primary document if item has none
  setAsPrimaryIfEmpty?: boolean;
};

export type ClaimsSummaryDTO = {
  propertyId: string;

  counts: {
    total: number;
    open: number;
    overdueFollowUps: number;
  };

  money: {
    totalEstimatedLossOpen: number; // sum estimatedLossAmount for open claims
  };

  aging: {
    avgAgingDaysOpen: number; // average days since openedAt/createdAt
  };
};
export async function uploadAndAttachChecklistItemDocument(args: UploadAndAttachArgs) {
  const { propertyId, claimId, itemId, userId, file } = args;

  // 1) Validate claim + item ownership under property (IDOR safety)
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, propertyId },
    select: { id: true, propertyId: true, createdBy: true },
  });
  if (!claim) {
    const err: any = new Error('Claim not found');
    err.statusCode = 404;
    throw err;
  }

  const item = await prisma.claimChecklistItem.findFirst({
    where: { id: itemId, claimId },
    select: { id: true, claimId: true, primaryClaimDocumentId: true },
  });
  if (!item) {
    const err: any = new Error('Checklist item not found');
    err.statusCode = 404;
    throw err;
  }

  // 2) Upload the binary to storage -> get fileUrl
  const uploaded = await uploadFileToStorage({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    propertyId,
    claimId,
  });

  // 3) Create Document row
  // IMPORTANT: Your Document model uses DocumentType (not provided in this batch).
  // We keep it safe: set type = OTHER (or map from mimetype if you want).
  const document = await prisma.document.create({
    data: {
      uploadedBy: userId,
      propertyId,
      type: 'OTHER' as any, // ⬅️ map to your DocumentType enum if desired
      name: uploaded.name,
      description: null,
      fileUrl: uploaded.fileUrl,
      fileSize: uploaded.fileSize,
      mimeType: uploaded.mimeType,
      metadata: uploaded.metadata ?? null,
    },
    select: { id: true, fileUrl: true, name: true, mimeType: true },
  });

  // 4) Create or reuse ClaimDocument join row (unique claimId+documentId exists)
  const claimDoc = await prisma.claimDocument.upsert({
    where: { claimId_documentId: { claimId, documentId: document.id } },
    update: {
      type: args.claimDocumentType ?? ClaimDocumentType.OTHER,
      title: args.title,
      notes: args.notes,
    },
    create: {
      claimId,
      documentId: document.id,
      type: args.claimDocumentType ?? ClaimDocumentType.OTHER,
      title: args.title,
      notes: args.notes,
    },
    select: { id: true },
  });

  // 5) Link to checklist item (many-to-many)
  await prisma.claimChecklistItemDocument.upsert({
    where: {
      claimChecklistItemId_claimDocumentId: {
        claimChecklistItemId: itemId,
        claimDocumentId: claimDoc.id,
      },
    },
    update: {},
    create: {
      claimChecklistItemId: itemId,
      claimDocumentId: claimDoc.id,
    },
  });

  // 6) Set primary doc if empty (nice UX)
  if (!item.primaryClaimDocumentId) {
    await prisma.claimChecklistItem.update({
      where: { id: itemId },
      data: { primaryClaimDocumentId: claimDoc.id },
    });
  }

  // 7) Timeline event
  await prisma.claimTimelineEvent.create({
    data: {
      claimId,
      propertyId,
      createdBy: userId,
      type: ClaimTimelineEventType.DOCUMENT_ADDED,
      title: 'Document added',
      description: args.title || file.originalname,
      claimDocumentId: claimDoc.id,
      meta: { checklistItemId: itemId },
      occurredAt: new Date(),
    },
  });

  // 8) Update claim lastActivityAt
  await prisma.claim.update({
    where: { id: claimId },
    data: { lastActivityAt: new Date() },
  });

  // Return updated claim (recommended) so UI can refresh cheaply.
  // If your existing pattern is “return claim”, keep consistent.
  return prisma.claim.findFirst({
    where: { id: claimId, propertyId },
    include: buildClaimIncludesForDetail(), // see helper below
  });
}

/**
 * ✅ Storage adapter: wire this to your real storage (S3/R2/local).
 * Returns a URL that the frontend can open.
 */
async function uploadFileToStorage(args: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  propertyId: string;
  claimId: string;
}): Promise<{
  name: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  metadata?: any;
}> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getS3Client } = await import('../storage/s3Client');
  const { presignGetObject } = await import('../storage/presign');

  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not set');

  const client = getS3Client();
  const key = `claims/${args.propertyId}/${args.claimId}/${Date.now()}-${args.originalName}`
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: args.buffer,
      ContentType: args.mimeType,
      Metadata: {
        propertyid: args.propertyId,
        claimid: args.claimId,
        originalname: args.originalName,
      },
    })
  );

  const fileUrl = await presignGetObject({
    bucket,
    key,
    expiresInSeconds: 60 * 60 * 24 * 7, // 7 days
  });

  return {
    name: args.originalName,
    fileUrl,
    fileSize: args.buffer.length,
    mimeType: args.mimeType,
    metadata: {
      bucket,
      key,
      propertyId: args.propertyId,
      claimId: args.claimId,
    },
  };
}

function buildClaimIncludesForDetail() {
  return {
    checklistItems: {
      orderBy: { orderIndex: 'asc' as const },
      include: {
        itemDocuments: {
          include: {
            claimDocument: { include: { document: true } },
          },
        },
      },
    },
    documents: { include: { document: true } },
    timelineEvents: { orderBy: { occurredAt: 'desc' as const } },
  };
}

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
        checklistItems: {
          orderBy: { orderIndex: 'asc' },
          include: {
            itemDocuments: {
              include: {
                claimDocument: {
                  include: {
                    document: true,
                  },
                },
              },
            },
          },
        },
  
        documents: {
          orderBy: { createdAt: 'desc' },
          include: { document: true },
        },
  
        timelineEvents: {
          orderBy: { occurredAt: 'desc' },
          include: {
            claimDocument: {
              include: { document: true },
            },
          },
        },
  
        insurancePolicy: true,
        warranty: true,
      },
    });
  
    if (!claim) throw new Error('Claim not found');
  
    // ✅ Normalize checklistItems → expose `documents[]`
    const normalized = {
      ...claim,
      checklistItems: claim.checklistItems.map((it) => ({
        ...it,
  
        // Flatten join table → frontend-friendly shape
        documents: (it.itemDocuments ?? []).map((r) => r.claimDocument),
  
        // Optional: hide join table from response
        itemDocuments: undefined,
      })),
    };
  
    return normalized;
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

    await HomeEventsAutoGen.onClaimCreated({
      propertyId,
      claimId: claim.id,
      userId,
      title: claim.title,
      type: String(claim.type ?? ''),
      incidentAt: claim.incidentAt ?? null,
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

    await markCoverageAnalysisStale(propertyId);
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

    const shouldAutoSetNextFollowUp =
      isTransitioning &&
      requestedStatus === 'SUBMITTED' &&
      !claim.nextFollowUpAt &&
      input.nextFollowUpAt === undefined;
  
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
        
        nextFollowUpAt:
        input.nextFollowUpAt !== undefined
          ? isoToDateOrNull(input.nextFollowUpAt)
          : shouldAutoSetNextFollowUp
            ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
            : undefined,
  
        lastActivityAt: now,
      },
    });
  
    // Timeline entry only when a real status change happened// Timeline entry only when a real status change happened
  if (requestedStatus && isTransitioning) {
    await prisma.claimTimelineEvent.create({
      data: {
        claimId: updated.id,
        propertyId: updated.propertyId, // safer than trusting input param
        createdBy: userId,
        type: 'STATUS_CHANGE',
        title: 'Status changed',
        description: `${claim.status} → ${requestedStatus}`,
        occurredAt: now,
        meta: {
          fromStatus: claim.status,
          toStatus: requestedStatus,
          autoTimestamps: {
            openedAt: shouldSetOpenedAt || undefined,
            submittedAt: shouldSetSubmittedAt || undefined,
            closedAt: shouldSetClosedAt || undefined,
            nextFollowUpAt: shouldAutoSetNextFollowUp || undefined,
          },
        },
      },
    });

    await HomeEventsAutoGen.onClaimStatusChanged({
      propertyId: updated.propertyId,
      claimId: updated.id,
      userId,
      title: updated.title,
      fromStatus: String(claim.status),
      toStatus: String(requestedStatus),
    });
  }

  
    async function validateCanSubmitClaim(propertyId: string, claimId: string) {
      const claim = await prisma.claim.findFirst({
        where: { id: claimId, propertyId },
        include: {
          checklistItems: {
            include: {
              itemDocuments: {
                include: {
                  claimDocument: true,
                },
              },
            },
          },
        },
      });
    
      if (!claim) {
        const err: any = new Error('Claim not found');
        err.statusCode = 404;
        throw err;
      }
    
      const blocking: Array<any> = [];
    
      for (const it of claim.checklistItems ?? []) {
        // Required status rule
        const requiredStatusOk =
          !it.required || it.status === 'DONE' || it.status === 'NOT_APPLICABLE';
    
        // Required docs rule
        const min = it.requiredDocMinCount ?? 0;
        const requiredTypes = it.requiredDocTypes ?? [];
    
        // Backward compat: count primary doc even if join missing
        const itemDocRows = it.itemDocuments ?? [];
        const attachedClaimDocs = itemDocRows.map((r: any) => r.claimDocument);
    
        // include primary doc if present and not already counted
        if (it.primaryClaimDocumentId) {
          const already = attachedClaimDocs.some((d: any) => d.id === it.primaryClaimDocumentId);
          if (!already) {
            const primary = await prisma.claimDocument.findUnique({
              where: { id: it.primaryClaimDocumentId },
            });
            if (primary) attachedClaimDocs.push(primary as any);
          }
        }
    
        let docCountOk = true;
        let missingDocs = 0;
    
        if (min > 0) {
          const matching =
            requiredTypes.length === 0
              ? attachedClaimDocs
              : attachedClaimDocs.filter((d: any) => requiredTypes.includes(d.type));
    
          docCountOk = matching.length >= min;
          missingDocs = Math.max(0, min - matching.length);
        }
    
        if (!requiredStatusOk || !docCountOk) {
          blocking.push({
            itemId: it.id,
            title: it.title,
            required: it.required,
            status: it.status,
            missingStatus: !requiredStatusOk,
            missingDocs,
            requiredDocTypes: requiredTypes,
            requiredDocMinCount: min,
          });
        }
      }
    
      if (blocking.length > 0) {
        const err: any = new Error('Claim cannot be submitted. Checklist requirements are incomplete.');
        err.statusCode = 409;
        err.code = 'CLAIM_SUBMIT_BLOCKED';
        err.details = { blocking };
        throw err;
      }
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
    
    if (nextStatus === 'SUBMITTED') {
      await validateCanSubmitClaim(propertyId, claimId);
    }
    await markCoverageAnalysisStale(propertyId);
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

  static async getClaimsSummary(propertyId: string): Promise<ClaimsSummaryDTO> {
    const now = new Date();

    const claims = await prisma.claim.findMany({
      where: { propertyId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        openedAt: true,
        nextFollowUpAt: true,
        estimatedLossAmount: true,
      },
    });

    const isOpen = (s: ClaimStatus) => s !== 'CLOSED';

    const openClaims = claims.filter((c) => isOpen(c.status as ClaimStatus));
    const overdue = openClaims.filter((c) => c.nextFollowUpAt && c.nextFollowUpAt <= now);

    const totalEstimatedLossOpen = openClaims.reduce((sum, c) => {
      const v = decToNumber(c.estimatedLossAmount);
      return sum + (v ?? 0);
    }, 0);

    const avgAgingDaysOpen =
      openClaims.length === 0
        ? 0
        : Math.round(
            openClaims.reduce((sum, c) => {
              const start = c.openedAt ?? c.createdAt;
              return sum + daysBetween(start, now);
            }, 0) / openClaims.length
          );

    return {
      propertyId,
      counts: {
        total: claims.length,
        open: openClaims.length,
        overdueFollowUps: overdue.length,
      },
      money: {
        totalEstimatedLossOpen,
      },
      aging: {
        avgAgingDaysOpen,
      },
    };
  }

  static async getClaimInsights(propertyId: string, claimId: string) {
    const now = new Date();
  
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, propertyId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        openedAt: true,
        submittedAt: true,
        closedAt: true,
        nextFollowUpAt: true,
        estimatedLossAmount: true,
        settlementAmount: true,
        checklistCompletionPct: true,
        lastActivityAt: true,
        insurancePolicyId: true,
        warrantyId: true,
        timelineEvents: {
          where: { type: 'STATUS_CHANGE' },
          orderBy: { occurredAt: 'desc' },
          take: 1,
          select: { occurredAt: true, meta: true },
        },
        _count: {
          select: {
            documents: true,
            timelineEvents: true,
            checklistItems: true,
          },
        },
      },
    });
  
    if (!claim) throw new Error('Claim not found');
  
    // -------------------------
    // Helpers
    // -------------------------
    function clamp(n: number, min: number, max: number) {
      return Math.max(min, Math.min(max, n));
    }
  
    function safeNumber(n: any): number | null {
      if (n === null || n === undefined) return null;
      const x = Number(n);
      return Number.isFinite(x) ? x : null;
    }
  
    const SLA = {
      followUpDaysByStatus: {
        DRAFT: 7,
        IN_PROGRESS: 7,
        SUBMITTED: 5,
        UNDER_REVIEW: 5,
        APPROVED: 7,
        DENIED: 7,
        CLOSED: 9999,
      } as Record<string, number>,
  
      statusMaxDays: {
        DRAFT: 14,
        IN_PROGRESS: 30,
        SUBMITTED: 14,
        UNDER_REVIEW: 21,
        APPROVED: 14,
        DENIED: 14,
        CLOSED: 9999,
      } as Record<string, number>,
    };
  
    function computeFinancial(estimated: number | null, settlement: number | null) {
      if (!estimated || estimated <= 0 || settlement === null || settlement === undefined) {
        return {
          estimatedLossAmount: estimated,
          settlementAmount: settlement,
          settlementVsEstimate: null as number | null,
          settlementRatio: null as number | null,
          visual: null as null | { label: string; direction: 'UP' | 'DOWN' | 'FLAT' },
        };
      }
  
      const diff = settlement - estimated;
      const ratio = settlement / estimated;
  
      let direction: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
      if (ratio >= 1.1) direction = 'UP';
      else if (ratio <= 0.9) direction = 'DOWN';
  
      const label =
        direction === 'FLAT'
          ? 'Settlement roughly matches estimate'
          : `Settlement is ${(ratio * 100).toFixed(0)}% of estimate`;
  
      return {
        estimatedLossAmount: estimated,
        settlementAmount: settlement,
        settlementVsEstimate: diff,
        settlementRatio: ratio,
        visual: { label, direction },
      };
    }
  
    function computeFollowUpRisk(params: {
      nextFollowUpAt: Date | null;
      lastActivityAt: Date | null;
      status: string;
    }) {
      const { nextFollowUpAt, lastActivityAt, status } = params;
  
      const followUpSlaDays = SLA.followUpDaysByStatus[status] ?? 7;
  
      const daysSinceActivity =
        lastActivityAt ? daysBetween(lastActivityAt, now) : 999;
  
      const isOverdue = Boolean(nextFollowUpAt && nextFollowUpAt <= now);
      const overdueDays =
        isOverdue && nextFollowUpAt ? daysBetween(nextFollowUpAt, now) : 0;
  
      let risk = 25;
  
      if (isOverdue) {
        risk += clamp((overdueDays ?? 0) * 10, 20, 70);
      } else {
        if ((daysSinceActivity ?? 0) > followUpSlaDays) {
          risk += clamp(((daysSinceActivity ?? 0) - followUpSlaDays) * 4, 0, 30);
        }
      }
  
      if (!lastActivityAt) risk += 25;
  
      risk = clamp(risk, 0, 100);
      const level = risk >= 75 ? 'HIGH' : risk >= 45 ? 'MEDIUM' : 'LOW';
  
      const reasons: string[] = [];
      if (isOverdue) reasons.push(`Follow-up overdue by ${overdueDays} day(s).`);
      if (!lastActivityAt) reasons.push('No activity recorded yet.');
      if (lastActivityAt && (daysSinceActivity ?? 0) > followUpSlaDays) {
        reasons.push(
          `No activity for ${daysSinceActivity} day(s) (cadence ~${followUpSlaDays}d).`
        );
      }
  
      return {
        score: risk,
        level,
        isOverdue,
        overdueDays: isOverdue ? overdueDays : 0,
        daysSinceActivity,
        reasons,
      };
    }
  
    function computeSla(params: {
      status: string;
      openedAt: Date | null;
      submittedAt: Date | null;
      createdAt: Date;
      statusStartFromTimeline: Date | null;
    }) {
      const { status, openedAt, submittedAt, createdAt, statusStartFromTimeline } = params;
  
      const maxDays = SLA.statusMaxDays[status] ?? 30;
      const statusStart =
      statusStartFromTimeline ??
      (status === 'SUBMITTED' || status === 'UNDER_REVIEW' || status === 'APPROVED' || status === 'DENIED'
        ? (submittedAt ?? openedAt ?? createdAt)
        : (openedAt ?? createdAt));
  
      const daysInStatus = daysBetween(statusStart, now);
      const isBreach = daysInStatus > maxDays;
  
      const warnAt = Math.floor(maxDays * 0.8);
      const isAtRisk = !isBreach && daysInStatus >= warnAt;
  
      const message = isBreach
        ? `SLA breached: ${daysInStatus} day(s) in ${status} (max ${maxDays}).`
        : isAtRisk
        ? `Approaching SLA: ${daysInStatus} day(s) in ${status} (max ${maxDays}).`
        : null;
  
      return { maxDays, daysInStatus, isAtRisk, isBreach, message };
    }
  
    function computeHealth(params: {
      checklistCompletionPct: number;
      followUpRiskScore: number;
      sla: { isAtRisk: boolean; isBreach: boolean };
      daysSinceLastActivity: number;
    }) {
      const { checklistCompletionPct, followUpRiskScore, sla, daysSinceLastActivity } = params;
  
      let score = 100;
  
      // risk reduces health
      score -= Math.round(followUpRiskScore * 0.45); // up to -45
  
      // SLA penalties
      if (sla.isAtRisk) score -= 10;
      if (sla.isBreach) score -= 25;
  
      // stale activity penalties
      if (daysSinceLastActivity >= 14) score -= 10;
      if (daysSinceLastActivity >= 30) score -= 10;
  
      // checklist completion improves health
      score += Math.round((checklistCompletionPct / 100) * 15); // up to +15
  
      score = clamp(score, 0, 100);
  
      const level = score >= 80 ? 'GOOD' : score >= 55 ? 'FAIR' : 'POOR';
  
      const reasons: string[] = [];
      reasons.push(`Checklist completion: ${Math.round(checklistCompletionPct)}%.`);
      if (followUpRiskScore >= 75) reasons.push('High follow-up risk.');
      if (sla.isBreach) reasons.push('SLA breached.');
      if (sla.isAtRisk && !sla.isBreach) reasons.push('Approaching SLA.');
      if (daysSinceLastActivity >= 14) reasons.push(`Activity is stale (${daysSinceLastActivity}d).`);
  
      return { score, level, reasons };
    }
  
    // -------------------------
    // Base metrics (existing)
    // -------------------------
    const startDate = claim.openedAt ?? claim.createdAt;
    const agingDays = daysBetween(startDate, now);
  
    const daysSinceLastActivity = claim.lastActivityAt
      ? daysBetween(claim.lastActivityAt, now)
      : null;
  
    const daysSinceSubmitted = claim.submittedAt
      ? daysBetween(claim.submittedAt, now)
      : null;
  
    const isOverdue = Boolean(claim.nextFollowUpAt && claim.nextFollowUpAt <= now);
  
    // -------------------------
    // NEW: Enhancements
    // -------------------------
    const checklistCompletionPct = Number(claim.checklistCompletionPct ?? 0);
  
    const followUpRisk = computeFollowUpRisk({
      nextFollowUpAt: claim.nextFollowUpAt ?? null,
      lastActivityAt: claim.lastActivityAt ?? null,
      status: claim.status,
    });
  
    const latestStatusChange = claim.timelineEvents?.[0] ?? null;
    const latestMeta = (latestStatusChange?.meta as any) ?? null;
    const latestToStatus = latestMeta?.toStatus ?? latestMeta?.to ?? null;
  
    const statusStartFromTimeline =
      latestStatusChange && latestToStatus === claim.status
        ? latestStatusChange.occurredAt
        : null;
  
    const sla = computeSla({
      status: claim.status,
      openedAt: claim.openedAt ?? null,
      submittedAt: claim.submittedAt ?? null,
      createdAt: claim.createdAt,
      statusStartFromTimeline,
    });
  
    const financial = computeFinancial(
      safeNumber(claim.estimatedLossAmount),
      safeNumber(claim.settlementAmount)
    );
  
    const health = computeHealth({
      checklistCompletionPct,
      followUpRiskScore: followUpRisk.score,
      sla: { isAtRisk: sla.isAtRisk, isBreach: sla.isBreach },
      daysSinceLastActivity: daysSinceLastActivity ?? 999,
    });
  
    // recommendation: keep your current behavior but enhance with risk/sla
    const recommendationDecision =
      sla.isBreach || followUpRisk.level === 'HIGH'
        ? 'FOLLOW_UP_NOW'
        : isOverdue
        ? 'FOLLOW_UP_NOW'
        : sla.isAtRisk || followUpRisk.level === 'MEDIUM'
        ? 'FOLLOW_UP_SOON'
        : 'ON_TRACK';
  
    const recommendationConfidence =
      recommendationDecision === 'FOLLOW_UP_NOW' ? 0.8 :
      recommendationDecision === 'FOLLOW_UP_SOON' ? 0.7 :
      0.6;
  
    const reasons: string[] = [
      ...(sla.isBreach ? [sla.message as string] : sla.isAtRisk ? [sla.message as string] : []),
      ...(followUpRisk.reasons ?? []).slice(0, 2),
      `Checklist completion is ${checklistCompletionPct}%.`,
      `Documents uploaded: ${claim._count.documents}.`,
    ].filter(Boolean);
  
    return {
      claimId: claim.id,
      status: claim.status,
  
      agingDays,
      daysSinceLastActivity,
      daysSinceSubmitted,
  
      // NEW SECTIONS
      followUp: {
        nextFollowUpAt: claim.nextFollowUpAt ?? null,
        isOverdue,
        risk: followUpRisk,
      },
  
      sla,
  
      financial,
  
      health,
  
      recommendation: {
        decision: recommendationDecision,
        confidence: recommendationConfidence,
        reasons,
      },
  
      coverage: {
        coverageGap: !claim.insurancePolicyId && !claim.warrantyId,
      },
    };
  }  

  /**
   * Bulk upload claim-level documents (NOT tied to a checklist item).
   * Creates Document + ClaimDocument + Timeline events, updates claim.lastActivityAt.
   */
  static async bulkUploadClaimDocuments(
    propertyId: string,
    claimId: string,
    userId: string,
    inputs: BulkUploadClaimDocumentInput[]
  ) {
    if (!inputs?.length) return [];

    // IDOR safety
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, propertyId },
      select: { id: true, propertyId: true, insurancePolicyId: true, warrantyId: true },
    });
    if (!claim) {
      const err: any = new Error('Claim not found');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const results: any[] = [];

      for (const it of inputs) {
        if (!it?.file) continue;

        // 1) Upload binary
        const uploaded = await uploadFileToStorage({
          buffer: it.file.buffer,
          mimeType: it.file.mimetype,
          originalName: it.file.originalname,
          propertyId,
          claimId,
        });

        // 2) Create Document row
        const doc = await tx.document.create({
          data: {
            propertyId,
            uploadedBy: userId,
            type: 'OTHER' as any, // map if you have a real DocumentType enum
            name: uploaded.name,
            description: null,
            fileUrl: uploaded.fileUrl,
            fileSize: uploaded.fileSize,
            mimeType: uploaded.mimeType,
            metadata: uploaded.metadata ?? null,

            // Optional: attach to policy/warranty if requested and exists
            policyId: it.attachToPolicy ? (claim.insurancePolicyId ?? null) : null,
            warrantyId: it.attachToWarranty ? (claim.warrantyId ?? null) : null,
          },
        });

        // 3) Create ClaimDocument row
        const claimDoc = await tx.claimDocument.create({
          data: {
            claimId,
            documentId: doc.id,
            type: (it.claimDocumentType ?? ClaimDocumentType.OTHER) as any,
            title: it.title ?? null,
            notes: it.notes ?? null,
          },
          include: { document: true },
        });

        // 4) Timeline event
        await tx.claimTimelineEvent.create({
          data: {
            claimId,
            propertyId,
            createdBy: userId,
            type: ClaimTimelineEventType.DOCUMENT_ADDED,
            title: 'Document added',
            description: it.title ?? it.file.originalname,
            claimDocumentId: claimDoc.id,
            meta: { bulk: true },
            occurredAt: now,
          },
        });

        results.push(claimDoc);
      }

      // 5) bump claim lastActivityAt once
      await tx.claim.update({
        where: { id: claimId },
        data: { lastActivityAt: now },
      });

      return results;
    });

    return created;
  }

  /**
   * Bulk upload documents tied to checklist items.
   * Creates Document + ClaimDocument + join table ClaimChecklistItemDocument.
   * Creates timeline events and updates claim.lastActivityAt.
   */
  static async bulkUploadChecklistItemDocuments(
    propertyId: string,
    claimId: string,
    userId: string,
    inputs: BulkUploadChecklistItemDocumentInput[]
  ) {
    if (!inputs?.length) return [];

    // IDOR safety
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, propertyId },
      select: { id: true, propertyId: true },
    });
    if (!claim) {
      const err: any = new Error('Claim not found');
      err.statusCode = 404;
      throw err;
    }

    // Validate all itemIds belong to claimId (avoid partial IDOR)
    const itemIds = Array.from(new Set(inputs.map((x) => x.itemId).filter(Boolean)));
    const items = await prisma.claimChecklistItem.findMany({
      where: { claimId, id: { in: itemIds } },
      select: { id: true, primaryClaimDocumentId: true },
    });

    const itemMap = new Map(items.map((i) => [i.id, i]));
    const missing = itemIds.filter((id) => !itemMap.has(id));
    if (missing.length) {
      const err: any = new Error(`Checklist item not found: ${missing[0]}`);
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const results: Array<{
        itemId: string;
        claimDocumentId: string;
        documentId: string;
        fileUrl: string;
        name: string;
      }> = [];

      for (const it of inputs) {
        if (!it?.file) continue;

        const item = itemMap.get(it.itemId)!;

        // 1) Upload binary
        const uploaded = await uploadFileToStorage({
          buffer: it.file.buffer,
          mimeType: it.file.mimetype,
          originalName: it.file.originalname,
          propertyId,
          claimId,
        });

        // 2) Create Document row
        const doc = await tx.document.create({
          data: {
            propertyId,
            uploadedBy: userId,
            type: 'OTHER' as any,
            name: uploaded.name,
            description: null,
            fileUrl: uploaded.fileUrl,
            fileSize: uploaded.fileSize,
            mimeType: uploaded.mimeType,
            metadata: uploaded.metadata ?? null,
          },
          select: { id: true, fileUrl: true, name: true },
        });

        // 3) Create ClaimDocument row (unique claimId+documentId constraint exists in your other function,
        // but here it's always new doc => safe to create)
        const claimDoc = await tx.claimDocument.create({
          data: {
            claimId,
            documentId: doc.id,
            type: (it.claimDocumentType ?? ClaimDocumentType.OTHER) as any,
            title: it.title ?? null,
            notes: it.notes ?? null,
          },
          select: { id: true },
        });

        // 4) Join to checklist item
        await tx.claimChecklistItemDocument.upsert({
          where: {
            claimChecklistItemId_claimDocumentId: {
              claimChecklistItemId: it.itemId,
              claimDocumentId: claimDoc.id,
            },
          },
          update: {},
          create: {
            claimChecklistItemId: it.itemId,
            claimDocumentId: claimDoc.id,
          },
        });

        // 5) Set primary doc if empty (optional behavior)
        const wantsPrimary = it.setAsPrimaryIfEmpty !== false; // default true
        if (wantsPrimary && !item.primaryClaimDocumentId) {
          await tx.claimChecklistItem.update({
            where: { id: it.itemId },
            data: { primaryClaimDocumentId: claimDoc.id },
          });

          // Update our cached map (so later uploads don’t re-update)
          item.primaryClaimDocumentId = claimDoc.id as any;
          itemMap.set(it.itemId, item as any);
        }

        // 6) Timeline event
        await tx.claimTimelineEvent.create({
          data: {
            claimId,
            propertyId,
            createdBy: userId,
            type: ClaimTimelineEventType.DOCUMENT_ADDED,
            title: 'Document added',
            description: it.title ?? it.file.originalname,
            claimDocumentId: claimDoc.id,
            meta: {
              kind: 'DOCUMENT_ADDED',
              checklistItemId: it.itemId,
              bulk: true,
              claimDocumentType: it.claimDocumentType ?? 'OTHER',
              fileName: it.file.originalname,
            },
            occurredAt: now,
          },
        });
        

        results.push({
          itemId: it.itemId,
          claimDocumentId: claimDoc.id,
          documentId: doc.id,
          fileUrl: doc.fileUrl,
          name: doc.name,
        });
      }

      await tx.claim.update({
        where: { id: claimId },
        data: { lastActivityAt: now },
      });

      return results;
    });

    // Optional: if you want checklist % to reflect doc rules quickly,
    // you can recompute here (cheap) or leave it for when user marks DONE.
    // await recomputeChecklistCompletionPct(claimId);

    return created;
  }
  
  static async exportClaimsCsv(propertyId: string): Promise<string> {
    const now = new Date();

    const claims = await prisma.claim.findMany({
      where: { propertyId },
      orderBy: { lastActivityAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        providerName: true,
        claimNumber: true,

        createdAt: true,
        openedAt: true,
        submittedAt: true,
        closedAt: true,
        nextFollowUpAt: true,
        lastActivityAt: true,

        checklistCompletionPct: true,
        estimatedLossAmount: true,
        settlementAmount: true,

        insurancePolicyId: true,
        warrantyId: true,

        _count: {
          select: {
            documents: true,
            timelineEvents: true,
            checklistItems: true,
          },
        },
      },
    });

    const header = [
      'claimId',
      'title',
      'status',
      'type',
      'providerName',
      'claimNumber',

      // "Insights-style" computed fields
      'agingDays',
      'daysSinceLastActivity',
      'daysSinceSubmitted',
      'recommendationDecision',
      'recommendationConfidence',
      'recommendationReasons',
      'coverageGap',

      // Counts
      'documentsCount',
      'timelineEventsCount',
      'checklistItemsCount',

      // Progress & money
      'checklistCompletionPct',
      'estimatedLossAmount',
      'settlementAmount',

      // Milestone dates
      'createdAt',
      'openedAt',
      'submittedAt',
      'closedAt',
      'nextFollowUpAt',
      'lastActivityAt',
    ];

    const rows = claims.map((c) => {
      const startDate = c.openedAt ?? c.createdAt;
      const agingDays = daysBetween(startDate, now);

      const daysSinceLastActivity = c.lastActivityAt
        ? daysBetween(c.lastActivityAt, now)
        : '';

      const daysSinceSubmitted = c.submittedAt
        ? daysBetween(c.submittedAt, now)
        : '';

      const isOverdue = Boolean(c.nextFollowUpAt && c.nextFollowUpAt <= now);

      // same logic as getClaimInsights
      const decision = isOverdue ? 'FOLLOW_UP_NOW' : 'ON_TRACK';
      const confidence = isOverdue ? 0.75 : 0.6;

      const reasons = [
        ...(isOverdue ? ['Follow-up date is overdue.'] : ['No overdue follow-ups detected.']),
        `Checklist completion is ${c.checklistCompletionPct ?? 0}%.`,
        `Documents uploaded: ${c._count.documents}.`,
      ];

      const coverageGap = !c.insurancePolicyId && !c.warrantyId;

      return [
        csv(c.id),
        csv(c.title ?? ''),
        csv(String(c.status ?? '')),
        csv(String(c.type ?? '')),
        csv(c.providerName ?? ''),
        csv(c.claimNumber ?? ''),

        csv(String(agingDays)),
        csv(String(daysSinceLastActivity)),
        csv(String(daysSinceSubmitted)),
        csv(decision),
        csv(String(confidence)),
        csv(reasons.join(' | ')),
        csv(coverageGap ? 'true' : 'false'),

        csv(String(c._count.documents ?? 0)),
        csv(String(c._count.timelineEvents ?? 0)),
        csv(String(c._count.checklistItems ?? 0)),

        csv(String(c.checklistCompletionPct ?? 0)),
        csv(decToNumber(c.estimatedLossAmount) ?? ''),
        csv(decToNumber(c.settlementAmount) ?? ''),

        csv(toIso(c.createdAt)),
        csv(toIso(c.openedAt)),
        csv(toIso(c.submittedAt)),
        csv(toIso(c.closedAt)),
        csv(toIso(c.nextFollowUpAt)),
        csv(toIso(c.lastActivityAt)),
      ].join(',');
    });

    return [header.join(','), ...rows].join('\n');
  }
}

function decToNumber(dec: any): number | null {
  if (!dec) return null;
  if (typeof dec === 'number') return dec;
  if (typeof dec === 'string') return parseFloat(dec);
  // Prisma Decimal type
  if (dec && typeof dec.toString === 'function') return parseFloat(dec.toString());
  return null;
}

function daysBetween(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
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

// helpers local to this file (safe to add near other helper funcs)
function csv(v: any) {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function toIso(d: any) {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
}
