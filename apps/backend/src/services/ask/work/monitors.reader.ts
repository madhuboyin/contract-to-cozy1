import type { Prisma, RefinanceRateMonitorProduct, RefinanceRateMonitorStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView } from '../governance/askWorkProviderRegistry';
import type { AskWorkProviderReader, AskWorkRow } from '../askWork.contract';
import { afterBoundaryWhere, countViews, workLaunch } from './askWorkRowSupport';

const KEY_PREFIX = 'monitor:refinanceRate:';
const SERVED: readonly AskWorkLifecycleView[] = ['ACTIVE', 'WAITING'];

const PRODUCT_LABELS: Record<RefinanceRateMonitorProduct, string> = { FIXED_30_YEAR: '30-year fixed', FIXED_15_YEAR: '15-year fixed' };
const STATUS_LABELS: Partial<Record<RefinanceRateMonitorStatus, string>> = { ACTIVE: 'Watching', PAUSED: 'Paused' };

/**
 * The caller's refinance rate monitors that can still notify or be resumed, the same set the monitor service lists. A watching monitor is
 * active; a paused one waits for the homeowner to resume it. A stopped monitor is final and is not work. Home deadline reminders are not
 * separate monitors: the canonical dated task drives them, so they surface as home work items.
 */
export function monitorLifecycleView(status: RefinanceRateMonitorStatus): AskWorkLifecycleView | null {
  return status === 'ACTIVE' ? 'ACTIVE' : status === 'PAUSED' ? 'WAITING' : null;
}

function viewWhere(view: AskWorkLifecycleView): Prisma.RefinanceRateMonitorWhereInput {
  return view === 'ACTIVE' ? { status: 'ACTIVE' } : view === 'WAITING' ? { status: 'PAUSED' } : { id: { in: [] } };
}

interface MonitorRecord {
  id: string;
  propertyId: string;
  product: RefinanceRateMonitorProduct;
  thresholdBps: number;
  status: RefinanceRateMonitorStatus;
  confirmationVersion: number;
  updatedAt: Date;
}

export function monitorRow(monitor: MonitorRecord): AskWorkRow | null {
  const lifecycleView = monitorLifecycleView(monitor.status);
  if (!lifecycleView) return null;
  const sortAt = monitor.updatedAt.toISOString();
  return {
    workKey: `${KEY_PREFIX}${monitor.id}`,
    sourceAliases: [],
    providerId: 'MONITORS',
    workType: 'MONITOR',
    propertyId: monitor.propertyId,
    entity: { type: 'REFINANCE_RATE_MONITOR', id: monitor.id },
    title: `Refinance rate alert · ${PRODUCT_LABELS[monitor.product]}`,
    summary: `Alert threshold ${(monitor.thresholdBps / 100).toFixed(2)}%`,
    status: { canonical: monitor.status, label: STATUS_LABELS[monitor.status] ?? monitor.status },
    lifecycleView,
    nextAction: monitor.status === 'PAUSED' ? { label: 'Resume or stop this alert', operationId: null, allowed: true } : null,
    sortAt,
    freshness: { version: String(monitor.confirmationVersion), asOf: sortAt },
    sourceOwner: 'monitors',
    resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: workLaunch({ operationId: 'REFINANCE_RATE_MONITOR', entityType: 'REFINANCE_RATE_MONITOR', entityId: monitor.id, contextVersion: String(monitor.confirmationVersion) }) },
  };
}

/** Monitors are per user and per home, so only the caller's own are read. */
export const readMonitorWork: AskWorkProviderReader = async (context, query) => {
  const base: Prisma.RefinanceRateMonitorWhereInput = { userId: context.userId, propertyId: context.propertyId };
  const statusFilter: Prisma.RefinanceRateMonitorWhereInput = query.status ? { status: query.status as RefinanceRateMonitorStatus } : {};
  const inView: Prisma.RefinanceRateMonitorWhereInput  = query.entityId ? { AND: [base, { id: query.entityId }] } : { AND: [base, viewWhere(query.view), statusFilter] };
  const [monitors, total, viewCounts] = await Promise.all([
    prisma.refinanceRateMonitor.findMany({
      where: afterBoundaryWhere(inView, query.after, KEY_PREFIX),
      select: { id: true, propertyId: true, product: true, thresholdBps: true, status: true, confirmationVersion: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    }),
    prisma.refinanceRateMonitor.count({ where: inView }),
    countViews(ASK_WORK_LIFECYCLE_VIEWS, SERVED, (view) => prisma.refinanceRateMonitor.count({ where: { AND: [base, viewWhere(view)] } })),
  ]);
  return { rows: monitors.flatMap((monitor) => { const row = monitorRow(monitor); return row ? [row] : []; }), total, viewCounts };
};
