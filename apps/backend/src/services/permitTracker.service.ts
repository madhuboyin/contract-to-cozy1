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
import {
  markProjectsForPermitRecordReconciliationError,
  reconcileProjectsForPermitRecord,
} from './renovationExecution.service';
import {
  evidenceConfidenceForFinding,
  NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE,
  validateRetroactiveDisposition,
} from './projectCompliance/retroactiveCompliancePolicy';

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
    await reconcileProjectsForPermitRecord(permitId, propertyId).catch(async (error) => {
      await markProjectsForPermitRecordReconciliationError(permitId, propertyId, error).catch(() => {});
    });
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
    await reconcileProjectsForPermitRecord(permitId, propertyId).catch(async (error) => {
      await markProjectsForPermitRecordReconciliationError(permitId, propertyId, error).catch(() => {});
    });
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
        where: { propertyId, status: { in: ['UNKNOWN', 'FLAGGED', 'INVESTIGATING'] } },
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

    await reconcileProjectsForPermitRecord(permitId, propertyId).catch(async (error) => {
      // Permit Tracker remains authoritative even if its Project projection
      // needs an explicit retry from execution-alignment diagnostics.
      await markProjectsForPermitRecordReconciliationError(permitId, propertyId, error).catch(() => {});
    });

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
        remediationCase: { select: { id: true, name: true, lifecycle: true } },
        historyEvents: { orderBy: { occurredAt: 'asc' } },
        _count: { select: { historyEvents: true } },
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
      include: {
        resolvedByPermit: { select: { permitNumber: true } },
        remediationCase: { select: { id: true, name: true, lifecycle: true } },
        historyEvents: { orderBy: { occurredAt: 'asc' } },
      },
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

  async updateFlag(flagId: string, propertyId: string, userId: string, patch: any) {
    const existing = await prisma.permitUnpermittedFlag.findFirst({
      where: { id: flagId, propertyId },
    });
    if (!existing) throw new APIError('Flag not found', 404, 'NOT_FOUND');

    const evidenceDocumentIds = patch.evidenceDocumentIds ?? existing.evidenceDocumentIds;
    if (evidenceDocumentIds.length > 0) {
      const count = await prisma.document.count({
        where: { id: { in: evidenceDocumentIds }, propertyId },
      });
      if (count !== new Set(evidenceDocumentIds).size) {
        throw new APIError('One or more evidence documents do not belong to this property.', 409, 'INVALID_RETROACTIVE_EVIDENCE');
      }
    }
    const resolvedByPermitId = patch.resolvedByPermitId ?? existing.resolvedByPermitId;
    if (resolvedByPermitId) {
      const permit = await prisma.propertyPermitRecord.findFirst({
        where: { id: resolvedByPermitId, propertyId, isActive: true },
        select: { id: true, source: true, isVerified: true },
      });
      if (!permit || (!permit.isVerified && permit.source !== 'OPEN_DATA_API')) {
        throw new APIError(
          'The matched permit must be authority-sourced or verified.',
          409,
          'AUTHORITATIVE_PERMIT_MATCH_REQUIRED',
        );
      }
    }

    const merged = {
      currentStatus: existing.status,
      nextStatus: patch.status,
      resolvedByPermitId,
      remediationCaseId: existing.remediationCaseId,
      resolutionNotes: patch.resolutionNotes ?? existing.resolutionNotes,
      evidenceDocumentIds,
      researchChannel: patch.researchChannel ?? existing.researchChannel,
      researchSourceReference: patch.researchSourceReference ?? existing.researchSourceReference,
      authorityOutcome: patch.authorityOutcome ?? existing.authorityOutcome,
      authorityObservedAt: patch.authorityObservedAt ?? existing.authorityObservedAt,
    };
    const dispositionErrors = validateRetroactiveDisposition(merged);
    if (dispositionErrors.length > 0) {
      throw new APIError(
        dispositionErrors.join(' '),
        409,
        'RETROACTIVE_DISPOSITION_EVIDENCE_REQUIRED',
        { requirements: dispositionErrors },
      );
    }
    if (patch.recordSearchOutcome === 'MATCH_FOUND' && !resolvedByPermitId) {
      throw new APIError('A matched-record outcome requires the matching permit.', 409, 'PERMIT_MATCH_REQUIRED');
    }
    const nextSearchOutcome = patch.recordSearchOutcome ?? existing.recordSearchOutcome;
    const nextCoverageDescription = patch.recordsCoverageDescription ?? existing.recordsCoverageDescription;
    if (nextSearchOutcome !== 'NOT_SEARCHED' && !nextCoverageDescription?.trim()) {
      throw new APIError(
        'Describe the records, date range, portal, or documents covered by this search.',
        409,
        'RECORD_SEARCH_COVERAGE_REQUIRED',
      );
    }

    const nextStatus = patch.status ?? existing.status;
    const evidenceConfidence = evidenceConfidenceForFinding({
      recordSearchOutcome: patch.recordSearchOutcome ?? existing.recordSearchOutcome,
      resolvedByPermitId,
      evidenceDocumentIds,
      researchChannel: patch.researchChannel ?? existing.researchChannel,
      researchSourceReference: patch.researchSourceReference ?? existing.researchSourceReference,
      authorityOutcome: patch.authorityOutcome ?? existing.authorityOutcome,
      authorityObservedAt: patch.authorityObservedAt ?? existing.authorityObservedAt,
    });
    await prisma.$transaction(async (tx) => {
      await tx.permitUnpermittedFlag.update({
        where: { id: flagId },
        data: {
          status: patch.status,
          disclosureRisk: patch.disclosureRisk,
          resolvedByPermitId: patch.resolvedByPermitId,
          resolutionNotes: patch.resolutionNotes,
          workOrigin: patch.workOrigin,
          workStage: patch.workStage,
          workStartedAt: patch.workStartedAt ? new Date(patch.workStartedAt) : undefined,
          workCompletedAt: patch.workCompletedAt ? new Date(patch.workCompletedAt) : undefined,
          recordSearchOutcome: patch.recordSearchOutcome,
          recordsSearchedAt: patch.recordSearchOutcome ? new Date() : undefined,
          recordsCoverageDescription: patch.recordsCoverageDescription,
          evidenceDocumentIds: patch.evidenceDocumentIds,
          evidenceConfidence,
          researchChannel: patch.researchChannel,
          researchSourceReference: patch.researchSourceReference,
          authorityOutcome: patch.authorityOutcome,
          authorityObservedAt: patch.authorityObservedAt ? new Date(patch.authorityObservedAt) : undefined,
          dispositionAt: patch.status && ['CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED', 'REMEDIATED', 'DISMISSED'].includes(patch.status)
            ? new Date()
            : undefined,
          dispositionByUserId: patch.status && ['CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED', 'REMEDIATED', 'DISMISSED'].includes(patch.status)
            ? userId
            : undefined,
        },
      });
      const evidenceChanged = patch.evidenceDocumentIds !== undefined;
      const searchChanged = patch.recordSearchOutcome !== undefined;
      const dispositionChanged = nextStatus !== existing.status;
      await tx.permitHistoricalFindingEvent.create({
        data: {
          flagId,
          propertyId,
          actorUserId: userId,
          eventType: dispositionChanged
            ? 'DISPOSITION_RECORDED'
            : searchChanged
              ? 'SEARCH_RECORDED'
              : evidenceChanged
                ? 'EVIDENCE_UPDATED'
                : 'RESEARCH_STARTED',
          fromStatus: existing.status,
          toStatus: nextStatus,
          evidenceDocumentIds,
          payload: {
            recordSearchOutcome: patch.recordSearchOutcome ?? existing.recordSearchOutcome,
            researchChannel: patch.researchChannel ?? existing.researchChannel,
            researchSourceReference: patch.researchSourceReference ?? existing.researchSourceReference,
            authorityOutcome: patch.authorityOutcome ?? existing.authorityOutcome,
            evidenceConfidence,
            resolutionNotes: patch.resolutionNotes ?? existing.resolutionNotes,
          },
        },
      });
    });

    return this.getFlagDetail(flagId, propertyId);
  }

  async createManualFlag(propertyId: string, userId: string, payload: any) {
    if (payload.recordSearchOutcome === 'MATCH_FOUND') {
      throw new APIError(
        'Create the historical finding first, then link the authoritative permit match.',
        409,
        'PERMIT_MATCH_REQUIRED',
      );
    }
    if (payload.evidenceDocumentIds.length > 0) {
      const evidenceCount = await prisma.document.count({
        where: { id: { in: payload.evidenceDocumentIds }, propertyId },
      });
      if (evidenceCount !== new Set(payload.evidenceDocumentIds).size) {
        throw new APIError('One or more evidence documents do not belong to this property.', 409, 'INVALID_RETROACTIVE_EVIDENCE');
      }
    }
    const triggerSource = payload.inventoryItemId
      ? `inventory:${payload.inventoryItemId}`
      : `manual:${Date.now()}`;

    const dedupeKey = `${propertyId}:${payload.workType}:${triggerSource}`;

    const flag = await prisma.$transaction(async (tx) => {
      const created = await tx.permitUnpermittedFlag.create({
        data: {
          propertyId,
          workType: payload.workType,
          triggerType: 'MANUAL',
          flagReason: payload.flagReason || NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE,
          status: 'UNKNOWN',
          disclosureRisk: payload.disclosureRisk,
          inventoryItemId: payload.inventoryItemId,
          resolutionNotes: payload.resolutionNotes,
          dedupeKey,
          workOrigin: payload.workOrigin,
          workStage: payload.workStage,
          workStartedAt: payload.workStartedAt ? new Date(payload.workStartedAt) : undefined,
          workCompletedAt: payload.workCompletedAt ? new Date(payload.workCompletedAt) : undefined,
          recordSearchOutcome: payload.recordSearchOutcome,
          recordsSearchedAt: payload.recordSearchOutcome !== 'NOT_SEARCHED' ? new Date() : undefined,
          recordsCoverageDescription: payload.recordsCoverageDescription,
          evidenceDocumentIds: payload.evidenceDocumentIds,
          evidenceConfidence: evidenceConfidenceForFinding(payload),
          researchChannel: payload.researchChannel,
          researchSourceReference: payload.researchSourceReference,
        },
      });
      await tx.permitHistoricalFindingEvent.create({
        data: {
          flagId: created.id,
          propertyId,
          actorUserId: userId,
          eventType: 'INTAKE_CREATED',
          toStatus: 'UNKNOWN',
          evidenceDocumentIds: payload.evidenceDocumentIds,
          payload: {
            workOrigin: payload.workOrigin,
            workStage: payload.workStage,
            recordSearchOutcome: payload.recordSearchOutcome,
            nonDiagnostic: true,
          },
        },
      });
      return created;
    });

    return {
      ...flag,
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  }

  async createRemediationCase(
    flagId: string,
    propertyId: string,
    userId: string,
    payload: { name?: string; objective?: string },
  ) {
    const flag = await prisma.permitUnpermittedFlag.findFirst({
      where: { id: flagId, propertyId },
    });
    if (!flag) throw new APIError('Historical finding not found.', 404, 'NOT_FOUND');
    if (flag.remediationCaseId) {
      return prisma.renovationCase.findUniqueOrThrow({ where: { id: flag.remediationCaseId } });
    }
    return prisma.$transaction(async (tx) => {
      const renovationCase = await tx.renovationCase.create({
        data: {
          propertyId,
          createdByUserId: userId,
          idempotencyKey: `retroactive-remediation:${flag.id}`,
          name: payload.name?.trim() || `Resolve historical ${flag.workType.toLowerCase().replace(/_/g, ' ')} records`,
          objective: payload.objective?.trim() || 'Research the historical work, obtain an authoritative determination, and complete any required remediation.',
          caseType: 'REPAIR',
          lifecycle: 'REQUIREMENTS_RESEARCH',
          outcomeStatus: 'OPEN',
          governanceTier: flag.disclosureRisk === 'HIGH' ? 'COMPLIANCE_SENSITIVE' : 'MATERIAL_FINANCIAL',
          entryPoint: 'PERMIT_HISTORICAL_RESEARCH',
          sourceType: 'PERMIT_UNPERMITTED_FLAG',
          sourceId: flag.id,
        },
      });
      await tx.renovationCaseLink.create({
        data: {
          renovationCaseId: renovationCase.id,
          propertyId,
          linkType: 'UNPERMITTED_FLAG',
          targetId: flag.id,
          metadata: { historicalResearchOnly: true, createsProject: false },
          createdByUserId: userId,
        },
      });
      await tx.renovationCaseEvent.create({
        data: {
          renovationCaseId: renovationCase.id,
          propertyId,
          actorUserId: userId,
          idempotencyKey: `retroactive-remediation:${flag.id}:created`,
          eventType: 'CASE_CREATED',
          toLifecycle: 'REQUIREMENTS_RESEARCH',
          payload: { sourceFlagId: flag.id, historicalResearchOnly: true },
        },
      });
      await tx.permitUnpermittedFlag.update({
        where: { id: flag.id },
        data: { remediationCaseId: renovationCase.id, status: 'WILL_REMEDIATE' },
      });
      await tx.permitHistoricalFindingEvent.create({
        data: {
          flagId: flag.id,
          propertyId,
          actorUserId: userId,
          eventType: 'REMEDIATION_CASE_CREATED',
          fromStatus: flag.status,
          toStatus: 'WILL_REMEDIATE',
          payload: { remediationCaseId: renovationCase.id, projectCreated: false },
        },
      });
      return renovationCase;
    });
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
