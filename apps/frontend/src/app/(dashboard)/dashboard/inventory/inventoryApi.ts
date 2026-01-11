// apps/frontend/src/app/(dashboard)/dashboard/inventory/inventoryApi.ts
import { api } from '@/lib/api/client';
import type { InventoryItem, InventoryRoom, InventoryItemCategory } from '@/types';

/**
 * ----------------------------
 * Types (Phase 2 / Phase 3)
 * ----------------------------
 */

export type BarcodeLookupResult = {
  name?: string;
  manufacturer?: string;
  modelNumber?: string;
  upc?: string;
  sku?: string;
  categoryHint?: string;
  imageUrl?: string;
  // allow unknown extra fields
  [k: string]: any;
};

export type InventoryOcrDraftResponse = {
  sessionId?: string;
  draftId: string;
  extracted: {
    manufacturer?: string | null;
    modelNumber?: string | null;
    serialNumber?: string | null;
  };
  confidence: Record<string, number>;
  rawText?: string;
};

export type InventoryDraftListItem = {
  id: string;
  status?: string;
  createdAt?: string;
  extracted?: any;
  confidence?: Record<string, number>;
  // allow unknown extra fields
  [k: string]: any;
};

/**
 * ----------------------------
 * Rooms
 * ----------------------------
 */

export async function listInventoryRooms(propertyId: string) {
  const res = await api.get<{ rooms: InventoryRoom[] }>(`/api/properties/${propertyId}/inventory/rooms`);
  return res.data.rooms;
}

export async function createInventoryRoom(
  propertyId: string,
  body: { name: string; floorLevel?: number | null; sortOrder?: number }
) {
  const res = await api.post<{ room: InventoryRoom }>(`/api/properties/${propertyId}/inventory/rooms`, body);
  return res.data.room;
}

export async function updateInventoryRoom(
  propertyId: string,
  roomId: string,
  body: { name?: string; floorLevel?: number | null; sortOrder?: number }
) {
  const res = await api.patch<{ room: InventoryRoom }>(`/api/properties/${propertyId}/inventory/rooms/${roomId}`, body);
  return res.data.room;
}

export async function deleteInventoryRoom(propertyId: string, roomId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/rooms/${roomId}`);
}

/**
 * ----------------------------
 * Items
 * ----------------------------
 */

export async function listInventoryItems(
  propertyId: string,
  params: {
    q?: string;
    roomId?: string;
    category?: InventoryItemCategory;
    hasDocuments?: boolean;
    hasRecallAlerts?: boolean;
  }
) {
  const cleanParams: any = { ...params };

  // roomId='ALL' => treat as no room filter
  if (!cleanParams.roomId || cleanParams.roomId === 'ALL') {
    delete cleanParams.roomId;
  }

  const res = await api.get<{ items: InventoryItem[] }>(`/api/properties/${propertyId}/inventory/items`, {
    params: cleanParams,
  });

  return res.data.items;
}

export async function createInventoryItem(propertyId: string, body: any) {
  const res = await api.post<{ item: InventoryItem }>(`/api/properties/${propertyId}/inventory/items`, body);
  return res.data.item;
}

export async function updateInventoryItem(propertyId: string, itemId: string, body: any) {
  const res = await api.patch<{ item: InventoryItem }>(`/api/properties/${propertyId}/inventory/items/${itemId}`, body);
  return res.data.item;
}

export async function deleteInventoryItem(propertyId: string, itemId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/items/${itemId}`);
}

export async function getInventoryItem(propertyId: string, itemId: string) {
  const res = await api.get<{ item: InventoryItem }>(`/api/properties/${propertyId}/inventory/items/${itemId}`);
  return res.data.item;
}

/**
 * ----------------------------
 * Documents & Linking
 * ----------------------------
 */

export async function linkDocumentToInventoryItem(propertyId: string, itemId: string, documentId: string) {
  const res = await api.post<any>(`/api/properties/${propertyId}/inventory/items/${itemId}/documents`, { documentId });
  return res.data.document;
}

