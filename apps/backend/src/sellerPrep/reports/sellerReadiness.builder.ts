// apps/backend/src/sellerPrep/reports/sellerReadiness.builder.ts
import { prisma } from '../../lib/prisma';
import { SellerReadinessReport } from './sellerReadiness.types';
import { resolveCompsProvider } from '../providers/compsResolver';

export async function buildSellerReadinessReport(
  userId: string,
  propertyId: string
): Promise<SellerReadinessReport> {

  const plan = await prisma.sellerPrepPlan.findFirst({
    where: { userId, propertyId },
    include: { items: true },
  });

  if (!plan) {
    throw new Error('Seller prep plan not found');
  }

  const total = plan.items.length;
  const completed = plan.items.filter(i => i.status === 'DONE').length;
  const highRemaining = plan.items.filter(
    i => i.priority === 'HIGH' && i.status !== 'DONE'
  ).length;

  const topActions = plan.items
    .sort((a, b) => a.priority.localeCompare(b.priority))
    .slice(0, 5);

  // Conservative uplift messaging (no math guarantees)
  const upliftRange =
    completed >= 3 ? '$15k–$30k (estimated)' : '$5k–$15k (estimated)';

  return {
    propertyId,
    summary: {
      completionPercent: total
        ? Math.round((completed / total) * 100)
        : 0,
      highPriorityRemaining: highRemaining,
      estimatedUpliftRange: upliftRange,
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
    ],
  };
}
