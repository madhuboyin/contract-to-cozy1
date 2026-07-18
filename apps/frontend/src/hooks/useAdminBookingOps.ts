// apps/frontend/src/hooks/useAdminBookingOps.ts
//
// React Query hooks for the Admin Booking Operations workspace.

import { useQuery } from '@tanstack/react-query';
import { BookingStatus, fetchAdminBookingDetail, fetchAdminBookings } from '@/lib/api/adminBookingOps';

export function useAdminBookingSearch(q: string, status: BookingStatus | undefined, page = 1) {
  return useQuery({
    queryKey: ['admin-booking-search', q, status ?? 'ALL', page],
    queryFn: () => fetchAdminBookings(q, status, page),
    staleTime: 15_000,
  });
}

export function useAdminBookingDetail(bookingId: string | null) {
  return useQuery({
    queryKey: ['admin-booking-detail', bookingId],
    queryFn: () => fetchAdminBookingDetail(bookingId as string),
    enabled: !!bookingId,
    staleTime: 5_000,
  });
}
