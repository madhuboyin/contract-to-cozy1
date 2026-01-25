// apps/frontend/src/app/(dashboard)/dashboard/inventory/inventoryApi.ts
import { api } from '@/lib/api/client';
import type { InventoryItem, InventoryRoom, InventoryItemCategory } from '@/types';

/**
 * ----------------------------
 * Types (Phase 2 / Phase 3)
 * ----------------------------
 */
console.log('[inventoryApi.ts] loaded from dashboard/inventory/inventoryApi.ts');

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

function unwrap<T = any>(input: any): T {
  let cur = input;

  for (let i = 0; i < 3; i++) {
    if (!cur || typeof cur !== 'object') break;

    // If this looks like an APIResponse wrapper, unwrap .data
    const hasSuccess = Object.prototype.hasOwnProperty.call(cur, 'success');
    const hasData = Object.prototype.hasOwnProperty.call(cur, 'data');

    if (hasData && (hasSuccess || Object.prototype.hasOwnProperty.call(cur, 'message') || Object.prototype.hasOwnProperty.call(cur, 'error'))) {
      cur = (cur as any).data;
      continue;
    }

    // If it's axios-like { data: ... } (some callsites still treat it that way), unwrap once
    if (hasData && !hasSuccess) {
      // Only unwrap if it's not already the domain shape (avoid stripping {drafts:...})
      const d = (cur as any).data;
      if (d && typeof d === 'object') {
        cur = d;
        continue;
      }
    }

    break;
  }

  return cur as T;
}

function unwrapApi(res: any) {
  // Handles:
  // - Axios response: { data, status, headers, ... }
  // - API envelope: { success: true/false, data, error }
  // - Direct payload
  let v: any = res;

  // unwrap axios-like
  for (let i = 0; i < 3; i++) {
    if (!v || typeof v !== 'object') break;
    if ('data' in v && ('status' in v || 'headers' in v || 'config' in v || 'request' in v)) {
      v = (v as any).data;
      continue;
    }
    break;
  }

  // unwrap {success,data}
  for (let i = 0; i < 3; i++) {
    if (!v || typeof v !== 'object') break;
    if ('success' in v && 'data' in v) {
      v = (v as any).data;
      continue;
    }
    break;
  }

  // some wrappers return {data:{...}} as the only meaningful field
  if (v && typeof v === 'object' && 'data' in v && !('drafts' in v) && !('sessionId' in v)) {
    const inner = (v as any).data;
    if (inner && (typeof inner === 'object' || Array.isArray(inner))) v = inner;
  }

  return v;
}

function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
export function normalizeDraftsPayload(input: any): any[] {
  if (Array.isArray(input)) return input;

  const payload = unwrap<any>(input);

  if (Array.isArray(payload?.drafts)) return payload.drafts;

  if (payload?.drafts && typeof payload.drafts === 'object') {
    const values = Object.values(payload.drafts);
    return Array.isArray(values) ? values : [];
  }

  if (Array.isArray(payload)) return payload;

  return [];
}

/**
 * ----------------------------
 * Rooms
 * ----------------------------
 */
export async function listInventoryRooms(propertyId: string): Promise<InventoryRoom[]> {
  const res: any = await api.get(`/api/properties/${propertyId}/inventory/rooms`);
  const payload = unwrapApi(res);
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).rooms)) return (payload as any).rooms;
  return asArray(payload);
}

export async function createInventoryRoom(propertyId: string, data: any): Promise<InventoryRoom> {
  const res: any = await api.post(`/api/properties/${propertyId}/inventory/rooms`, data);
  return unwrapApi(res);
}

export async function updateInventoryRoom(propertyId: string, roomId: string, data: any): Promise<InventoryRoom> {
  const res: any = await api.put(`/api/properties/${propertyId}/inventory/rooms/${roomId}`, data);
  return unwrapApi(res);
}

export async function deleteInventoryRoom(propertyId: string, roomId: string) {
  const res: any = await api.delete(`/api/properties/${propertyId}/inventory/rooms/${roomId}`);
  return unwrapApi(res);
}

/**
 * ----------------------------
 * Items
 * ----------------------------
 */
export async function listInventoryItems(propertyId: string): Promise<InventoryItem[]> {
  const res: any = await api.get(`/api/properties/${propertyId}/inventory/items`);
  const payload = unwrapApi(res);
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).items)) return (payload as any).items;
  return asArray(payload);
}

