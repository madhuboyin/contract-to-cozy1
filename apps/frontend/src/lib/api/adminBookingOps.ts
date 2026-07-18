// apps/frontend/src/lib/api/adminBookingOps.ts
//
// API client for the Admin Booking Operations workspace
// (ADMIN_MODULE_FRD.md §10.3, Phase 2 slice). Read-only v1.

import { api } from '@/lib/api/client';

export type BookingStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface BookingRow {
  id: string;
  bookingNumber: string;
  category: string;
  status: BookingStatus;
  scheduledDate: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  homeowner: { id: string; firstName: string; lastName: string };
  providerProfile: { id: string; businessName: string };
  service: { name: string };
}

export interface BookingListResult {
  bookings: BookingRow[];
  total: number;
  page: number;
  limit: number;
}

export interface BookingTimelineEvent {
  at: string;
  kind: string;
  label: string;
  note?: string | null;
  actorId?: string | null;
}

export interface BookingDetail extends Omit<BookingRow, 'homeowner'> {
  description: string;
  specialRequests: string | null;
  requestedDate: string | null;
  startTime: string | null;
  endTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  homeowner: { id: string; firstName: string; lastName: string };
  provider: { id: string; firstName: string; lastName: string };
  providerProfile: { id: string; businessName: string; status: string };
  property: { id: string; city: string; state: string };
  service: { id: string; name: string; category: string };
  review: { id: string; rating: number; status: string; createdAt: string } | null;
  events: BookingTimelineEvent[];
}

export async function fetchAdminBookings(
  q: string,
  status?: BookingStatus,
  page = 1,
): Promise<BookingListResult> {
  const params = new URLSearchParams({ page: String(page) });
  if (q.trim()) params.set('q', q.trim());
  if (status) params.set('status', status);
  const res = await api.get<BookingListResult>(`/api/admin/bookings?${params.toString()}`);
  return res.data;
}

export async function fetchAdminBookingDetail(bookingId: string): Promise<BookingDetail> {
  const res = await api.get<BookingDetail>(`/api/admin/bookings/${bookingId}`);
  return res.data;
}

export async function openBookingDisputeCase(
  bookingId: string,
  reason: string,
): Promise<{ id: string; caseNumber: string }> {
  const res = await api.post<{ id: string; caseNumber: string }>(
    `/api/admin/bookings/${bookingId}/dispute-case`,
    { reason },
  );
  return res.data;
}
