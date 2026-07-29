import { Prisma, InspectionFindingSeverity, MaintenanceTaskPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { inspectionFindingSourceAdapter, resolveInspectionFindingWorkKey } from '../modules/homeOperations/adapters/inspectionFinding.adapter';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { findWorkItemByWorkKey, linkWorkExecution } from '../modules/homeOperations/infrastructure/workItemRepository';

// ── Home Operations Slice 5: finding -> work policy mapping ────────────────────

// Same $1,500 threshold loadInspectionFindingActions uses to elevate a MAJOR
// finding's safetyTier to MATERIAL_FINANCIAL before acceptance.
const MATERIAL_COST_THRESHOLD_CENTS = 150_000;

/**
 * Deterministic policy, not a homeowner choice — kept small and pure so it
 * is trivially testable. SAFETY routes to Guidance (matches the real-world
 * judgment buyerAcquisition.service.ts's dispositionFinding already makes:
 * safety issues need Guidance's structured decision flow, not a bare task).
 * A materially expensive MAJOR finding routes to Project — but this slice
 * does not auto-create the project itself (see acceptFindingAsWork).
 */
export function resolveFindingWorkPolicy(
  finding: Pick<InspectionFindingRecord, 'severity' | 'estimatedCostCentsHigh'>,
): 'MAINTENANCE' | 'GUIDANCE' | 'PROJECT' {
  if (finding.severity === 'SAFETY') return 'GUIDANCE';
  if (finding.severity === 'MAJOR' && (finding.estimatedCostCentsHigh ?? 0) >= MATERIAL_COST_THRESHOLD_CENTS) {
    return 'PROJECT';
  }
  return 'MAINTENANCE';
}

type InspectionFindingRecord = {
  severity: InspectionFindingSeverity;
  estimatedCostCentsHigh: number | null;
};

function guidanceSeverityForFinding(severity: InspectionFindingSeverity) {
  if (severity === 'SAFETY') return 'CRITICAL' as const;
  if (severity === 'MAJOR') return 'HIGH' as const;
  if (severity === 'MINOR') return 'MEDIUM' as const;
  return 'LOW' as const;
}

function maintenancePriorityForFinding(severity: InspectionFindingSeverity): MaintenanceTaskPriority {
  if (severity === 'SAFETY') return 'URGENT';
  if (severity === 'MAJOR') return 'HIGH';
  if (severity === 'MINOR') return 'MEDIUM';
  return 'LOW';
}

async function closeFindingWorkItemBestEffort(
  findingId: string,
  propertyId: string,
  actorUserId: string | null,
): Promise<void> {
  try {
    const workKey = resolveInspectionFindingWorkKey(findingId, propertyId);
    const workItem = await findWorkItemByWorkKey(propertyId, workKey);
    if (!workItem || workItem.state === 'CLOSED') return;
    await transitionWorkItem({
      workItemId: workItem.id,
      to: 'CLOSED',
      disposition: 'NOT_RELEVANT',
      actorType: actorUserId ? 'USER' : 'SYSTEM',
      actorUserId,
      idempotencyKey: `inspection-finding-dismissed:${workItem.id}`,
    });
  } catch (err) {
    logger.warn({ err, findingId }, 'Home Operations work item sync failed; finding dismissal proceeds regardless');
  }
}

/**
 * The explicit accept gate — a finding never becomes committed work without
 * a homeowner calling this. Idempotent: re-accepting a finding that was
 * already routed returns the existing link rather than creating a second
 * downstream record.
 */
export async function acceptFindingAsWork(
  findingId: string,
  reportId: string,
  propertyId: string,
  actorUserId: string,
) {
  const finding = await prisma.inspectionFinding.findUnique({
    where: { id: findingId },
    include: { report: { select: { status: true } } },
  });
  if (!finding || finding.reportId !== reportId || finding.propertyId !== propertyId) {
    throw new APIError('Finding not found', 404, 'NOT_FOUND');
  }
  if (finding.report.status !== 'CONFIRMED') {
    throw new APIError(
      'Confirm the inspection report before accepting findings as work',
      409,
      'REPORT_NOT_CONFIRMED',
    );
  }
  if (finding.status !== 'OPEN') {
    throw new APIError('Only an open finding can be accepted as work', 409, 'INVALID_STATE');
  }

  const proposal = inspectionFindingSourceAdapter.propose(finding, propertyId);
  if (!proposal) {
    throw new APIError('This finding is not eligible for tracked work', 409, 'NOT_ELIGIBLE');
  }

  let workItem = await resolveAndUpsertWorkItem(proposal);
  if (workItem.state === 'CANDIDATE') {
    workItem = await transitionWorkItem({
      workItemId: workItem.id,
      to: 'ACCEPTED',
      actorType: 'USER',
      actorUserId,
      idempotencyKey: `inspection-finding-accepted:${workItem.id}`,
    });
  }

  const policy = resolveFindingWorkPolicy(finding);

  const existingExecutions = await prisma.operationalWorkExecution.findMany({
    where: { workItemId: workItem.id },
  });
  if (existingExecutions.length > 0) {
    return { workItem, policy, execution: existingExecutions[0], created: false };
  }

  if (policy === 'PROJECT') {
    // No auto-created project — a project needs contractor/scope/schedule
    // details a finding alone doesn't have. The work item stays ACCEPTED,
    // ready for the homeowner to create a project through the normal
    // Project Tracker flow (documented non-goal, Slice 5 plan).
    return { workItem, policy, execution: null, created: false };
  }

  if (policy === 'GUIDANCE') {
    const { journey } = await guidanceJourneyService.ingestSignal({
      propertyId,
      inventoryItemId: finding.inventoryItemId,
      signalIntentFamily: 'inspection_followup_needed',
      issueDomain: 'MAINTENANCE',
      severity: guidanceSeverityForFinding(finding.severity),
      severityScore: finding.severity === 'SAFETY' ? 100 : 80,
      confidenceScore: finding.extractionConfidence === 'HIGH' ? 0.9 : finding.extractionConfidence === 'MEDIUM' ? 0.7 : 0.5,
      sourceType: 'INSPECTION',
      sourceFeatureKey: 'inspection-hub',
      sourceToolKey: 'inspection-hub',
      sourceEntityType: 'INSPECTION_FINDING',
      sourceEntityId: finding.id,
      dedupeKey: `${propertyId}:inspection_followup_needed:INSPECTION_FINDING:${finding.id}`,
      duplicateGroupKey: `${propertyId}:inspection-finding:${finding.id}`,
      payloadJson: {
        findingId: finding.id,
        reportId: finding.reportId,
        homeSystem: finding.homeSystem,
        severity: finding.severity,
        description: finding.inspectorDescription,
      },
      actorUserId,
    });
    await linkWorkExecution({ workItemId: workItem.id, executionType: 'GUIDANCE', executionEntityId: journey.id });
    if (workItem.state === 'ACCEPTED') {
      workItem = await transitionWorkItem({
        workItemId: workItem.id,
        to: 'IN_GUIDANCE',
        actorType: 'SYSTEM',
        idempotencyKey: `inspection-finding-in-guidance:${workItem.id}`,
      });
    }
    return { workItem, policy, execution: { executionType: 'GUIDANCE' as const, executionEntityId: journey.id }, created: true };
  }

  // MAINTENANCE
  const task = await PropertyMaintenanceTaskService.createUserTask(actorUserId, propertyId, {
    title: `${finding.homeSystem}: ${finding.inspectorRecommendation}`,
    description: finding.inspectorDescription,
    priority: maintenancePriorityForFinding(finding.severity),
    estimatedCost: finding.estimatedCostCentsHigh != null ? finding.estimatedCostCentsHigh / 100 : undefined,
  });
  await linkWorkExecution({ workItemId: workItem.id, executionType: 'MAINTENANCE_TASK', executionEntityId: task.id });
  return { workItem, policy, execution: { executionType: 'MAINTENANCE_TASK' as const, executionEntityId: task.id }, created: true };
}

function toArr(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// ── Report management ─────────────────────────────────────────────────────────

export async function getHub(propertyId: string) {
  const [reports, openCount, safetyCount, majorCount] = await Promise.all([
    prisma.inspectionReport.findMany({
      where: { propertyId, status: { not: 'ARCHIVED' } },
      orderBy: { inspectionDate: 'desc' },
      select: {
        id: true,
        reportType: true,
        inspectionDate: true,
        inspectorName: true,
        inspectorCompany: true,
        status: true,
        totalFindings: true,
        openFindings: true,
        safetyFindings: true,
        majorFindings: true,
        confirmedAt: true,
        processedAt: true,
      },
    }),
    prisma.inspectionFinding.count({
      where: { propertyId, status: 'OPEN', report: { status: 'CONFIRMED' } },
    }),
    prisma.inspectionFinding.count({
      where: { propertyId, status: 'OPEN', severity: 'SAFETY', report: { status: 'CONFIRMED' } },
    }),
    prisma.inspectionFinding.count({
      where: { propertyId, status: 'OPEN', severity: 'MAJOR', report: { status: 'CONFIRMED' } },
    }),
  ]);

  return { reports, openCount, safetyCount, majorCount };
}

export async function listReports(propertyId: string) {
  return prisma.inspectionReport.findMany({
    where: { propertyId },
    orderBy: { inspectionDate: 'desc' },
    include: {
      _count: { select: { findings: true } },
    },
  });
}

export async function getReport(reportId: string, propertyId: string) {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    include: {
      _count: { select: { findings: true } },
    },
  });
  if (!report || report.propertyId !== propertyId) {
    throw new APIError('Report not found', 404, 'NOT_FOUND');
  }
  return report;
}

