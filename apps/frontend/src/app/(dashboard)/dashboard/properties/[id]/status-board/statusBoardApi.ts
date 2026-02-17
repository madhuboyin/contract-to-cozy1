import { api } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusBoardCondition = 'GOOD' | 'MONITOR' | 'ACTION_NEEDED';
export type StatusBoardRecommendation = 'OK' | 'REPAIR' | 'REPLACE_SOON';
export type WarrantyBadge = 'active' | 'expiring_soon' | 'expired' | 'none';

export interface StatusBoardItemDTO {
  id: string;
  kind: 'INVENTORY_ITEM' | 'HOME_ASSET';
  displayName: string;
  category: string;
  ageYears: number | null;
  installDate: string | null;
  condition: StatusBoardCondition;
  recommendation: StatusBoardRecommendation;
  computedCondition: StatusBoardCondition | null;
  computedRecommendation: StatusBoardRecommendation | null;
  computedReasons: { code: string; detail: string }[];
  computedAt: string | null;
  overrideCondition: StatusBoardCondition | null;
  overrideRecommendation: StatusBoardRecommendation | null;
  overrideNotes: string | null;
  overridePurchaseDate: string | null;
  overrideInstalledAt: string | null;
  isPinned: boolean;
  isHidden: boolean;
  warrantyStatus: WarrantyBadge;
  warrantyExpiry: string | null;
  pendingMaintenance: number;
  room: { id: string; name: string } | null;
  needsInstallDateForPrediction: boolean;
  deepLinks: Record<string, string>;
  inventoryItemId: string | null;
  homeAssetId: string | null;
}

export interface StatusBoardSummary {
  total: number;
  good: number;
  monitor: number;
  actionNeeded: number;
}

export interface StatusBoardPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface StatusBoardResponse {
  items: StatusBoardItemDTO[];
  summary: StatusBoardSummary;
  pagination: StatusBoardPagination;
  groups?: Record<string, StatusBoardItemDTO[]>;
}

export interface ListBoardParams {
  q?: string;
  groupBy?: 'condition' | 'category' | 'room';
  condition?: StatusBoardCondition;
  categoryKey?: string;
  pinnedOnly?: boolean;
  includeHidden?: boolean;
  page?: number;
  limit?: number;
}

export interface PatchStatusPayload {
  overrideCondition?: StatusBoardCondition | null;
  overrideRecommendation?: StatusBoardRecommendation | null;
  overridePurchaseDate?: string | null;
  overrideInstalledAt?: string | null;
  overrideNotes?: string | null;
  isPinned?: boolean;
  isHidden?: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function getStatusBoard(propertyId: string, params: ListBoardParams = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.groupBy) query.set('groupBy', params.groupBy);
  if (params.condition) query.set('condition', params.condition);
  if (params.categoryKey) query.set('categoryKey', params.categoryKey);
  if (params.pinnedOnly) query.set('pinnedOnly', 'true');
  if (params.includeHidden) query.set('includeHidden', 'true');
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const url = `/api/properties/${propertyId}/status-board${qs ? `?${qs}` : ''}`;
  const res = await api.get(url);
  return res.data as StatusBoardResponse;
}

export async function recomputeStatuses(propertyId: string) {
  const res = await api.post(`/api/properties/${propertyId}/status-board/recompute`);
  return res.data;
}

export async function patchItemStatus(propertyId: string, homeItemId: string, payload: PatchStatusPayload) {
  const res = await api.patch(`/api/properties/${propertyId}/status-board/${homeItemId}`, payload);
  return res.data;
}
