'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  const loadBooking = async () => {
    try {
      const response = await api.getBooking(bookingId);
      if (response.success) {
        setBooking(response.data);
      }
    } catch (error) {
      console.error('Failed to load booking:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      CONFIRMED: 'bg-blue-100 text-blue-800',
      IN_PROGRESS: 'bg-purple-100 text-purple-800',
      COMPLETED: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800',
      DISPUTED: 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <p className="text-gray-600">Booking not found</p>
          <button
            onClick={() => router.push('/dashboard/bookings')}
            className="text-blue-600 hover:text-blue-700 mt-4"
          >
            ← Back to bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to bookings
        </button>
      </div>

      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Booking Details</h1>
            <p className="mt-1 text-sm text-gray-600">{booking.bookingNumber}</p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(booking.status)}`}>
            {booking.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Provider Info */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Provider</h2>
        <div className="space-y-2">
          <p className="text-base font-medium text-gray-900">{booking.provider.businessName}</p>
          <p className="text-sm text-gray-600">
            {booking.provider.firstName} {booking.provider.lastName}
          </p>
          {booking.provider.email && (
            <p className="text-sm text-gray-600">{booking.provider.email}</p>
          )}
          {booking.provider.phone && (
            <p className="text-sm text-gray-600">{booking.provider.phone}</p>
          )}
        </div>
      </div>

      {/* Service & Schedule */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Service Details</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Service</p>
            <p className="mt-1 text-base text-gray-900">{booking.service.name}</p>
            <p className="text-sm text-gray-600">{booking.category.replace('_', ' ')}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Scheduled Date</p>
            <p className="mt-1 text-base text-gray-900">{formatDate(booking.scheduledDate)}</p>
            {booking.startTime && (
              <p className="text-sm text-gray-600">
                {booking.startTime}
                {booking.endTime && ` - ${booking.endTime}`}
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Description</p>
            <p className="mt-1 text-sm text-gray-900">{booking.description}</p>
          </div>

          {booking.specialRequests && (
            <div>
              <p className="text-sm font-medium text-gray-700">Special Requests</p>
              <p className="mt-1 text-sm text-gray-900">{booking.specialRequests}</p>
            </div>
          )}
        </div>
      </div>

      {/* Property */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Property</h2>
        <div className="space-y-1">
          {booking.property.name && (
            <p className="text-base font-medium text-gray-900">{booking.property.name}</p>
          )}
          <p className="text-sm text-gray-600">{booking.property.address}</p>
          <p className="text-sm text-gray-600">
            {booking.property.city}, {booking.property.state} {booking.property.zipCode}
          </p>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Pricing</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Estimated Price</span>
            <span className="text-sm font-medium text-gray-900">${booking.estimatedPrice}</span>
          </div>
          {booking.depositAmount && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Deposit</span>
              <span className="text-sm font-medium text-gray-900">${booking.depositAmount}</span>
            </div>
          )}
          {booking.finalPrice && (
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="text-base font-medium text-gray-900">Final Price</span>
              <span className="text-base font-bold text-gray-900">${booking.finalPrice}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}