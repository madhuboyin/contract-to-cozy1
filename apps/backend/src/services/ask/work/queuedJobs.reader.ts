import type { HomeReportExportStatus, HomeReportExportType, HomeScoreExportFormat, HomeScoreExportJobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import { compareAskWorkRows, type AskWorkProviderReader, type AskWorkRow } from '../askWork.contract';
import { ASK_WORK_LISTING_RETENTION_DAYS, listingCutoff } from './askWorkRetention';
import { afterBoundaryWhere, countViews, workLaunch } from './askWorkRowSupport';

const REPORT_PREFIX = 'job:reportExport:';
const SCORE_PREFIX = 'job:scoreExport:';
const SERVED: readonly AskWorkLifecycleView[] = ['NEEDS_YOU', 'ACTIVE', 'WAITING', 'COMPLETED', 'ARCHIVED'];

const REPORT_TYPE_LABELS: Record<HomeReportExportType, string> = {
  HOME_SUMMARY: 'Home summary', INVENTORY: 'Inventory', MAINTENANCE_HISTORY: 'Maintenance history', COVERAGE_SNAPSHOT: 'Coverage snapshot', HOME_REPORT_PACK: 'Home report pack',
};
const REPORT_STATUS_LABELS: Record<HomeReportExportStatus, string> = {
  PENDING: 'Queued', GENERATING: 'Being prepared', READY: 'Ready', FAILED: 'Did not finish', EXPIRED: 'Expired', DELETED: 'Deleted',
};
const SCORE_STATUS_LABELS: Record<HomeScoreExportJobStatus, string> = { QUEUED: 'Queued', RUNNING: 'Being prepared', DONE: 'Ready', FAILED: 'Did not finish' };

/** A failed export needs the homeowner; a queued one waits; one being prepared is active; a ready one that has not expired is completed. Deleted exports are gone. */
export function reportExportView(status: HomeReportExportStatus, expiresAt: Date | null, deletedAt: Date | null, now: Date): AskWorkLifecycleView | null {
  if (deletedAt || status === 'DELETED') return null;
  switch (status) {
    case 'FAILED': return 'NEEDS_YOU';
    case 'PENDING': return 'WAITING';
    case 'GENERATING': return 'ACTIVE';
    case 'READY': return expiresAt && expiresAt <= now ? 'ARCHIVED' : 'COMPLETED';
    default: return 'ARCHIVED';
  }
}

export function scoreExportView(status: HomeScoreExportJobStatus): AskWorkLifecycleView {
  return status === 'FAILED' ? 'NEEDS_YOU' : status === 'QUEUED' ? 'WAITING' : status === 'RUNNING' ? 'ACTIVE' : 'COMPLETED';
}

function reportWhere(view: AskWorkLifecycleView, now: Date): Prisma.HomeReportExportWhereInput {
  const live: Prisma.HomeReportExportWhereInput = { deletedAt: null };
  const unexpired: Prisma.HomeReportExportWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  switch (view) {
    case 'NEEDS_YOU': return { ...live, status: 'FAILED' };
    case 'WAITING': return { ...live, status: 'PENDING' };
    case 'ACTIVE': return { ...live, status: 'GENERATING' };
    case 'COMPLETED': return { AND: [live, { status: 'READY' }, unexpired] };
    case 'ARCHIVED': return { AND: [live, { expiresAt: { gt: listingCutoff(ASK_WORK_LISTING_RETENTION_DAYS.reportExportsExpiredHistory, now) } }, { OR: [{ status: 'EXPIRED' }, { status: 'READY', expiresAt: { lte: now } }] }] };
    default: return { id: { in: [] } };
  }
}

const SCORE_STATUSES: Partial<Record<AskWorkLifecycleView, HomeScoreExportJobStatus[]>> = { NEEDS_YOU: ['FAILED'], WAITING: ['QUEUED'], ACTIVE: ['RUNNING'], COMPLETED: ['DONE'] };
function scoreWhere(view: AskWorkLifecycleView, now: Date): Prisma.HomeScoreExportJobWhereInput {
  const statuses = SCORE_STATUSES[view];
  if (!statuses) return { id: { in: [] } };
  return view === 'COMPLETED' ? { jobStatus: { in: statuses }, createdAt: { gte: listingCutoff(ASK_WORK_LISTING_RETENTION_DAYS.scoreExportsCompleted, now) } } : { jobStatus: { in: statuses } };
}

interface ReportRecord { id: string; propertyId: string; type: HomeReportExportType; status: HomeReportExportStatus; requestedAt: Date; expiresAt: Date | null; deletedAt: Date | null }
interface ScoreRecord { id: string; jobStatus: HomeScoreExportJobStatus; format: HomeScoreExportFormat; createdAt: Date }

export function reportExportRow(report: ReportRecord, now: Date): AskWorkRow | null {
  const lifecycleView = reportExportView(report.status, report.expiresAt, report.deletedAt, now);
  if (!lifecycleView) return null;
  const sortAt = report.requestedAt.toISOString();
  return {
    workKey: `${REPORT_PREFIX}${report.id}`,
    sourceAliases: [],
    providerId: 'QUEUED_JOBS',
    workType: 'QUEUED_JOB',
    propertyId: report.propertyId,
    entity: { type: 'HOME_REPORT_EXPORT', id: report.id },
    title: `${REPORT_TYPE_LABELS[report.type]} report`,
    summary: null,
    status: { canonical: report.status, label: REPORT_STATUS_LABELS[report.status] },
    lifecycleView,
    nextAction: lifecycleView === 'NEEDS_YOU' ? { label: 'Request this report again', operationId: null, allowed: true } : lifecycleView === 'COMPLETED' ? { label: 'Open the report', operationId: null, allowed: true } : null,
    sortAt,
    dueAt: report.expiresAt && lifecycleView === 'COMPLETED' ? report.expiresAt.toISOString() : null,
    freshness: { version: report.status, asOf: sortAt },
    sourceOwner: 'workers',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ entityType: 'HOME_REPORT_EXPORT', entityId: report.id, contextVersion: report.status }) },
  };
}

