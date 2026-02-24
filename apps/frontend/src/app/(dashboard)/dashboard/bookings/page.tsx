// apps/frontend/src/app/(dashboard)/dashboard/bookings/page.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Booking, BookingStatus, CreateBookingInput } from '@/types';
import { CalendarClock, Edit, Eye, House, XCircle } from 'lucide-react';
import LottieBadge from '@/components/ui/LottieBadge';
import { housePulseAnimation } from '@/components/animations/lottieData';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/bookings/StatusBadge';

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

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Not scheduled';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

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

function groupBookings(bookings: Booking[]): { upcoming: Booking[]; recent: Booking[]; past: Booking[] } {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    upcoming: bookings.filter(
      (b) =>
        b.scheduledDate &&
        new Date(b.scheduledDate) >= now &&
        ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)
    ),
    recent: bookings.filter(
      (b) =>
        b.scheduledDate &&
        new Date(b.scheduledDate) < now &&
        new Date(b.scheduledDate) > thirtyDaysAgo &&
        b.status !== 'CANCELLED'
    ),
    past: bookings.filter(
      (b) =>
        !b.scheduledDate || new Date(b.scheduledDate) <= thirtyDaysAgo || b.status === 'CANCELLED' || b.status === 'DISPUTED'
    ),
  };
}

