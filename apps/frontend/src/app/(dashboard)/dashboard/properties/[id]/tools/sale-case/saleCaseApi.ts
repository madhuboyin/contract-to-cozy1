import { api } from '@/lib/api/client';
import type { PropertySaleCase, SaleCaseOverview, SaleCaseStatus, SaleReadinessItem } from './types';

export async function getSaleCase(propertyId: string): Promise<SaleCaseOverview> {
  const res = await api.get<SaleCaseOverview>(`/api/properties/${propertyId}/sale-case`);
  return res.data;
}

export async function createSaleCase(propertyId: string): Promise<PropertySaleCase> {
  const res = await api.post<{ saleCase: PropertySaleCase }>(`/api/properties/${propertyId}/sale-case`, {});
  return res.data.saleCase;
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
