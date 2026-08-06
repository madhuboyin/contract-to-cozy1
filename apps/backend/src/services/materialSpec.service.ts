import {
  MaterialCategory,
  MaterialLifecycleStatus,
  MaterialScopeLevel,
  MaterialSpecExportStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { presignGetObject } from './storage/presign';
import { uploadDocumentBuffer } from './storage/reportStorage';

type UploadedPhotoFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

// Static paint brand color-code → hex lookup (BM, SW, Behr, PPG representative values)
const PAINT_COLOR_HEX: Record<string, Record<string, string>> = {
  'benjamin moore': {
    'oc-17': '#F4F0E8',
    'oc-65': '#F5F0E0',
    'oc-57': '#F7F3E8',
    'hc-172': '#C2C0B8',
    'hc-173': '#A8A49C',
    '2126-60': '#E8E4DC',
    '2155-70': '#D6E8F0',
    'csp-10': '#F5F2EC',
  },
  'sherwin-williams': {
    'sw 7006': '#F2EFE4',
    'sw 7015': '#9E9B8E',
    'sw 7016': '#808080',
    'sw 7029': '#8C8680',
    'sw 7057': '#717C7F',
    'sw 6119': '#C8A882',
    'sw 6385': '#F0E6D0',
    'sw 7005': '#E8E3D8',
    'sw 9140': '#EDE8E0',
  },
  'behr': {
    'n100-1': '#F5F2EB',
    'n120-1': '#F0EDE5',
    '75': '#F2EDE0',
    'pr-w15': '#EAE6DC',
    '790c-3': '#C0B8A8',
  },
  'ppg': {
    'ppg1001-1': '#F5F3EC',
    'ppg1025-1': '#EDE9E0',
    'ppg1002-3': '#D8D4C8',
  },
};

function lookupColorHex(manufacturer?: string | null, colorCode?: string | null): string | null {
  if (!manufacturer || !colorCode) return null;
  const brandKey = manufacturer.toLowerCase().trim();
  const codeKey = colorCode.toLowerCase().trim();
  const brandMap = PAINT_COLOR_HEX[brandKey];
  return brandMap?.[codeKey] ?? null;
}

function buildPresignedPhotoUrl(fileKey: string): Promise<string | null> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !fileKey) return Promise.resolve(null);
  return presignGetObject({ bucket, key: fileKey, expiresInSeconds: 3600 }).catch(() => null);
}

export function canTransitionMaterialLifecycle(
  from: MaterialLifecycleStatus,
  to: MaterialLifecycleStatus,
) {
  const allowed: Record<MaterialLifecycleStatus, MaterialLifecycleStatus[]> = {
    PROPOSED: ['APPROVED', 'SUBSTITUTED'],
    APPROVED: ['SUBSTITUTED', 'INSTALLED'],
    SUBSTITUTED: [],
    INSTALLED: ['AS_BUILT'],
    AS_BUILT: [],
  };
  return allowed[from].includes(to);
}

function complianceCheckPassed(spec: {
  complianceRelevance: unknown;
  permitAttributeCheck: string;
  hoaAttributeCheck: string;
}) {
  const relevance = (spec.complianceRelevance ?? {}) as {
    permitRelevant?: boolean;
    hoaRelevant?: boolean;
  };
  return {
    permitPassed: !relevance.permitRelevant || spec.permitAttributeCheck === 'PASSED',
    hoaPassed: !relevance.hoaRelevant || spec.hoaAttributeCheck === 'PASSED',
  };
}

export class MaterialSpecService {
  // ── Guards ────────────────────────────────────────────────────────────────

  private async assertSpecBelongs(propertyId: string, specId: string) {
    const spec = await prisma.materialSpec.findFirst({
      where: { id: specId, propertyId },
      include: {
        room: { select: { id: true, name: true } },
      },
    });
    if (!spec) throw new APIError('Material spec not found', 404, 'SPEC_NOT_FOUND');
    return spec;
  }

