import { api } from '@/lib/api/client';
import type {
  PropertySaleCase,
  PropertyTransition,
  SaleCaseOverview,
  SaleCaseStatus,
  SaleReadinessItem,
  SaleTransitionRetentionDecision,
} from './types';

export async function getSaleCase(propertyId: string): Promise<SaleCaseOverview> {
  const res = await api.get<SaleCaseOverview>(`/api/properties/${propertyId}/sale-case`);
  return res.data;
}

export async function createSaleCase(propertyId: string): Promise<PropertySaleCase> {
  const res = await api.post<{ saleCase: PropertySaleCase }>(`/api/properties/${propertyId}/sale-case`, {});
  return res.data.saleCase;
}

// Sale Readiness gates on a single property attribute (propertyUse === 'FOR_SALE').
// Confirming intent inline just flips that one field via the existing property
// update endpoint, instead of routing the homeowner through the full property
// edit form for what is really a one-field decision.
export async function confirmSaleIntent(propertyId: string): Promise<void> {
  await api.updateProperty(propertyId, { propertyUse: 'FOR_SALE' });
}

export async function updateTargetDates(
  propertyId: string,
  input: { targetListDate?: string | null; targetCloseDate?: string | null },
): Promise<PropertySaleCase> {
  const res = await api.patch<{ saleCase: PropertySaleCase }>(`/api/properties/${propertyId}/sale-case/dates`, input);
  return res.data.saleCase;
}

export async function transitionStatus(propertyId: string, status: SaleCaseStatus): Promise<PropertySaleCase> {
  const res = await api.patch<{ saleCase: PropertySaleCase }>(`/api/properties/${propertyId}/sale-case/status`, { status });
  return res.data.saleCase;
}

export async function setItemDecision(
  propertyId: string,
  itemId: string,
  action: 'WAIVE' | 'REOPEN',
  reason?: string,
): Promise<SaleReadinessItem> {
  const res = await api.patch<{ item: SaleReadinessItem }>(
    `/api/properties/${propertyId}/sale-case/items/${itemId}`,
    { action, reason },
  );
  return res.data.item;
}

type TransitionInput = {
  effectiveAt?: string | null;
  sellerRetentionDecision?: SaleTransitionRetentionDecision | null;
  sellerRetentionNotes?: string | null;
  buyerPackageId?: string | null;
};

export async function recordTransition(propertyId: string, input: TransitionInput): Promise<PropertyTransition> {
  const res = await api.post<{ transition: PropertyTransition }>(`/api/properties/${propertyId}/sale-case/transitions`, input);
  return res.data.transition;
}

export async function updateTransition(
  propertyId: string,
  transitionId: string,
  input: TransitionInput,
): Promise<PropertyTransition> {
  const res = await api.patch<{ transition: PropertyTransition }>(
    `/api/properties/${propertyId}/sale-case/transitions/${transitionId}`,
    input,
  );
  return res.data.transition;
}

// Minimal local shape of what /property-briefs returns — kept independent
// of the property-brief tool's own api module so these two tool
// directories stay self-contained rather than cross-importing.
type PropertyBriefListEntry = {
  id: string;
  title: string;
  purpose: string;
  shares: Array<{
    id: string;
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
    invitationStatus: 'NOT_SET' | 'PENDING' | 'ACCEPTED';
    acceptedAt: string | null;
    recipientName: string | null;
  }>;
};

export type BuyerPackageShareOption = {
  shareId: string;
  briefTitle: string;
  invitationStatus: 'NOT_SET' | 'PENDING' | 'ACCEPTED';
  acceptedAt: string | null;
  recipientName: string | null;
};

export type RevocableShareOption = {
  shareId: string;
  briefTitle: string;
  purpose: string;
};

async function listActivePropertyBriefShares(propertyId: string): Promise<Array<{ briefId: string; briefTitle: string; purpose: string; share: PropertyBriefListEntry['shares'][number] }>> {
  const res = await api.get<PropertyBriefListEntry[]>(`/api/properties/${propertyId}/property-briefs`);
  const briefs = res.data ?? [];
  return briefs.flatMap((brief) =>
    brief.shares
      .filter((share) => share.status === 'ACTIVE')
      .map((share) => ({ briefId: brief.id, briefTitle: brief.title, purpose: brief.purpose, share })));
}

export async function listBuyerPackageShares(propertyId: string): Promise<BuyerPackageShareOption[]> {
  const active = await listActivePropertyBriefShares(propertyId);
  return active
    .filter((entry) => entry.purpose === 'PROSPECTIVE_BUYER')
    .map((entry) => ({
      shareId: entry.share.id,
      briefTitle: entry.briefTitle,
      invitationStatus: entry.share.invitationStatus,
      acceptedAt: entry.share.acceptedAt,
      recipientName: entry.share.recipientName,
    }));
}

export async function listRevocableShares(propertyId: string): Promise<RevocableShareOption[]> {
  const active = await listActivePropertyBriefShares(propertyId);
  return active
    .filter((entry) => entry.purpose !== 'PROSPECTIVE_BUYER')
    .map((entry) => ({ shareId: entry.share.id, briefTitle: entry.briefTitle, purpose: entry.purpose }));
}

export async function completeTransition(
  propertyId: string,
  transitionId: string,
  revokeShareIds?: string[],
): Promise<{ transition: PropertyTransition; revokeResults: Array<{ shareId: string; revoked: boolean; error?: string }> }> {
  const res = await api.post<{ transition: PropertyTransition; revokeResults: Array<{ shareId: string; revoked: boolean; error?: string }> }>(
    `/api/properties/${propertyId}/sale-case/transitions/${transitionId}/complete`,
    { revokeShareIds },
  );
  return res.data;
}
