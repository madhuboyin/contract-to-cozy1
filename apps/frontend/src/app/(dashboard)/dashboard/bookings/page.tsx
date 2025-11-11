// apps/frontend/src/app/(dashboard)/dashboard/bookings/page.tsx
// Homeowner bookings page with EDIT and CANCEL functionality
// ✅ FIXED: Uses global Booking type from @/types

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Booking, BookingStatus } from '@/types';

interface EditFormData {
  scheduledDate: string;
  description: string;
  specialRequests: string;
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

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      // ✅ FIXED: Changed from api.getBookings() to api.listBookings()
      const response = await api.listBookings({});
      
      if (response.success) {
        setBookings(response.data.bookings);
      }
    } catch (err: any) {
      console.error('Error fetching bookings:', err);
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = filter === 'all' 
    ? bookings 
    : bookings.filter(b => b.status === filter);

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS':
        return 'bg-purple-100 text-purple-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canEditBooking = (status: BookingStatus) => {
    return ['DRAFT', 'PENDING', 'CONFIRMED'].includes(status);
  };

  const canCancelBooking = (status: BookingStatus) => {
    return ['DRAFT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(status);
  };

  const handleEditClick = (booking: Booking) => {
    setEditingBooking(booking);
    setEditFormData({
      scheduledDate: booking.scheduledDate || '',
      description: booking.description,
      specialRequests: booking.specialRequests || '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingBooking) return;

    // Validation
    if (editFormData.description.length < 10) {
      setError('Description must be at least 10 characters');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const updates: any = {
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
        fetchBookings(); // Refresh list
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Error updating booking:', err);
      setError(err.message || 'Failed to update booking');
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

    // Validation
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
        fetchBookings(); // Refresh list
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Error cancelling booking:', err);
      setError(err.message || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Bookings</h1>
          <p className="mt-2 text-sm text-gray-600">
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
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All
          </button>
          {(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as BookingStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Bookings List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading bookings...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <p className="text-gray-600">No bookings found</p>
            <Link
              href="/dashboard/providers"
              className="mt-4 inline-block text-blue-600 hover:text-blue-700"
            >
              Book a service
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                  {/* Booking Details */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {booking.service.name}
                          </h3>
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                              booking.status
                            )}`}
                          >
                            {booking.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          Booking #{booking.bookingNumber}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Provider</p>
                        <p className="mt-1 text-sm text-gray-900">
                          {booking.provider.businessName || 
                           `${booking.provider.firstName} ${booking.provider.lastName}`}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-500">Property</p>
                        <p className="mt-1 text-sm text-gray-900">
                          {booking.property.address}, {booking.property.city}, {booking.property.state}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-500">Scheduled Date</p>
                        <p className="mt-1 text-sm text-gray-900">
                          {booking.scheduledDate
                            ? new Date(booking.scheduledDate).toLocaleString()
                            : 'Not scheduled'}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-500">Price</p>
                        <p className="mt-1 text-sm text-gray-900">
                          ${parseFloat(booking.estimatedPrice).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {booking.description && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-500">Description</p>
                        <p className="mt-1 text-sm text-gray-700">{booking.description}</p>
                      </div>
                    )}

                    {booking.specialRequests && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-500">Special Requests</p>
                        <p className="mt-1 text-sm text-gray-700">{booking.specialRequests}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 lg:mt-0 lg:ml-6 flex flex-col space-y-2">
                    <Link
                      href={`/dashboard/bookings/${booking.id}`}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-center text-sm font-medium"
                    >
                      View Details
                    </Link>
                    
                    {canEditBooking(booking.status) && (
                      <button
                        onClick={() => handleEditClick(booking)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                      >
                        Edit Booking
                      </button>
                    )}
                    
                    {canCancelBooking(booking.status) && (
                      <button
                        onClick={() => handleCancelClick(booking)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Edit Booking</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleEditSubmit}>
                {/* Service Info (Read-only) */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-500">Service</p>
                  <p className="mt-1 text-base font-semibold text-gray-900">
                    {editingBooking.service.name}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Booking #{editingBooking.bookingNumber}
                  </p>
                </div>

                {/* Scheduled Date */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scheduled Date *
                  </label>
                  <input
                    type="datetime-local"
                    value={editFormData.scheduledDate ? new Date(editFormData.scheduledDate).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setEditFormData({ ...editFormData, scheduledDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Description */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe what you need..."
                    required
                    minLength={10}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Minimum 10 characters ({editFormData.description.length}/10)
                  </p>
                </div>

                {/* Special Requests */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Special Requests (Optional)
                  </label>
                  <textarea
                    value={editFormData.specialRequests}
                    onChange={(e) => setEditFormData({ ...editFormData, specialRequests: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Any special instructions or requirements..."
                    maxLength={500}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    {editFormData.specialRequests.length}/500 characters
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && cancellingBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>

              <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                Cancel Booking
              </h2>
              
              <p className="text-sm text-gray-600 text-center mb-4">
                Booking #{cancellingBooking.bookingNumber}
              </p>
              
              <p className="text-sm text-gray-700 text-center mb-6">
                {cancellingBooking.service.name}
              </p>

              <form onSubmit={handleCancelSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cancellation Reason *
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Please provide a reason for cancellation..."
                    required
                    minLength={10}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Minimum 10 characters ({cancelReason.length}/10)
                  </p>
                </div>

                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(false)}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                    disabled={cancelling}
                  >
                    Keep Booking
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={cancelling}
                  >
                    {cancelling ? 'Cancelling...' : 'Cancel Booking'}
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
