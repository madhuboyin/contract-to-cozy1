import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

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
      where: { propertyId, status: 'OPEN' },
    }),
    prisma.inspectionFinding.count({
      where: { propertyId, status: 'OPEN', severity: 'SAFETY' },
    }),
    prisma.inspectionFinding.count({
      where: { propertyId, status: 'OPEN', severity: 'MAJOR' },
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
    select: { id: true, propertyId: true, reportId: true, status: true },
  });
  if (!finding || finding.propertyId !== propertyId) {
    throw new APIError('Finding not found', 404, 'NOT_FOUND');
  }
  if (finding.status === 'RESOLVED') {
    throw new APIError('Finding already resolved', 409, 'ALREADY_RESOLVED');
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
    select: { reportType: true, propertyId: true, inspectionDate: true, inspectorName: true, inspectorCompany: true },
  });
  if (!report || report.propertyId !== propertyId) throw new APIError('Report not found', 404, 'NOT_FOUND');
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
    select: { reportType: true, propertyId: true },
  });
  if (!report || report.propertyId !== propertyId) throw new APIError('Report not found', 404, 'NOT_FOUND');
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
    select: { reportType: true, propertyId: true },
  });
  if (!report || report.propertyId !== propertyId) throw new APIError('Report not found', 404, 'NOT_FOUND');
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
