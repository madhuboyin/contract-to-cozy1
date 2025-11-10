// apps/frontend/src/app/providers/(dashboard)/bookings/page.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface Booking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  serviceType: string;
  propertyAddress: string;
  scheduledDate: string;
  customerName: string;
  customerEmail: string;
  price: number;
  notes?: string;
  createdAt: string;
}

export default function ProviderBookingsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'completed'>('pending');
  const [bookings] = useState<Booking[]>([
    {
      id: '1',
      bookingNumber: 'B-2025-000123',
      status: 'PENDING',
      serviceType: 'Home Inspection',
      propertyAddress: '123 Main St, Princeton, NJ 08540',
      scheduledDate: '2025-11-15T10:00:00',
      customerName: 'John Smith',
      customerEmail: 'john@example.com',
      price: 450,
      notes: 'Please call before arrival',
      createdAt: '2025-11-10T08:30:00',
    },
    {
      id: '2',
      bookingNumber: 'B-2025-000122',
      status: 'CONFIRMED',
      serviceType: 'Minor Repairs',
      propertyAddress: '456 Oak Ave, Trenton, NJ 08608',
      scheduledDate: '2025-11-12T14:00:00',
      customerName: 'Sarah Johnson',
      customerEmail: 'sarah@example.com',
      price: 250,
      createdAt: '2025-11-09T15:20:00',
    },
    {
      id: '3',
      bookingNumber: 'B-2025-000121',
      status: 'COMPLETED',
      serviceType: 'Pest Inspection',
      propertyAddress: '789 Elm St, Hamilton, NJ 08610',
      scheduledDate: '2025-11-07T09:00:00',
      customerName: 'Mike Davis',
      customerEmail: 'mike@example.com',
      price: 350,
      createdAt: '2025-11-05T11:45:00',
    },
  ]);

  const filteredBookings = bookings.filter((booking) => {
    if (activeTab === 'pending') return booking.status === 'PENDING';
    if (activeTab === 'confirmed') return booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';
    if (activeTab === 'completed') return booking.status === 'COMPLETED' || booking.status === 'CANCELLED';
    return true;
  });

  const getStatusBadge = (status: BookingStatus) => {
    const styles = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      CONFIRMED: 'bg-blue-100 text-blue-800',
      IN_PROGRESS: 'bg-purple-100 text-purple-800',
      COMPLETED: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleConfirm = (bookingId: string) => {
    // TODO: API call to confirm booking
    alert(`Confirming booking ${bookingId}`);
  };

  const handleCancel = (bookingId: string) => {
    // TODO: API call to cancel booking
    if (confirm('Are you sure you want to cancel this booking?')) {
      alert(`Cancelling booking ${bookingId}`);
    }
  };

  const handleStart = (bookingId: string) => {
    // TODO: API call to start booking
    alert(`Starting job ${bookingId}`);
  };

  const handleComplete = (bookingId: string) => {
    // TODO: API call to complete booking
    alert(`Completing job ${bookingId}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bookings</h1>
        <p className="mt-2 text-gray-600">Manage your booking requests and scheduled jobs</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('pending')}
              className={`${
                activeTab === 'pending'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Pending Requests
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-yellow-100 text-yellow-800">
                {bookings.filter((b) => b.status === 'PENDING').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('confirmed')}
              className={`${
                activeTab === 'confirmed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Confirmed Jobs
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-blue-100 text-blue-800">
                {bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`${
                activeTab === 'completed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              History
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-800">
                {bookings.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED').length}
              </span>
            </button>
          </nav>
        </div>

        {/* Bookings List */}
        <div className="divide-y divide-gray-200">
          {filteredBookings.length === 0 ? (
            <div className="p-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No bookings found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {activeTab === 'pending' && "You don't have any pending booking requests."}
                {activeTab === 'confirmed' && "You don't have any confirmed jobs."}
                {activeTab === 'completed' && "You don't have any completed jobs yet."}
              </p>
            </div>
          ) : (
            filteredBookings.map((booking) => (
              <div key={booking.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  {/* Booking Info */}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900">{booking.serviceType}</h3>
                      {getStatusBadge(booking.status)}
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {booking.propertyAddress}
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Scheduled: {formatDate(booking.scheduledDate)}
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {booking.customerName} • {booking.customerEmail}
                      </div>

                      <div className="flex items-center text-sm font-medium text-gray-900">
                        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        ${booking.price}
                      </div>

                      {booking.notes && (
                        <div className="mt-2 p-3 bg-blue-50 rounded-md">
                          <p className="text-sm text-blue-900">
                            <strong>Note:</strong> {booking.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      Booking #{booking.bookingNumber} • Created {formatDate(booking.createdAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="ml-6 flex flex-col space-y-2">
                    {booking.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleConfirm(booking.id)}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {booking.status === 'CONFIRMED' && (
                      <>
                        <button
                          onClick={() => handleStart(booking.id)}
                          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                        >
                          Start Job
                        </button>
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {booking.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleComplete(booking.id)}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                      >
                        Complete
                      </button>
                    )}

                    {(booking.status === 'COMPLETED' || booking.status === 'CANCELLED') && (
                      <Link
                        href={`/providers/bookings/${booking.id}`}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-center"
                      >
                        View Details
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
