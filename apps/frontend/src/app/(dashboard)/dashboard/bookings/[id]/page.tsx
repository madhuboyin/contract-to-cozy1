// apps/frontend/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/bookings/StatusBadge';
import { BookingTimeline } from '@/components/bookings/BookingTimeline';
import { formatEnumLabel } from '@/lib/utils/formatters';

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Not scheduled';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function BookingDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    kind: 'NOT_FOUND' | 'REQUEST_FAILED';
    message?: string;
  } | null>(null);

  const fetchBooking = useCallback(async () => {
    try {
      setLoading(true);
      setErrorState(null);
      const response = await api.getBooking(params.id as string);
      if (response.success) {
        setBooking(response.data);
      }
    } catch (error: unknown) {
      console.error('Error fetching booking:', error);
      setBooking(null);
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        setErrorState({ kind: 'NOT_FOUND' });
      } else {
        const message = error instanceof Error ? error.message : undefined;
        setErrorState({
          kind: 'REQUEST_FAILED',
          message,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-brand-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    const isRequestFailure = errorState?.kind === 'REQUEST_FAILED';
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="py-12 text-center">
            <p className="text-gray-600">
              {isRequestFailure ? 'Unable to load booking details right now.' : 'Booking not found'}
            </p>
            {isRequestFailure && errorState?.message && <p className="mt-2 text-sm text-gray-500">{errorState.message}</p>}
            <div className="mt-4 flex items-center justify-center gap-3">
              {isRequestFailure && (
                <Button onClick={fetchBooking} variant="default">
                  Retry
                </Button>
              )}
              <Button
                onClick={() => router.push('/dashboard/bookings')}
                variant={isRequestFailure ? 'outline' : 'default'}
              >
                Back to bookings
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <button
          onClick={() => router.back()}
          className="mb-6 flex min-h-[44px] items-center text-sm text-gray-600 transition-colors hover:text-gray-900"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to bookings
        </button>

        <div className="mb-6 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 p-4 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-teal-200">{booking.bookingNumber}</p>
              <h1 className="text-lg font-bold">{booking.service.name}</h1>
              <p className="text-sm text-teal-200">{booking.provider.businessName}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={booking.status} className="border-white/30 bg-white/20 text-white" />
              <div className="text-right">
                <p className="text-xl font-bold">${Number(booking.finalPrice || booking.estimatedPrice || 0).toFixed(2)}</p>
                <p className="text-xs text-teal-200">
                  {booking.scheduledDate
                    ? new Date(booking.scheduledDate).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Date TBD'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="animate-fade-in-up grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="order-1 space-y-4 sm:space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Service Information</h2>
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-sm text-gray-500">Service</p>
                  <p className="text-base font-medium text-gray-900">{booking.service.name}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-gray-500">Category</p>
                  <p className="text-base text-gray-900">{formatEnumLabel(booking.category)}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-gray-500">Scheduled Date & Time</p>
                  <p className="text-base font-medium text-gray-900">{formatDate(booking.scheduledDate)}</p>
                  <p className="text-sm text-gray-600">{formatTime(booking.scheduledDate)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Provider</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-base font-medium text-gray-900">{booking.provider.businessName}</p>
                  <p className="text-sm text-gray-600">
                    {booking.provider.firstName} {booking.provider.lastName}
                  </p>
                </div>
                {booking.provider.email && (
                  <div>
                    <p className="mb-1 text-sm text-gray-500">Email</p>
                    <p className="text-sm text-gray-900">{booking.provider.email}</p>
                  </div>
                )}
                {booking.provider.phone && (
                  <div>
                    <p className="mb-1 text-sm text-gray-500">Phone</p>
                    <p className="text-sm text-gray-900">{booking.provider.phone}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Property</h2>
              <div className="space-y-2">
                {booking.property.name && <p className="text-base font-medium text-gray-900">{booking.property.name}</p>}
                <p className="text-sm text-gray-900">{booking.property.address}</p>
                <p className="text-sm text-gray-600">
                  {booking.property.city}, {booking.property.state} {booking.property.zipCode}
                </p>
              </div>
            </div>

            {(booking.description || booking.specialRequests) && (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Additional Details</h2>
                <div className="space-y-4">
                  {booking.description && (
                    <div>
                      <p className="mb-1 text-sm text-gray-500">Description</p>
                      <p className="text-sm text-gray-900">{booking.description}</p>
                    </div>
                  )}
                  {booking.specialRequests && (
                    <div>
                      <p className="mb-1 text-sm text-gray-500">Special Requests</p>
                      <p className="text-sm text-gray-900">{booking.specialRequests}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="order-2 space-y-4 sm:space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Pricing</h2>
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-sm text-gray-500">Estimated Price</p>
                  <p className="text-xl font-bold text-gray-900 sm:text-2xl">
                    ${Number(booking.estimatedPrice || 0).toFixed(2)}
                  </p>
                </div>
                {booking.finalPrice && (
                  <div className="border-t border-gray-200 pt-4">
                    <p className="mb-1 text-sm text-gray-500">Final Price</p>
                    <p className="text-xl font-bold text-green-600 sm:text-2xl">
                      ${Number(booking.finalPrice || 0).toFixed(2)}
                    </p>
                  </div>
                )}
                {booking.depositAmount && (
                  <div>
                    <p className="mb-1 text-sm text-gray-500">Deposit Paid</p>
                    <p className="text-base font-medium text-gray-900">
                      ${Number(booking.depositAmount || 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {booking.timeline && booking.timeline.length > 0 && (
              <BookingTimeline currentStatus={booking.status} timeline={booking.timeline} />
            )}

            {booking.cancelledAt && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-red-500">Cancelled</h2>
                <p className="mb-3 text-sm text-red-700">{formatDateTime(booking.cancelledAt)}</p>
                {booking.cancellationReason && <p className="text-sm text-red-800">{booking.cancellationReason}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
