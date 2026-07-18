// apps/frontend/src/lib/api/adminWorkQueues.ts
//
// API client for the Admin operational work-queues overview
// (ADMIN_MODULE_FRD.md Phase 2 slice).

import { api } from '@/lib/api/client';

export interface WorkQueueSummary {
  key: string;
  label: string;
  href: string;
  capability: string;
  count: number;
}

export async function fetchAdminWorkQueues(): Promise<{ queues: WorkQueueSummary[]; generatedAt: string }> {
  const res = await api.get<{ queues: WorkQueueSummary[]; generatedAt: string }>('/api/admin/work-queues');
  return res.data;
}
