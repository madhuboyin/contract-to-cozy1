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
  CalendarCheck,
  Check,
  Search,
  PlusCircle,
  Settings,
} from 'lucide-react';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';
import { cn } from '@/lib/utils';
import { ServiceCategoryConfig } from '@/types'; // <-- 1. IMPORTED FROM GLOBAL TYPES

// --- Types ---
type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';

// --- 2. REMOVED HBChecklistType and ServiceCategoryConfig from here ---

// --- NEW TYPES FOR EXISTING_OWNER ---
interface MaintenanceTaskItem {
  id: string;
  title: string;
  status: ChecklistItemStatus;
  serviceCategory: string | null;
  isRecurring: boolean;
  nextDueDate: string | null;
}

interface FullChecklist {
  id: string;
  items: MaintenanceTaskItem[];
}
// --- END NEW TYPES ---

// --- HELPER FUNCTIONS ---

const getStatusBadge = (status: string) => {
  // ... (this function is unchanged)
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
  // ... (this function is unchanged)
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
  // --- 3. MOVED TYPES INSIDE THE COMPONENT ---
  interface HBChecklistItemType {
    id: string;
    status: ChecklistItemStatus;
  }
  interface HBChecklistType {
    id: string;
    items: HBChecklistItemType[];
  }
  // --- END OF MOVE ---

  const [checklist, setChecklist] = useState<HBChecklistType | null>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(true);

  const [recentActivityList, setRecentActivityList] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryConfig[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // ... (rest of HomeBuyerWelcome component is unchanged) ...
  const fetchChecklist = async () => {
    try {
      setLoadingChecklist(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/checklist`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
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
  const fetchHomeBuyerBookings = async () => {
    try {
      setDataLoading(true);
      const bookingsRes = await Promise.all([
        api.listBookings({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' }),
      ]);
      let bookingsList: any[] = [];
      if (bookingsRes[0].success && bookingsRes[0].data?.bookings) {
        bookingsList = bookingsRes[0].data.bookings;
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
          const dateB = new Date(b.cancelledAt || b.completedAt || b.updatedAt || b.createdAt).getTime();
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
  const fetchServiceCategories = async () => {
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
  };
  useEffect(() => {
    fetchChecklist();
    fetchHomeBuyerBookings();
    fetchServiceCategories();
    const handleFocus = () => {
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
  const totalItems = checklist?.items.length || 8;
  const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  const isChecklistComplete = totalItems > 0 && completedItems === totalItems;
  const cardTitle = isChecklistComplete
    ? 'Checklist Completed 🎉'
    : 'Your Closure Checklist';
  const cardDescription = isChecklistComplete
    ? 'Congratulations! Review your steps or find more services.'
    : "We're here to guide you through a smooth closing process.";
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
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
      </div>
    </div>
  );
};

// ... (formatDueDate helper is unchanged) ...
const formatDueDate = (dateString: string | null) => {
  if (!dateString) return 'Upcoming';
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return `Due on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

// ... (UpcomingMaintenanceList is unchanged) ...
interface UpcomingMaintenanceListProps {
  items: MaintenanceTaskItem[];
  onComplete: (itemId: string) => void;
  updatingItems: Record<string, boolean>;
}
const UpcomingMaintenanceList = ({ items, onComplete, updatingItems }: UpcomingMaintenanceListProps) => {
  const upcomingTasks = items
    .filter(item => item.isRecurring && item.status === 'PENDING')
    .slice(0, 4);
  if (upcomingTasks.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4 space-y-3">
        <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
        <p className="mt-2 font-medium">All caught up!</p>
        <p className="text-sm">
          You have no upcoming maintenance tasks.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard/maintenance-setup">
            <PlusCircle className="mr-2 h-4 w-4" />
            Set Up Maintenance Plan
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-gray-100">
      {upcomingTasks.map(item => {
        const isUpdating = updatingItems[item.id] || false;
        return (
          <li
            key={item.id}
            className={cn(
              "flex items-center justify-between py-3",
              isUpdating && "opacity-50"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.title}</p>
              <p className="text-sm text-blue-600 font-medium">
                {formatDueDate(item.nextDueDate)}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0 flex items-center space-x-2">
              {item.serviceCategory && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={isUpdating}
                  className="hidden sm:flex"
                >
                  <Link href={`/dashboard/providers?service=${item.serviceCategory}`}>
                    <Search className="mr-2 h-4 w-4" />
                    Find Provider
                  </Link>
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={() => onComplete(item.id)}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Complete
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
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

  // Use the imported global type
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryConfig[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Use the local type
  const [checklist, setChecklist] = useState<FullChecklist | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [updatingItems, setUpdatingItems] = useState<Record<string, boolean>>({});

  // ... (All functions: fetchDashboardData, fetchServiceCategories, handleCompleteTask, useEffect... are unchanged) ...
  const fetchDashboardData = async () => {
    if (user && user.segment !== 'HOME_BUYER') {
      try {
        setDataLoading(true);
        setChecklistLoading(true);
        const token = localStorage.getItem('accessToken');
        const [bookingsRes, propertiesRes, checklistRes] = await Promise.all([
          api.listBookings({ limit: 50 }),
          api.getProperties(),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/checklist`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
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
            const dateB = new Date(b.cancelledAt || b.completedAt || b.updatedAt || b.createdAt).getTime();
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
        if (checklistRes.ok) {
          const checklistData = await checklistRes.json();
          setChecklist(checklistData);
        } else {
          console.error('Failed to fetch checklist');
          setChecklist(null);
        }
      } catch (error) {
        console.error('Failed to fetch existing owner dashboard data:', error);
      } finally {
        setDataLoading(false);
        setChecklistLoading(false);
      }
    }
  };
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
      } finally {
        setCategoriesLoading(false);
      }
    }
  };
  const handleCompleteTask = async (itemId: string) => {
    if (!checklist) return;
    const originalItem = checklist.items.find((item) => item.id === itemId);
    if (!originalItem) return;
    setUpdatingItems(prev => ({ ...prev, [itemId]: true }));
    setChecklist(prev => ({
      ...prev!,
      items: prev!.items.filter(i => i.id !== itemId),
    }));
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/checklist/items/${itemId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: 'COMPLETED' }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to update item.');
      }
      const updatedItem = await response.json();
      if (updatedItem.isRecurring && updatedItem.status === 'PENDING') {
        setChecklist(prev => ({
          ...prev!,
          items: [...prev!.items, updatedItem],
        }));
      }
    } catch (err: any) {
      console.error('Failed to update task', err);
      setChecklist(prev => ({
        ...prev!,
        items: [...prev!.items, originalItem],
      }));
    } finally {
      setUpdatingItems(prev => ({ ...prev, [itemId]: false }));
    }
  };
  useEffect(() => {
    if (user && user.segment !== 'HOME_BUYER') {
      fetchDashboardData();
      fetchServiceCategories();
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
        <h2 className="text-3xl font-bold tracking-tight">
          Loading Dashboard...
        </h2>
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

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle className="text-2xl font-bold">
              Upcoming Maintenance
            </CardTitle>
            <CardDescription>
              Your home's schedule of upcoming tasks.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/maintenance-setup">
              <Settings className="mr-2 h-4 w-4" />
              Manage Plan
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {checklistLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <UpcomingMaintenanceList
              items={checklist?.items || []}
              onComplete={handleCompleteTask}
              updatingItems={updatingItems}
            />
          )}
        </CardContent>
      </Card>

      {dataLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <p className="ml-2 text-gray-600">Loading metrics...</p>
        </div>
      )}

      {/* ... (Rest of the file is unchanged) ... */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Upcoming Bookings
            </CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24"
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Spending
            </CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24"
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