// apps/frontend/src/app/(dashboard)/dashboard/inventory/inventoryApi.ts
import { api } from '@/lib/api/client';
import { InventoryItem, InventoryRoom, InventoryItemCategory } from '@/types';

// -------- Rooms --------

/**
 * Fetches all rooms for a specific property.
 */
export async function listInventoryRooms(propertyId: string) {
  const res = await api.get<{ rooms: InventoryRoom[] }>(`/api/properties/${propertyId}/inventory/rooms`);
  return res.data.rooms;
}

/**
 * Creates a new room in the inventory.
 */
export async function createInventoryRoom(
  propertyId: string,
  body: { name: string; floorLevel?: number | null; sortOrder?: number }
) {
  const res = await api.post<{ room: InventoryRoom }>(`/api/properties/${propertyId}/inventory/rooms`, body);
  return res.data.room;
}

/**
 * Updates an existing room's details.
 */
export async function updateInventoryRoom(
  propertyId: string,
  roomId: string,
  body: { name?: string; floorLevel?: number | null; sortOrder?: number }
) {
  const res = await api.patch<{ room: InventoryRoom }>(`/api/properties/${propertyId}/inventory/rooms/${roomId}`, body);
  return res.data.room;
}

/**
 * Deletes a room from the inventory.
 */
export async function deleteInventoryRoom(propertyId: string, roomId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/rooms/${roomId}`);
}

// -------- Items --------

/**
 * Lists inventory items based on filters.
 */
export async function listInventoryItems(
  propertyId: string, 
  params: { q?: string; roomId?: string; category?: InventoryItemCategory; hasDocuments?: boolean; hasRecallAlerts?: boolean }
) {
  // Create a clean copy of parameters
  const cleanParams: any = { ...params };

  // If roomId is 'ALL', undefined, or an empty string, remove it 
  // so the backend returns all items for the property regardless of room.
  if (!cleanParams.roomId || cleanParams.roomId === 'ALL') {
    delete cleanParams.roomId;
  }

  // Use the cleaned params for the API call
  const res = await api.get<{ items: InventoryItem[] }>(
    `/api/properties/${propertyId}/inventory/items`, 
    { params: cleanParams }
  );
  
  return res.data.items;
}

/**
 * Creates a new inventory item.
 */
export async function createInventoryItem(propertyId: string, body: any) {
  const res = await api.post<{ item: InventoryItem }>(`/api/properties/${propertyId}/inventory/items`, body);
  return res.data.item;
}

/**
 * Updates an inventory item's details.
 */
export async function updateInventoryItem(propertyId: string, itemId: string, body: any) {
  const res = await api.patch<{ item: InventoryItem }>(`/api/properties/${propertyId}/inventory/items/${itemId}`, body);
  return res.data.item;
}

/**
 * Deletes an item from the inventory.
 */
export async function deleteInventoryItem(propertyId: string, itemId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/items/${itemId}`);
}

/**
 * Fetches a single inventory item.
 */
export async function getInventoryItem(propertyId: string, itemId: string) {
  const res = await api.get<{ item: InventoryItem }>(`/api/properties/${propertyId}/inventory/items/${itemId}`);
  return res.data.item;
}

// -------- Documents & Linking --------

/**
 * Links an existing document to an inventory item.
 */
export async function linkDocumentToInventoryItem(propertyId: string, itemId: string, documentId: string) {
  const res = await api.post<any>(`/api/properties/${propertyId}/inventory/items/${itemId}/documents`, { documentId });
  return res.data.document;
}

/**
 * Unlinks a document from an inventory item.
 */
export async function unlinkDocumentFromInventoryItem(propertyId: string, itemId: string, documentId: string) {
  await api.delete(`/api/properties/${propertyId}/inventory/items/${itemId}/documents/${documentId}`);
}

/**
 * Lists documents available for a specific property.
 */
export async function listPropertyDocuments(propertyId: string, q?: string) {
  const res = await api.get<{ documents: any[] }>(`/api/properties/${propertyId}/documents`, { params: { q } });
  return res.data.documents;
}

/**
 * Lists all documents for the current user.
 */
export async function listUserDocuments() {
  const res = await api.get<{ documents: any[] }>('/api/documents');
  return res.data.documents;
}

/**
 * Uploads a document and analyzes it using AI.
 */
export async function uploadAndAnalyzeDocument(args: {
  file: File;
  propertyId: string;
  autoCreateWarranty?: boolean;
}) {
  const res = await api.analyzeDocument(args.file, args.propertyId, args.autoCreateWarranty);
  if (!res.success) {
    throw new Error(res.message || 'Failed to analyze document');
  }
  return res.data;
}

/**
 * Fetches AI-powered asset suggestions from a specific document.
 */
export async function getDocumentAssetSuggestions(documentId: string, propertyId: string) {
  const res = await api.get<{ suggestions: any[] }>(`/api/documents/${documentId}/asset-suggestions`, { params: { propertyId } });
  return res.data;
}

// -------- Additional Helpers --------
/**
 * Lists all warranties associated ONLY with the specific property.
 */
export async function listPropertyWarranties(propertyId: string) {
  // Directly targeting the property-nested endpoint to ensure backend filtering
  const res = await api.get<{ warranties: any[] }>(`/api/properties/${propertyId}/warranties`);
  
  // The central API client handles 'success' checks, 
  // so we can return the data directly.
  return res.data.warranties;
}

/**
 * Lists all insurance policies associated ONLY with the specific property.
 */
export async function listPropertyInsurancePolicies(propertyId: string) {
  // Directly targeting the property-nested endpoint to ensure backend filtering
  const res = await api.get<{ policies: any[] }>(`/api/properties/${propertyId}/insurance`);
  
  return res.data.policies;
}

export async function downloadInventoryExport(propertyId: string) {
  // Use the standard api client which includes the Authorization header automatically
  const res = await api.get<Blob>(`/api/properties/${propertyId}/inventory/export?format=csv`, {
    responseType: 'blob' // Tells the client to return binary data
  });

  // Create a blob URL and trigger download
  const url = window.URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `inventory-${propertyId}.csv`);
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  link.remove();
  window.URL.revokeObjectURL(url);
}