  async transitionLifecycle(
    propertyId: string,
    specId: string,
    actorUserId: string,
    payload: {
      toStatus: MaterialLifecycleStatus;
      evidenceDocumentIds: string[];
      notes: string;
      approvalDocumentIds?: string[];
      submittalDocumentIds?: string[];
      receiptDocumentId?: string | null;
      warrantyDocumentId?: string | null;
      manualDocumentId?: string | null;
      quantityInstalled?: string | null;
      quantityRemaining?: string | null;
      remainingStorageLocation?: string | null;
      installedByName?: string | null;
      installedAt?: string | null;
      permitAttributeCheck?: 'NOT_CONFIGURED' | 'REVIEW_REQUIRED' | 'PASSED' | 'FAILED';
      hoaAttributeCheck?: 'NOT_CONFIGURED' | 'REVIEW_REQUIRED' | 'PASSED' | 'FAILED';
    },
  ) {
    const spec = await this.assertSpecBelongs(propertyId, specId);
    if (!canTransitionMaterialLifecycle(spec.lifecycleStatus, payload.toStatus)) {
      throw new APIError(
        `Material cannot transition from ${spec.lifecycleStatus} to ${payload.toStatus}.`,
        409,
        'INVALID_MATERIAL_LIFECYCLE_TRANSITION',
      );
    }

    const allEvidenceIds = [
      ...(payload.evidenceDocumentIds ?? []),
      ...(payload.approvalDocumentIds ?? []),
      ...(payload.submittalDocumentIds ?? []),
      ...[payload.receiptDocumentId, payload.warrantyDocumentId, payload.manualDocumentId]
        .filter((id): id is string => Boolean(id)),
    ];
    await this.assertDocumentsBelong(propertyId, allEvidenceIds);

    // Migration onto the typed PropertyRecordLink model (Slice 5): the
    // legacy *DocumentIds fields above stay exactly as they were — every
    // existing gate below still honors them first, zero behavior change
    // for specs that only ever use them. What's new: a real Home Record
    // (linked via Home Records' own "Link to another record" — already
    // fully functional as of an earlier pass) can ALSO satisfy these same
    // evidence requirements, via PropertyRecordLink.purpose values that
    // map 1:1 onto this domain's evidence categories. This is additive —
    // no existing validation logic is rewritten, only widened to accept a
    // second, more governed evidence source going forward.
    const linkedPurposes = ['APPROVED', 'INSTALLED', 'AS_BUILT'].includes(payload.toStatus)
      ? new Set((await prisma.propertyRecordLink.findMany({
          where: { entityType: 'MATERIAL_SPEC', entityId: specId, record: { propertyId } },
          select: { purpose: true },
        })).map((link) => link.purpose))
      : new Set<string>();

    const permitAttributeCheck = payload.permitAttributeCheck ?? spec.permitAttributeCheck;
    const hoaAttributeCheck = payload.hoaAttributeCheck ?? spec.hoaAttributeCheck;
    const checks = complianceCheckPassed({
      complianceRelevance: spec.complianceRelevance,
      permitAttributeCheck,
      hoaAttributeCheck,
    });
    if (!checks.permitPassed || !checks.hoaPassed) {
      throw new APIError(
        'Permit and HOA-relevant material attributes must pass review before approval or installation.',
        409,
        'MATERIAL_COMPLIANCE_CHECK_REQUIRED',
        checks,
      );
    }

    if (payload.toStatus === 'APPROVED') {
      const submittalSatisfied = (payload.submittalDocumentIds ?? spec.submittalDocumentIds).length > 0
        || linkedPurposes.has('SOURCE');
      const approvalSatisfied = (payload.approvalDocumentIds ?? []).length > 0
        || linkedPurposes.has('APPROVAL');
      if (!submittalSatisfied || !approvalSatisfied) {
        throw new APIError(
          'Approval requires both submittal and approval evidence.',
          409,
          'MATERIAL_APPROVAL_EVIDENCE_REQUIRED',
        );
      }
    }
    if (payload.toStatus === 'INSTALLED') {
      const evidenceSatisfied = payload.evidenceDocumentIds.length > 0 || linkedPurposes.has('EVIDENCE');
      if (!evidenceSatisfied || !payload.quantityInstalled?.trim()) {
        throw new APIError(
          'Installation requires evidence and installed quantity.',
          409,
          'MATERIAL_INSTALLATION_EVIDENCE_REQUIRED',
        );
      }
    }
    if (payload.toStatus === 'AS_BUILT') {
      const exactIdentityKnown = Boolean(
        spec.manufacturer?.trim()
        && spec.productName?.trim()
        && (spec.sku?.trim() || spec.colorCode?.trim() || spec.lotBatch?.trim()),
      );
      const evidenceSatisfied = payload.evidenceDocumentIds.length > 0 || linkedPurposes.has('EVIDENCE');
      const receiptSatisfied = Boolean(payload.receiptDocumentId) || linkedPurposes.has('RECEIPT');
      if (
        !exactIdentityKnown
        || !evidenceSatisfied
        || !receiptSatisfied
        || payload.quantityRemaining == null
      ) {
        throw new APIError(
          'As-built verification requires exact product identity, installation evidence, receipt, and an explicit remaining-material record.',
          409,
          'MATERIAL_AS_BUILT_EVIDENCE_REQUIRED',
        );
      }
    }

    const eventType = payload.toStatus === 'AS_BUILT'
      ? 'AS_BUILT_VERIFIED'
      : payload.toStatus;
    return prisma.$transaction(async (tx) => {
      const updated = await tx.materialSpec.update({
        where: { id: specId },
        data: {
          lifecycleStatus: payload.toStatus,
          permitAttributeCheck,
          hoaAttributeCheck,
          approvalDocumentIds: payload.approvalDocumentIds ?? spec.approvalDocumentIds,
          submittalDocumentIds: payload.submittalDocumentIds ?? spec.submittalDocumentIds,
          receiptDocumentId: payload.receiptDocumentId ?? spec.receiptDocumentId,
          warrantyDocumentId: payload.warrantyDocumentId ?? spec.warrantyDocumentId,
          manualDocumentId: payload.manualDocumentId ?? spec.manualDocumentId,
          quantityInstalled: payload.quantityInstalled ?? spec.quantityInstalled,
          quantityRemaining: payload.quantityRemaining ?? spec.quantityRemaining,
          remainingStorageLocation: payload.remainingStorageLocation ?? spec.remainingStorageLocation,
          installedByName: payload.installedByName ?? spec.installedByName,
          installedAt: payload.toStatus === 'INSTALLED'
            ? new Date(payload.installedAt ?? Date.now())
            : spec.installedAt,
          verificationConfidence: payload.toStatus === 'AS_BUILT' ? 'VERIFIED' : 'DOCUMENTED',
          verifiedAt: payload.toStatus === 'AS_BUILT' ? new Date() : spec.verifiedAt,
          verifiedByUserId: payload.toStatus === 'AS_BUILT' ? actorUserId : spec.verifiedByUserId,
        },
        include: {
          photos: { orderBy: { sortOrder: 'asc' } },
          room: { select: { id: true, name: true } },
        },
      });
      await tx.materialLifecycleEvent.create({
        data: {
          materialSpecId: specId,
          propertyId,
          projectId: spec.projectId,
          eventType,
          fromStatus: spec.lifecycleStatus,
          toStatus: payload.toStatus,
          actorUserId,
          evidenceDocumentIds: payload.evidenceDocumentIds,
          notes: payload.notes,
        },
      });

      // Slice 11 cross-linking: AS_BUILT is the one lifecycle transition
      // that's already gated on real, verified evidence (exact identity,
      // installation evidence, receipt — see the check above) — the same
      // "only promote a genuinely verified fact" bar Slice 6 used for
      // Warranty/Expense. Material Specs previously created zero HomeEvent
      // rows despite having its own bespoke MaterialLifecycleEvent log
      // (confirmed via grep before this pass), so this real installation
      // fact never reached Timeline. occurredAt is the real installation
      // date, not today, matching Slice 6's "the real historical fact
      // happened then" principle.
      if (payload.toStatus === 'AS_BUILT') {
        const occurredAt = updated.installedAt ?? new Date();
        const identity = [updated.manufacturer, updated.productName].filter(Boolean).join(' ') || updated.label;
        await tx.homeEvent.create({
          data: {
            propertyId,
            createdById: actorUserId,
            type: 'MILESTONE',
            title: `Material verified as-built: ${updated.label}`,
            summary: `${identity} confirmed installed and verified, evidenced by receipt and installation documentation.`,
            occurredAt,
            datePrecision: 'EXACT_DATE',
            observationKind: 'EVIDENCE_DERIVED',
            verificationStatus: 'EVIDENCE_VERIFIED',
            sourceType: 'DOMAIN_ENTITY',
            sourceEntityType: 'MATERIAL_SPEC',
            sourceEntityId: specId,
            sourceBadge: 'DOCUMENT_BACKED',
            idempotencyKey: `material-spec-as-built:${specId}`,
          },
        });
      }

      return updated;
    });
  }

