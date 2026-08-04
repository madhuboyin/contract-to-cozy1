import { api } from '@/lib/api/client';
import type {
  CreateRecordInput,
  CreateRecordResult,
  ExtractedFactCandidate,
  PropertyRecordDetail,
  PropertyRecordLinkEntityType,
  PropertyRecordLinkPurpose,
  PropertyRecordSummary,
} from './types';

export async function listRecords(
  propertyId: string,
  lifecycleStatus?: 'ACTIVE' | 'ARCHIVED' | 'TRASHED',
): Promise<PropertyRecordSummary[]> {
  const res = await api.get<{ records: PropertyRecordSummary[] }>(
    `/api/properties/${propertyId}/records`,
    { params: lifecycleStatus ? { lifecycleStatus } : undefined },
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
  const res = await api.postFormData<CreateRecordResult>(
    `/api/properties/${propertyId}/records`,
    formData,
  );
  if (!res.success) throw new Error(res.message ?? 'Failed to add record.');
  return res.data;
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
