// apps/frontend/src/app/(dashboard)/dashboard/inventory/inventoryApi.ts
import { ApiResponse, InventoryItem, InventoryRoom, InventoryItemCategory } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL; // must already exist in your app
async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = json?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
}

// -------- Rooms --------
export async function listInventoryRooms(propertyId: string) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/rooms`;
  const res = await apiFetch<ApiResponse<{ rooms: InventoryRoom[] }>>(url);
  return res.data.rooms;
}

export async function createInventoryRoom(
  propertyId: string,
  body: { name: string; floorLevel?: number | null; sortOrder?: number }
) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/rooms`;
  const res = await apiFetch<ApiResponse<{ room: InventoryRoom }>>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data.room;
}

export async function updateInventoryRoom(
  propertyId: string,
  roomId: string,
  body: { name?: string; floorLevel?: number | null; sortOrder?: number }
) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/rooms/${roomId}`;
  const res = await apiFetch<ApiResponse<{ room: InventoryRoom }>>(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.data.room;
}

export async function deleteInventoryRoom(propertyId: string, roomId: string) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/rooms/${roomId}`;
  await apiFetch(url, { method: 'DELETE' });
}

// -------- Items --------
export async function listInventoryItems(propertyId: string, params: { q?: string; roomId?: string; category?: InventoryItemCategory; hasDocuments?: boolean }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.roomId) sp.set('roomId', params.roomId);
  if (params.category) sp.set('category', params.category);
  if (params.hasDocuments !== undefined) sp.set('hasDocuments', String(params.hasDocuments));

  const url = `${API_BASE}/api/properties/${propertyId}/inventory/items?${sp.toString()}`;
  const res = await apiFetch<ApiResponse<{ items: InventoryItem[] }>>(url);
  return res.data.items;
}
export async function createInventoryItem(propertyId: string, body: any) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/items`;
  const res = await apiFetch<ApiResponse<{ item: InventoryItem }>>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data.item;
}
export async function updateInventoryItem(propertyId: string, itemId: string, body: any) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/items/${itemId}`;
  const res = await apiFetch<ApiResponse<{ item: InventoryItem }>>(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.data.item;
}
export async function deleteInventoryItem(propertyId: string, itemId: string) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/items/${itemId}`;
  await apiFetch(url, { method: 'DELETE' });
}

// Documents linking
export async function linkDocumentToInventoryItem(propertyId: string, itemId: string, documentId: string) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/items/${itemId}/documents`;
  const res = await apiFetch<ApiResponse<{ document: any }>>(url, {
    method: 'POST',
    body: JSON.stringify({ documentId }),
  });
  return res.data.document;
}
export async function unlinkDocumentFromInventoryItem(propertyId: string, itemId: string, documentId: string) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/items/${itemId}/documents/${documentId}`;
  await apiFetch(url, { method: 'DELETE' });
}
export async function getInventoryItem(propertyId: string, itemId: string) {
  const url = `${API_BASE}/api/properties/${propertyId}/inventory/items/${itemId}`;
  const res = await apiFetch<ApiResponse<{ item: InventoryItem }>>(url);
  return res.data.item;
}

/**
 * List documents available for a property (for picker).
 * Adjust this URL to match your existing documents API.
 */
export async function listPropertyDocuments(propertyId: string, q?: string) {
  const sp = new URLSearchParams();
  if (q) sp.set('q', q);

  // ✅ CHANGE THIS if your documents listing endpoint differs.
  const url = `${API_BASE}/api/properties/${propertyId}/documents?${sp.toString()}`;

  const res = await apiFetch<ApiResponse<{ documents: any[] }>>(url);
  return res.data.documents;
}

export async function listUserDocuments() {
  const url = `${API_BASE}/api/documents`;
  const res = await apiFetch<ApiResponse<{ documents: any[] }>>(url);
  return res.data.documents;
}

/**
 * Uploads a document using your existing backend:
 * POST /api/documents/analyze (multipart form-data)
 * fields:
 *  - file (binary)
 *  - propertyId (string, optional)
 *  - autoCreateWarranty (boolean-as-string, optional)
 */
type AnalyzeResponse = ApiResponse<{
  document: any;
  insights: any;
  warranty: any | null;
}>;
export async function uploadAndAnalyzeDocument(args: {
  file: File;
  propertyId?: string;
  autoCreateWarranty?: boolean;
}) {
  const url = `${API_BASE}/api/documents/analyze`;
  const fd = new FormData();
  fd.append('file', args.file);
  if (args.propertyId) fd.append('propertyId', args.propertyId);
  fd.append('autoCreateWarranty', args.autoCreateWarranty ? 'true' : 'false');

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: fd,
    cache: 'no-store',
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `Upload failed (${res.status})`);

  return (json as AnalyzeResponse).data;
}
async function tryFetch<T>(url: string): Promise<T | null> {
  try {
    return await apiFetch<T>(url);
  } catch {
    return null;
  }
}

// These endpoints may differ in your backend.
// We try a couple common patterns and return [] if none work.
export async function listPropertyWarranties(propertyId: string) {
  const res = await apiFetch<ApiResponse<{ warranties: any[] }>>(
    `${API_BASE}/api/documents/warranties?propertyId=${propertyId}`
  );
  return res.data.warranties;
}

export async function listPropertyInsurancePolicies(propertyId: string) {
  const res = await apiFetch<ApiResponse<{ policies: any[] }>>(
    `${API_BASE}/api/documents/insurance-policies?propertyId=${propertyId}`
  );
  return res.data.policies;
}

export async function getDocumentAssetSuggestions(documentId: string, propertyId: string) {
  const res = await apiFetch<ApiResponse<any>>(
    `${API_BASE}/api/documents/${documentId}/asset-suggestions?propertyId=${propertyId}`
  );
  return res.data;
}


