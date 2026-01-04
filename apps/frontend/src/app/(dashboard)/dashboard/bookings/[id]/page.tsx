// apps/frontend/src/app/(dashboard)/dashboard/bookings/[id]/page.tsx
// ✅ REDESIGNED: Modern unified layout with consistent spacing and balanced cards

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
  ChevronLeft,
  Briefcase
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
        <div className="max-w-6xl mx-auto px-4">
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
        <div className="max-w-6xl mx-auto px-4">
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
      <div className="max-w-6xl mx-auto px-4">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to bookings
        </button>

        {/* Single Unified Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Booking Details</h1>
                <p className="text-sm text-gray-500 mt-1">{booking.bookingNumber}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                {booking.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Content Grid - Balanced 2-column */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
            {/* Left Column */}
            <div className="p-6 space-y-6">
              {/* Service Info */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Service</h2>
                </div>
                <div className="ml-7 space-y-2">
                  <p className="text-base font-medium text-gray-900">{booking.service.name}</p>
                  <p className="text-sm text-gray-600">{booking.category.replace('_', ' ')}</p>
                </div>
              </div>

              {/* Schedule Info */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Schedule</h2>
                </div>
                <div className="ml-7 space-y-2">
                  <p className="text-base font-medium text-gray-900">{formatDate(booking.scheduledDate)}</p>
                  <p className="text-sm text-gray-600">{formatTime(booking.scheduledDate)}</p>
                </div>
              </div>

              {/* Provider Info */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Provider</h2>
                </div>
                <div className="ml-7 space-y-2">
                  <p className="text-base font-medium text-gray-900">{booking.provider.businessName}</p>
                  <p className="text-sm text-gray-600">
                    {booking.provider.firstName} {booking.provider.lastName}
                  </p>
                  {booking.provider.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4" />
                      {booking.provider.email}
                    </div>
                  )}
                  {booking.provider.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      {booking.provider.phone}
                    </div>
                  )}
                </div>
              </div>

              {/* Property Info */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Property</h2>
                </div>
                <div className="ml-7 space-y-1">
                  {booking.property.name && (
                    <p className="text-base font-medium text-gray-900">{booking.property.name}</p>
                  )}
                  <p className="text-sm text-gray-600">{booking.property.address}</p>
                  <p className="text-sm text-gray-600">
                    {booking.property.city}, {booking.property.state} {booking.property.zipCode}
                  </p>
                </div>
              </div>

              {/* Description */}
              {booking.description && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Description</h2>
                  </div>
                  <div className="ml-7">
                    <p className="text-sm text-gray-700">{booking.description}</p>
                  </div>
                </div>
              )}

              {/* Special Requests */}
              {booking.specialRequests && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 ml-7">Special Requests</h3>
                  <div className="ml-7">
                    <p className="text-sm text-gray-700">{booking.specialRequests}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="p-6 space-y-6 bg-gray-50/50">
              {/* Pricing */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-5 h-5 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Pricing</h2>
                </div>
                <div className="ml-7 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Estimated Price</span>
                    <span className="text-xl font-bold text-gray-900">
                      ${parseFloat(booking.estimatedPrice).toFixed(2)}
                    </span>
                  </div>
                  {booking.finalPrice && (
                    <>
                      <div className="border-t border-gray-200 pt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Final Price</span>
                          <span className="text-xl font-bold text-green-600">
                            ${parseFloat(booking.finalPrice).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </>
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

              {/* Timeline */}
              {booking.timeline && booking.timeline.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Timeline</h2>
                  </div>
                  <div className="ml-7 space-y-4">
                    {booking.timeline.map((entry, index) => (
                      <div key={entry.id} className="relative">
                        {index !== booking.timeline!.length - 1 && (
                          <div className="absolute left-1 top-6 bottom-0 w-px bg-gray-300" />
                        )}
                        <div className="flex gap-3 items-start">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                            index === booking.timeline!.length - 1 ? 'bg-blue-500' : 'bg-gray-300'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {entry.status.replace('_', ' ')}
                            </p>
                            {entry.note && (
                              <p className="text-xs text-gray-600 mt-0.5">{entry.note}</p>
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

              {/* Cancellation Info */}
              {booking.cancelledAt && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-red-900 mb-2">Cancelled</h3>
                  <p className="text-xs text-red-700 mb-2">
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
    </div>
  );
}