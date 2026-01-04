// apps/frontend/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';
import { 
  Calendar, 
  MapPin, 
  User, 
  Phone, 
  Mail, 
  DollarSign,
  Clock,
  FileText,
  ChevronLeft 
} from 'lucide-react';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'CONFIRMED':
      return 'bg-green-100 text-green-800';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800';
    case 'COMPLETED':
      return 'bg-gray-100 text-gray-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    case 'DISPUTED':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
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

export default function BookingDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBooking();
  }, [params.id]);

  const fetchBooking = async () => {
    try {
      setLoading(true);
      const response = await api.getBooking(params.id as string);
      if (response.success) {
        setBooking(response.data);
      }
    } catch (error) {
      console.error('Error fetching booking:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to bookings
        </button>

        {/* Header - Compact */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Booking Details</h1>
              <p className="text-sm text-gray-500 mt-1">{booking.bookingNumber}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
              {booking.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Info (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Provider Info - Compact */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Provider</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-base font-medium text-gray-900">{booking.provider.businessName}</p>
                  <p className="text-sm text-gray-600">
                    {booking.provider.firstName} {booking.provider.lastName}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {booking.provider.email && (
                    <div className="flex items-center text-gray-600">
                      <Mail className="w-4 h-4 mr-1.5" />
                      {booking.provider.email}
                    </div>
                  )}
                  {booking.provider.phone && (
                    <div className="flex items-center text-gray-600">
                      <Phone className="w-4 h-4 mr-1.5" />
                      {booking.provider.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Service Details - Compact */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Service Details</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Service</p>
                    <p className="text-sm font-medium text-gray-900">{booking.service.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{booking.category.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Scheduled</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(booking.scheduledDate)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatTime(booking.scheduledDate)}</p>
                  </div>
                </div>

                {booking.description && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-gray-700">{booking.description}</p>
                  </div>
                )}

                {booking.specialRequests && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Special Requests</p>
                    <p className="text-sm text-gray-700">{booking.specialRequests}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Property - Compact */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Property</h2>
              <div className="space-y-2">
                {booking.property.name && (
                  <p className="text-base font-medium text-gray-900">{booking.property.name}</p>
                )}
                <div className="flex items-start text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-1.5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{booking.property.address}</p>
                    <p>{booking.property.city}, {booking.property.state} {booking.property.zipCode}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Summary (1/3 width) */}
          <div className="space-y-6">
            {/* Pricing Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Pricing</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Estimated Price</span>
                  <span className="text-lg font-bold text-gray-900">
                    ${parseFloat(booking.estimatedPrice).toFixed(2)}
                  </span>
                </div>
                {booking.finalPrice && (
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="text-sm text-gray-600">Final Price</span>
                    <span className="text-lg font-bold text-green-600">
                      ${parseFloat(booking.finalPrice).toFixed(2)}
                    </span>
                  </div>
                )}
                {booking.depositAmount && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Deposit Paid</span>
                    <span className="font-medium text-gray-900">
                      ${parseFloat(booking.depositAmount).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline - Compact */}
            {booking.timeline && booking.timeline.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Timeline</h2>
                <div className="space-y-3">
                  {booking.timeline.map((entry, index) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${
                          index === booking.timeline!.length - 1 ? 'bg-blue-500' : 'bg-gray-300'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {entry.status.replace('_', ' ')}
                        </p>
                        {entry.note && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(entry.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cancellation Info */}
            {booking.cancelledAt && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-red-900 mb-2">Cancelled</h3>
                <p className="text-xs text-red-700">
                  {new Date(booking.cancelledAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                {booking.cancellationReason && (
                  <p className="text-sm text-red-800 mt-2">{booking.cancellationReason}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}