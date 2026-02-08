'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Booking, BookingStatus } from '@/types';
import { MoreVertical, Calendar, MapPin, DollarSign, X, CheckCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

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

const StatusDot = ({ status }: { status: BookingStatus }) => {
  const colors: Record<BookingStatus, string> = {
    DRAFT: 'bg-gray-400',
    PENDING: 'bg-yellow-500',
    CONFIRMED: 'bg-green-500',
    IN_PROGRESS: 'bg-blue-500',
    COMPLETED: 'bg-gray-500',
    CANCELLED: 'bg-red-500',
    DISPUTED: 'bg-orange-500',
  };

  const labels: Record<BookingStatus, string> = {
    DRAFT: 'Draft',
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    DISPUTED: 'Disputed',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-sm font-medium text-gray-700">{labels[status]}</span>
    </div>
  );
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Not scheduled';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

const formatProperty = (property: any) => {
  if (!property) return 'N/A';
  return property.address || 'Property Details';
};

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

  useEffect(() => {
    fetchBookings();
    const onFocus = () => fetchBookings();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.listBookings({});
      if (response.success) setBookings(response.data.bookings);
    } catch (err: any) {
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = filter === 'all' 
    ? bookings 
    : bookings.filter(b => b.status === filter);

  const canEditBooking = (status: BookingStatus) => status === 'PENDING' || status === 'CONFIRMED';
  const canCancelBooking = (status: BookingStatus) => ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(status);

  const handleEditClick = (booking: Booking) => {
    setEditingBooking(booking);
    setEditFormData({
      scheduledDate: toLocalDatetimeInput(booking.scheduledDate),
      description: booking.description || '',
      specialRequests: booking.specialRequests || '',
    });
    setShowEditModal(true);
  };

  const handleCancelClick = (booking: Booking) => {
    setCancellingBooking(booking);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;
    try {
      setSaving(true);
      const updates: any = { description: editFormData.description, specialRequests: editFormData.specialRequests };
      if (editFormData.scheduledDate) updates.scheduledDate = new Date(editFormData.scheduledDate).toISOString();
      const response = await api.updateBooking(editingBooking.id, updates);
      if (response.success) {
        setSuccess('Booking updated successfully');
        setShowEditModal(false);
        fetchBookings();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update booking');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingBooking || cancelReason.length < 10) return;
    try {
      setCancelling(true);
      const response = await api.cancelBooking(cancellingBooking.id, cancelReason);
      if (response.success) {
        setSuccess('Booking cancelled successfully');
        setShowCancelModal(false);
        fetchBookings();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-6 md:mb-8 pt-4 md:pt-0">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">My Bookings</h1>
          <p className="mt-1 text-sm text-gray-600">View and manage your service bookings</p>
        </div>

        {/* Alerts Container */}
        {(success || error) && (
          <div className="mb-6 space-y-3">
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">{success}</span>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center gap-2">
                <X className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Filters - FIXED: Scrollable on mobile to prevent stretching */}
        <div className="mb-6 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide md:flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all shrink-0 shadow-sm ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'
              }`}
            >
              All Bookings
            </button>
            {(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as BookingStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all shrink-0 shadow-sm ${
                  filter === status ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div></div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
            <Calendar className="mx-auto h-12 w-12 text-gray-200 mb-4" />
            <h3 className="text-lg font-bold text-gray-900">No bookings found</h3>
            <p className="mt-2 text-sm text-gray-500">Browse services to schedule a new appointment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => (
              <div key={booking.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all group">
                <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-5 gap-4">
                  {/* Left Column: Info Stack */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between md:block">
                      <h3 className="font-bold text-gray-900 text-base md:text-lg truncate group-hover:text-blue-700 transition-colors">
                        {booking.service?.name || 'Service Booking'}
                      </h3>
                      <div className="md:hidden shrink-0">
                        <StatusDot status={booking.status} />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 mt-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="w-4 h-4 mr-2.5 text-gray-400 shrink-0" />
                        <span className="truncate">{formatDate(booking.scheduledDate)}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="w-4 h-4 mr-2.5 text-gray-400 shrink-0" />
                        <span className="truncate font-medium">{formatProperty(booking.property)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Status & Actions - FIXED: Stacking and thumb-targets for mobile */}
                  <div className="flex items-center justify-between md:justify-end gap-3 pt-4 md:pt-0 border-t border-gray-50 md:border-t-0">
                    <div className="hidden md:block pr-2">
                      <StatusDot status={booking.status} />
                    </div>
                    
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <Link href={`/dashboard/bookings/${booking.id}`} className="flex-1 md:flex-none">
                        <Button variant="outline" size="sm" className="w-full md:w-auto text-xs font-bold rounded-xl px-5 h-10">
                          View Details
                        </Button>
                      </Link>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors">
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-xl border-gray-100">
                          {canEditBooking(booking.status) && (
                            <DropdownMenuItem 
                              className="rounded-lg font-medium cursor-pointer"
                              onClick={() => handleEditClick(booking)}
                            >
                              Edit Booking Details
                            </DropdownMenuItem>
                          )}
                          {canCancelBooking(booking.status) && (
                            <DropdownMenuItem 
                              className="text-red-600 rounded-lg font-bold focus:text-red-700 focus:bg-red-50 cursor-pointer"
                              onClick={() => handleCancelClick(booking)}
                            >
                              Cancel Booking
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FULL MODAL IMPLEMENTATIONS (PRESERVING ALL ORIGINAL LOGIC) */}
        {showEditModal && editingBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold">Edit Booking</h2>
                <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Scheduled Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editFormData.scheduledDate}
                    onChange={(e) => setEditFormData({ ...editFormData, scheduledDate: e.target.value })}
                    className="w-full px-4 h-11 border rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Description</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="ghost" onClick={() => setShowEditModal(false)} className="flex-1 h-11 rounded-xl">Cancel</Button>
                  <Button type="submit" disabled={saving} className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                    {saving ? 'Saving...' : 'Update Booking'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showCancelModal && cancellingBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold mb-2">Cancel Booking?</h2>
                <p className="text-sm text-gray-600 mb-6">Are you sure you want to cancel your booking for <strong>{cancellingBooking.service?.name}</strong>?</p>
                <div className="space-y-4">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Please provide a reason (min. 10 chars)"
                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500 text-sm"
                    rows={3}
                  />
                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={() => setShowCancelModal(false)} className="flex-1 h-11 rounded-xl">Go Back</Button>
                    <Button 
                      onClick={handleCancelSubmit}
                      disabled={cancelling || cancelReason.length < 10}
                      className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel Now'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}