export async function archiveReport(reportId: string, propertyId: string) {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    select: { id: true, propertyId: true },
  });
  if (!report || report.propertyId !== propertyId) {
    throw new APIError('Report not found', 404, 'NOT_FOUND');
  }
  return prisma.inspectionReport.update({
    where: { id: reportId },
    data: { status: 'ARCHIVED' },
  });
}

// ── Findings ──────────────────────────────────────────────────────────────────

export async function listFindings(
  reportId: string,
  propertyId: string,
  opts: { groupBySystem?: boolean },
) {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    select: { propertyId: true, status: true },
  });
  if (!report || report.propertyId !== propertyId) {
    throw new APIError('Report not found', 404, 'NOT_FOUND');
  }

  const findings = await prisma.inspectionFinding.findMany({
    where: { reportId },
    orderBy: [{ severity: 'asc' }, { homeSystem: 'asc' }],
  });

  if (!opts.groupBySystem) return findings;

  // Group by homeSystem
  const grouped: Record<string, typeof findings> = {};
  for (const f of findings) {
    if (!grouped[f.homeSystem]) grouped[f.homeSystem] = [];
    grouped[f.homeSystem].push(f);
  }
  return grouped;
}

export async function updateFinding(
  findingId: string,
  reportId: string,
  propertyId: string,
  data: {
    homeSystem?: string;
    subsystem?: string;
    location?: string;
    conditionRating?: string;
    severity?: string;
    aiInterpretation?: string;
    estimatedCostCentsLow?: number;
    estimatedCostCentsHigh?: number;
  },
) {
  const finding = await prisma.inspectionFinding.findUnique({
    where: { id: findingId },
    select: { id: true, reportId: true, propertyId: true, status: true },
  });
  if (!finding || finding.reportId !== reportId || finding.propertyId !== propertyId) {
    throw new APIError('Finding not found', 404, 'NOT_FOUND');
  }
  if (finding.status === 'DISMISSED') {
    throw new APIError('Cannot edit a dismissed finding', 400, 'INVALID_STATE');
  }
  return prisma.inspectionFinding.update({
    where: { id: findingId },
    data: data as Prisma.InspectionFindingUpdateInput,
  });
}