export function scoreExportRow(job: ScoreRecord, propertyId: string): AskWorkRow {
  const sortAt = job.createdAt.toISOString();
  return {
    workKey: `${SCORE_PREFIX}${job.id}`,
    sourceAliases: [],
    providerId: 'QUEUED_JOBS',
    workType: 'QUEUED_JOB',
    propertyId,
    entity: { type: 'HOME_SCORE_EXPORT_JOB', id: job.id },
    title: `Home score report (${job.format})`,
    summary: null,
    status: { canonical: job.jobStatus, label: SCORE_STATUS_LABELS[job.jobStatus] },
    lifecycleView: scoreExportView(job.jobStatus),
    nextAction: job.jobStatus === 'FAILED' ? { label: 'Request this report again', operationId: null, allowed: true } : job.jobStatus === 'DONE' ? { label: 'Open the report', operationId: null, allowed: true } : null,
    sortAt,
    freshness: { version: job.jobStatus, asOf: sortAt },
    sourceOwner: 'workers',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ entityType: 'HOME_SCORE_EXPORT_JOB', entityId: job.id, contextVersion: job.jobStatus }) },
  };
}

/**
 * Report and score export jobs the caller requested for this home (FR-WORK-001 long-running or queued jobs). Both tables are read by the
 * caller's own request, merged on the shared order, and counted together. Read-only.
 */
export const readQueuedJobWork: AskWorkProviderReader = async (context, query) => {
  const now = new Date();
  const reportBase: Prisma.HomeReportExportWhereInput = { userId: context.userId, propertyId: context.propertyId };
  const scoreBase: Prisma.HomeScoreExportJobWhereInput = { requestedByUserId: context.userId, report: { propertyId: context.propertyId } };
  const reportStatus: Prisma.HomeReportExportWhereInput = query.status ? { status: query.status as HomeReportExportStatus } : {};
  const scoreStatus: Prisma.HomeScoreExportJobWhereInput = query.status ? { jobStatus: query.status as HomeScoreExportJobStatus } : {};
  // Text search matches the kind of report ("inventory", "coverage") or the words that name any export or score report.
  const needle = (query.search ?? '').toLowerCase();
  const exportWords = needle !== '' && ['report', 'export', 'download'].some((word) => word.includes(needle) || needle.includes(word));
  const reportTypes = (Object.entries(REPORT_TYPE_LABELS) as Array<[HomeReportExportType, string]>).filter(([, label]) => label.toLowerCase().includes(needle)).map(([type]) => type);
  const scoreMatches = needle === '' || exportWords || ['home score', 'score', 'pdf', 'json'].some((word) => word.includes(needle) || needle.includes(word));
  const reportSearch: Prisma.HomeReportExportWhereInput[] = needle && !exportWords ? [{ type: { in: reportTypes } }] : [];
  const reportInView: Prisma.HomeReportExportWhereInput = query.entityId ? { AND: [reportBase, { id: query.entityId }] } : { AND: [reportBase, query.allViews ? { status: { in: ['PENDING', 'GENERATING', 'READY', 'FAILED', 'EXPIRED'] }, deletedAt: null } : reportWhere(query.view, now), reportStatus, ...reportSearch] };
  const scoreInView: Prisma.HomeScoreExportJobWhereInput = query.entityId ? { AND: [scoreBase, { id: query.entityId }] } : { AND: [scoreBase, query.allViews ? {} : scoreWhere(query.view, now), scoreStatus, ...(scoreMatches ? [] : [{ id: { in: [] as string[] } }])] };
  const [reports, scores, reportTotal, scoreTotal, reportCounts, scoreCounts] = await Promise.all([
    prisma.homeReportExport.findMany({
      where: afterBoundaryWhere(reportInView, query.after, REPORT_PREFIX, 'requestedAt'),
      select: { id: true, propertyId: true, type: true, status: true, requestedAt: true, expiresAt: true, deletedAt: true },
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.homeScoreExportJob.findMany({
      where: afterBoundaryWhere(scoreInView, query.after, SCORE_PREFIX, 'createdAt'),
      select: { id: true, jobStatus: true, format: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.homeReportExport.count({ where: reportInView }),
    prisma.homeScoreExportJob.count({ where: scoreInView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.homeReportExport.count({ where: { AND: [reportBase, reportWhere(view, now)] } })),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.homeScoreExportJob.count({ where: { AND: [scoreBase, scoreWhere(view, now)] } })),
  ]);
  const rows = [
    ...reports.flatMap((report) => { const row = reportExportRow(report, now); return row ? [row] : []; }),
    ...scores.map((job) => scoreExportRow(job, context.propertyId)),
  ].sort(compareAskWorkRows).slice(0, query.limit);
  const viewCounts: Partial<Record<AskWorkLifecycleView, number>> = {};
  for (const view of ASK_WORK_LIFECYCLE_VIEWS) viewCounts[view] = (reportCounts[view] ?? 0) + (scoreCounts[view] ?? 0);
  return { rows, total: reportTotal + scoreTotal, viewCounts };
};
