// apps/frontend/src/app/(dashboard)/dashboard/bookings/page.tsx

'use client';

import { useState, useEffect, useCallback, type ComponentType } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Booking, BookingStatus, CreateBookingInput } from '@/types';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Edit,
  Eye,
  LoaderCircle,
  House,
  XCircle,
} from 'lucide-react';
import LottieBadge from '@/components/ui/LottieBadge';
import { housePulseAnimation } from '@/components/animations/lottieData';

interface EditFormData {
  scheduledDate: string;
  description: string;
  specialRequests: string;
}

const toLocalDatetimeInput = (isoString: string | null): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const offset = date.getTimezoneOffset() * 60000;
  const localTime = new Date(date.getTime() - offset);
  return localTime.toISOString().slice(0, 16);
};

const UPCOMING_SOON_WINDOW_DAYS = 7;
const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
};

const StatusDot = ({ status }: { status: BookingStatus }) => {
  const colors: Record<BookingStatus, string> = {
    DRAFT: 'border-slate-300 bg-slate-100 text-slate-700',
    PENDING: 'border-amber-300 bg-amber-100 text-amber-800',
    CONFIRMED: 'border-emerald-300 bg-emerald-100 text-emerald-800',
    IN_PROGRESS: 'border-sky-300 bg-sky-100 text-sky-800',
    COMPLETED: 'border-teal-300 bg-teal-100 text-teal-800',
    CANCELLED: 'border-rose-300 bg-rose-100 text-rose-800',
    DISPUTED: 'border-orange-300 bg-orange-100 text-orange-800',
  };

  const icons: Record<BookingStatus, ComponentType<{ className?: string }>> = {
    DRAFT: CircleDashed,
    PENDING: Clock3,
    CONFIRMED: CheckCircle2,
    IN_PROGRESS: LoaderCircle,
    COMPLETED: CheckCircle2,
    CANCELLED: XCircle,
    DISPUTED: AlertTriangle,
  };
  const Icon = icons[status];
  const isInProgress = status === 'IN_PROGRESS';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[status]}`}>
      <Icon className={`h-3.5 w-3.5 ${isInProgress ? 'animate-spin' : ''}`} />
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
};

// Format date compactly
const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Not scheduled';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
};

// Shorten property address
const formatProperty = (property: Booking['property'] | null | undefined) => {
  if (!property) return 'N/A';
  const parts = [property.address, property.city, property.state];
  return parts.filter(Boolean).join(', ');
};

const isUpcomingSoon = (booking: Booking): boolean => {
  if (!booking.scheduledDate) return false;
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') return false;

  const scheduledAt = new Date(booking.scheduledDate);
  if (Number.isNaN(scheduledAt.getTime())) return false;

  const now = new Date();
  const soonCutoff = new Date(now);
  soonCutoff.setDate(now.getDate() + UPCOMING_SOON_WINDOW_DAYS);
  return scheduledAt >= now && scheduledAt <= soonCutoff;
};

function getEmptyStateTone(filter: 'all' | BookingStatus) {
  if (filter === 'all') {
    return {
      iconClass: 'absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-brand-700',
      reducedBgClass: 'bg-brand-50',
      speed: 0.8,
      loop: false,
    };
  }

  if (filter === 'CANCELLED' || filter === 'DISPUTED') {
    return {
      iconClass: 'absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-rose-600',
      reducedBgClass: 'bg-rose-50',
      speed: 0.75,
      loop: false,
    };
  }

  if (filter === 'COMPLETED') {
    return {
      iconClass: 'absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-emerald-600',
      reducedBgClass: 'bg-emerald-50',
      speed: 0.75,
      loop: false,
    };
  }

  return {
    iconClass: 'absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-amber-600',
    reducedBgClass: 'bg-amber-50',
    speed: 0.9,
    loop: false,
  };
}

export default function HomeownerBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    scheduledDate: '',
    description: '',
    specialRequests: '',
  });
  const [saving, setSaving] = useState(false);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.listBookings({});
      
      if (response.success) {
        setBookings(response.data.bookings);
      }
    } catch (err: unknown) {
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();

    // Refetch when the tab regains focus so data is fresh after navigation
    const onFocus = () => fetchBookings();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchBookings]);

  const filteredBookings = filter === 'all' 
    ? bookings 
    : bookings.filter(b => b.status === filter);
  const emptyStateTone = getEmptyStateTone(filter);

  const canEditBooking = (status: BookingStatus) => {
    return status === 'PENDING' || status === 'CONFIRMED';
  };

  const canCancelBooking = (status: BookingStatus) => {
    return status === 'PENDING' || status === 'CONFIRMED' || status === 'IN_PROGRESS';
  };

  const handleEditClick = (booking: Booking) => {
    setEditingBooking(booking);
    setEditFormData({
      scheduledDate: toLocalDatetimeInput(booking.scheduledDate),
      description: booking.description || '',
      specialRequests: booking.specialRequests || '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;

    try {
      setSaving(true);
      setError(null);

      const updates: Partial<CreateBookingInput> = {
        description: editFormData.description,
      };

      if (editFormData.scheduledDate) {
        updates.scheduledDate = new Date(editFormData.scheduledDate).toISOString();
      }

      if (editFormData.specialRequests) {
        updates.specialRequests = editFormData.specialRequests;
      }

      const response = await api.updateBooking(editingBooking.id, updates);

      if (response.success) {
        setSuccess('Booking updated successfully');
        setShowEditModal(false);
        setEditingBooking(null);
        fetchBookings();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update booking');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelClick = (booking: Booking) => {
    setCancellingBooking(booking);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cancellingBooking) return;

    if (cancelReason.length < 10) {
      setError('Cancellation reason must be at least 10 characters');
      return;
    }

    try {
      setCancelling(true);
      setError(null);

      const response = await api.cancelBooking(cancellingBooking.id, cancelReason);

      if (response.success) {
        setSuccess('Booking cancelled successfully');
        setShowCancelModal(false);
        setCancellingBooking(null);
        setCancelReason('');
        fetchBookings();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  const renderActions = (booking: Booking, centered = false) => (
    <div className={`flex items-center gap-1 ${centered ? 'justify-center' : 'justify-end'}`}>
      <Link
        href={`/dashboard/bookings/${booking.id}`}
        aria-label={`View booking ${booking.bookingNumber}`}
        title="View Details"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600 md:h-9 md:w-9"
      >
        <Eye className="h-4 w-4" />
      </Link>

      {canEditBooking(booking.status) && (
        <button
          type="button"
          onClick={() => handleEditClick(booking)}
          aria-label={`Edit booking ${booking.bookingNumber}`}
          title="Edit Booking"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600 md:h-9 md:w-9"
        >
          <Edit className="h-4 w-4" />
        </button>
      )}

      {canCancelBooking(booking.status) && (
        <button
          type="button"
          onClick={() => handleCancelClick(booking)}
          aria-label={`Cancel booking ${booking.bookingNumber}`}
          title="Cancel Booking"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 md:h-9 md:w-9"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl lg:text-3xl">My Bookings</h1>
          <p className="mt-2 text-muted-foreground">
            View and manage your service bookings
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Filter Buttons */}
        <div className="sticky top-[calc(env(safe-area-inset-top)+4.25rem)] z-20 -mx-2 rounded-xl bg-gray-50/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 md:static md:z-auto md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="inline-flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`min-h-[44px] whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                All
              </button>
              {(['DRAFT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as BookingStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`min-h-[44px] whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    filter === status
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border bg-white py-10 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-brand-primary" />
            <p className="mt-3 text-gray-600">Loading bookings...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center">
            <div className="mx-auto mb-3 flex justify-center">
              <LottieBadge
                animationData={housePulseAnimation}
                icon={House}
                size={72}
                iconClassName={emptyStateTone.iconClass}
                reducedMotionBgClassName={emptyStateTone.reducedBgClass}
                speed={emptyStateTone.speed}
                loop={emptyStateTone.loop}
              />
            </div>
            <h3 className="mb-2 text-base sm:text-lg font-medium text-gray-900">No bookings found</h3>
            <p className="mb-6 text-gray-600">
              {filter === 'all'
                ? "You haven't made any bookings yet."
                : `No ${filter.toLowerCase().replace('_', ' ')} bookings.`}
            </p>
            <Link
              href="/dashboard/find-services"
              className="inline-flex items-center rounded-lg bg-brand-primary px-4 py-2 text-white hover:bg-brand-primary-light"
            >
              Find Services
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="grid gap-4 md:hidden">
              {filteredBookings.map((booking) => {
                const isSoon = isUpcomingSoon(booking);
                return (
                <div
                  key={booking.id}
                  className={`rounded-xl border bg-white p-3 shadow-sm transition-colors sm:p-4 ${
                    isSoon ? 'border-amber-200 shadow-[0_12px_24px_-18px_rgba(180,83,9,0.5)]' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm sm:text-base font-semibold text-gray-900">
                        {booking.service?.name || 'Service'}
                      </div>
                      <div className="mt-1 truncate text-sm text-gray-500">
                        {booking.provider?.businessName || 'Provider'}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">#{booking.bookingNumber}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2.5 text-sm text-muted-foreground">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Date</span>
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <CalendarClock className="h-3.5 w-3.5 text-gray-500" />
                        <span className="font-medium">{formatDate(booking.scheduledDate)}</span>
                        {isSoon && (
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            Soon
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Time</span>
                      <span className="text-foreground">{formatTime(booking.scheduledDate)}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Price</span>
                      <span className="font-semibold text-foreground">
                        ${Number(booking.estimatedPrice || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Property</span>
                      <span className="text-right text-foreground">{formatProperty(booking.property)}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Status</span>
                      <StatusDot status={booking.status} />
                    </div>
                  </div>
                  <div className="mt-3">{renderActions(booking)}</div>
                </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-xl border bg-white shadow-sm md:block">
              <div className="grid grid-cols-12 gap-4 border-b border-gray-200 bg-gray-50 px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                <div className="md:col-span-3">Service</div>
                <div className="md:col-span-2">Date & Time</div>
                <div className="md:col-span-3">Property</div>
                <div className="md:col-span-2">Status</div>
                <div className="md:col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-gray-100">
                {filteredBookings.map((booking) => {
                  const isSoon = isUpcomingSoon(booking);
                  return (
                  <div
                    key={booking.id}
                    className="grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-gray-50"
                  >
                    <div className="md:col-span-3">
                      <div className="text-sm font-medium text-gray-900">
                        {booking.service?.name || 'Service'}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {booking.provider?.businessName || 'Provider'}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">#{booking.bookingNumber}</div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-1 text-sm text-gray-900">
                          <CalendarClock className="h-3.5 w-3.5 text-gray-500" />
                          {formatDate(booking.scheduledDate)}
                        </div>
                        {isSoon && (
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            Soon
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{formatTime(booking.scheduledDate)}</div>
                      <div className="mt-1 text-xs font-medium text-gray-900">
                        ${Number(booking.estimatedPrice || 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <div className="truncate text-sm text-gray-900">{booking.property?.address || 'N/A'}</div>
                      <div className="mt-1 truncate text-xs text-gray-500">
                        {booking.property?.city && booking.property?.state
                          ? `${booking.property.city}, ${booking.property.state}`
                          : ''}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <StatusDot status={booking.status} />
                    </div>

                    <div className="md:col-span-2 text-right">
                      {renderActions(booking)}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      

      {/* Edit Modal - Keep existing modal code */}
      {showEditModal && editingBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center overflow-y-auto p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Edit Booking</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="h-11 w-11 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Close edit booking modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleEditSubmit}>
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700">Service</p>
                  <p className="text-base sm:text-lg text-gray-900 break-words">{editingBooking.service?.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{editingBooking.provider?.businessName}</p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5 leading-tight break-words">
                      Scheduled Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={editFormData.scheduledDate}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                      className="w-full min-w-0 text-sm px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={editFormData.description}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      className="w-full text-sm px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Special Requests
                    </label>
                    <textarea
                      value={editFormData.specialRequests}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, specialRequests: e.target.value }))}
                      rows={2}
                      className="w-full text-sm px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal - Keep existing modal code */}
      {showCancelModal && cancellingBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center overflow-y-auto p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[80vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Cancel Booking</h2>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="h-11 w-11 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Close cancel booking modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCancelSubmit}>
                <div className="mb-3 sm:mb-4">
                  <p className="text-sm text-gray-600">
                    You are about to cancel your booking for:
                  </p>
                  <p className="text-base sm:text-lg font-medium text-gray-900 mt-1.5 break-words">
                    {cancellingBooking.service?.name}
                  </p>
                </div>

                  <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 leading-tight break-words">
                    Reason for cancellation <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                    required
                    placeholder="Please provide a reason (minimum 10 characters)"
                    className="w-full text-sm px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="mt-4 sm:mt-6 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(false)}
                    className="flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Keep
                  </button>
                  <button
                    type="submit"
                    disabled={cancelling || cancelReason.length < 10}
                    className="flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling ? 'Cancelling...' : 'Cancel'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
