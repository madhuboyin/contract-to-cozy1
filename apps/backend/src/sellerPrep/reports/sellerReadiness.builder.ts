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
  });

  // Sale readiness is judged against current open-work and coverage context.
  const planning = await getPlanningContextDecisions(propertyId, userId, 'SELLER_PREP');
  const saleReadiness = planning.decisions.saleReadiness;

  // The static ROI checklist (SellerPrepPlanItem) this summary/topActions
  // block used to compute from is retired — see the comment in
  // sellerPrep.service.ts. PropertySaleCase's SaleReadinessItem projection
  // is the real governed replacement; this report doesn't consume it yet.
  return {
    propertyId,
    saleIntentConfirmed: Boolean(plan),
    summary: {
      completionPercent: 0,
      highPriorityRemaining: 0,
    },
    topActions: [],
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
