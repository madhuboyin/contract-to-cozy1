// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-habit-coach/homeHabitCoachApi.ts

import { api } from '@/lib/api/client';
import type {
  GenerationResult,
  HabitPreferences,
  ListHabitsResult,
  PropertyHabit,
  SpotlightResult,
} from './types';

const base = (propertyId: string) => `/api/properties/${propertyId}/home-habits`;

export async function generateHabits(propertyId: string): Promise<GenerationResult> {
  const res = await api.post<GenerationResult>(`${base(propertyId)}/generate`);
  return res.data;
}

export async function listHabits(
  propertyId: string,
  opts: { includeSnoozed?: boolean; limit?: number; cursor?: string } = {},
): Promise<ListHabitsResult> {
  const params = new URLSearchParams();
  if (opts.includeSnoozed) params.set('includeSnoozed', 'true');
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get<ListHabitsResult>(`${base(propertyId)}${query}`);
  return res.data ?? { habits: [], hasMore: false, nextCursor: null };
}

export async function getSpotlightHabit(propertyId: string): Promise<SpotlightResult> {
  const res = await api.get<SpotlightResult>(`${base(propertyId)}/spotlight`);
  return res.data ?? { habit: null };
}

export async function getHabitHistory(
  propertyId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<ListHabitsResult> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get<ListHabitsResult>(`${base(propertyId)}/history${query}`);
  return res.data ?? { habits: [], hasMore: false, nextCursor: null };
}

export async function getHabitDetail(
  propertyId: string,
  habitId: string,
): Promise<PropertyHabit> {
  const res = await api.get<{ habit: PropertyHabit }>(`${base(propertyId)}/${habitId}`);
  return res.data.habit;
}

export async function completeHabit(
  propertyId: string,
  habitId: string,
  body: { note?: string | null } = {},
): Promise<PropertyHabit> {
  const res = await api.post<{ habit: PropertyHabit }>(
    `${base(propertyId)}/${habitId}/complete`,
    body,
  );
  return res.data.habit;
}

export async function snoozeHabit(
  propertyId: string,
  habitId: string,
  body: { snoozePreset?: string; snoozeUntil?: string; note?: string | null },
): Promise<PropertyHabit> {
  const res = await api.post<{ habit: PropertyHabit }>(
    `${base(propertyId)}/${habitId}/snooze`,
    body,
  );
  return res.data.habit;
}

export async function skipHabit(
  propertyId: string,
  habitId: string,
  body: { note?: string | null } = {},
): Promise<PropertyHabit> {
  const res = await api.post<{ habit: PropertyHabit }>(
    `${base(propertyId)}/${habitId}/skip`,
    body,
  );
  return res.data.habit;
}

export async function dismissHabit(
  propertyId: string,
  habitId: string,
  body: { note?: string | null } = {},
): Promise<PropertyHabit> {
  const res = await api.post<{ habit: PropertyHabit }>(
    `${base(propertyId)}/${habitId}/dismiss`,
    body,
  );
  return res.data.habit;
}

export async function reopenHabit(
  propertyId: string,
  habitId: string,
): Promise<PropertyHabit> {
  const res = await api.post<{ habit: PropertyHabit }>(
    `${base(propertyId)}/${habitId}/reopen`,
  );
  return res.data.habit;
}

export async function recordViewed(
  propertyId: string,
  habitId: string,
): Promise<void> {
  await api.post(`${base(propertyId)}/${habitId}/viewed`);
}

export async function getPreferences(propertyId: string): Promise<HabitPreferences> {
  const res = await api.get<{ preferences: HabitPreferences }>(
    `${base(propertyId)}/preferences`,
  );
  return res.data.preferences;
}

export async function updatePreferences(
  propertyId: string,
  body: { isEnabled?: boolean; preferredSurfaceCount?: number | null },
): Promise<HabitPreferences> {
  const res = await api.patch<{ preferences: HabitPreferences }>(
    `${base(propertyId)}/preferences`,
    body,
  );
  return res.data.preferences;
}
