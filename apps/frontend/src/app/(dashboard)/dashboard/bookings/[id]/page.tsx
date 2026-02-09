// apps/frontend/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';



const getStatusColor = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800 border-gray-300';
    case 'PENDING':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'CONFIRMED':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'IN_PROGRESS':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'COMPLETED':
      return 'bg-gray-100 text-gray-700 border-gray-300';
    case 'CANCELLED':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'DISPUTED':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

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
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    const isRequestFailure = errorState?.kind === 'REQUEST_FAILED';
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center py-12">
            <p className="text-gray-600">
              {isRequestFailure ? 'Unable to load booking details right now.' : 'Booking not found'}
            </p>
            {isRequestFailure && errorState?.message && (
              <p className="text-sm text-gray-500 mt-2">{errorState.message}</p>
            )}
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors min-h-[44px]"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to bookings
        </button>

        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Booking Details</h1>
              <p className="text-sm text-gray-500 mt-1 sm:mt-2">{booking.bookingNumber}</p>
            </div>
            <span className={`self-start inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium border ${getStatusColor(booking.status)}`}>
              {booking.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Mobile-only: Compact pricing summary so users see cost immediately */}
        <div className="lg:hidden mb-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">
                {booking.finalPrice ? 'Final Price' : 'Estimated Price'}
              </p>
              <p className={`text-xl font-bold ${booking.finalPrice ? 'text-green-600' : 'text-gray-900'}`}>
                ${Number(booking.finalPrice || booking.estimatedPrice || 0).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Scheduled</p>
              <p className="text-sm font-medium text-gray-900">
                {booking.scheduledDate
                  ? new Date(booking.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'TBD'}
              </p>
            </div>
          </div>
        </div>

        {/* Content Grid — explicit order ensures main content always appears first on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Main Content - 2/3 width */}
          <div className="order-1 lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Service Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Information</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Service</p>
                  <p className="text-base font-medium text-gray-900">{booking.service.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Category</p>
                  <p className="text-base text-gray-900">{booking.category.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Scheduled Date & Time</p>
                  <p className="text-base font-medium text-gray-900">{formatDate(booking.scheduledDate)}</p>
                  <p className="text-sm text-gray-600">{formatTime(booking.scheduledDate)}</p>
                </div>
              </div>
            </div>

            {/* Provider Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Provider</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-base font-medium text-gray-900">{booking.provider.businessName}</p>
                  <p className="text-sm text-gray-600">{booking.provider.firstName} {booking.provider.lastName}</p>
                </div>
                {booking.provider.email && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Email</p>
                    <p className="text-sm text-gray-900">{booking.provider.email}</p>
                  </div>
                )}
                {booking.provider.phone && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Phone</p>
                    <p className="text-sm text-gray-900">{booking.provider.phone}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Property Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Property</h2>
              <div className="space-y-2">
                {booking.property.name && (
                  <p className="text-base font-medium text-gray-900">{booking.property.name}</p>
                )}
                <p className="text-sm text-gray-900">{booking.property.address}</p>
                <p className="text-sm text-gray-600">
                  {booking.property.city}, {booking.property.state} {booking.property.zipCode}
                </p>
              </div>
            </div>

            {/* Description & Requests */}
            {(booking.description || booking.specialRequests) && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h2>
                <div className="space-y-4">
                  {booking.description && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Description</p>
                      <p className="text-sm text-gray-900">{booking.description}</p>
                    </div>
                  )}
                  {booking.specialRequests && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Special Requests</p>
                      <p className="text-sm text-gray-900">{booking.specialRequests}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - 1/3 width, appears after main content on mobile */}
          <div className="order-2 space-y-4 sm:space-y-6">
            {/* Pricing Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Estimated Price</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${Number(booking.estimatedPrice || 0).toFixed(2)}
                  </p>
                </div>
                {booking.finalPrice && (
                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-500 mb-1">Final Price</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${Number(booking.finalPrice || 0).toFixed(2)}
                    </p>
                  </div>
                )}
                {booking.depositAmount && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Deposit Paid</p>
                    <p className="text-base font-medium text-gray-900">
                      ${Number(booking.depositAmount || 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline Card */}
            {booking.timeline && booking.timeline.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
                <div className="space-y-4">
                  {booking.timeline.map((entry, index) => (
                    <div key={entry.id} className="relative">
                      {index !== (booking.timeline?.length ?? 0) - 1 && (
                        <div className="absolute left-2 top-8 bottom-0 w-px bg-gray-200" />
                      )}
                      <div className="flex gap-3">
                        <div className={`w-4 h-4 rounded-full mt-0.5 flex-shrink-0 ${
                          index === (booking.timeline?.length ?? 0) - 1
                            ? 'bg-blue-500 ring-4 ring-blue-100' 
                            : 'bg-gray-300'
                        }`} />
                        <div className="flex-1 min-w-0 pb-4">
                          <p className="text-sm font-medium text-gray-900">
                            {entry.status.replace('_', ' ')}
                          </p>
                          {entry.note && (
                            <p className="text-xs text-gray-600 mt-1">{entry.note}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDateTime(entry.createdAt.toString())}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cancellation Card */}
            {booking.cancelledAt && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-6">
                <h3 className="text-base font-semibold text-red-900 mb-2">Cancelled</h3>
                <p className="text-sm text-red-700 mb-3">
                  {formatDateTime(booking.cancelledAt.toString())}
                </p>
                {booking.cancellationReason && (
                  <p className="text-sm text-red-800">{booking.cancellationReason}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
