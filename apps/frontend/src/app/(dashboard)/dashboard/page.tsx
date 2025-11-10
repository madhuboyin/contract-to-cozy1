// apps/frontend/src/app/(dashboard)/dashboard/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';
import { formatDate, formatCurrency, getBookingStatusColor, getBookingStatusLabel } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    confirmed: 0,
    completed: 0,
    total: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const response = await api.listBookings({ limit: 5 });
      if (response.success) {
        setBookings(response.data.bookings);
        
        // Calculate stats
        if (response.data.summary) {
          setStats({
            pending: response.data.summary.byStatus.PENDING || 0,
            confirmed: response.data.summary.byStatus.CONFIRMED || 0,
            completed: response.data.summary.byStatus.COMPLETED || 0,
            total: response.data.summary.totalBookings || 0,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.firstName}! 👋
        </h1>
        <p className="mt-2 text-gray-600">
          {user?.role === 'HOMEOWNER' 
            ? 'Manage your property services and bookings'
            : 'View and manage your service requests'
          }
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">📊</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Bookings
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {stats.total}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">⏳</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Pending
                  </dt>
                  <dd className="text-2xl font-semibold text-yellow-600">
                    {stats.pending}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">✅</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Confirmed
                  </dt>
                  <dd className="text-2xl font-semibold text-blue-600">
                    {stats.confirmed}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">🎉</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Completed
                  </dt>
                  <dd className="text-2xl font-semibold text-green-600">
                    {stats.completed}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {user?.role === 'HOMEOWNER' && (
            <>
              <Link
                href="/dashboard/providers"
                className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <span className="text-2xl mr-3">🔍</span>
                <div>
                  <div className="font-medium text-gray-900">Find Providers</div>
                  <div className="text-sm text-gray-500">Search for service providers</div>
                </div>
              </Link>
              <Link
                href="/dashboard/providers"
                className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <span className="text-2xl mr-3">➕</span>
                <div>
                  <div className="font-medium text-gray-900">New Booking</div>
                  <div className="text-sm text-gray-500">Create a service request</div>
                </div>
              </Link>
            </>
          )}
          <Link
            href="/dashboard/bookings"
            className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <span className="text-2xl mr-3">📅</span>
            <div>
              <div className="font-medium text-gray-900">View Bookings</div>
              <div className="text-sm text-gray-500">Manage all bookings</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Bookings */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Recent Bookings</h2>
          <Link
            href="/dashboard/bookings"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            View all →
          </Link>
        </div>
        
        {bookings.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-500">No bookings yet</p>
            {user?.role === 'HOMEOWNER' && (
              <Link
                href="/dashboard/providers"
                className="mt-4 inline-block text-blue-600 hover:text-blue-800 font-medium"
              >
                Find a service provider
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {bookings.map((booking) => (
              <Link
                key={booking.id}
                href={`/dashboard/bookings/${booking.id}`}
                className="block hover:bg-gray-50 transition-colors"
              >
                <div className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <p className="text-sm font-medium text-gray-900">
                          {booking.bookingNumber}
                        </p>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${getBookingStatusColor(
                            booking.status
                          )}-100 text-${getBookingStatusColor(booking.status)}-800`}
                        >
                          {getBookingStatusLabel(booking.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {booking.service.name} - {booking.property.address}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {booking.scheduledDate
                          ? formatDate(booking.scheduledDate)
                          : 'Not scheduled'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(booking.estimatedPrice)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {user?.role === 'HOMEOWNER'
                          ? booking.provider.businessName
                          : `${booking.homeowner.firstName} ${booking.homeowner.lastName}`}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