export async function unlinkDocumentFromInventoryItem(propertyId: string, itemId: string, documentId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/items/${itemId}/documents/${documentId}`);
}

export async function listPropertyDocuments(propertyId: string, q?: string) {
  const res = await api.get<{ documents: any[] }>(`/api/properties/${propertyId}/documents`, { params: { q } });
  return res.data.documents;
}

export async function listUserDocuments() {
  const res = await api.get<{ documents: any[] }>('/api/documents');
  return res.data.documents;
}

/**
 * Uploads a document and analyzes it using your existing api client helper.
 * NOTE: this depends on your api client implementing analyzeDocument().
 */
export async function uploadAndAnalyzeDocument(args: { file: File; propertyId: string; autoCreateWarranty?: boolean }) {
  const res = await api.analyzeDocument(args.file, args.propertyId, args.autoCreateWarranty);
  if (!res.success) {
    throw new Error(res.message || 'Failed to analyze document');
  }
  return res.data;
}

export async function getDocumentAssetSuggestions(documentId: string, propertyId: string) {
  const res = await api.get<any>(`/api/documents/${documentId}/asset-suggestions`, { params: { propertyId } });
  return res.data;
}

/**
 * ----------------------------
 * Coverage helpers
 * ----------------------------
 */

export async function listPropertyWarranties(propertyId: string) {
  const res = await api.get<any>(`/api/properties/${propertyId}/warranties`);
  return res.data.warranties ?? res.data.items ?? [];
}

/**
 * Your backend has used different paths historically; be defensive.
 * Prefer /insurance-policies if you have it, otherwise fallback to /insurance.
 */
export async function listPropertyInsurancePolicies(propertyId: string) {
  try {
    const res = await api.get<any>(`/api/properties/${propertyId}/insurance-policies`);
    return res.data.policies ?? res.data.items ?? [];
  } catch {
    const res = await api.get<any>(`/api/properties/${propertyId}/insurance`);
    return res.data.policies ?? res.data.items ?? [];
  }
}

/**
 * ----------------------------
 * Export
 * ----------------------------
 */

export async function downloadInventoryExport(propertyId: string) {
  const res = await api.get<Blob>(`/api/properties/${propertyId}/inventory/export?format=csv`, {
    responseType: 'blob',
  });

  const url = window.URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `inventory-${propertyId}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * ----------------------------
 * Phase 2 — Barcode lookup
 * ----------------------------
 * Contract (recommended):
 * POST /api/properties/:propertyId/inventory/barcode/lookup
 * body: { code }
 */
export async function lookupBarcode(propertyId: string, code: string): Promise<BarcodeLookupResult> {
  const res = await api.post(`/api/properties/${propertyId}/inventory/barcode/lookup`, { code });
  // UI is defensive; return whatever shape backend sends
  return (res.data?.data ?? res.data) as BarcodeLookupResult;
}

/**
 * ----------------------------
 * Phase 3 — OCR Label -> Draft
 * ----------------------------
 * POST /api/properties/:propertyId/inventory/ocr/label
 * multipart: image=<file>
 */
export async function ocrLabelToDraft(propertyId: string, file: File): Promise<InventoryOcrDraftResponse> {
  const form = new FormData();
  form.append('image', file);

  const res = await api.post(`/api/properties/${propertyId}/inventory/ocr/label`, form);

  return res.data as InventoryOcrDraftResponse;
}

export async function listInventoryDrafts(propertyId: string): Promise<InventoryDraftListItem[]> {
  const res = await api.get(`/api/properties/${propertyId}/inventory/drafts`);
  return (res.data?.drafts ?? res.data?.items ?? res.data) as InventoryDraftListItem[];
}

export async function confirmInventoryDraft(propertyId: string, draftId: string) {
  const res = await api.post(`/api/properties/${propertyId}/inventory/drafts/${draftId}/confirm`, {});
  return res.data?.item ?? res.data;
}

export async function dismissInventoryDraft(propertyId: string, draftId: string) {
  const res = await api.post(`/api/properties/${propertyId}/inventory/drafts/${draftId}/dismiss`, {});
  return res.data;
}

export async function lookupInventoryBarcode(
  propertyId: string,
  code: string
): Promise<BarcodeLookupResult> {
  const path = `/api/properties/${propertyId}/inventory/barcode/lookup`;

  const res: any = await api.post(path, { code });

  const candidate =
    res?.data ??
    res?.body ??
    res?.payload ??
    res?.result ??
    res;

  // If candidate is the wrapped response { success, data }
  const payload =
    candidate?.data && typeof candidate?.data === 'object'
      ? candidate.data
      : candidate;

  // If it's { success:true, data: payload }
  const finalPayload =
    payload?.data && typeof payload?.data === 'object'
      ? payload.data
      : payload;

  // Last guard: ensure object
  if (!finalPayload || typeof finalPayload !== 'object') {
    return { upc: code } as BarcodeLookupResult;
  }

  return finalPayload as BarcodeLookupResult;
}

