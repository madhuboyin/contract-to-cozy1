import { Prisma } from '@prisma/client';

type PermitRecordCategory =
  | 'BUILDING' | 'ELECTRICAL' | 'PLUMBING' | 'MECHANICAL' | 'STRUCTURAL'
  | 'ROOFING' | 'ZONING' | 'DEMOLITION' | 'GRADING' | 'FIRE' | 'OTHER';
type PermitRecordStatus =
  | 'APPLIED' | 'UNDER_REVIEW' | 'CORRECTION_REQUESTED' | 'RESUBMITTED'
  | 'ISSUED' | 'INSPECTION_PENDING' | 'INSPECTION_FAILED'
  | 'FINALED' | 'EXPIRED' | 'VOIDED' | 'UNKNOWN';
type PermitInspectionStatus =
  | 'NOT_SCHEDULED' | 'SCHEDULED' | 'PASSED' | 'FAILED' | 'PARTIAL' | 'CANCELLED';
type PermitWorkType =
  | 'HVAC_NEW' | 'HVAC_REPLACEMENT' | 'ELECTRICAL_PANEL' | 'ELECTRICAL_WIRING'
  | 'PLUMBING_NEW' | 'PLUMBING_REPAIR' | 'ROOF_REPLACEMENT' | 'ROOF_REPAIR'
  | 'ROOM_ADDITION' | 'GARAGE_CONVERSION' | 'ADU' | 'BASEMENT_FINISH' | 'DECK_PATIO'
  | 'FENCE' | 'SWIMMING_POOL' | 'SOLAR' | 'WINDOWS_DOORS' | 'FIREPLACE'
  | 'SEWER_WATER_LINE' | 'STRUCTURAL_REPAIR' | 'INTERIOR_REMODEL' | 'EXTERIOR_REMODEL'
  | 'DEMOLITION' | 'GRADING_DRAINAGE' | 'OTHER';
type RenovationInspectionStageType =
  | 'PLAN_REVIEW' | 'PRE_CONSTRUCTION' | 'FOUNDATION' | 'FRAMING'
  | 'ROUGH_IN' | 'ELECTRICAL' | 'PLUMBING' | 'MECHANICAL' | 'INSULATION' | 'FINAL' | 'OTHER';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { getGeneratePermitDisclosureQueue } from './JobQueue.service';
import { presignGetObject } from './storage/presign';
import { JOB_REGISTRY } from '../config/workerJobRegistry';
import { evaluateWorkerExecution } from '../config/workerExecutionPolicy';

// ── Inspection milestone templates ───────────────────────────────────────────

interface MilestoneTemplate {
  stageName: string;
  stageType: RenovationInspectionStageType;
  isRequired: boolean;
}

const MILESTONES_BY_CATEGORY: Record<PermitRecordCategory, MilestoneTemplate[]> = {
  BUILDING: [
    { stageName: 'Foundation', stageType: 'FOUNDATION', isRequired: false },
    { stageName: 'Framing', stageType: 'FRAMING', isRequired: true },
    { stageName: 'Rough-In', stageType: 'ROUGH_IN', isRequired: true },
    { stageName: 'Insulation', stageType: 'INSULATION', isRequired: true },
    { stageName: 'Final', stageType: 'FINAL', isRequired: true },
  ],
  ELECTRICAL: [
    { stageName: 'Rough-In', stageType: 'ROUGH_IN', isRequired: true },
    { stageName: 'Final', stageType: 'FINAL', isRequired: true },
  ],
  PLUMBING: [
    { stageName: 'Rough-In', stageType: 'ROUGH_IN', isRequired: true },
    { stageName: 'Final', stageType: 'FINAL', isRequired: true },
  ],
  MECHANICAL: [
    { stageName: 'Rough-In', stageType: 'ROUGH_IN', isRequired: true },
    { stageName: 'Final', stageType: 'FINAL', isRequired: true },
  ],
  STRUCTURAL: [
    { stageName: 'Pre-Construction', stageType: 'PRE_CONSTRUCTION', isRequired: true },
    { stageName: 'Framing', stageType: 'FRAMING', isRequired: true },
    { stageName: 'Final', stageType: 'FINAL', isRequired: true },
  ],
  ROOFING: [
    { stageName: 'Mid-Point', stageType: 'OTHER', isRequired: true },
    { stageName: 'Final', stageType: 'FINAL', isRequired: true },
  ],
  ZONING: [{ stageName: 'Final', stageType: 'FINAL', isRequired: true }],
  DEMOLITION: [{ stageName: 'Final', stageType: 'FINAL', isRequired: true }],
  GRADING: [{ stageName: 'Final', stageType: 'FINAL', isRequired: true }],
  FIRE: [
    { stageName: 'Rough-In', stageType: 'ROUGH_IN', isRequired: true },
    { stageName: 'Final', stageType: 'FINAL', isRequired: true },
  ],
  OTHER: [{ stageName: 'Final', stageType: 'FINAL', isRequired: true }],
};