export async function dismissFinding(
  findingId: string,
  reportId: string,
  propertyId: string,
  reason?: string,
  actorUserId: string | null = null,
) {
  const finding = await prisma.inspectionFinding.findUnique({
    where: { id: findingId },
    select: { id: true, reportId: true, propertyId: true, status: true },
  });
  if (!finding || finding.reportId !== reportId || finding.propertyId !== propertyId) {
    throw new APIError('Finding not found', 404, 'NOT_FOUND');
  }
  if (finding.status === 'DISMISSED') return finding;

  const updated = await prisma.inspectionFinding.update({
    where: { id: findingId },
    data: {
      status: 'DISMISSED',
      resolutionNotes: reason,
      resolutionMethod: 'DISMISSED',
      resolvedAt: new Date(),
    },
  });

  await _syncOpenFindingsCount(reportId);
  await closeFindingWorkItemBestEffort(findingId, propertyId, actorUserId);
  return updated;
}

// ── Open items ────────────────────────────────────────────────────────────────

export async function listOpenItems(
  propertyId: string,
  params: {
    severity?: string | string[];
    homeSystem?: string | string[];
    reportId?: string;
    limit: number;
    cursor?: string;
  },
) {
  const severities = toArr(params.severity);
  const systems = toArr(params.homeSystem);

  const where: Prisma.InspectionFindingWhereInput = {
    propertyId,
    status: 'OPEN',
    report: { status: 'CONFIRMED' },
    ...(severities.length > 0 && { severity: { in: severities as any[] } }),
    ...(systems.length > 0 && { homeSystem: { in: systems } }),
    ...(params.reportId && { reportId: params.reportId }),
    ...(params.cursor && { id: { lt: params.cursor } }),
  };

  const findings = await prisma.inspectionFinding.findMany({
    where,
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    take: params.limit + 1,
    include: {
      report: { select: { reportType: true, inspectionDate: true, inspectorName: true } },
    },
  });

  const hasMore = findings.length > params.limit;
  if (hasMore) findings.pop();
  return { findings, hasMore, nextCursor: hasMore ? findings[findings.length - 1]?.id : null };
}