export async function getInventoryItem(propertyId: string, itemId: string): Promise<InventoryItem> {
  const res: any = await api.get(`/api/properties/${propertyId}/inventory/items/${itemId}`);
  return unwrapApi(res);
}

export async function createInventoryItem(propertyId: string, data: any): Promise<InventoryItem> {
  const res: any = await api.post(`/api/properties/${propertyId}/inventory/items`, data);
  return unwrapApi(res);
}

export async function updateInventoryItem(propertyId: string, itemId: string, data: any): Promise<InventoryItem> {
  const res: any = await api.put(`/api/properties/${propertyId}/inventory/items/${itemId}`, data);
  return unwrapApi(res);
}

export async function deleteInventoryItem(propertyId: string, itemId: string) {
  const res: any = await api.delete(`/api/properties/${propertyId}/inventory/items/${itemId}`);
  return unwrapApi(res);
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
export async function lookupBarcode(
  propertyId: string,
  code: string
): Promise<BarcodeLookupResult> {
  const path = `/api/properties/${propertyId}/inventory/barcode/lookup`;
  const res: any = await api.post(path, { code });

  // Normalize top-level response (axios vs custom wrapper)
  const top =
    res?.data ??
    res?.body ??
    res?.payload ??
    res?.result ??
    res;

  // Unwrap exactly once, only for { success, data } shape
  const raw =
    top && typeof top === 'object' && 'success' in top && 'data' in top
      ? (top as any).data
      : top;

  if (!raw || typeof raw !== 'object') {
    return { upc: code } as any;
  }

  return raw as BarcodeLookupResult;
}
/**
 * ----------------------------
 * Phase 3 — OCR Label -> Draft
 * ----------------------------
 * POST /api/properties/:propertyId/inventory/ocr/label
 * multipart: image=<file>
 */
export async function ocrLabelToDraft(
  propertyId: string,
  file: File
): Promise<InventoryOcrDraftResponse> {
  const form = new FormData();

  // ✅ canonical key
  form.append('image', file);

  const res: any = await api.post(
    `/api/properties/${propertyId}/inventory/ocr/label`,
    form
  );

  // unwrap axios/custom wrapper shapes
  const top =
    res?.data ??
    res?.body ??
    res?.payload ??
    res?.result ??
    res;

  const raw =
    top && typeof top === 'object' && 'success' in top && 'data' in top
      ? (top as any).data
      : top;

  if (!raw || typeof raw !== 'object') {
    throw new Error('OCR upload succeeded but response was empty/invalid');
  }

  return raw as InventoryOcrDraftResponse;
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

  // Normalize the wrapper *once* (axios res.data OR raw response)
  const raw =
    res?.data ??
    res?.body ??
    res?.payload ??
    res?.result ??
    res;

  // If backend returns { success: true, data: {...} }, unwrap once.
  const payload =
    raw && typeof raw === 'object' && 'success' in raw && 'data' in raw
      ? (raw as any).data
      : raw;

  if (!payload || typeof payload !== 'object') {
    return { upc: code } as BarcodeLookupResult;
  }

  return payload as BarcodeLookupResult;
}

export async function lookupInventoryBarcodeWithDiagnostics(
  propertyId: string,
  code: string
): Promise<any> {
  const path = `/api/properties/${propertyId}/inventory/barcode/lookup?debug=1`;
  const res: any = await api.post(path, { code });

  return res?.data ?? res?.body ?? res?.payload ?? res?.result ?? res;
}

export async function getRoomInsights(propertyId: string, roomId: string) {
  const res = await api.get(`/api/properties/${propertyId}/inventory/rooms/${roomId}/insights`);
  // support { success, data } or direct
  return (res as any)?.data?.data ?? (res as any)?.data ?? res;
}

export async function patchRoomMeta(propertyId: string, roomId: string, input: { type?: string; profile?: any; heroImage?: string | null }) {
  const res = await api.patch(`/api/properties/${propertyId}/inventory/rooms/${roomId}`, input);
  return (res as any)?.data?.data ?? (res as any)?.data ?? res;
}

export type RoomChecklistItemDTO = {
  id: string;
  roomId: string;
  propertyId: string;
  title: string;
  notes?: string | null;
  status: 'OPEN' | 'DONE';
  frequency: 'ONCE' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEASONAL';
  sortOrder: number;
  lastCompletedAt?: string | null;
  nextDueDate?: string | null;
};

export type RoomTimelineEventDTO = {
  type: 'TASK' | 'INCIDENT';
  id: string;
  title: string;
  status: string;
  at: string;
  meta?: any;
};

export async function getInventoryRoom(propertyId: string, roomId: string) {
  const res = await api.get<{ room: any }>(`/api/properties/${propertyId}/inventory/rooms/${roomId}`);
  return res.data.room;
}

export async function listRoomChecklistItems(propertyId: string, roomId: string) {
  const res = await api.get(`/api/properties/${propertyId}/inventory/rooms/${roomId}/checklist-items`);
  const payload = (res as any)?.data ?? res;
  return payload?.data?.items ?? payload?.items ?? [];
}

export async function createRoomChecklistItem(propertyId: string, roomId: string, body: any) {
  const res = await api.post(`/api/properties/${propertyId}/inventory/rooms/${roomId}/checklist-items`, body);
  const payload = (res as any)?.data ?? res;
  return payload?.data?.item ?? payload?.item;
}

export async function updateRoomChecklistItem(propertyId: string, roomId: string, itemId: string, body: any) {
  const res = await api.patch(
    `/api/properties/${propertyId}/inventory/rooms/${roomId}/checklist-items/${itemId}`,
    body
  );
  return (res as any)?.data?.item ?? (res as any)?.data?.data?.item;
}

export async function deleteRoomChecklistItem(propertyId: string, roomId: string, itemId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/rooms/${roomId}/checklist-items/${itemId}`);
}

export async function getRoomTimeline(propertyId: string, roomId: string) {
  const res = await api.get(
    `/api/properties/${propertyId}/inventory/rooms/${roomId}/timeline`
  );
  return (res as any)?.data?.data?.timeline ?? [];
}

export async function updateInventoryRoomProfile(propertyId: string, roomId: string, profile: any) {
  const res: any = await api.put(
    `/api/properties/${propertyId}/inventory/rooms/${roomId}/profile`,
    { profile }
  );
  const payload = unwrapApi(res);
  return (payload as any)?.room ?? payload;
}

export async function startRoomScanAi(propertyId: string, roomId: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append('images', f);

  const res: any = await api.post(
    `/api/properties/${propertyId}/inventory/rooms/${roomId}/scan-ai`,
    form
  );

  const payload = unwrapApi(res) || {};
  const sessionId = (payload as any)?.sessionId;
  const drafts = (payload as any)?.drafts;

  return {
    sessionId: typeof sessionId === 'string' ? sessionId : null,
    drafts: asArray(drafts),
  } as { sessionId: string | null; drafts: any[] };
}

export async function getRoomScanAiSession(propertyId: string, roomId: string, sessionId: string) {
  const res: any = await api.get(
    `/api/properties/${propertyId}/inventory/rooms/${roomId}/scan-ai/${sessionId}`
  );
  return unwrapApi(res);
}

export async function listInventoryDraftsFiltered(
  propertyId: string,
  params: { scanSessionId?: string; status?: string; roomId?: string } = {}
): Promise<InventoryDraftListItem[]> {
  const res: any = await api.get(
    `/api/properties/${propertyId}/inventory/drafts`,
    { params }
  );

  const payload = unwrapApi(res);

  // server contract: {drafts: []}
  if (payload && typeof payload === 'object' && Array.isArray((payload as any).drafts)) {
    return (payload as any).drafts;
  }

  // older contracts might return drafts array directly
  return asArray(payload);
}

export async function bulkConfirmInventoryDrafts(propertyId: string, draftIds: string[]) {
  // ✅ canonical route (matches backend)
  const res: any = await api.post(
    `/api/properties/${propertyId}/inventory/drafts/bulk-confirm`,
    { draftIds }
  );
  return unwrapApi(res);
}

export async function bulkDismissInventoryDrafts(propertyId: string, draftIds: string[]) {
  // ✅ canonical route (matches backend)
  const res: any = await api.post(
    `/api/properties/${propertyId}/inventory/drafts/bulk-dismiss`,
    { draftIds }
  );
  return unwrapApi(res);
}

export async function updateInventoryDraft(
  propertyId: string,
  draftId: string,
  patch: { name?: string | null; category?: string | null; roomId?: string | null }
) {
  const res: any = await api.patch(
    `/api/properties/${propertyId}/inventory/drafts/${draftId}`,
    patch
  );

  const payload = unwrapApi(res);

  // controller: {draft: {...}}
  if (payload && typeof payload === 'object' && (payload as any).draft) return (payload as any).draft;
  return payload;
}