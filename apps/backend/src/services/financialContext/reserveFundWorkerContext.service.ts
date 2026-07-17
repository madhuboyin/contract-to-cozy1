import { prisma } from '../../lib/prisma';
import { getFinancialContextDecisions } from './context';

export interface ReserveFundWorkerContextResult {
  allowed: boolean;
  contextVersion: string | null;
  userId: string | null;
  reasonCodes: string[];
}

function snapshotContextVersion(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>)._propertyContextVersion;
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function checkReserveFundWorkerContext(
  propertyId: string,
  options: { requireCurrentFund?: boolean; requireCurrentTimeline?: boolean } = {},
): Promise<ReserveFundWorkerContextResult> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { homeownerProfile: { select: { userId: true } } },
  });
  const userId = property?.homeownerProfile?.userId ?? null;
  if (!userId) {
    return {
      allowed: false,
      contextVersion: null,
      userId: null,
      reasonCodes: ['PROPERTY_OWNER_CONTEXT_UNAVAILABLE'],
    };
  }

  const reserveContext = await getFinancialContextDecisions(propertyId, userId, 'RESERVE_FUND');
  if (reserveContext.decisions.reservePlanning.status !== 'APPLICABLE') {
    return {
      allowed: false,
      contextVersion: reserveContext.contextVersion,
      userId,
      reasonCodes: reserveContext.decisions.reservePlanning.reasonCodes,
    };
  }

  if (options.requireCurrentFund) {
    const fund = await prisma.homeReserveFund.findUnique({
      where: { propertyId },
      select: { propertyContextVersion: true },
    });
    if (!fund?.propertyContextVersion || fund.propertyContextVersion !== reserveContext.contextVersion) {
      return {
        allowed: false,
        contextVersion: reserveContext.contextVersion,
        userId,
        reasonCodes: ['RESERVE_FUND_CONTEXT_STALE'],
      };
    }
  }

  if (options.requireCurrentTimeline) {
    const [capitalContext, timeline] = await Promise.all([
      getFinancialContextDecisions(propertyId, userId, 'CAPITAL_TIMELINE'),
      prisma.homeCapitalTimelineAnalysis.findFirst({
        where: { propertyId, status: 'READY' },
        orderBy: { computedAt: 'desc' },
        select: { inputsSnapshot: true },
      }),
    ]);
    if (
      capitalContext.decisions.capitalPlanning.status !== 'APPLICABLE' ||
      snapshotContextVersion(timeline?.inputsSnapshot) !== capitalContext.contextVersion
    ) {
      return {
        allowed: false,
        contextVersion: reserveContext.contextVersion,
        userId,
        reasonCodes: ['CAPITAL_TIMELINE_CONTEXT_STALE'],
      };
    }
  }

  return {
    allowed: true,
    contextVersion: reserveContext.contextVersion,
    userId,
    reasonCodes: ['RESERVE_FUND_WORKER_CONTEXT_APPLICABLE'],
  };
}
