import { api } from '@/lib/api/client';
import type {
  MaterialSpec,
  MaterialSpecPhoto,
  MaterialSpecExport,
  MaterialCategory,
  MaterialScopeLevel,
  MaterialSurface,
  MaterialLifecycleStatus,
  MaterialComplianceCheckStatus,
  MaterialExtractionReview,
} from '@/types';

export interface ListSpecsParams {
  category?: MaterialCategory;
  scopeLevel?: MaterialScopeLevel;
  roomId?: string;
  projectId?: string;
  lifecycleStatus?: MaterialLifecycleStatus;
  isActive?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListSpecsResult {
  specs: MaterialSpec[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function listSpecs(propertyId: string, params: ListSpecsParams = {}): Promise<MaterialSpec[]> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.scopeLevel) query.set('scopeLevel', params.scopeLevel);
  if (params.roomId) query.set('roomId', params.roomId);
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.lifecycleStatus) query.set('lifecycleStatus', params.lifecycleStatus);
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const qs = query.toString();
  const res = await api.get<ListSpecsResult>(`/api/properties/${propertyId}/materials${qs ? `?${qs}` : ''}`);
  return res.data.specs;
}

export async function searchSpecs(propertyId: string, q: string): Promise<MaterialSpec[]> {
  const res = await api.get<{ specs: MaterialSpec[] }>(`/api/properties/${propertyId}/materials/search?q=${encodeURIComponent(q)}`);
  return res.data.specs;
}

export async function getSpec(propertyId: string, specId: string): Promise<MaterialSpec> {
  const res = await api.get<{ spec: MaterialSpec }>(`/api/properties/${propertyId}/materials/${specId}`);
  return res.data.spec;
}

export interface CreateSpecInput {
  label: string;
  category: MaterialCategory;
  scopeLevel: MaterialScopeLevel;
  surface?: MaterialSurface | null;
  roomId?: string | null;
  manufacturer?: string | null;
  productLine?: string | null;
  productName?: string | null;
  sku?: string | null;
  colorCode?: string | null;
  colorHex?: string | null;
  finish?: string | null;
  dimensions?: string | null;
  material?: string | null;
  supplier?: string | null;
  supplierUrl?: string | null;
  supplierCheckedAt?: string | null;
  supplierDiscontinued?: boolean;
  successorProductUrl?: string | null;
  purchaseDate?: string | null;
  quantityPurchased?: string | null;
  lotBatch?: string | null;
  notes?: string | null;
  projectId?: string | null;
  scopeVersionId?: string | null;
  careInstructions?: string | null;
  complianceRelevance?: {
    permitRelevant: boolean;
    hoaRelevant: boolean;
    attributes: string[];
  } | null;
  permitAttributeCheck?: MaterialComplianceCheckStatus;
  hoaAttributeCheck?: MaterialComplianceCheckStatus;
  submittalDocumentIds?: string[];
}

export interface CreateSpecResult {
  spec: MaterialSpec;
  // Non-blocking: other active specs in the same category+surface(+room) —
  // this may be the same real-world surface already captured, or a genuine
  // second instance. Only populated when a `surface` was given.
  possibleDuplicates: { id: string; label: string; lifecycleStatus: MaterialLifecycleStatus }[];
}

export async function createSpec(propertyId: string, body: CreateSpecInput): Promise<CreateSpecResult> {
  const res = await api.post<CreateSpecResult>(`/api/properties/${propertyId}/materials`, body);
  return res.data;
}

export async function updateSpec(propertyId: string, specId: string, body: Partial<CreateSpecInput> & { isActive?: boolean }): Promise<MaterialSpec> {
  const res = await api.patch<{ spec: MaterialSpec }>(`/api/properties/${propertyId}/materials/${specId}`, body);
  return res.data.spec;
}

export async function deleteSpec(propertyId: string, specId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/materials/${specId}`);
}

export async function addPhoto(propertyId: string, specId: string, body: { photoUrl: string; fileKey: string; caption?: string; sortOrder?: number }): Promise<MaterialSpecPhoto> {
  const res = await api.post<{ photo: MaterialSpecPhoto }>(`/api/properties/${propertyId}/materials/${specId}/photos`, body);
  return res.data.photo;
}

export async function deletePhoto(propertyId: string, specId: string, photoId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/materials/${specId}/photos/${photoId}`);
}

