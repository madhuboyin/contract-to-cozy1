// apps/frontend/src/app/(dashboard)/dashboard/inventory/inventoryApi.ts
import { api } from '@/lib/api/client';
import type { InventoryItem, InventoryRoom, InventoryItemCategory } from '@/types';

export async function listInventoryRooms(propertyId: string): Promise<InventoryRoom[]> {
  const res = await api.get(`/api/properties/${propertyId}/inventory/rooms`);
  return res.data.rooms;
}

export async function listInventoryItems(
  propertyId: string,
  params: {
    q?: string;
    roomId?: string;
    category?: InventoryItemCategory;
    hasDocuments?: boolean;
  }
): Promise<InventoryItem[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.roomId) sp.set('roomId', params.roomId);
  if (params.category) sp.set('category', params.category);
  if (params.hasDocuments !== undefined) sp.set('hasDocuments', String(params.hasDocuments));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await api.get(`/api/properties/${propertyId}/inventory/items${qs}`);
  return res.data.items;
}

export async function getInventoryItem(propertyId: string, itemId: string): Promise<InventoryItem> {
  const res = await api.get(`/api/properties/${propertyId}/inventory/items/${itemId}`);
  return res.data.item;
}

export async function createInventoryItem(propertyId: string, body: any): Promise<InventoryItem> {
  const res = await api.post(`/api/properties/${propertyId}/inventory/items`, body);
  return res.data.item;
}

export async function updateInventoryItem(propertyId: string, itemId: string, body: any): Promise<InventoryItem> {
  const res = await api.patch(`/api/properties/${propertyId}/inventory/items/${itemId}`, body);
  return res.data.item;
}

export async function deleteInventoryItem(propertyId: string, itemId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/inventory/items/${itemId}`);
}

export async function linkDocumentToInventoryItem(propertyId: string, itemId: string, documentId: string) {
  const res = await api.post(`/api/properties/${propertyId}/inventory/items/${itemId}/documents`, { documentId });
  return res.data.document;
}

export async function unlinkDocumentFromInventoryItem(propertyId: string, itemId: string, documentId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/items/${itemId}/documents/${documentId}`);
}

export async function downloadInventoryExport(propertyId: string) {
  // uses the backend CSV export you already have
  const url = `${process.env.NEXT_PUBLIC_API_URL}/api/properties/${propertyId}/inventory/export?format=csv`;
  window.open(url, '_blank');
}

// These two are used by your drawer; keep signatures compatible with your existing code.
// If your backend endpoints differ, adjust only these two functions.
export async function listPropertyWarranties(propertyId: string) {
  const res = await api.get(`/api/properties/${propertyId}/warranties`);
  return res.data.warranties ?? res.data.items ?? [];
}

export async function listPropertyInsurancePolicies(propertyId: string) {
  const res = await api.get(`/api/properties/${propertyId}/insurance-policies`);
  return res.data.policies ?? res.data.items ?? [];
}

// Leave these as-is if you already implemented them elsewhere.
// Included here only to keep the file “drop-in compile-safe” for the imports in your drawer.
export async function uploadAndAnalyzeDocument(_input: any) {
  throw new Error('uploadAndAnalyzeDocument: wire to your existing implementation/endpoints');
}
export async function getDocumentAssetSuggestions(_documentId: string, _propertyId: string) {
  throw new Error('getDocumentAssetSuggestions: wire to your existing implementation/endpoints');
}

// ✅ NEW: barcode → product lookup
export async function lookupBarcode(propertyId: string, code: string) {
    const res = await api.get(
      `/properties/${propertyId}/inventory/barcode/lookup?code=${encodeURIComponent(code)}`
    );
    // Expecting { success: true, data: { provider, code, found, suggestion, raw } }
    return res.data?.data ?? res.data;
  }

  // ✅ Phase 3: OCR label -> draft
export async function ocrLabelToDraft(propertyId: string, file: File) {
  const form = new FormData();
  form.append('image', file);

  const res = await api.post(`/properties/${propertyId}/inventory/ocr/label`, form);

  return res.data as {
    sessionId: string;
    draftId: string;
    extracted: {
      manufacturer?: string | null;
      modelNumber?: string | null;
      serialNumber?: string | null;
    };
    confidence: Record<string, number>;
    rawText?: string;
  };
}

export async function confirmInventoryDraft(propertyId: string, draftId: string) {
  const res = await api.post(`/api/properties/${propertyId}/inventory/drafts/${draftId}/confirm`, {});
  return res.data?.item ?? res.data;
}

export async function dismissInventoryDraft(propertyId: string, draftId: string) {
  const res = await api.post(`/api/properties/${propertyId}/inventory/drafts/${draftId}/dismiss`, {});
  return res.data;
}
