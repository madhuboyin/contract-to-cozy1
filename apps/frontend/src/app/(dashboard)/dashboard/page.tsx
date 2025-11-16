// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { api } from '@/lib/api/client'; 
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ArrowRight,
  CheckCircle,
  Grid,
  Home,
  ListChecks,
  Loader2,
} from 'lucide-react';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';

// --- Types ---
type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
interface ChecklistItemType {
  id: string;
  status: ChecklistItemStatus;
}
interface ChecklistType {
  id: string;
  items: ChecklistItemType[];
}
// Define type for service categories (mirroring API response)
interface ServiceCategoryConfig {
  category: string;
  displayName: string;
  description: string;
  icon: string;
}

// --- HELPER FUNCTIONS (Moved to top for use in all components) ---

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


// ----------------------------------------
// --- Home Buyer Welcome Component ---
// ----------------------------------------
const HomeBuyerWelcome = ({ user }: { user: any }) => {
  const [checklist, setChecklist] = useState<ChecklistType | null>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(true);

  // --- START: Added state for dynamic cards ---
  const [recentActivityList, setRecentActivityList] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryConfig[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  // --- END: Added state for dynamic cards ---

  // --- START: Added data fetching functions ---
  const fetchChecklist = async () => {
    try {
      setLoadingChecklist(true);
      const token = localStorage.getItem('accessToken'); // Note: api client handles this, but this is legacy fetch
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/checklist`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store', // Ensure we always get fresh data
        }
      );
      if (response.ok) {
        const data = await response.json();
        setChecklist(data);
      }
    } catch (error) {
      console.error('Failed to fetch checklist for dashboard', error);
    } finally {
      setLoadingChecklist(false);
    }
  };

  // Fetch bookings for "Recent Activity"
  const fetchHomeBuyerBookings = async () => {
    try {
      setDataLoading(true);
      
      // Home buyers just need their bookings
      const bookingsRes = await Promise.all([
        api.listBookings({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' }), 
      ]);
      
      let bookingsList: any[] = [];
      
      if (bookingsRes[0].success && bookingsRes[0].data?.bookings) {
          bookingsList = bookingsRes[0].data.bookings;
          
          // --- Logic for Recent Activity List ---
          const relevantBookings = bookingsList.filter(b => b.status !== 'DRAFT');
          
          relevantBookings.sort((a, b) => {
              const statusA = String(a.status).toUpperCase().trim();
              const statusB = String(b.status).toUpperCase().trim();
              const isUpcomingA = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(statusA);
              const isUpcomingB = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(statusB);
  
              if (isUpcomingA && !isUpcomingB) return -1;
              if (!isUpcomingA && isUpcomingB) return 1;
  
              if (isUpcomingA && isUpcomingB) {
                  return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
              }
  
              const dateA = new Date(a.cancelledAt || a.completedAt || a.updatedAt || a.createdAt).getTime();
              const dateB = new Date(b.cancelledAt || a.completedAt || b.updatedAt || b.createdAt).getTime();
              
              return dateB - dateA;
          });

          setRecentActivityList(relevantBookings.slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to fetch home buyer bookings:', error);
    } finally {
      setDataLoading(false);
    }
  };

  // Fetch service categories
  const fetchServiceCategories = async () => {
    try {
      setCategoriesLoading(true);
      // The API will correctly return *only* HOME_BUYER categories
      // because the user's token is sent with the request.
      const response = await api.getServiceCategories();
      if (response.success) {
        setServiceCategories(response.data.categories);
      }
    } catch (error) {
      console.error('Failed to fetch service categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };
  // --- END: Added data fetching functions ---


  useEffect(() => {
    // Fetch all data on load
    fetchChecklist();
    fetchHomeBuyerBookings();
    fetchServiceCategories();

    const handleFocus = () => {
      // Re-fetch all data on focus
      fetchChecklist();
      fetchHomeBuyerBookings();
      fetchServiceCategories();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const completedItems =
    checklist?.items.filter((item) => item.status === 'COMPLETED').length || 0;
  const totalItems = checklist?.items.length || 8; // Default to 8
  const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  
  const isChecklistComplete = totalItems > 0 && completedItems === totalItems;

  const cardTitle = isChecklistComplete
    ? 'Checklist Completed 🎉'
    : 'Your Closure Checklist';
  
  const cardDescription = isChecklistComplete
    ? 'Congratulations! Review your steps or find more services.'
    : 'We\'re here to guide you through a smooth closing process.';
  
  const buttonText = isChecklistComplete
    ? 'Review Your Checklist'
    : 'Start Your Checklist';

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">
        Welcome, {user.firstName}!
      </h2>
      <p className="text-lg text-muted-foreground">
        Let's get you cozy in your new home.
      </p>

      <div className="flex-1 space-y-6 pt-6">
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="space-y-1.5">
              <CardTitle className="text-2xl font-bold">
                {cardTitle}
              </CardTitle>
              <CardDescription>
                {cardDescription}
              </CardDescription>
            </div>
            <ListChecks className="h-8 w-8 text-blue-500" />
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingChecklist ? (
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

        {/* --- START: Replaced static cards with dynamic grid --- */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          
          {/* Dynamic Recent Activity Card */}
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                {dataLoading 
                  ? 'Fetching activity...' 
                  : recentActivityList.length > 0 
                      ? `Showing ${recentActivityList.length} most relevant activities.`
                      : `No recent activity found.`
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dataLoading ? (
                  <div className="flex items-center justify-center py-4 text-gray-500">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading recent activity...
                  </div>
              ) : recentActivityList.length === 0 ? (
                  <p className="text-sm text-gray-500 pt-2">Your recent activity feed is empty. Get started by booking a service!</p>
              ) : (
                  <ul className="divide-y divide-gray-100 -mx-4">
                      {recentActivityList.map((booking) => {
                          const status = booking.status.toUpperCase();
                          const timeText = (
                              status === 'COMPLETED' 
                                  ? `Finished ${formatActivityTime(booking.completedAt || booking.updatedAt)}`
                                  : status === 'CANCELLED' 
                                  ? `Cancelled ${formatActivityTime(booking.cancelledAt || booking.updatedAt)}`
                                  : `Scheduled ${formatActivityTime(booking.scheduledDate)}`
                          );
                          
                          return (
                              <li key={booking.id} className="py-2.5 px-4 hover:bg-gray-50 transition-colors cursor-pointer">
                                  <Link href={`/dashboard/bookings/${booking.id}`}>
                                      <div className="flex items-start justify-between">
                                          <p className="text-sm font-medium text-gray-900 truncate flex items-center">
                                              {getStatusBadge(status)}
                                              {booking.service.name}
                                          </p>
                                          <p className="ml-2 text-xs text-gray-500 flex-shrink-0">
                                              {timeText}
                                          </p>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-0.5 ml-4 truncate">
                                          Provider: {booking.provider.businessName || `${booking.provider.firstName} ${booking.provider.lastName}`}
                                      </p>
                                  </Link>
                              </li>
                          );
                      })}
                  </ul>
              )}
              <Button asChild variant="ghost" className="w-full text-blue-600 justify-end mt-2">
                  <Link href="/dashboard/bookings">
                      View All Bookings <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Dynamic Book Services Card */}
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Book Services</CardTitle>
              <CardDescription>
                Find providers for your new home
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {categoriesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : serviceCategories.length > 0 ? (
                <>
                  {/* Show top 3 HOME_BUYER categories */}
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
                        <Grid className="mr-2 h-4 w-4" />
                        View All Services
                      </Link>
                    </Button>
                  )}
                </>
              ) : (
                // Fallback: Static buttons if API fails
                <Button asChild className="w-full justify-start" variant="default">
                  <Link href="/dashboard/providers?service=INSPECTION">
                    <ServiceCategoryIcon icon="INSPECTION" className="mr-2 h-4 w-4" />
                    Home Inspection
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
        {/* --- END: Replaced static cards with dynamic grid --- */}
      </div>
    </div>
  );
};


// ----------------------------------------
// --- MAIN COMPONENT (Existing Owner) ---
// ----------------------------------------
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

  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryConfig[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Fetch data for Existing Owner Dashboard
  const fetchDashboardData = async () => {
    // This check ENSURES this code only runs for EXISTING OWNERS
    if (user && user.segment !== 'HOME_BUYER') {
      try {
        setDataLoading(true);
        
        const [bookingsRes, propertiesRes] = await Promise.all([
          api.listBookings({ limit: 50 }), 
          api.getProperties(),
        ]);
        
        let upcoming = 0;
        let completed = 0;
        let totalSpending = 0;
        let totalProperties = 0;
        let bookingsList: any[] = [];
        
        if (bookingsRes.success && bookingsRes.data?.bookings) {
            bookingsList = bookingsRes.data.bookings;
            
            bookingsList.forEach(booking => {
                const status = String(booking.status).toUpperCase().trim();
                
                if (status === 'PENDING' || status === 'CONFIRMED' || status === 'IN_PROGRESS') {
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
            
            const relevantBookings = bookingsList.filter(b => b.status !== 'DRAFT');
            
            relevantBookings.sort((a, b) => {
                const statusA = String(a.status).toUpperCase().trim();
                const statusB = String(b.status).toUpperCase().trim();
                const isUpcomingA = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(statusA);
                const isUpcomingB = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(statusB);
    
                if (isUpcomingA && !isUpcomingB) return -1;
                if (!isUpcomingA && isUpcomingB) return 1;
    
                if (isUpcomingA && isUpcomingB) {
                    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
                }
    
                const dateA = new Date(a.cancelledAt || a.completedAt || a.updatedAt || a.createdAt).getTime();
                const dateB = new Date(b.cancelledAt || a.completedAt || b.updatedAt || b.createdAt).getTime();
                
                return dateB - dateA;
            });

            setRecentActivityList(relevantBookings.slice(0, 5));
        }

        if (propertiesRes.success && propertiesRes.data?.properties) {
            totalProperties = propertiesRes.data.properties.length;
        }

        setDashboardData({
          upcomingBookings: upcoming,
          completedJobs: completed,
          totalSpending: totalSpending,
          totalProperties: totalProperties,
        });

      } catch (error) {
        console.error('Failed to fetch existing owner dashboard data:', error);
      } finally {
        setDataLoading(false);
      }
    }
  };

  // Fetch service categories
  const fetchServiceCategories = async () => {
    // This check ENSURES this code only runs for EXISTING OWNERS
    if (user && user.segment !== 'HOME_BUYER') {
      try {
        setCategoriesLoading(true);
        const response = await api.getServiceCategories();
        if (response.success) {
          setServiceCategories(response.data.categories);
        }
      } catch (error) {
        console.error('Failed to fetch service categories:', error);
      } finally {
        setCategoriesLoading(false);
      }
    }
  };

  useEffect(() => {
    // This logic correctly ensures it only runs for non-home-buyers
    if (user && user.segment !== 'HOME_BUYER') {
        fetchDashboardData();
        fetchServiceCategories();
    }
    const handleFocus = () => {
      // This logic also correctly ensures it only runs for non-home-buyers
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
        <h2 className="text-3xl font-bold tracking-tight">
          Loading Dashboard...
        </h2>
      </div>
    );
  }

  // --- ROUTER LOGIC ---
  // If user is HOME_BUYER, render the HomeBuyerWelcome component
  if (user && user.segment === 'HOME_BUYER') {
    return <HomeBuyerWelcome user={user} />;
  }

  // --- EXISTING OWNER RENDER ---
  // This JSX will only be reached if user is NOT a HOME_BUYER
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
        {/* Upcoming Bookings Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Upcoming Bookings
            </CardTitle>
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
            <div className="text-2xl font-bold">{dataLoading ? '-' : dashboardData.upcomingBookings}</div>
            <p className="text-xs text-muted-foreground">Pending / Confirmed</p>
          </CardContent>
        </Card>
        
        {/* Total Spending Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Spending
            </CardTitle>
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
            <div className="text-2xl font-bold">{dataLoading ? '-' : `$${dashboardData.totalSpending.toFixed(2)}`}</div>
            <p className="text-xs text-muted-foreground">On completed services</p>
          </CardContent>
        </Card>
        
        {/* My Properties Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Properties</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-2xl font-bold">{dataLoading ? '-' : dashboardData.totalProperties}</div>
            <p className="text-xs text-muted-foreground">Properties added</p>
          </CardContent>
          <CardFooter className="pt-0 pb-3 px-6">
            <Button
              asChild
              variant="link"
              size="sm"
              className="p-0 h-auto text-xs text-blue-600"
            >
              <Link href="/dashboard/properties">
                Manage Properties <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
        
        {/* Completed Jobs Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Completed Jobs
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dataLoading ? '-' : dashboardData.completedJobs}</div>
            <p className="text-xs text-muted-foreground">Total services finished</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Activity Card - ENHANCED */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              {dataLoading 
                ? 'Fetching activity...' 
                : recentActivityList.length > 0 
                    ? `Showing ${recentActivityList.length} most relevant activities.`
                    : `No recent activity found. You have ${dashboardData.upcomingBookings} upcoming bookings.`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataLoading ? (
                <div className="flex items-center justify-center py-4 text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading recent activity...
                </div>
            ) : recentActivityList.length === 0 ? (
                <p className="text-sm text-gray-500 pt-2">Your recent activity feed is empty. Get started by booking a service!</p>
            ) : (
                <ul className="divide-y divide-gray-100 -mx-4">
                    {recentActivityList.map((booking) => {
                        const status = booking.status.toUpperCase();
                        const timeText = (
                            status === 'COMPLETED' 
                                ? `Finished ${formatActivityTime(booking.completedAt || booking.updatedAt)}`
                                : status === 'CANCELLED' 
                                ? `Cancelled ${formatActivityTime(booking.cancelledAt || booking.updatedAt)}`
                                : `Scheduled ${formatActivityTime(booking.scheduledDate)}`
                        );
                        
                        return (
                            <li key={booking.id} className="py-2.5 px-4 hover:bg-gray-50 transition-colors cursor-pointer">
                                <Link href={`/dashboard/bookings/${booking.id}`}>
                                    <div className="flex items-start justify-between">
                                        <p className="text-sm font-medium text-gray-900 truncate flex items-center">
                                            {getStatusBadge(status)}
                                            {booking.service.name}
                                        </p>
                                        <p className="ml-2 text-xs text-gray-500 flex-shrink-0">
                                            {timeText}
                                        </p>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5 ml-4 truncate">
                                        Provider: {booking.provider.businessName || `${booking.provider.firstName} ${booking.provider.lastName}`}
                                    </p>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
            <Button asChild variant="ghost" className="w-full text-blue-600 justify-end mt-2">
                <Link href="/dashboard/bookings">
                    View All Bookings <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Dynamic Service Category Quick Actions */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Book Services</CardTitle>
            <CardDescription>
              Find providers for your home maintenance needs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {categoriesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : serviceCategories.length > 0 ? (
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
                      <Grid className="mr-2 h-4 w-4" />
                      View All Services
                    </Link>
                  </Button>
                )}
              </>
            ) : (
              // Fallback: Static buttons if API fails
              <>
                <Button asChild className="w-full justify-start" variant="default">
                  <Link href="/dashboard/providers?service=INSPECTION">
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Home Inspection
                  </Link>
                </Button>
                
                <Button asChild className="w-full justify-start" variant="outline">
                  <Link href="/dashboard/providers?service=HANDYMAN">
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Handyman Services
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}