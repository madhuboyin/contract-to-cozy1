// apps/backend/src/sellerPrep/reports/sellerReadiness.builder.ts
import { prisma } from '../../lib/prisma';
import { SellerReadinessReport } from './sellerReadiness.types';
import { resolveCompsProvider } from '../providers/compsResolver';
import { getPlanningContextDecisions } from '../../services/planningContext/context';

export async function buildSellerReadinessReport(
  userId: string,
  propertyId: string
): Promise<SellerReadinessReport> {

  const plan = await prisma.sellerPrepPlan.findFirst({
    where: { userId, propertyId },
    include: { items: true },
  });

  // Sale readiness is judged against current open-work and coverage context.
  const planning = await getPlanningContextDecisions(propertyId, userId, 'SELLER_PREP');
  const saleReadiness = planning.decisions.saleReadiness;

  const items = plan?.items ?? [];
  const total = items.length;
  const completed = items.filter(i => i.status === 'DONE').length;
  const highRemaining = items.filter(
    i => i.priority === 'HIGH' && i.status !== 'DONE'
  ).length;

  // Explicit rank, not a lexical sort — 'HIGH' < 'LOW' < 'MEDIUM'
  // alphabetically would put LOW ahead of MEDIUM.
  const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const topActions = [...items]
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99))
    .slice(0, 5);

  return {
    propertyId,
    saleIntentConfirmed: Boolean(plan),
    summary: {
      completionPercent: total
        ? Math.round((completed / total) * 100)
        : 0,
      highPriorityRemaining: highRemaining,
    },
    topActions,
    comparables: {
      available: false,
      source: 'PUBLIC_RECORDS / MARKET_TRENDS',
      note: 'Comparable availability varies by location',
    },
    disclaimers: [
      'Estimates are based on historical data and public records.',
      'Actual sale price may vary due to market conditions.',
      'This report is for informational purposes only.',
      ...(saleReadiness.status !== 'APPLICABLE'
        ? ['Open-work and coverage context is incomplete; readiness confidence is reduced.']
        : []),
    ],
    saleReadiness: {
      status: saleReadiness.status,
      reasonCodes: saleReadiness.reasonCodes,
      missingFactKeys: saleReadiness.missingFactKeys,
      contextVersion: planning.contextVersion,
    },
  };
}