export async function resolveFinding(
  findingId: string,
  propertyId: string,
  data: {
    resolutionMethod: string;
    resolutionNotes?: string;
    resolutionCostCents?: number;
    warrantyExpiresAt?: string;
  },
) {
  const finding = await prisma.inspectionFinding.findUnique({
    where: { id: findingId },
    select: {
      id: true,
      propertyId: true,
      reportId: true,
      status: true,
      report: { select: { status: true } },
    },
  });
  if (!finding || finding.propertyId !== propertyId) {
    throw new APIError('Finding not found', 404, 'NOT_FOUND');
  }
  if (finding.status === 'RESOLVED') {
    throw new APIError('Finding already resolved', 409, 'ALREADY_RESOLVED');
  }
  if (finding.report.status !== 'CONFIRMED') {
    throw new APIError(
      'Confirm the inspection report before resolving findings or creating downstream actions',
      409,
      'REPORT_NOT_CONFIRMED',
    );
  }

  const updated = await prisma.inspectionFinding.update({
    where: { id: findingId },
    data: {
      status: 'RESOLVED',
      resolutionMethod: data.resolutionMethod as any,
      resolutionNotes: data.resolutionNotes,
      resolutionCostCents: data.resolutionCostCents,
      warrantyExpiresAt: data.warrantyExpiresAt ? new Date(data.warrantyExpiresAt) : undefined,
      resolvedAt: new Date(),
    },
  });

  await _syncOpenFindingsCount(finding.reportId);
  return updated;
}

// ── Multi-report comparison ───────────────────────────────────────────────────

