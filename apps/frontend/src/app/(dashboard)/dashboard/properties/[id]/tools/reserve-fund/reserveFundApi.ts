// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/reserveFundApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/PropertyContextNotice';

export type ReserveFundPosture = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
export type ReserveFundLineItemStatus = 'ACTIVE' | 'FUNDED' | 'RETIRED' | 'OVERDUE';
export type ReserveFundContributionType = 'DEPOSIT' | 'WITHDRAWAL' | 'BALANCE_CORRECTION';
export type ReserveFundRetiredReason = 'LINKED_HOME_EVENT' | 'MATCHED_EXPENSE' | 'MANUAL' | null;

export type ReserveFundDTO = {
  id: string;
  propertyId: string;
  posture: ReserveFundPosture;
  horizonYears: number;
  currentBalanceCents: number;
  recommendedMonthlyContributionCents: number;
  currentShortfallCents: number;
  lastRecalculatedAt: string | null;
  isActive: boolean;
  propertyContextVersion?: string | null;
};

export type ReserveFundResult = {
  fund: ReserveFundDTO;
  propertyContext?: PropertyContextEnvelope;
};

export type TimelineItemSummary = {
  id: string;
  inventoryItemId: string | null;
  category: string;
  eventType: string;
  windowStart: string;
  windowEnd: string;
  estimatedCostMinCents: number | null;
  estimatedCostMaxCents: number | null;
  why: string;
  inventoryItem?: {
    name: string;
    condition: string;
    installedOn: string | null;
    purchasedOn: string | null;
  } | null;
};

export type ReserveFundLineItemDTO = {
  id: string;
  fundId: string;
  timelineItemId: string;
  status: ReserveFundLineItemStatus;
  targetCostCents: number;
  allocatedMonthlyCents: number;
  allocatedBalanceCents: number;
  retiredAt: string | null;
  retiredReason: ReserveFundRetiredReason;
  retiredEvidenceRef: string | null;
  timelineItem: TimelineItemSummary;
};

export type ReserveFundContributionDTO = {
  id: string;
  fundId: string;
  type: ReserveFundContributionType;
  amountCents: number;
  occurredAt: string;
  note: string | null;
  linkedExpenseId: string | null;
  linkedLineItemId: string | null;
};

export type ReconciliationSuggestionDTO = {
  lineItemId: string;
  timelineItemId: string;
  category: string;
  targetCostCents: number;
  expenseId: string;
  expenseDescription: string;
  expenseAmount: number;
  expenseDate: string;
};

export async function getFund(propertyId: string): Promise<ReserveFundResult> {
  const res = await api.get(`/api/properties/${propertyId}/reserve-fund`);
  return {
    fund: res.data?.fund as ReserveFundDTO,
    propertyContext: res.data?.propertyContext as PropertyContextEnvelope | undefined,
  };
}

export async function updateFund(
  propertyId: string,
  body: { posture?: ReserveFundPosture; isActive?: boolean }
): Promise<ReserveFundResult> {
  const res = await api.patch(`/api/properties/${propertyId}/reserve-fund`, body);
  return {
    fund: res.data?.fund as ReserveFundDTO,
    propertyContext: res.data?.propertyContext as PropertyContextEnvelope | undefined,
  };
}

export async function recalculateFund(propertyId: string): Promise<ReserveFundResult> {
  const res = await api.post(`/api/properties/${propertyId}/reserve-fund/recalculate`);
  return {
    fund: res.data?.fund as ReserveFundDTO,
    propertyContext: res.data?.propertyContext as PropertyContextEnvelope | undefined,
  };
}

export async function listLineItems(
  propertyId: string,
  filters?: { status?: ReserveFundLineItemStatus }
): Promise<ReserveFundLineItemDTO[]> {
  const res = await api.get(`/api/properties/${propertyId}/reserve-fund/line-items`, {
    params: filters,
  });
  return (res.data?.lineItems as ReserveFundLineItemDTO[]) ?? [];
}

export async function retireLineItem(
  propertyId: string,
  lineItemId: string,
  evidenceRef?: string | null
): Promise<ReserveFundLineItemDTO> {
  const res = await api.post(
    `/api/properties/${propertyId}/reserve-fund/line-items/${lineItemId}/retire`,
    { evidenceRef: evidenceRef ?? null }
  );
  return res.data?.lineItem as ReserveFundLineItemDTO;
}

export async function listContributions(
  propertyId: string,
  params?: { limit?: number; cursor?: string }
): Promise<{ items: ReserveFundContributionDTO[]; nextCursor?: string }> {
  const res = await api.get(`/api/properties/${propertyId}/reserve-fund/contributions`, {
    params,
  });
  return {
    items: (res.data?.items as ReserveFundContributionDTO[]) ?? [],
    nextCursor: res.data?.nextCursor as string | undefined,
  };
}

export async function addContribution(
  propertyId: string,
  body: {
    type: ReserveFundContributionType;
    amountCents: number;
    occurredAt?: string;
    note?: string | null;
    linkedExpenseId?: string | null;
    linkedLineItemId?: string | null;
  }
): Promise<ReserveFundContributionDTO> {
  const res = await api.post(`/api/properties/${propertyId}/reserve-fund/contributions`, body);
  return res.data?.contribution as ReserveFundContributionDTO;
}

export async function removeContribution(propertyId: string, contributionId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/reserve-fund/contributions/${contributionId}`);
}

export async function listReconciliationSuggestions(
  propertyId: string
): Promise<ReconciliationSuggestionDTO[]> {
  const res = await api.get(`/api/properties/${propertyId}/reserve-fund/reconciliation-suggestions`);
  return (res.data?.suggestions as ReconciliationSuggestionDTO[]) ?? [];
}

export async function acceptReconciliationMatch(
  propertyId: string,
  lineItemId: string,
  expenseId: string
): Promise<ReserveFundLineItemDTO> {
  const res = await api.post(
    `/api/properties/${propertyId}/reserve-fund/reconciliation-suggestions/accept`,
    { lineItemId, expenseId }
  );
  return res.data?.lineItem as ReserveFundLineItemDTO;
}
