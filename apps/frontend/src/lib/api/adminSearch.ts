// apps/frontend/src/lib/api/adminSearch.ts
//
// API client for global admin search (ADMIN_MODULE_FRD.md §17 Phase 1).
// Results only cover domains the actor can view.

import { api } from '@/lib/api/client';

export interface AdminSearchResult {
  type: 'USER' | 'PROVIDER' | 'BOOKING' | 'CASE' | 'PRIVACY_REQUEST';
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export async function adminGlobalSearch(q: string): Promise<AdminSearchResult[]> {
  const res = await api.get<AdminSearchResult[]>(`/api/admin/search?q=${encodeURIComponent(q)}`);
  return res.data;
}
