import { api } from '@/lib/api/client';
import type {
  CreateBatchInput,
  CreateBatchResult,
  CreateRecordInput,
  CreateRecordResult,
  ExtractedFactCandidate,
  PropertyRecordDetail,
  PropertyRecordDownloadEvent,
  PropertyRecordLinkEntityType,
  PropertyRecordLinkPurpose,
  PropertyRecordSavedSearch,
  PropertyRecordSavedSearchView,
  PropertyRecordStorageHealth,
  PropertyRecordSummary,
  PropertyRecordType,
} from './types';

export async function listRecords(
  propertyId: string,
  options?: { lifecycleStatus?: 'ACTIVE' | 'ARCHIVED' | 'TRASHED'; search?: string; recordType?: PropertyRecordType },
): Promise<PropertyRecordSummary[]> {
  const params: Record<string, string> = {};
  if (options?.lifecycleStatus) params.lifecycleStatus = options.lifecycleStatus;
  if (options?.search?.trim()) params.search = options.search.trim();
  if (options?.recordType) params.recordType = options.recordType;
  const res = await api.get<{ records: PropertyRecordSummary[] }>(
    `/api/properties/${propertyId}/records`,
    { params: Object.keys(params).length > 0 ? params : undefined },
  );
  return res.data.records;
}

export async function getRecord(propertyId: string, recordId: string): Promise<PropertyRecordDetail> {
  const res = await api.get<{ record: PropertyRecordDetail }>(
    `/api/properties/${propertyId}/records/${recordId}`,
  );
  return res.data.record;
}

export async function createRecord(
  propertyId: string,
  input: CreateRecordInput,
): Promise<CreateRecordResult> {
  const formData = new FormData();
  formData.append('file', input.file);
  formData.append('title', input.title);
  if (input.description) formData.append('description', input.description);
  formData.append('recordType', input.recordType);
  formData.append('sensitivity', input.sensitivity);
  formData.append('visibility', input.visibility);
  if (input.effectiveTo) formData.append('effectiveTo', input.effectiveTo);
  const res = await api.postFormData<CreateRecordResult>(
    `/api/properties/${propertyId}/records`,
    formData,
  );
  if (!res.success) throw new Error(res.message ?? 'Failed to add record.');
  return res.data;
}

export async function createBatchRecords(
  propertyId: string,
  input: CreateBatchInput,
): Promise<CreateBatchResult> {
  const formData = new FormData();
  for (const file of input.files) formData.append('files', file);
  formData.append('title', input.title);
  formData.append('recordType', input.recordType);
  formData.append('sensitivity', input.sensitivity);
  formData.append('visibility', input.visibility);
  const res = await api.postFormData<CreateBatchResult>(
    `/api/properties/${propertyId}/records/batch`,
    formData,
  );
  if (!res.success) throw new Error(res.message ?? 'Failed to add records.');
  return res.data;
}

export type PossibleVersionMatch = { id: string; title: string; currentVersionId: string | null } | null;

// A real pre-flight check, not the after-the-fact toast create() alone
// used to provide — lets the homeowner choose "add as a new version of X"
// before a redundant record ever gets created.
export async function checkPossibleVersion(
  propertyId: string,
  title: string,
  recordType: PropertyRecordType,
): Promise<PossibleVersionMatch> {
  const res = await api.get<{ match: PossibleVersionMatch }>(
    `/api/properties/${propertyId}/records/possible-version`,
    { params: { title, recordType } },
  );
  return res.data.match;
}

export async function addVersion(
  propertyId: string,
  recordId: string,
  file: File,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  await api.postFormData(`/api/properties/${propertyId}/records/${recordId}/versions`, formData);
}

export async function addLink(
  propertyId: string,
  recordId: string,
  input: { entityType: PropertyRecordLinkEntityType; entityId: string; purpose: PropertyRecordLinkPurpose; label?: string },
): Promise<void> {
  await api.post(`/api/properties/${propertyId}/records/${recordId}/links`, input);
}

