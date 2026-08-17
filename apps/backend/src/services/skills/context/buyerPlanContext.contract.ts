import type { BuyerClosingHomeOverview, BuyerDashboardPresentationMode } from '../../../productFramework/buyerAcquisition.contract';

export const BUYER_PLAN_CONTEXT_PROVIDER = Object.freeze({
  id: 'buyer.plan-context',
  version: '1.0.0',
});

export interface BuyerPlanContext {
  propertyId: string;
  presentationMode: BuyerDashboardPresentationMode;
  overview: BuyerClosingHomeOverview | null;
  contextVersion: string;
}