export async function reorderPhotos(propertyId: string, specId: string, orderedIds: string[]): Promise<MaterialSpecPhoto[]> {
  const res = await api.patch<{ photos: MaterialSpecPhoto[] }>(`/api/properties/${propertyId}/materials/${specId}/photos/reorder`, { orderedIds });
  return res.data.photos;
}

export async function listExports(propertyId: string): Promise<MaterialSpecExport[]> {
  const res = await api.get<{ exports: MaterialSpecExport[] }>(`/api/properties/${propertyId}/materials/exports`);
  return res.data.exports;
}

export async function createExport(propertyId: string, body: { scopeType: string; title: string; roomId?: string; category?: string }): Promise<MaterialSpecExport> {
  const res = await api.post<{ export: MaterialSpecExport }>(`/api/properties/${propertyId}/materials/exports`, body);
  return res.data.export;
}

export async function getExport(propertyId: string, exportId: string): Promise<{ export: MaterialSpecExport; signedUrl?: string }> {
  const res = await api.get<{ export: MaterialSpecExport; signedUrl?: string }>(`/api/properties/${propertyId}/materials/exports/${exportId}`);
  return res.data;
}

export async function transitionMaterialLifecycle(
  propertyId: string,
  specId: string,
  body: {
    toStatus: 'APPROVED' | 'INSTALLED' | 'AS_BUILT';
    evidenceDocumentIds: string[];
    notes: string;
    approvalDocumentIds?: string[];
    submittalDocumentIds?: string[];
    receiptDocumentId?: string | null;
    warrantyDocumentId?: string | null;
    manualDocumentId?: string | null;
    quantityInstalled?: string | null;
    quantityRemaining?: string | null;
    remainingStorageLocation?: string | null;
    installedByName?: string | null;
    installedAt?: string | null;
    permitAttributeCheck?: MaterialComplianceCheckStatus;
    hoaAttributeCheck?: MaterialComplianceCheckStatus;
  },
): Promise<MaterialSpec> {
  const res = await api.post<{ spec: MaterialSpec }>(
    `/api/properties/${propertyId}/materials/${specId}/lifecycle`,
    body,
  );
  return res.data.spec;
}

export async function substituteMaterial(
  propertyId: string,
  specId: string,
  body: {
    replacement: Partial<CreateSpecInput> & { label: string };
    comparison: {
      identityChanges: string[];
      costDeltaCents?: number;
      scheduleImpact?: string;
      reason: string;
    };
    complianceImpact: {
      permitRelevant: boolean;
      hoaRelevant: boolean;
      changedAttributes: string[];
      explanation: string;
    };
    evidenceDocumentIds: string[];
    sourceChangeOrderId?: string | null;
    notes: string;
  },
): Promise<MaterialSpec> {
  const res = await api.post<{ spec: MaterialSpec }>(
    `/api/properties/${propertyId}/materials/${specId}/substitutions`,
    body,
  );
  return res.data.spec;
}

export async function createMaterialExtraction(
  propertyId: string,
  specId: string,
  body: {
    sourceDocumentId?: string | null;
    sourcePhotoKey?: string | null;
    extractionMethod: string;
    parserVersion?: string | null;
    candidateFields: Record<string, unknown>;
    confidence?: Record<string, unknown> | null;
  },
): Promise<MaterialExtractionReview> {
  const res = await api.post<{ review: MaterialExtractionReview }>(
    `/api/properties/${propertyId}/materials/${specId}/extractions`,
    body,
  );
  return res.data.review;
}

export async function reviewMaterialExtraction(
  propertyId: string,
  specId: string,
  reviewId: string,
  body: {
    status: 'CONFIRMED' | 'REJECTED';
    reviewedFields?: Record<string, unknown>;
    reviewNotes: string;
  },
): Promise<MaterialExtractionReview> {
  const res = await api.post<{ review: MaterialExtractionReview }>(
    `/api/properties/${propertyId}/materials/${specId}/extractions/${reviewId}/review`,
    body,
  );
  return res.data.review;
}

export async function getMaterialRepairReorder(propertyId: string, specId: string): Promise<{
  record: Record<string, unknown>;
}> {
  const res = await api.get<{ record: Record<string, unknown> }>(
    `/api/properties/${propertyId}/materials/${specId}/repair-reorder`,
  );
  return res.data;
}