export default function HomeownerBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    scheduledDate: '',
    description: '',
    specialRequests: '',
  });
  const [saving, setSaving] = useState(false);

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
    } catch {
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();

    const onFocus = () => fetchBookings();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchBookings]);

  const filteredBookings = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);
  const groupedBookings = groupBookings(filteredBookings);
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

  const renderDesktopActions = (booking: Booking) => (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/dashboard/bookings/${booking.id}`}
        aria-label={`View booking ${booking.bookingNumber}`}
        title="View Details"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
      >
        <Eye className="h-4 w-4" />
      </Link>

      {canEditBooking(booking.status) && (
        <button
          type="button"
          onClick={() => handleEditClick(booking)}
          aria-label={`Edit booking ${booking.bookingNumber}`}
          title="Edit Booking"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const renderDesktopRow = (booking: Booking) => {
    const isSoon = isUpcomingSoon(booking);

    return (
      <div
        key={booking.id}
        className={cn(
          'grid grid-cols-12 items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-4 transition-colors hover:bg-gray-50',
          isSoon && 'border-amber-200'
        )}
      >
        <div className="col-span-4">
          <div className="text-sm font-semibold text-gray-900">{booking.service?.name || 'Service'}</div>
          <div className="mt-1 text-xs text-gray-500">{booking.provider?.businessName || 'Provider'}</div>
          <div className="mt-1 text-xs text-gray-400">#{booking.bookingNumber}</div>
        </div>

        <div className="col-span-3">
          <div className="inline-flex items-center gap-1 text-sm text-gray-900">
            <CalendarClock className="h-3.5 w-3.5 text-gray-500" />
            {formatDate(booking.scheduledDate)}
          </div>
          <div className="mt-1 text-xs text-gray-500">{formatTime(booking.scheduledDate)}</div>
          <div className="mt-1 text-xs font-medium text-gray-900">${Number(booking.estimatedPrice || 0).toFixed(2)}</div>
        </div>

        <div className="col-span-3">
          <div className="truncate text-sm text-gray-900">{booking.property?.address || 'N/A'}</div>
          <div className="mt-1 truncate text-xs text-gray-500">
            {booking.property?.city && booking.property?.state ? `${booking.property.city}, ${booking.property.state}` : ''}
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-between gap-2">
          <StatusBadge status={booking.status} />
          {renderDesktopActions(booking)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl lg:text-3xl">My Bookings</h1>
        <p className="mt-2 text-muted-foreground">View and manage your service bookings</p>
      </div>

      {success && <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">{success}</div>}

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>}

      <div className="sticky top-[calc(env(safe-area-inset-top)+4.25rem)] z-20 -mx-2 bg-white/90 px-2 py-2 backdrop-blur-sm supports-[backdrop-filter]:bg-white/70 md:static md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
          <div className="inline-flex gap-1.5 rounded-xl bg-gray-100 p-1">
            {['all', 'DRAFT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => {
              const isActive = filter === status;
              return (
                <button
                  key={status}
                  onClick={() => setFilter(status as BookingStatus | 'all')}
                  className={cn(
                    'min-h-[36px] whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                    isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {status === 'all' ? 'All' : formatEnumLabel(status)}
                </button>
              );
            })}
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
          <h3 className="mb-2 text-base font-medium text-gray-900 sm:text-lg">No bookings found</h3>
          <p className="mb-6 text-gray-600">
            {filter === 'all' ? "You haven't made any bookings yet." : `No ${formatEnumLabel(filter)} bookings.`}
          </p>
          <Link
            href="/dashboard/find-services"
            className="inline-flex items-center rounded-lg bg-brand-primary px-4 py-2 text-white hover:bg-brand-primary/90"
          >
            Find Services
          </Link>
        </div>
      ) : (
        <div className="animate-fade-in-up space-y-4">
          <div className="grid gap-4 md:hidden">
            {filteredBookings.map((booking) => {
              const isSoon = isUpcomingSoon(booking);
              return (
                <div
                  key={booking.id}
                  className={cn(
                    'rounded-xl border bg-white p-3 shadow-sm transition-colors sm:p-4',
                    isSoon && 'border-amber-200 shadow-[0_12px_24px_-18px_rgba(180,83,9,0.5)]'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                        {booking.service?.name || 'Service'}
                      </div>
                      <div className="mt-1 truncate text-sm text-gray-500">{booking.provider?.businessName || 'Provider'}</div>
                      <div className="mt-1 text-xs text-gray-400">#{booking.bookingNumber}</div>
                    </div>
                    <StatusBadge status={booking.status} />
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
                      <span className="font-semibold text-foreground">${Number(booking.estimatedPrice || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Property</span>
                      <span className="text-right text-foreground">{formatProperty(booking.property)}</span>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-gray-50 pt-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/bookings/${booking.id}`}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gray-50 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Link>

                      {canEditBooking(booking.status) && (
                        <button
                          type="button"
                          onClick={() => handleEditClick(booking)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-50 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      )}

                      {canCancelBooking(booking.status) && (
                        <button
                          type="button"
                          onClick={() => handleCancelClick(booking)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-50 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden space-y-4 md:block">
            {filter === 'all' ? (
              <>
                {groupedBookings.upcoming.length > 0 && (
                  <>
                    <div className="mb-2 mt-1 flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-teal-600">Upcoming</span>
                      <div className="h-px flex-1 bg-teal-100" />
                    </div>
                    <div className="space-y-3">{groupedBookings.upcoming.map((booking) => renderDesktopRow(booking))}</div>
                  </>
                )}

                {groupedBookings.recent.length > 0 && (
                  <>
                    <div className="mb-2 mt-4 flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Recent</span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                    <div className="space-y-3">{groupedBookings.recent.map((booking) => renderDesktopRow(booking))}</div>
                  </>
                )}

                {groupedBookings.past.length > 0 && (
                  <>
                    <div className="mb-2 mt-4 flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Past</span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                    <div className="space-y-3">{groupedBookings.past.map((booking) => renderDesktopRow(booking))}</div>
                  </>
                )}
              </>
            ) : (
              <div className="space-y-3">{filteredBookings.map((booking) => renderDesktopRow(booking))}</div>
            )}
          </div>
        </div>
      )}

      {showEditModal && editingBooking && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-2 sm:items-center sm:p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white sm:max-h-[90vh]">
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between sm:mb-6">
                <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Edit Booking</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close edit booking modal"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleEditSubmit}>
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Editing Booking</p>
                    <p className="truncate text-sm font-semibold text-gray-900">{editingBooking?.service?.name}</p>
                    <p className="text-xs text-gray-500">
                      {editingBooking?.provider?.businessName} · {editingBooking?.bookingNumber}
                    </p>
                  </div>
                  <StatusBadge status={editingBooking?.status ?? 'PENDING'} />
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="mb-1.5 block break-words text-sm font-medium leading-tight text-gray-700">
                      Scheduled Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={editFormData.scheduledDate}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                      className="min-h-[44px] w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={editFormData.description}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Special Requests</label>
                    <textarea
                      value={editFormData.specialRequests}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, specialRequests: e.target.value }))}
                      rows={2}
                      className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 sm:mt-6">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 sm:flex-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && cancellingBooking && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-2 sm:items-center sm:p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white sm:max-h-[90vh]">
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between sm:mb-6">
                <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Cancel Booking</h2>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close cancel booking modal"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCancelSubmit}>
                <div className="mb-3 sm:mb-4">
                  <p className="text-sm text-gray-600">You are about to cancel your booking for:</p>
                  <p className="mt-1.5 break-words text-base font-medium text-gray-900 sm:text-lg">
                    {cancellingBooking.service?.name}
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block break-words text-sm font-medium leading-tight text-gray-700">
                    Reason for cancellation <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                    required
                    placeholder="Please provide a reason (minimum 10 characters)"
                    className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="mt-4 flex items-center gap-2 sm:mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(false)}
                    className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 sm:flex-none"
                  >
                    Keep
                  </button>
                  <button
                    type="submit"
                    disabled={cancelling || cancelReason.length < 10}
                    className="min-h-[44px] flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm text-white hover:bg-red-700 disabled:opacity-50 sm:flex-none"
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