export async function compareReports(
  propertyId: string,
  reportAId: string,
  reportBId: string,
) {
  const [reportA, reportB] = await Promise.all([
    prisma.inspectionReport.findUnique({
      where: { id: reportAId },
      include: { findings: { select: { id: true, homeSystem: true, subsystem: true, severity: true, conditionRating: true, status: true, inspectorDescription: true } } },
    }),
    prisma.inspectionReport.findUnique({
      where: { id: reportBId },
      include: { findings: { select: { id: true, homeSystem: true, subsystem: true, severity: true, conditionRating: true, status: true, inspectorDescription: true } } },
    }),
  ]);

  if (!reportA || reportA.propertyId !== propertyId) throw new APIError('Report A not found', 404, 'NOT_FOUND');
  if (!reportB || reportB.propertyId !== propertyId) throw new APIError('Report B not found', 404, 'NOT_FOUND');
  if (reportA.status !== 'CONFIRMED' || reportB.status !== 'CONFIRMED') {
    throw new APIError('Both reports must be confirmed before comparison', 400, 'INVALID_STATE');
  }

  const conditionOrder: Record<string, number> = { GOOD: 0, FAIR: 1, POOR: 2, SAFETY_CONCERN: 3 };

  const resolved: typeof reportA.findings = [];
  const persisted: typeof reportA.findings = [];
  const newFindings: typeof reportB.findings = [];
  const worsened: { a: (typeof reportA.findings)[0]; b: (typeof reportB.findings)[0] }[] = [];

  for (const bFinding of reportB.findings) {
    const match = reportA.findings.find(
      (a) => a.homeSystem === bFinding.homeSystem && a.subsystem === bFinding.subsystem,
    );
    if (!match) {
      newFindings.push(bFinding);
    } else if (bFinding.status === 'OPEN' && match.status === 'OPEN') {
      const worsened_ =
        (conditionOrder[bFinding.conditionRating] ?? 0) > (conditionOrder[match.conditionRating] ?? 0);
      if (worsened_) {
        worsened.push({ a: match, b: bFinding });
      } else {
        persisted.push(bFinding);
      }
    }
  }

  for (const aFinding of reportA.findings) {
    if (aFinding.status === 'RESOLVED') resolved.push(aFinding);
  }

  return {
    reportA: { id: reportA.id, reportType: reportA.reportType, inspectionDate: reportA.inspectionDate },
    reportB: { id: reportB.id, reportType: reportB.reportType, inspectionDate: reportB.inspectionDate },
    resolved,
    persisted,
    newFindings,
    worsened,
  };
}

// ── Negotiation package (PRE_PURCHASE) ────────────────────────────────────────

export async function generateNegotiationPackage(
  reportId: string,
  propertyId: string,
  findingIds: string[],
  decisions: Record<string, 'negotiate_credit' | 'request_repair' | 'accept_as_is'>,
) {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    select: { reportType: true, propertyId: true, status: true, inspectionDate: true, inspectorName: true, inspectorCompany: true },
  });
  if (!report || report.propertyId !== propertyId) throw new APIError('Report not found', 404, 'NOT_FOUND');
  if (report.status !== 'CONFIRMED') {
    throw new APIError('Confirm the inspection report before generating a negotiation package', 409, 'REPORT_NOT_CONFIRMED');
  }
  if (report.reportType !== 'PRE_PURCHASE') {
    throw new APIError('Negotiation package is only available for PRE_PURCHASE reports', 400, 'INVALID_REPORT_TYPE');
  }

  const findings = await prisma.inspectionFinding.findMany({
    where: { id: { in: findingIds }, reportId, propertyId },
  });

  let creditTotal = 0;
  const negotiateCredit = [];
  const requestRepair = [];
  const acceptAsIs = [];

  for (const f of findings) {
    const decision = decisions[f.id] ?? 'accept_as_is';
    const midpoint =
      f.estimatedCostCentsLow != null && f.estimatedCostCentsHigh != null
        ? Math.round((f.estimatedCostCentsLow + f.estimatedCostCentsHigh) / 2)
        : 0;

    const item = {
      findingId: f.id,
      homeSystem: f.homeSystem,
      subsystem: f.subsystem,
      severity: f.severity,
      inspectorDescription: f.inspectorDescription,
      aiInterpretation: f.aiInterpretation,
      estimatedCostCentsLow: f.estimatedCostCentsLow,
      estimatedCostCentsHigh: f.estimatedCostCentsHigh,
      decision,
    };

    if (decision === 'negotiate_credit') {
      creditTotal += midpoint;
      negotiateCredit.push(item);
    } else if (decision === 'request_repair') {
      requestRepair.push(item);
    } else {
      acceptAsIs.push(item);
    }
  }

  return {
    report: { id: reportId, inspectionDate: report.inspectionDate, inspectorName: report.inspectorName, inspectorCompany: report.inspectorCompany },
    negotiateCredit,
    requestRepair,
    acceptAsIs,
    requestedCreditTotalCents: creditTotal,
    requestedCreditTotalDollars: (creditTotal / 100).toFixed(2),
  };
}