  async substituteSpec(
    propertyId: string,
    specId: string,
    actorUserId: string,
    payload: {
      replacement: Record<string, unknown>;
      comparison: Prisma.InputJsonValue;
      complianceImpact: Prisma.InputJsonValue;
      evidenceDocumentIds: string[];
      sourceChangeOrderId?: string | null;
      notes: string;
    },
  ) {
    const original = await this.assertSpecBelongs(propertyId, specId);
    if (!['PROPOSED', 'APPROVED'].includes(original.lifecycleStatus)) {
      throw new APIError(
        'Only proposed or approved material can be substituted.',
        409,
        'MATERIAL_NOT_SUBSTITUTABLE',
      );
    }
    await this.assertDocumentsBelong(propertyId, payload.evidenceDocumentIds);

    const impact = payload.complianceImpact as {
      permitRelevant?: boolean;
      hoaRelevant?: boolean;
    };
    if ((impact.permitRelevant || impact.hoaRelevant) && !payload.sourceChangeOrderId) {
      throw new APIError(
        'A permit or HOA-relevant substitution requires a compliance-reviewed change order.',
        409,
        'MATERIAL_SUBSTITUTION_CHANGE_ORDER_REQUIRED',
      );
    }
    if (payload.sourceChangeOrderId) {
      const changeOrder = await prisma.projectChangeOrder.findFirst({
        where: {
          id: payload.sourceChangeOrderId,
          projectId: original.projectId ?? undefined,
          project: { propertyId },
        },
        select: { id: true, complianceStatus: true },
      });
      if (
        !changeOrder
        || !['NO_RECHECK_REQUIRED', 'RECHECK_COMPLETE'].includes(changeOrder.complianceStatus)
      ) {
        throw new APIError(
          'The linked change order must complete compliance review first.',
          409,
          'MATERIAL_SUBSTITUTION_COMPLIANCE_REVIEW_REQUIRED',
        );
      }
    }

    const replacement = payload.replacement as any;
    return prisma.$transaction(async (tx) => {
      const substitute = await tx.materialSpec.create({
        data: {
          propertyId,
          projectId: original.projectId,
          scopeVersionId: original.scopeVersionId,
          roomId: replacement.roomId ?? original.roomId,
          scopeLevel: replacement.scopeLevel ?? original.scopeLevel,
          category: replacement.category ?? original.category,
          surface: replacement.surface ?? original.surface,
          label: replacement.label ?? `${original.label} substitute`,
          manufacturer: replacement.manufacturer ?? null,
          productLine: replacement.productLine ?? null,
          productName: replacement.productName ?? null,
          sku: replacement.sku ?? null,
          colorCode: replacement.colorCode ?? null,
          colorHex: replacement.colorHex ?? null,
          finish: replacement.finish ?? null,
          dimensions: replacement.dimensions ?? null,
          material: replacement.material ?? null,
          supplier: replacement.supplier ?? null,
          supplierUrl: replacement.supplierUrl ?? null,
          quantityPurchased: replacement.quantityPurchased ?? null,
          lotBatch: replacement.lotBatch ?? null,
          notes: replacement.notes ?? payload.notes,
          lifecycleStatus: 'PROPOSED',
          verificationConfidence: 'DOCUMENTED',
          complianceRelevance: payload.complianceImpact,
          permitAttributeCheck: impact.permitRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED',
          hoaAttributeCheck: impact.hoaRelevant ? 'REVIEW_REQUIRED' : 'NOT_CONFIGURED',
          submittalDocumentIds: payload.evidenceDocumentIds,
          substitutedFromId: original.id,
          sourceChangeOrderId: payload.sourceChangeOrderId,
        },
      });
      await tx.materialSpec.update({
        where: { id: original.id },
        data: { lifecycleStatus: 'SUBSTITUTED', isActive: false },
      });
      await tx.materialLifecycleEvent.createMany({
        data: [
          {
            materialSpecId: original.id,
            propertyId,
            projectId: original.projectId,
            eventType: 'SUBSTITUTED',
            fromStatus: original.lifecycleStatus,
            toStatus: 'SUBSTITUTED',
            actorUserId,
            evidenceDocumentIds: payload.evidenceDocumentIds,
            comparison: payload.comparison,
            complianceImpact: payload.complianceImpact,
            notes: payload.notes,
          },
          {
            materialSpecId: substitute.id,
            propertyId,
            projectId: original.projectId,
            eventType: 'PROPOSED',
            toStatus: 'PROPOSED',
            actorUserId,
            evidenceDocumentIds: payload.evidenceDocumentIds,
            comparison: payload.comparison,
            complianceImpact: payload.complianceImpact,
            notes: payload.notes,
          },
        ],
      });
      return tx.materialSpec.findUnique({
        where: { id: substitute.id },
        include: {
          photos: { orderBy: { sortOrder: 'asc' } },
          room: { select: { id: true, name: true } },
        },
      });
    });
  }