export async function removeLink(propertyId: string, recordId: string, linkId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/records/${recordId}/links/${linkId}`);
}

export async function archiveRecord(propertyId: string, recordId: string): Promise<void> {
  await api.post(`/api/properties/${propertyId}/records/${recordId}/archive`, {});
}

export async function trashRecord(
  propertyId: string,
  recordId: string,
  impactDecision?: 'KEEP_LINKS' | 'REMOVE_LINKS',
): Promise<void> {
  await api.post(`/api/properties/${propertyId}/records/${recordId}/trash`, { impactDecision });
}

export async function restoreRecord(propertyId: string, recordId: string): Promise<void> {
  await api.post(`/api/properties/${propertyId}/records/${recordId}/restore`, {});
}

export async function setRetention(
  propertyId: string,
  recordId: string,
  input: { retainUntil?: string | null; legalHoldReason?: string | null },
): Promise<void> {
  await api.patch(`/api/properties/${propertyId}/records/${recordId}/retention`, input);
}

export async function setEffectivePeriod(
  propertyId: string,
  recordId: string,
  input: { effectiveFrom?: string | null; effectiveTo?: string | null },
): Promise<void> {
  await api.patch(`/api/properties/${propertyId}/records/${recordId}/effective-period`, input);
}

export async function runExtraction(
  propertyId: string,
  recordId: string,
  versionId: string,
): Promise<ExtractedFactCandidate[]> {
  const res = await api.post<{ candidates: ExtractedFactCandidate[] }>(
    `/api/properties/${propertyId}/records/${recordId}/versions/${versionId}/extract`,
    {},
  );
  return res.data.candidates;
}

export async function reviewCandidate(
  propertyId: string,
  recordId: string,
  candidateId: string,
  input: { action: 'CONFIRM' | 'CORRECT' | 'REJECT'; reviewedValue?: string },
): Promise<ExtractedFactCandidate> {
  const res = await api.post<{ candidate: ExtractedFactCandidate }>(
    `/api/properties/${propertyId}/records/${recordId}/extractions/${candidateId}/review`,
    input,
  );
  return res.data.candidate;
}

export async function promoteWarranty(
  propertyId: string,
  recordId: string,
  versionId: string,
): Promise<{ id: string }> {
  const res = await api.post<{ warranty: { id: string } }>(
    `/api/properties/${propertyId}/records/${recordId}/extractions/promote-warranty`,
    { versionId },
  );
  return res.data.warranty;
}

export async function promoteExpense(
  propertyId: string,
  recordId: string,
  versionId: string,
): Promise<{ id: string }> {
  const res = await api.post<{ expense: { id: string } }>(
    `/api/properties/${propertyId}/records/${recordId}/extractions/promote-expense`,
    { versionId },
  );
  return res.data.expense;
}

export async function promoteInsurancePolicy(
  propertyId: string,
  recordId: string,
  versionId: string,
): Promise<{ id: string }> {
  const res = await api.post<{ insurancePolicy: { policy: { id: string }; term: { id: string } } }>(
    `/api/properties/${propertyId}/records/${recordId}/extractions/promote-insurance-policy`,
    { versionId },
  );
  return res.data.insurancePolicy.policy;
}

export async function listSavedSearches(propertyId: string): Promise<PropertyRecordSavedSearch[]> {
  const res = await api.get<{ savedSearches: PropertyRecordSavedSearch[] }>(
    `/api/properties/${propertyId}/records/saved-searches`,
  );
  return res.data.savedSearches;
}

export async function createSavedSearch(
  propertyId: string,
  input: { name: string; search?: string; recordType?: PropertyRecordType; view: PropertyRecordSavedSearchView },
): Promise<PropertyRecordSavedSearch> {
  const res = await api.post<{ savedSearch: PropertyRecordSavedSearch }>(
    `/api/properties/${propertyId}/records/saved-searches`,
    input,
  );
  return res.data.savedSearch;
}

export async function deleteSavedSearch(propertyId: string, savedSearchId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/records/saved-searches/${savedSearchId}`);
}

// Fire-and-forget from the caller's perspective — registering the click
// must never block or fail the actual download.
export async function registerDownload(propertyId: string, recordId: string, versionId: string): Promise<void> {
  await api.post(`/api/properties/${propertyId}/records/${recordId}/versions/${versionId}/register-download`, {});
}

export async function listDownloadHistory(propertyId: string, recordId: string): Promise<PropertyRecordDownloadEvent[]> {
  const res = await api.get<{ downloadHistory: PropertyRecordDownloadEvent[] }>(
    `/api/properties/${propertyId}/records/${recordId}/download-history`,
  );
  return res.data.downloadHistory;
}

export async function getStorageHealth(propertyId: string): Promise<PropertyRecordStorageHealth> {
  const res = await api.get<{ storageHealth: PropertyRecordStorageHealth }>(
    `/api/properties/${propertyId}/records/storage-health`,
  );
  return res.data.storageHealth;
}