// ── Seller fix / disclose (PRE_LISTING) ───────────────────────────────────────

export async function getFixDisclosureDecisions(reportId: string, propertyId: string) {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    select: { reportType: true, propertyId: true, status: true },
  });
  if (!report || report.propertyId !== propertyId) throw new APIError('Report not found', 404, 'NOT_FOUND');
  if (report.status !== 'CONFIRMED') {
    throw new APIError('Confirm the inspection report before making fix or disclosure decisions', 409, 'REPORT_NOT_CONFIRMED');
  }
  if (report.reportType !== 'PRE_LISTING') {
    throw new APIError('Fix/disclose is only available for PRE_LISTING reports', 400, 'INVALID_REPORT_TYPE');
  }

  const findings = await prisma.inspectionFinding.findMany({
    where: { reportId, status: { in: ['OPEN', 'RESOLVED'] } },
    orderBy: [{ severity: 'asc' }],
  });

  return findings.map((f) => ({
    findingId: f.id,
    homeSystem: f.homeSystem,
    subsystem: f.subsystem,
    severity: f.severity,
    inspectorDescription: f.inspectorDescription,
    aiInterpretation: f.aiInterpretation,
    estimatedCostCentsLow: f.estimatedCostCentsLow,
    estimatedCostCentsHigh: f.estimatedCostCentsHigh,
    status: f.status,
    // fix-disclose decision is stored in resolutionNotes as JSON
    fixDisclosureDecision: _parseFixDisclosure(f.resolutionNotes),
  }));
}

export async function saveFixDisclosureDecisions(
  reportId: string,
  propertyId: string,
  decisions: Array<{
    findingId: string;
    decision: 'FIX' | 'DISCLOSE_PRICE_ADJUST' | 'DISCLOSE_CREDIT';
    estimatedFixCostCents?: number;
    sellerNote?: string;
  }>,
) {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    select: { reportType: true, propertyId: true, status: true },
  });
  if (!report || report.propertyId !== propertyId) throw new APIError('Report not found', 404, 'NOT_FOUND');
  if (report.status !== 'CONFIRMED') {
    throw new APIError('Confirm the inspection report before saving fix or disclosure decisions', 409, 'REPORT_NOT_CONFIRMED');
  }
  if (report.reportType !== 'PRE_LISTING') {
    throw new APIError('Fix/disclose is only available for PRE_LISTING reports', 400, 'INVALID_REPORT_TYPE');
  }

  await Promise.all(
    decisions.map(async (d) => {
      const finding = await prisma.inspectionFinding.findUnique({
        where: { id: d.findingId },
        select: { reportId: true, propertyId: true },
      });
      if (!finding || finding.reportId !== reportId || finding.propertyId !== propertyId) return;

      await prisma.inspectionFinding.update({
        where: { id: d.findingId },
        data: {
          resolutionNotes: JSON.stringify({
            fixDisclosure: d.decision,
            estimatedFixCostCents: d.estimatedFixCostCents,
            sellerNote: d.sellerNote,
          }),
        },
      });
    }),
  );

  return { saved: decisions.length };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _syncOpenFindingsCount(reportId: string) {
  const openCount = await prisma.inspectionFinding.count({
    where: { reportId, status: 'OPEN' },
  });
  await prisma.inspectionReport.update({
    where: { id: reportId },
    data: { openFindings: openCount },
  });
}

function _parseFixDisclosure(notes: string | null): Record<string, unknown> | null {
  if (!notes) return null;
  try {
    return JSON.parse(notes);
  } catch {
    return null;
  }
}