  async createExtractionReview(
    propertyId: string,
    specId: string,
    payload: {
      sourceDocumentId?: string | null;
      sourcePhotoKey?: string | null;
      extractionMethod: string;
      parserVersion?: string | null;
      candidateFields: Prisma.InputJsonValue;
      confidence?: Prisma.InputJsonValue | null;
    },
  ) {
    await this.assertSpecBelongs(propertyId, specId);
    await this.assertDocumentsBelong(
      propertyId,
      payload.sourceDocumentId ? [payload.sourceDocumentId] : [],
    );
    return prisma.materialExtractionReview.create({
      data: {
        materialSpecId: specId,
        propertyId,
        sourceDocumentId: payload.sourceDocumentId,
        sourcePhotoKey: payload.sourcePhotoKey,
        extractionMethod: payload.extractionMethod,
        parserVersion: payload.parserVersion,
        candidateFields: payload.candidateFields,
        confidence: payload.confidence ?? undefined,
      },
    });
  }

  async reviewExtraction(
    propertyId: string,
    specId: string,
    reviewId: string,
    actorUserId: string,
    payload: {
      status: 'CONFIRMED' | 'REJECTED';
      reviewedFields?: Record<string, unknown>;
      reviewNotes: string;
    },
  ) {
    const spec = await this.assertSpecBelongs(propertyId, specId);
    const review = await prisma.materialExtractionReview.findFirst({
      where: { id: reviewId, materialSpecId: specId, propertyId, status: 'NEEDS_REVIEW' },
    });
    if (!review) throw new APIError('Extraction review not found', 404, 'EXTRACTION_REVIEW_NOT_FOUND');

    const allowed = new Set([
      'manufacturer', 'productLine', 'productName', 'sku', 'colorCode',
      'finish', 'dimensions', 'material', 'supplier', 'supplierUrl',
      'quantityPurchased', 'lotBatch', 'careInstructions',
    ]);
    const reviewedFields = payload.reviewedFields ?? {};
    const appliedFields = Object.fromEntries(
      Object.entries(reviewedFields).filter(
        ([key, value]) => allowed.has(key) && (typeof value === 'string' || value === null),
      ),
    );
    return prisma.$transaction(async (tx) => {
      if (payload.status === 'CONFIRMED') {
        await tx.materialSpec.update({
          where: { id: specId },
          data: appliedFields as Prisma.MaterialSpecUpdateInput,
        });
        await tx.materialLifecycleEvent.create({
          data: {
            materialSpecId: specId,
            propertyId,
            projectId: spec.projectId,
            eventType: 'EXTRACTION_CONFIRMED',
            fromStatus: spec.lifecycleStatus,
            toStatus: spec.lifecycleStatus,
            actorUserId,
            evidenceDocumentIds: review.sourceDocumentId ? [review.sourceDocumentId] : [],
            notes: payload.reviewNotes,
          },
        });
      }
      return tx.materialExtractionReview.update({
        where: { id: reviewId },
        data: {
          status: payload.status,
          reviewedFields: appliedFields as Prisma.InputJsonValue,
          reviewNotes: payload.reviewNotes,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
      });
    });
  }

  async getRepairReorderRecord(propertyId: string, specId: string) {
    const spec = await this.assertSpecBelongs(propertyId, specId);
    if (spec.lifecycleStatus !== 'AS_BUILT') {
      throw new APIError(
        'Repair and reorder details are available only from a verified as-built record.',
        409,
        'MATERIAL_AS_BUILT_REQUIRED',
      );
    }
    return {
      materialSpecId: spec.id,
      label: spec.label,
      location: spec.room?.name ?? 'Property-wide',
      manufacturer: spec.manufacturer,
      productLine: spec.productLine,
      productName: spec.productName,
      sku: spec.sku,
      colorCode: spec.colorCode,
      lotBatch: spec.lotBatch,
      supplier: spec.supplier,
      supplierUrl: spec.supplierUrl,
      quantityRemaining: spec.quantityRemaining,
      remainingStorageLocation: spec.remainingStorageLocation,
      careInstructions: spec.careInstructions,
      receiptDocumentId: spec.receiptDocumentId,
      warrantyDocumentId: spec.warrantyDocumentId,
      manualDocumentId: spec.manualDocumentId,
      confidence: spec.verificationConfidence,
      verifiedAt: spec.verifiedAt,
    };
  }

  private async assertRoomBelongs(propertyId: string, roomId?: string | null) {
    if (!roomId) return;
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      select: { id: true },
    });
    if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
  }

  private async assertInventoryItemBelongs(propertyId: string, id?: string | null) {
    if (!id) return;
    const item = await prisma.inventoryItem.findFirst({
      where: { id, propertyId },
      select: { id: true },
    });
    if (!item) throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
  }

  private async assertProjectBelongs(propertyId: string, projectId?: string | null) {
    if (!projectId) return;
    const project = await prisma.projectRecord.findFirst({
      where: { id: projectId, propertyId },
      select: { id: true },
    });
    if (!project) throw new APIError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }

  private async assertScopeVersionBelongs(propertyId: string, scopeVersionId?: string | null) {
    if (!scopeVersionId) return;
    const scope = await prisma.renovationScopeVersion.findFirst({
      where: { id: scopeVersionId, renovationCase: { propertyId } },
      select: { id: true },
    });
    if (!scope) throw new APIError('Scope version not found', 404, 'SCOPE_VERSION_NOT_FOUND');
  }

  private async assertDocumentsBelong(propertyId: string, documentIds: string[]) {
    if (documentIds.length === 0) return;
    const count = await prisma.document.count({
      where: { propertyId, id: { in: [...new Set(documentIds)] } },
    });
    if (count !== new Set(documentIds).size) {
      throw new APIError(
        'Every material evidence document must belong to the same property.',
        409,
        'MATERIAL_EVIDENCE_SCOPE_MISMATCH',
      );
    }
  }

  // ── List / Search ─────────────────────────────────────────────────────────

  async listSpecs(
    propertyId: string,
    query: {
      category?: MaterialCategory;
      scopeLevel?: MaterialScopeLevel;
      roomId?: string;
      projectId?: string;
      lifecycleStatus?: MaterialLifecycleStatus;
      isActive?: boolean;
      limit?: number;
      cursor?: string;
    }
  ) {
    const limit = query.limit ?? 50;
    const where: Prisma.MaterialSpecWhereInput = {
      propertyId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.scopeLevel ? { scopeLevel: query.scopeLevel } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.lifecycleStatus ? { lifecycleStatus: query.lifecycleStatus } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const specs = await prisma.materialSpec.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      include: {
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { photoUrl: true, fileKey: true } },
        room: { select: { id: true, name: true } },
      },
    });

    const hasMore = specs.length > limit;
    const items = hasMore ? specs.slice(0, limit) : specs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { specs: items, nextCursor, hasMore };
  }

  async searchSpecs(propertyId: string, q: string) {
    const term = q.trim().toLowerCase();
    const specs = await prisma.materialSpec.findMany({
      where: {
        propertyId,
        isActive: true,
        OR: [
          { label: { contains: term, mode: 'insensitive' } },
          { manufacturer: { contains: term, mode: 'insensitive' } },
          { productName: { contains: term, mode: 'insensitive' } },
          { colorCode: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { notes: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { label: 'asc' },
      include: {
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { photoUrl: true, fileKey: true } },
        room: { select: { id: true, name: true } },
      },
    });
    return specs;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async getSpec(propertyId: string, specId: string) {
    const spec = await prisma.materialSpec.findFirst({
      where: { id: specId, propertyId },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        room: { select: { id: true, name: true } },
        extractionReviews: { orderBy: { createdAt: 'desc' }, take: 20 },
        lifecycleEvents: { orderBy: { occurredAt: 'desc' }, take: 50 },
      },
    });
    if (!spec) throw new APIError('Material spec not found', 404, 'SPEC_NOT_FOUND');

    // Read-only reconciliation with Home Records' typed PropertyRecordLink
    // graph — link CREATION already works today (Home Records' addLink()
    // already validates MATERIAL_SPEC entityIds via entityExists()), the
    // gap was purely that this detail page never surfaced the incoming
    // links. Deliberately does NOT touch submittalDocumentIds/
    // approvalDocumentIds/receiptDocumentId/etc. or any lifecycle-gate
    // logic below — those still read/write the legacy Document model
    // exactly as before. A full migration of that write path is a
    // separate, larger, DB-untested change, not done here.
    const homeRecordLinks = await prisma.propertyRecordLink.findMany({
      where: { entityType: 'MATERIAL_SPEC', entityId: specId, record: { propertyId } },
      include: { record: { select: { id: true, title: true, recordType: true, lifecycleStatus: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...spec,
      homeRecordLinks: homeRecordLinks.map((link) => ({
        linkId: link.id,
        recordId: link.record.id,
        title: link.record.title,
        recordType: link.record.recordType,
        lifecycleStatus: link.record.lifecycleStatus,
        purpose: link.purpose,
      })),
    };
  }

  async createSpec(propertyId: string, payload: {
    scopeLevel: MaterialScopeLevel;
    category: MaterialCategory;
    label: string;
    surface?: string | null;
    roomId?: string | null;
    manufacturer?: string | null;
    productLine?: string | null;
    productName?: string | null;
    sku?: string | null;
    colorCode?: string | null;
    colorHex?: string | null;
    finish?: string | null;
    dimensions?: string | null;
    material?: string | null;
    supplier?: string | null;
    supplierUrl?: string | null;
    supplierCheckedAt?: string | null;
    supplierDiscontinued?: boolean;
    successorProductUrl?: string | null;
    purchaseDate?: string | null;
    quantityPurchased?: string | null;
    lotBatch?: string | null;
    notes?: string | null;
    isActive?: boolean;
    linkedInventoryItemId?: string | null;
    projectId?: string | null;
    scopeVersionId?: string | null;
    careInstructions?: string | null;
    complianceRelevance?: Prisma.InputJsonValue | null;
    permitAttributeCheck?: 'NOT_CONFIGURED' | 'REVIEW_REQUIRED' | 'PASSED' | 'FAILED';
    hoaAttributeCheck?: 'NOT_CONFIGURED' | 'REVIEW_REQUIRED' | 'PASSED' | 'FAILED';
    submittalDocumentIds?: string[];
  }, actorUserId?: string) {
    await this.assertRoomBelongs(propertyId, payload.roomId);
    await this.assertInventoryItemBelongs(propertyId, payload.linkedInventoryItemId);
    await this.assertProjectBelongs(propertyId, payload.projectId);
    await this.assertScopeVersionBelongs(propertyId, payload.scopeVersionId);
    await this.assertDocumentsBelong(propertyId, payload.submittalDocumentIds ?? []);

    // Auto-populate colorHex from paint brand lookup if missing
    let colorHex = payload.colorHex ?? null;
    if (!colorHex && payload.colorCode && payload.category === 'PAINT') {
      colorHex = lookupColorHex(payload.manufacturer, payload.colorCode);
    }

    // Same category + surface (+ room, for room-scoped items) suggests this
    // may be the same real-world surface already captured — surfaced as a
    // non-blocking suggestion, not a uniqueness constraint, since a homeowner
    // may legitimately be recording a genuine replacement or a second spot.
    const possibleDuplicates = payload.surface
      ? await prisma.materialSpec.findMany({
        where: {
          propertyId,
          isActive: true,
          category: payload.category,
          surface: payload.surface as any,
          ...(payload.scopeLevel === 'ROOM' ? { roomId: payload.roomId ?? null } : {}),
        },
        select: { id: true, label: true, lifecycleStatus: true },
        take: 3,
      })
      : [];

    const spec = await prisma.materialSpec.create({
      data: {
        propertyId,
        scopeLevel: payload.scopeLevel,
        category: payload.category,
        surface: payload.surface as any ?? null,
        label: payload.label,
        roomId: payload.roomId ?? null,
        manufacturer: payload.manufacturer ?? null,
        productLine: payload.productLine ?? null,
        productName: payload.productName ?? null,
        sku: payload.sku ?? null,
        colorCode: payload.colorCode ?? null,
        colorHex,
        finish: payload.finish ?? null,
        dimensions: payload.dimensions ?? null,
        material: payload.material ?? null,
        supplier: payload.supplier ?? null,
        supplierUrl: payload.supplierUrl ?? null,
        supplierCheckedAt: payload.supplierCheckedAt ? new Date(payload.supplierCheckedAt) : null,
        supplierDiscontinued: payload.supplierDiscontinued ?? false,
        successorProductUrl: payload.successorProductUrl ?? null,
        purchaseDate: payload.purchaseDate ? new Date(payload.purchaseDate) : null,
        quantityPurchased: payload.quantityPurchased ?? null,
        lotBatch: payload.lotBatch ?? null,
        notes: payload.notes ?? null,
        isActive: payload.isActive ?? true,
        linkedInventoryItemId: payload.linkedInventoryItemId ?? null,
        projectId: payload.projectId ?? null,
        scopeVersionId: payload.scopeVersionId ?? null,
        careInstructions: payload.careInstructions ?? null,
        complianceRelevance: payload.complianceRelevance ?? undefined,
        permitAttributeCheck: payload.permitAttributeCheck ?? 'NOT_CONFIGURED',
        hoaAttributeCheck: payload.hoaAttributeCheck ?? 'NOT_CONFIGURED',
        submittalDocumentIds: payload.submittalDocumentIds ?? [],
        ...(actorUserId ? {
          lifecycleEvents: {
            create: {
              propertyId,
              projectId: payload.projectId ?? null,
              eventType: 'PROPOSED',
              toStatus: 'PROPOSED',
              actorUserId,
              evidenceDocumentIds: payload.submittalDocumentIds ?? [],
            },
          },
        } : {}),
      },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        room: { select: { id: true, name: true } },
      },
    });

    return { spec, possibleDuplicates };
  }

  async updateSpec(propertyId: string, specId: string, payload: Partial<Parameters<MaterialSpecService['createSpec']>[1]>) {
    const currentSpec = await this.assertSpecBelongs(propertyId, specId);
    if (
      ['INSTALLED', 'AS_BUILT'].includes(currentSpec.lifecycleStatus)
      && Object.keys(payload).some((key) => [
        'category', 'manufacturer', 'productLine', 'productName', 'sku',
        'colorCode', 'colorHex', 'finish', 'dimensions', 'material', 'lotBatch', 'roomId',
      ].includes(key))
    ) {
      throw new APIError(
        'Installed and as-built identity is immutable. Record a substitution instead.',
        409,
        'MATERIAL_AS_BUILT_IDENTITY_IMMUTABLE',
      );
    }
    if (payload.roomId !== undefined) await this.assertRoomBelongs(propertyId, payload.roomId);
    if (payload.linkedInventoryItemId !== undefined) await this.assertInventoryItemBelongs(propertyId, payload.linkedInventoryItemId);
    if (payload.projectId !== undefined) await this.assertProjectBelongs(propertyId, payload.projectId);
    if (payload.scopeVersionId !== undefined) await this.assertScopeVersionBelongs(propertyId, payload.scopeVersionId);
    if (payload.submittalDocumentIds !== undefined) {
      await this.assertDocumentsBelong(propertyId, payload.submittalDocumentIds);
    }

    // Re-run color lookup if colorCode changed and colorHex not explicitly set
    const updateData: Prisma.MaterialSpecUpdateInput = {};

    if (payload.scopeLevel !== undefined) updateData.scopeLevel = payload.scopeLevel;
    if (payload.category !== undefined) updateData.category = payload.category;
    if (payload.surface !== undefined) updateData.surface = payload.surface as any;
    if (payload.label !== undefined) updateData.label = payload.label;
    if (payload.roomId !== undefined) updateData.room = payload.roomId ? { connect: { id: payload.roomId } } : { disconnect: true };
    if (payload.manufacturer !== undefined) updateData.manufacturer = payload.manufacturer;
    if (payload.productLine !== undefined) updateData.productLine = payload.productLine;
    if (payload.productName !== undefined) updateData.productName = payload.productName;
    if (payload.sku !== undefined) updateData.sku = payload.sku;
    if (payload.finish !== undefined) updateData.finish = payload.finish;
    if (payload.dimensions !== undefined) updateData.dimensions = payload.dimensions;
    if (payload.material !== undefined) updateData.material = payload.material;
    if (payload.supplier !== undefined) updateData.supplier = payload.supplier;
    if (payload.supplierUrl !== undefined) updateData.supplierUrl = payload.supplierUrl;
    if (payload.supplierCheckedAt !== undefined) {
      updateData.supplierCheckedAt = payload.supplierCheckedAt ? new Date(payload.supplierCheckedAt) : null;
    }
    if (payload.supplierDiscontinued !== undefined) updateData.supplierDiscontinued = payload.supplierDiscontinued;
    if (payload.successorProductUrl !== undefined) updateData.successorProductUrl = payload.successorProductUrl;
    if (payload.purchaseDate !== undefined) updateData.purchaseDate = payload.purchaseDate ? new Date(payload.purchaseDate) : null;
    if (payload.quantityPurchased !== undefined) updateData.quantityPurchased = payload.quantityPurchased;
    if (payload.lotBatch !== undefined) updateData.lotBatch = payload.lotBatch;
    if (payload.notes !== undefined) updateData.notes = payload.notes;
    if (payload.careInstructions !== undefined) updateData.careInstructions = payload.careInstructions;
    if (payload.complianceRelevance !== undefined) {
      updateData.complianceRelevance = payload.complianceRelevance === null
        ? Prisma.JsonNull
        : payload.complianceRelevance;
    }
    if (payload.permitAttributeCheck !== undefined) updateData.permitAttributeCheck = payload.permitAttributeCheck;
    if (payload.hoaAttributeCheck !== undefined) updateData.hoaAttributeCheck = payload.hoaAttributeCheck;
    if (payload.submittalDocumentIds !== undefined) updateData.submittalDocumentIds = payload.submittalDocumentIds;
    if (payload.isActive !== undefined) updateData.isActive = payload.isActive;
    if (payload.linkedInventoryItemId !== undefined) {
      updateData.inventoryItem = payload.linkedInventoryItemId
        ? { connect: { id: payload.linkedInventoryItemId } }
        : { disconnect: true };
    }
    if (payload.projectId !== undefined) {
      updateData.project = payload.projectId
        ? { connect: { id: payload.projectId } }
        : { disconnect: true };
    }
    if (payload.scopeVersionId !== undefined) {
      updateData.scopeVersion = payload.scopeVersionId
        ? { connect: { id: payload.scopeVersionId } }
        : { disconnect: true };
    }

    if (payload.colorHex !== undefined) {
      updateData.colorHex = payload.colorHex;
    } else if (payload.colorCode !== undefined) {
      updateData.colorCode = payload.colorCode;
      const current = await prisma.materialSpec.findUnique({ where: { id: specId }, select: { manufacturer: true, category: true, colorHex: true } });
      if (!current?.colorHex && payload.colorCode && current?.category === 'PAINT') {
        updateData.colorHex = lookupColorHex(payload.manufacturer ?? current?.manufacturer, payload.colorCode);
      }
    }
    if (payload.colorCode !== undefined) updateData.colorCode = payload.colorCode;

    const spec = await prisma.materialSpec.update({
      where: { id: specId },
      data: updateData,
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        room: { select: { id: true, name: true } },
      },
    });

    return spec;
  }

  async deleteSpec(propertyId: string, specId: string) {
    const spec = await this.assertSpecBelongs(propertyId, specId);
    if (spec.lifecycleStatus !== 'PROPOSED') {
      throw new APIError(
        'Approved, substituted, installed, and as-built material history cannot be deleted; archive it instead.',
        409,
        'MATERIAL_HISTORY_IMMUTABLE',
      );
    }
    await prisma.materialSpec.delete({ where: { id: specId } });
  }

  // ── Photos ────────────────────────────────────────────────────────────────

  async addPhoto(
    propertyId: string,
    specId: string,
    payload: { photoUrl: string; fileKey: string; caption?: string | null; sortOrder?: number }
  ) {
    await this.assertSpecBelongs(propertyId, specId);

    const existing = await prisma.materialSpecPhoto.count({ where: { materialSpecId: specId } });
    if (existing >= 10) throw new APIError('Maximum 10 photos per spec', 400, 'PHOTO_LIMIT_EXCEEDED');

    const photo = await prisma.materialSpecPhoto.create({
      data: {
        materialSpecId: specId,
        propertyId,
        photoUrl: payload.photoUrl,
        fileKey: payload.fileKey,
        caption: payload.caption ?? null,
        sortOrder: payload.sortOrder ?? existing,
      },
    });

    return photo;
  }

  // The photo-capture upload endpoint this domain never had — addPhoto()
  // above always required the caller to already have a photoUrl/fileKey
  // from storage elsewhere, but nothing in the app ever uploaded a file to
  // get one (confirmed via grep: addPhoto has zero real UI callers).
  // Reuses the same generic S3 buffer-upload helper Document Vault already
  // uses, and buildPresignedPhotoUrl() above (also previously unused) to
  // serve a real signed URL back rather than storing a static string that
  // would go stale/private-bucket-inaccessible.
  async uploadPhoto(
    propertyId: string,
    specId: string,
    userId: string,
    file: UploadedPhotoFile,
    options: { caption?: string | null } = {},
  ) {
    await this.assertSpecBelongs(propertyId, specId);

    const existing = await prisma.materialSpecPhoto.count({ where: { materialSpecId: specId } });
    if (existing >= 10) throw new APIError('Maximum 10 photos per spec', 400, 'PHOTO_LIMIT_EXCEEDED');

    const { key } = await uploadDocumentBuffer({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      userId,
      propertyId,
    });

    const photo = await prisma.materialSpecPhoto.create({
      data: {
        materialSpecId: specId,
        propertyId,
        photoUrl: (await buildPresignedPhotoUrl(key)) ?? '',
        fileKey: key,
        caption: options.caption ?? null,
        sortOrder: existing,
      },
    });

    this.runPhotoExtraction(propertyId, specId, key, file.buffer, file.mimetype);

    return photo;
  }

  // Fire-and-forget, matching homeRecords.service.ts's extractVersionText
  // convention exactly (same lazy require for the same reason —
  // documentIntelligence.service.ts's singleton throws at construction if
  // GEMINI_API_KEY is unset, and this file is imported widely enough that
  // a top-level import would break module load in any env/test without
  // the key). Never blocks or fails the photo upload; a failed or
  // nothing-extracted analysis just means no review row gets created —
  // the homeowner can still fill in fields by hand as before.
  private runPhotoExtraction(propertyId: string, specId: string, photoKey: string, buffer: Buffer, mimeType: string): void {
    void (async () => {
      try {
        const { documentIntelligenceService } = require('./documentIntelligence.service') as typeof import('./documentIntelligence.service');
        const insights = await documentIntelligenceService.analyzeMaterialPhoto(buffer, mimeType);
        if (Object.keys(insights.candidateFields).length === 0) return;

        const confidence = Object.fromEntries(
          Object.keys(insights.candidateFields).map((key) => [key, insights.confidence]),
        );
        await prisma.materialExtractionReview.create({
          data: {
            materialSpecId: specId,
            propertyId,
            sourcePhotoKey: photoKey,
            extractionMethod: 'DOCUMENT_AI',
            candidateFields: insights.candidateFields,
            confidence,
          },
        });
      } catch (err) {
        logger.warn({ err, propertyId, specId }, 'Material photo AI extraction failed; spec fields remain editable by hand only');
      }
    })();
  }

  async deletePhoto(propertyId: string, specId: string, photoId: string) {
    await this.assertSpecBelongs(propertyId, specId);
    const photo = await prisma.materialSpecPhoto.findFirst({
      where: { id: photoId, materialSpecId: specId },
    });
    if (!photo) throw new APIError('Photo not found', 404, 'PHOTO_NOT_FOUND');
    await prisma.materialSpecPhoto.delete({ where: { id: photoId } });
  }

  async reorderPhotos(propertyId: string, specId: string, orderedIds: string[]) {
    await this.assertSpecBelongs(propertyId, specId);

    const photos = await prisma.materialSpecPhoto.findMany({
      where: { materialSpecId: specId },
      select: { id: true },
    });
    const existingIds = new Set(photos.map((p) => p.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) throw new APIError(`Photo ${id} not found on this spec`, 400, 'PHOTO_NOT_FOUND');
    }

    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.materialSpecPhoto.update({ where: { id }, data: { sortOrder: idx } })
      )
    );

    return prisma.materialSpecPhoto.findMany({
      where: { materialSpecId: specId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  async requestExport(
    propertyId: string,
    userId: string,
    payload: { scopeType: string; title: string; roomId?: string | null; category?: string | null }
  ) {
    if (payload.roomId) await this.assertRoomBelongs(propertyId, payload.roomId);

    // Prevent duplicate pending/generating exports
    const inFlight = await prisma.materialSpecExport.findFirst({
      where: {
        propertyId,
        status: { in: [MaterialSpecExportStatus.PENDING, MaterialSpecExportStatus.GENERATING] },
      },
      select: { id: true, status: true },
    });
    if (inFlight) {
      throw new APIError('An export is already in progress', 409, 'EXPORT_IN_PROGRESS');
    }

    const titleParts = [payload.title];
    if (payload.scopeType === 'ROOM' && payload.roomId) {
      const room = await prisma.inventoryRoom.findUnique({ where: { id: payload.roomId }, select: { name: true } });
      if (room) titleParts[0] = `${payload.title} — ${room.name}`;
    }

    const specExport = await prisma.materialSpecExport.create({
      data: {
        propertyId,
        requestedByUserId: userId,
        status: MaterialSpecExportStatus.PENDING,
        scopeType: payload.scopeType,
        title: titleParts[0],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return specExport;
  }

  async listExports(propertyId: string) {
    const exports = await prisma.materialSpecExport.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, scopeType: true, title: true,
        totalSpecs: true, fileUrl: true, fileKey: true,
        expiresAt: true, errorMessage: true, createdAt: true, updatedAt: true,
      },
    });
    return exports;
  }

  async getExport(propertyId: string, exportId: string) {
    const specExport = await prisma.materialSpecExport.findFirst({
      where: { id: exportId, propertyId },
    });
    if (!specExport) throw new APIError('Export not found', 404, 'EXPORT_NOT_FOUND');

    let signedUrl: string | null = null;
    if (specExport.fileKey && specExport.status === MaterialSpecExportStatus.COMPLETED) {
      const bucket = process.env.S3_BUCKET;
      if (bucket) {
        signedUrl = await presignGetObject({
          bucket,
          key: specExport.fileKey,
          expiresInSeconds: 3600,
          downloadFilename: `${specExport.title}.pdf`,
        }).catch(() => null);
      }
    }

    return { ...specExport, signedUrl };
  }
}