const ACTIVE_STATUSES: PermitRecordStatus[] = ['ISSUED', 'INSPECTION_PENDING'];

function toArr(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

async function presignDisclosureExportUrl(fileKey: string | null): Promise<string | null> {
  if (!fileKey) return null;
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  return presignGetObject({ bucket, key: fileKey, expiresInSeconds: 60 });
}

// ── Service ───────────────────────────────────────────────────────────────────

export class PermitTrackerService {
  // ── Permits ──────────────────────────────────────────────────────────────

  async listPermits(
    propertyId: string,
    params: {
      category?: string | string[];
      status?: string | string[];
      source?: string | string[];
      workType?: string | string[];
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const { from, to, limit = 30, cursor } = params;
    const categories = toArr(params.category) as PermitRecordCategory[];
    const statuses = toArr(params.status) as PermitRecordStatus[];
    const sources = toArr(params.source) as any[];
    const workTypes = toArr(params.workType) as PermitWorkType[];

    const where: Prisma.PropertyPermitRecordWhereInput = {
      propertyId,
      isActive: true,
      ...(categories.length && { category: { in: categories } }),
      ...(statuses.length && { status: { in: statuses } }),
      ...(sources.length && { source: { in: sources } }),
      ...(workTypes.length && { workTypes: { hasSome: workTypes } }),
      ...((from || to) && {
        issueDate: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const records = await prisma.propertyPermitRecord.findMany({
      where,
      orderBy: [{ status: 'asc' }, { issueDate: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        permitNumber: true,
        category: true,
        workTypes: true,
        description: true,
        status: true,
        source: true,
        issueDate: true,
        finaledDate: true,
        expirationDate: true,
        contractorName: true,
        isVerified: true,
        _count: {
          select: {
            inspectionMilestones: {
              where: { status: { notIn: ['PASSED', 'CANCELLED'] as PermitInspectionStatus[] } },
            },
          },
        },
      },
    });

    const hasMore = records.length > limit;
    if (hasMore) records.pop();

    return {
      items: records.map((r) => ({
        ...r,
        issueDate: r.issueDate?.toISOString(),
        finaledDate: r.finaledDate?.toISOString(),
        expirationDate: r.expirationDate?.toISOString(),
        hasOpenInspections: r._count.inspectionMilestones > 0,
      })),
      nextCursor: hasMore ? records[records.length - 1]?.id : undefined,
    };
  }

  async createManualPermit(propertyId: string, userId: string, payload: any) {
    const record = await prisma.propertyPermitRecord.create({
      data: {
        propertyId,
        source: 'MANUAL_ENTRY',
        permitNumber: payload.permitNumber,
        category: payload.category,
        workTypes: payload.workTypes,
        description: payload.description,
        status: 'UNKNOWN',
        reportedStatus: payload.reportedStatus ?? 'DRAFT',
        reportedAt: new Date(),
        reportedByUserId: userId,
        applicantName: payload.applicantName,
        contractorName: payload.contractorName,
        contractorLicense: payload.contractorLicense,
        workLocation: payload.workLocation,
        applicationDate: payload.applicationDate ? new Date(payload.applicationDate) : undefined,
        issueDate: payload.issueDate ? new Date(payload.issueDate) : undefined,
        expirationDate: payload.expirationDate ? new Date(payload.expirationDate) : undefined,
        finaledDate: payload.finaledDate ? new Date(payload.finaledDate) : undefined,
        estimatedCostCents: payload.estimatedCostCents,
        documentIds: payload.documentIds ?? [],
        notes: payload.notes,
        renovationAdvisorSessionId: payload.renovationAdvisorSessionId,
        sourceActionId: payload.sourceActionId,
        sourceEntityType: payload.sourceEntityType,
        sourceEntityId: payload.sourceEntityId,
        sourceJourneyId: payload.sourceJourneyId,
      },
    });

    return this.getPermitDetail(record.id, propertyId);
  }

  async getPermitDetail(permitId: string, propertyId: string) {
    const record = await prisma.propertyPermitRecord.findFirst({
      where: { id: permitId, propertyId, isActive: true },
      include: {
        inspectionMilestones: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!record) throw new APIError('Permit not found', 404, 'NOT_FOUND');

    const now = new Date();
    return {
      ...record,
      applicationDate: record.applicationDate?.toISOString(),
      issueDate: record.issueDate?.toISOString(),
      expirationDate: record.expirationDate?.toISOString(),
      finaledDate: record.finaledDate?.toISOString(),
      inspectionMilestones: record.inspectionMilestones.map((m) => ({
        ...m,
        scheduledDate: m.scheduledDate?.toISOString(),
        inspectedDate: m.inspectedDate?.toISOString(),
        isOverdue:
          m.scheduledDate != null &&
          m.scheduledDate < now &&
          m.status !== 'PASSED' &&
          m.status !== 'CANCELLED',
      })),
    };
  }

  async updatePermit(permitId: string, propertyId: string, userId: string, patch: any) {
    const existing = await prisma.propertyPermitRecord.findFirst({
      where: { id: permitId, propertyId, isActive: true },
    });
    if (!existing) throw new APIError('Permit not found', 404, 'NOT_FOUND');

    // API-sourced permits: only notes, isVerified, documentIds are updatable
    const isApiSourced = existing.source === 'OPEN_DATA_API';
    const data: Prisma.PropertyPermitRecordUpdateInput = isApiSourced
      ? {
          notes: patch.notes,
          reportedStatus: patch.reportedStatus,
          reportedAt: patch.reportedStatus !== undefined ? new Date() : undefined,
          reportedByUserId: patch.reportedStatus !== undefined ? userId : undefined,
          ...(patch.documentIds && { documentIds: patch.documentIds }),
        }
      : {
          permitNumber: patch.permitNumber,
          category: patch.category,
          workTypes: patch.workTypes,
          description: patch.description,
          reportedStatus: patch.reportedStatus,
          reportedAt: patch.reportedStatus !== undefined ? new Date() : undefined,
          reportedByUserId: patch.reportedStatus !== undefined ? userId : undefined,
          applicantName: patch.applicantName,
          contractorName: patch.contractorName,
          contractorLicense: patch.contractorLicense,
          workLocation: patch.workLocation,
          applicationDate: patch.applicationDate ? new Date(patch.applicationDate) : undefined,
          issueDate: patch.issueDate ? new Date(patch.issueDate) : undefined,
          expirationDate: patch.expirationDate ? new Date(patch.expirationDate) : undefined,
          finaledDate: patch.finaledDate ? new Date(patch.finaledDate) : undefined,
          estimatedCostCents: patch.estimatedCostCents,
          finalCostCents: patch.finalCostCents,
          documentIds: patch.documentIds,
          notes: patch.notes,
        };

    await prisma.propertyPermitRecord.update({ where: { id: permitId }, data });
    return this.getPermitDetail(permitId, propertyId);
  }

  async recordOfficialStatus(permitId: string, propertyId: string, userId: string, payload: any) {
    const existing = await prisma.propertyPermitRecord.findFirst({
      where: { id: permitId, propertyId, isActive: true },
    });
    if (!existing) throw new APIError('Permit not found', 404, 'NOT_FOUND');
    if (payload.evidenceDocumentId) {
      const evidence = await prisma.document.findFirst({
        where: { id: payload.evidenceDocumentId, propertyId },
        select: { id: true },
      });
      if (!evidence) {
        throw new APIError(
          'Official permit evidence must belong to the same property.',
          409,
          'PERMIT_EVIDENCE_SCOPE_MISMATCH',
        );
      }
    }
    await prisma.propertyPermitRecord.update({
      where: { id: permitId },
      data: {
        status: payload.status,
        officialTruthLayer: payload.truthLayer,
        officialSourceType: payload.sourceType,
        officialSourceReference: payload.sourceReference,
        officialEvidenceDocumentId: payload.evidenceDocumentId,
        officialObservedAt: new Date(payload.observedAt),
        officialRecordedByUserId: userId,
        authorityReferenceNumber: payload.authorityReferenceNumber,
        issueDate: payload.issueDate ? new Date(payload.issueDate) : undefined,
        expirationDate: payload.expirationDate ? new Date(payload.expirationDate) : undefined,
        finaledDate: payload.finaledDate ? new Date(payload.finaledDate) : undefined,
        isVerified: true,
      },
    });
    if (ACTIVE_STATUSES.includes(payload.status as PermitRecordStatus)) {
      await this.generateInspectionMilestones(permitId, propertyId, existing.category as PermitRecordCategory);
    }
    return this.getPermitDetail(permitId, propertyId);
  }

  async softDeletePermit(permitId: string, propertyId: string) {
    const existing = await prisma.propertyPermitRecord.findFirst({
      where: { id: permitId, propertyId, isActive: true },
    });
    if (!existing) throw new APIError('Permit not found', 404, 'NOT_FOUND');

    await prisma.$transaction([
      prisma.propertyPermitRecord.update({
        where: { id: permitId },
        data: { isActive: false },
      }),
      // Unlink any flags that resolved against this permit
      prisma.permitUnpermittedFlag.updateMany({
        where: { resolvedByPermitId: permitId },
        data: { resolvedByPermitId: null },
      }),
    ]);
  }

  async getPermitSummary(propertyId: string) {
    const [byStatus, flags] = await Promise.all([
      prisma.propertyPermitRecord.groupBy({
        by: ['status'],
        where: { propertyId, isActive: true },
        _count: { id: true },
      }),
      prisma.permitUnpermittedFlag.count({
        where: { propertyId, status: { in: ['FLAGGED', 'INVESTIGATING'] } },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    let totalPermits = 0;
    let activePermits = 0;
    let finaledPermits = 0;

    for (const row of byStatus) {
      const n = row._count.id;
      statusCounts[row.status] = n;
      totalPermits += n;
      if (ACTIVE_STATUSES.includes(row.status as PermitRecordStatus)) activePermits += n;
      if (row.status === 'FINALED') finaledPermits += n;
    }

    return { totalPermits, activePermits, finaledPermits, openFlags: flags, statusCounts };
  }

  // ── Inspection Milestones ─────────────────────────────────────────────────

  async addInspectionMilestone(permitId: string, propertyId: string, payload: any) {
    const permit = await prisma.propertyPermitRecord.findFirst({
      where: { id: permitId, propertyId, isActive: true },
    });
    if (!permit) throw new APIError('Permit not found', 404, 'NOT_FOUND');

    const max = await prisma.permitInspectionMilestone.aggregate({
      where: { permitRecordId: permitId },
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;

    const milestone = await prisma.permitInspectionMilestone.create({
      data: {
        permitRecordId: permitId,
        propertyId,
        stageName: payload.stageName,
        stageType: payload.stageType,
        status: payload.status ?? 'NOT_SCHEDULED',
        scheduledDate: payload.scheduledDate ? new Date(payload.scheduledDate) : undefined,
        inspectedDate: payload.inspectedDate ? new Date(payload.inspectedDate) : undefined,
        inspectorNotes: payload.inspectorNotes,
        isRequired: payload.isRequired ?? true,
        sortOrder,
      },
    });

    const now = new Date();
    return {
      ...milestone,
      scheduledDate: milestone.scheduledDate?.toISOString(),
      inspectedDate: milestone.inspectedDate?.toISOString(),
      isOverdue:
        milestone.scheduledDate != null &&
        milestone.scheduledDate < now &&
        milestone.status !== 'PASSED' &&
        milestone.status !== 'CANCELLED',
    };
  }

  async updateInspectionMilestone(
    milestoneId: string,
    permitId: string,
    propertyId: string,
    patch: any,
  ) {
    const existing = await prisma.permitInspectionMilestone.findFirst({
      where: { id: milestoneId, permitRecordId: permitId, propertyId },
    });
    if (!existing) throw new APIError('Inspection milestone not found', 404, 'NOT_FOUND');

    const updated = await prisma.permitInspectionMilestone.update({
      where: { id: milestoneId },
      data: {
        status: patch.status,
        scheduledDate: patch.scheduledDate ? new Date(patch.scheduledDate) : undefined,
        inspectedDate: patch.inspectedDate ? new Date(patch.inspectedDate) : undefined,
        inspectorNotes: patch.inspectorNotes,
        stageName: patch.stageName,
        isRequired: patch.isRequired,
      },
    });

    // Local milestone progress is homeowner-reported tracking, not an issuing
    // authority decision. Completing every tracked step must never mutate the
    // permit's official status or finaled date.
    if (patch.status === 'PASSED' && existing.status !== 'PASSED') {
      const remaining = await prisma.permitInspectionMilestone.count({
        where: {
          permitRecordId: permitId,
          isRequired: true,
          status: { notIn: ['PASSED', 'CANCELLED'] as PermitInspectionStatus[] },
        },
      });
      if (remaining === 0) {
        const permit = await prisma.propertyPermitRecord.findUnique({
          where: { id: permitId },
          select: { permitNumber: true },
        });
        await prisma.homeEvent.create({
          data: {
            propertyId,
            title: `Permit ${permit?.permitNumber ?? 'tracking'} steps marked complete`,
            summary: 'All locally tracked required inspection steps are marked complete. Verify official finalization with the issuing authority; the permit official status has not changed.',
            type: 'MAINTENANCE',
            subtype: 'PERMIT_TRACKING_STEPS_COMPLETE',
            importance: 'NORMAL',
            visibility: 'PRIVATE',
            occurredAt: new Date(),
            idempotencyKey: `permit:${permitId}:tracked-inspections-complete`,
            meta: {
              permitRecordId: permitId,
              trackingProgress: 'ALL_REQUIRED_STEPS_REPORTED_COMPLETE',
              officialStatusChanged: false,
            },
          },
        }).catch(() => {});
      }
    }

    const now = new Date();
    return {
      ...updated,
      scheduledDate: updated.scheduledDate?.toISOString(),
      inspectedDate: updated.inspectedDate?.toISOString(),
      isOverdue:
        updated.scheduledDate != null &&
        updated.scheduledDate < now &&
        updated.status !== 'PASSED' &&
        updated.status !== 'CANCELLED',
    };
  }

  async deleteInspectionMilestone(milestoneId: string, permitId: string, propertyId: string) {
    const existing = await prisma.permitInspectionMilestone.findFirst({
      where: { id: milestoneId, permitRecordId: permitId, propertyId },
    });
    if (!existing) throw new APIError('Inspection milestone not found', 404, 'NOT_FOUND');
    await prisma.permitInspectionMilestone.delete({ where: { id: milestoneId } });
  }

  // ── Flags ─────────────────────────────────────────────────────────────────

  async listFlags(
    propertyId: string,
    params: { status?: string | string[]; risk?: string | string[]; limit?: number; cursor?: string },
  ) {
    const { limit = 30, cursor } = params;
    const statuses = toArr(params.status);
    const risks = toArr(params.risk);

    const where: Prisma.PermitUnpermittedFlagWhereInput = {
      propertyId,
      ...(statuses.length && { status: { in: statuses as any[] } }),
      ...(risks.length && { disclosureRisk: { in: risks as any[] } }),
    };

    const flags = await prisma.permitUnpermittedFlag.findMany({
      where,
      orderBy: [{ disclosureRisk: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        resolvedByPermit: { select: { permitNumber: true } },
      },
    });

    const hasMore = flags.length > limit;
    if (hasMore) flags.pop();

    return {
      items: flags.map((f) => ({
        ...f,
        resolvedByPermitNumber: f.resolvedByPermit?.permitNumber,
        resolvedByPermit: undefined,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      nextCursor: hasMore ? flags[flags.length - 1]?.id : undefined,
    };
  }

  async getFlagDetail(flagId: string, propertyId: string) {
    const flag = await prisma.permitUnpermittedFlag.findFirst({
      where: { id: flagId, propertyId },
      include: { resolvedByPermit: { select: { permitNumber: true } } },
    });
    if (!flag) throw new APIError('Flag not found', 404, 'NOT_FOUND');
    return {
      ...flag,
      resolvedByPermitNumber: flag.resolvedByPermit?.permitNumber,
      resolvedByPermit: undefined,
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  }

  async updateFlag(flagId: string, propertyId: string, patch: any) {
    const existing = await prisma.permitUnpermittedFlag.findFirst({
      where: { id: flagId, propertyId },
    });
    if (!existing) throw new APIError('Flag not found', 404, 'NOT_FOUND');

    await prisma.permitUnpermittedFlag.update({
      where: { id: flagId },
      data: {
        status: patch.status,
        disclosureRisk: patch.disclosureRisk,
        resolvedByPermitId: patch.resolvedByPermitId,
        resolutionNotes: patch.resolutionNotes,
      },
    });

    return this.getFlagDetail(flagId, propertyId);
  }

  async createManualFlag(propertyId: string, payload: any) {
    const triggerSource = payload.inventoryItemId
      ? `inventory:${payload.inventoryItemId}`
      : `manual:${Date.now()}`;

    const dedupeKey = `${propertyId}:${payload.workType}:${triggerSource}`;

    const flag = await prisma.permitUnpermittedFlag.create({
      data: {
        propertyId,
        workType: payload.workType,
        triggerType: 'MANUAL',
        flagReason: payload.flagReason,
        status: 'FLAGGED',
        disclosureRisk: payload.disclosureRisk,
        inventoryItemId: payload.inventoryItemId,
        resolutionNotes: payload.resolutionNotes,
        dedupeKey,
      },
    });

    return {
      ...flag,
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  }

  // ── Disclosure Export ─────────────────────────────────────────────────────

  async requestDisclosureExport(propertyId: string, userId: string) {
    // Cross-cutting W4 fix: this on-demand enqueue previously bypassed
    // evaluateWorkerExecution entirely. This is the user's primary
    // requested action, so a blocked decision fails the request — before
    // creating any row — rather than silently doing nothing.
    const registryEntry = JOB_REGISTRY.find((j) => j.key === 'generate-permit-disclosure');
    const decision = registryEntry
      ? evaluateWorkerExecution('generate-permit-disclosure', 'manual', registryEntry)
      : { allowed: false, reason: 'missing registry entry' };
    if (!decision.allowed) {
      throw new APIError(
        `Permit disclosure export is not currently enabled (${decision.reason}).`,
        503,
        'WORKER_JOB_DISABLED',
      );
    }

    const exportRecord = await prisma.permitDisclosureExport.create({
      data: {
        propertyId,
        requestedByUserId: userId,
        status: 'PENDING',
      },
    });

    await getGeneratePermitDisclosureQueue().add('generate-permit-disclosure', {
      exportId: exportRecord.id,
      propertyId,
    });

    return { exportId: exportRecord.id };
  }

  async getDisclosureExport(exportId: string, propertyId: string) {
    const record = await prisma.permitDisclosureExport.findFirst({
      where: { id: exportId, propertyId },
    });
    if (!record) throw new APIError('Export not found', 404, 'NOT_FOUND');

    const urlExpired = record.expiresAt != null && record.expiresAt < new Date();
    const snapshot = record.snapshotJson && typeof record.snapshotJson === 'object' && !Array.isArray(record.snapshotJson)
      ? record.snapshotJson as Record<string, unknown>
      : null;

    return {
      id: record.id,
      status: record.status,
      totalPermits: record.totalPermits,
      openFlags: record.openFlags,
      fileUrl: record.status === 'COMPLETED' && !urlExpired ? await presignDisclosureExportUrl(record.fileKey) : null,
      expiresAt: record.expiresAt?.toISOString(),
      errorMessage: record.errorMessage,
      generatedContextVersion: typeof snapshot?.propertyContextVersion === 'string'
        ? snapshot.propertyContextVersion
        : null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async listDisclosureExports(propertyId: string) {
    const records = await prisma.permitDisclosureExport.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalPermits: true,
        openFlags: true,
        fileKey: true,
        expiresAt: true,
        errorMessage: true,
        snapshotJson: true,
        createdAt: true,
      },
    });

    const now = new Date();
    return Promise.all(records.map(async (r) => ({
      ...r,
      fileKey: undefined,
      snapshotJson: undefined,
      generatedContextVersion:
        r.snapshotJson && typeof r.snapshotJson === 'object' && !Array.isArray(r.snapshotJson) &&
        typeof (r.snapshotJson as Record<string, unknown>).propertyContextVersion === 'string'
          ? (r.snapshotJson as Record<string, unknown>).propertyContextVersion
          : null,
      fileUrl: r.status === 'COMPLETED' && r.expiresAt != null && r.expiresAt > now
        ? await presignDisclosureExportUrl(r.fileKey)
        : null,
      expiresAt: r.expiresAt?.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async generateInspectionMilestones(
    permitId: string,
    propertyId: string,
    category: PermitRecordCategory,
  ) {
    const templates = MILESTONES_BY_CATEGORY[category] ?? MILESTONES_BY_CATEGORY.OTHER;
    await prisma.permitInspectionMilestone.createMany({
      data: templates.map((t, i) => ({
        permitRecordId: permitId,
        propertyId,
        stageName: t.stageName,
        stageType: t.stageType,
        status: 'NOT_SCHEDULED' as PermitInspectionStatus,
        isRequired: t.isRequired,
        sortOrder: i,
      })),
    });
  }
}

export const permitTrackerService = new PermitTrackerService();
