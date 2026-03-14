import { api } from '@/lib/api/client';
import type {
  DigitalWill,
  CreateEntryInput,
  UpdateEntryInput,
  UpdateWillInput,
  TrustedContact,
  CreateTrustedContactInput,
  UpdateTrustedContactInput,
} from './types';

export async function getDigitalWill(propertyId: string): Promise<DigitalWill | null> {
  const res = await api.get<DigitalWill | null>(
    `/api/properties/${propertyId}/home-digital-will`,
  );
  return res.data ?? null;
}

export async function getOrCreateDigitalWill(
  propertyId: string,
  title?: string,
): Promise<DigitalWill> {
  const res = await api.post<DigitalWill>(
    `/api/properties/${propertyId}/home-digital-will`,
    { title },
  );
  return res.data;
}

export async function updateDigitalWill(
  willId: string,
  data: UpdateWillInput,
): Promise<DigitalWill> {
  const res = await api.patch<DigitalWill>(
    `/api/home-digital-wills/${willId}`,
    data,
  );
  return res.data;
}

export async function createEntry(
  sectionId: string,
  data: CreateEntryInput,
) {
  const res = await api.post(
    `/api/home-digital-will-sections/${sectionId}/entries`,
    data,
  );
  return res.data?.entry ?? res.data;
}

export async function updateEntry(entryId: string, data: UpdateEntryInput) {
  const res = await api.patch(
    `/api/home-digital-will-entries/${entryId}`,
    data,
  );
  return res.data?.entry ?? res.data;
}

export async function deleteEntry(entryId: string): Promise<void> {
  await api.delete(`/api/home-digital-will-entries/${entryId}`);
}

export async function updateSection(
  sectionId: string,
  data: { title?: string; description?: string | null; isEnabled?: boolean },
) {
  const res = await api.patch(
    `/api/home-digital-will-sections/${sectionId}`,
    data,
  );
  return res.data?.section ?? res.data;
}

export async function createTrustedContact(
  willId: string,
  data: CreateTrustedContactInput,
): Promise<TrustedContact> {
  const res = await api.post(
    `/api/home-digital-wills/${willId}/trusted-contacts`,
    data,
  );
  return res.data?.contact ?? res.data;
}

export async function updateTrustedContact(
  contactId: string,
  data: UpdateTrustedContactInput,
): Promise<TrustedContact> {
  const res = await api.patch(
    `/api/home-digital-will-trusted-contacts/${contactId}`,
    data,
  );
  return res.data?.contact ?? res.data;
}

export async function deleteTrustedContact(contactId: string): Promise<void> {
  await api.delete(`/api/home-digital-will-trusted-contacts/${contactId}`);
}
