// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Home,
  CheckCircle,
  Loader2,
  ArrowRight,
  ListChecks,
} from 'lucide-react';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';

// --- HOME BUYER WELCOME COMPONENT ---
const HomeBuyerWelcome = ({ user }: { user: any }) => {
  const [loading, setLoading] = useState(true);
  const [completedItems, setCompletedItems] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const fetchChecklistProgress = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/checklist`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const items = data.items || [];
          setTotalItems(items.length);
          setCompletedItems(
            items.filter((item: any) => item.status === 'COMPLETED').length
          );
        }
      } catch (error) {
        console.error('Failed to fetch checklist:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChecklistProgress();
  }, []);

  const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  const buttonText =
    completedItems === 0
      ? 'Start Your Checklist'
      : completedItems === totalItems
      ? 'View Completed Checklist'
      : 'Continue Checklist';

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome, {user.firstName}! 🎉
        </h2>
        <p className="text-muted-foreground mt-2">
          Congratulations on your new home purchase! Let's get you settled in.
        </p>
      </div>

      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl">Your Home Buying Checklist</CardTitle>
            <CardDescription>
              We've created a personalized checklist to guide you through the closing process.
            </CardDescription>
          </div>
          <ListChecks className="h-8 w-8 text-blue-500" />
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                {completedItems} / {totalItems} items completed
              </p>
              <Progress value={progressPercent} className="w-full" />
            </div>
          )}
          <Button asChild className="w-full md:w-auto">
            <Link href="/dashboard/checklist">
              {buttonText}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Find Services</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Book Now</div>
            <p className="text-xs text-muted-foreground">
              Inspections, Movers, & More
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Bookings</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              View your scheduled services
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// --- HELPER FUNCTIONS FOR EXISTING OWNER DASHBOARD ---
const getStatusBadge = (status: string) => {
  const statusClass = 'inline-block h-2 w-2 rounded-full mr-2 flex-shrink-0';
  switch (status.toUpperCase()) {
    case 'PENDING':
    case 'IN_PROGRESS':
      return <span className={`${statusClass} bg-yellow-500`} title="Pending/In Progress" />;
    case 'CONFIRMED':
      return <span className={`${statusClass} bg-blue-500`} title="Confirmed" />;
    case 'COMPLETED':
      return <span className={`${statusClass} bg-green-500`} title="Completed" />;
    case 'CANCELLED':
      return <span className={`${statusClass} bg-red-500`} title="Cancelled" />;
    default:
      return <span className={`${statusClass} bg-gray-500`} title={status} />;
  }
};

const formatActivityTime = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// --- MAIN COMPONENT ---
export default function DashboardPage() {
  const { user, loading } = useAuth();

  const [dashboardData, setDashboardData] = useState({
    upcomingBookings: 0,
    completedJobs: 0,
    totalSpending: 0,
    totalProperties: 0,
  });
  const [dataLoading, setDataLoading] = useState(false);
  const [recentActivityList, setRecentActivityList] = useState<any[]>([]);

  // NEW: Service categories state
  const [serviceCategories, setServiceCategories] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  const processBookings = (bookings: any[]) => {
    let upcoming = 0;
    let completed = 0;
    let totalSpending = 0;

    const upcomingStatuses = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];

    bookings.forEach((booking) => {
      const status = typeof booking.status === 'string' ? booking.status : '';

      if (upcomingStatuses.includes(status)) {
        upcoming += 1;
      }

      if (status === 'COMPLETED') {
        completed += 1;
        const price = parseFloat(booking.finalPrice || booking.estimatedPrice);
        if (!isNaN(price)) {
          totalSpending += price;
        }
      }
    });

    return { upcoming, completed, totalSpending };
  };

  const fetchDashboardData = async () => {
    if (user && user.segment !== 'HOME_BUYER') {
      try {
        setDataLoading(true);

        const [bookingsRes, propertiesRes] = await Promise.all([
          api.listBookings({ limit: 100 }),
          api.getProperties(),
        ]);

        let processedBookings = { upcoming: 0, completed: 0, totalSpending: 0 };
        if (bookingsRes.success && bookingsRes.data.bookings) {
          processedBookings = processBookings(bookingsRes.data.bookings);
        }

        const totalProperties = propertiesRes.success
          ? propertiesRes.data.properties.length
          : 0;

        // Recent activity
        let relevantBookings: any[] = [];
        if (bookingsRes.success && bookingsRes.data.bookings) {
          const upcomingStatuses = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'];
          relevantBookings = bookingsRes.data.bookings
            .filter((b: any) => {
              const status = b.status?.toUpperCase();
              return (
                upcomingStatuses.includes(status) ||
                status === 'COMPLETED' ||
                status === 'CANCELLED'
              );
            })
            .sort((a: any, b: any) => {
              const statusA = a.status?.toUpperCase();
              const statusB = b.status?.toUpperCase();
              const isUpcomingA = upcomingStatuses.includes(statusA);
              const isUpcomingB = upcomingStatuses.includes(statusB);

              if (isUpcomingA && !isUpcomingB) return -1;
              if (!isUpcomingA && isUpcomingB) return 1;

              if (isUpcomingA && isUpcomingB) {
                return (
                  new Date(a.scheduledDate).getTime() -
                  new Date(b.scheduledDate).getTime()
                );
              }

              const dateA = new Date(
                a.cancelledAt || a.completedAt || a.updatedAt || a.createdAt
              ).getTime();
              const dateB = new Date(
                b.cancelledAt || b.completedAt || b.updatedAt || b.createdAt
              ).getTime();

              return dateB - dateA;
            });

          setRecentActivityList(relevantBookings.slice(0, 5));
        }

        setDashboardData({
          upcomingBookings: processedBookings.upcoming,
          completedJobs: processedBookings.completed,
          totalSpending: processedBookings.totalSpending,
          totalProperties: totalProperties,
        });
      } catch (error) {
        console.error('Failed to fetch existing owner dashboard data:', error);
      } finally {
        setDataLoading(false);
      }
    }
  };

  // NEW: Fetch service categories
  const fetchServiceCategories = async () => {
    if (user && user.segment !== 'HOME_BUYER') {
      try {
        setCategoriesLoading(true);
        const response = await api.getServiceCategories();
        if (response.success) {
          setServiceCategories(response.data.categories);
        }
      } catch (error) {
        console.error('Failed to fetch service categories:', error);
        // Fallback to empty array - will show static buttons
      } finally {
        setCategoriesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (user && user.segment !== 'HOME_BUYER') {
      fetchDashboardData();
      fetchServiceCategories(); // NEW
    }

    const handleFocus = () => {
      if (user && user.segment !== 'HOME_BUYER') {
        fetchDashboardData();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">Loading Dashboard...</h2>
      </div>
    );
  }

  if (user && user.segment === 'HOME_BUYER') {
    return <HomeBuyerWelcome user={user} />;
  }

  // --- EXISTING OWNER RENDER ---
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>

      {dataLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <p className="ml-2 text-gray-600">Loading metrics...</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Metric Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Bookings</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataLoading ? '-' : dashboardData.upcomingBookings}
            </div>
            <p className="text-xs text-muted-foreground">Pending / Confirmed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataLoading ? '-' : `$${dashboardData.totalSpending.toFixed(2)}`}
            </div>
            <p className="text-xs text-muted-foreground">On completed services</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Properties</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataLoading ? '-' : dashboardData.totalProperties}
            </div>
            <p className="text-xs text-muted-foreground">Properties added</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Jobs</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataLoading ? '-' : dashboardData.completedJobs}
            </div>
            <p className="text-xs text-muted-foreground">Total services finished</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity Card */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              {dataLoading
                ? 'Fetching activity...'
                : recentActivityList.length > 0
                ? `Showing ${recentActivityList.length} most relevant activities.`
                : `No recent activity found.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataLoading ? (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
              </div>
            ) : recentActivityList.length === 0 ? (
              <p className="text-sm text-gray-500 pt-2">
                No recent activity. Get started by booking a service!
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 -mx-4">
                {recentActivityList.map((booking) => {
                  const status = booking.status.toUpperCase();
                  const timeText =
                    status === 'COMPLETED'
                      ? `Finished ${formatActivityTime(booking.completedAt || booking.updatedAt)}`
                      : status === 'CANCELLED'
                      ? `Cancelled ${formatActivityTime(booking.cancelledAt || booking.updatedAt)}`
                      : booking.scheduledDate
                      ? `Scheduled for ${new Date(booking.scheduledDate).toLocaleDateString()}`
                      : `Updated ${formatActivityTime(booking.updatedAt)}`;

                  return (
                    <li key={booking.id} className="px-4 py-3 hover:bg-gray-50">
                      <Link href={`/dashboard/bookings/${booking.id}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            {getStatusBadge(status)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {booking.service?.name || 'Service'}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {booking.provider?.businessName || 'Provider'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-4">
                            <p className="text-xs text-gray-500">{timeText}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions Card - WITH DYNAMIC SERVICE CATEGORIES */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Book Services</CardTitle>
            <CardDescription>Quick access to service providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {categoriesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : serviceCategories.length > 0 ? (
              // NEW: Dynamic category buttons
              <>
                {serviceCategories.slice(0, 3).map((category, index) => (
                  <Button
                    key={category.category}
                    asChild
                    className="w-full justify-start"
                    variant={index === 0 ? 'default' : 'outline'}
                  >
                    <Link href={`/dashboard/providers?service=${category.category}`}>
                      <ServiceCategoryIcon icon={category.icon} className="mr-2 h-4 w-4" />
                      {category.displayName}
                    </Link>
                  </Button>
                ))}
                {serviceCategories.length > 3 && (
                  <Button asChild className="w-full justify-start" variant="outline">
                    <Link href="/dashboard/providers">
                      <Home className="mr-2 h-4 w-4" />
                      View All Services
                    </Link>
                  </Button>
                )}
              </>
            ) : (
              // Fallback: Static buttons if API fails
              <>
                <Button asChild className="w-full justify-start">
                  <Link href="/dashboard/providers?service=HANDYMAN">
                    <Home className="mr-2 h-4 w-4" />
                    Handyman Services
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/dashboard/providers?service=PLUMBING">
                    <Home className="mr-2 h-4 w-4" />
                    Plumbing
                  </Link>
                </Button>
              </>
            )}

            {/* Static buttons that always show */}
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/dashboard/properties">
                <Home className="mr-2 h-4 w-4" />
                Manage Properties
              </Link>
            </Button>

            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/dashboard/bookings">
                <ListChecks className="mr-2 h-4 w-4" />
                View All Bookings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}