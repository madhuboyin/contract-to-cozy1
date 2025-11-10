// apps/frontend/src/app/providers/(dashboard)/dashboard/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';

export default function ProviderDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    pendingBookings: 0,
    todayBookings: 0,
    monthlyRevenue: 0,
    avgRating: 0,
  });

  // TODO: Fetch real stats from API
  useEffect(() => {
    // Placeholder stats
    setStats({
      pendingBookings: 3,
      todayBookings: 2,
      monthlyRevenue: 4250,
      avgRating: 4.8,
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="mt-2 text-gray-600">
          Here's what's happening with your business today
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Pending Bookings */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Requests</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stats.pendingBookings}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <Link href="/providers/bookings" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              View all →
            </Link>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Jobs</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stats.todayBookings}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <Link href="/providers/calendar" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              View calendar →
            </Link>
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">This Month</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">${stats.monthlyRevenue.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm text-green-600 font-medium">+12% from last month</span>
          </div>
        </div>

        {/* Average Rating */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg. Rating</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stats.avgRating}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="h-8 w-8 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-600">Based on 42 reviews</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Bookings</h2>
              <Link href="/providers/bookings" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                View all
              </Link>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {/* Booking 1 */}
            <div className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Pending
                    </span>
                    <span className="ml-2 text-sm text-gray-500">2 hours ago</span>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    Home Inspection Request
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    123 Main St, Princeton, NJ
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Requested for: Nov 15, 2025
                  </p>
                </div>
                <button className="ml-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                  View
                </button>
              </div>
            </div>

            {/* Booking 2 */}
            <div className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Confirmed
                    </span>
                    <span className="ml-2 text-sm text-gray-500">Yesterday</span>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    Minor Repairs
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    456 Oak Ave, Trenton, NJ
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Scheduled for: Nov 12, 2025
                  </p>
                </div>
                <button className="ml-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                  View
                </button>
              </div>
            </div>

            {/* Booking 3 */}
            <div className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Completed
                    </span>
                    <span className="ml-2 text-sm text-gray-500">3 days ago</span>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    Pest Inspection
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    789 Elm St, Hamilton, NJ
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Completed: Nov 7, 2025
                  </p>
                </div>
                <button className="ml-4 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                  View
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions & Tips */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                href="/providers/services"
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center">
                  <span className="mr-3 text-2xl">🔧</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Manage Services</p>
                    <p className="text-xs text-gray-500">Update pricing & availability</p>
                  </div>
                </div>
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              <Link
                href="/providers/calendar"
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center">
                  <span className="mr-3 text-2xl">🗓️</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Update Calendar</p>
                    <p className="text-xs text-gray-500">Set your availability</p>
                  </div>
                </div>
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              <Link
                href="/providers/portfolio"
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center">
                  <span className="mr-3 text-2xl">📸</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Add Photos</p>
                    <p className="text-xs text-gray-500">Showcase your work</p>
                  </div>
                </div>
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Tips & Insights */}
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow p-6 text-white">
            <h2 className="text-lg font-semibold mb-2">💡 Pro Tip</h2>
            <p className="text-sm opacity-90">
              Providers who respond to bookings within 2 hours get 3x more repeat customers!
            </p>
            <button className="mt-4 px-4 py-2 bg-white text-blue-600 text-sm font-medium rounded-md hover:bg-gray-100 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
