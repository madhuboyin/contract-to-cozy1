// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

// 1. Import new hooks and icons
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
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
  ArrowRight,
  CheckCircle,
  Home,
  ListChecks,
  Loader2, // <-- 1. Add this
} from 'lucide-react';

// --- Types (copied from checklist page) ---
type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
interface ChecklistItemType {
  id: string;
  status: ChecklistItemStatus;
}
interface ChecklistType {
  id: string;
  items: ChecklistItemType[];
}

// ----------------------------------------
// --- New Home Buyer Welcome Component ---
// ----------------------------------------
const HomeBuyerWelcome = ({ user }: { user: any }) => {
  // 2. Add state for checklist data and loading
  const [checklist, setChecklist] = useState<ChecklistType | null>(null);
  const [loading, setLoading] = useState(true);

  // 3. Create a function to fetch the checklist
  const fetchChecklist = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
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
      setLoading(false);
    }
  };

  // 4. Fetch data on mount AND when the user navigates back
  useEffect(() => {
    fetchChecklist();

    // This is the key: Re-fetch when the user focuses the tab/window
    // This happens when they use the browser's "back" button
    const handleFocus = () => {
      fetchChecklist();
    };

    window.addEventListener('focus', handleFocus);

    // Clean up the listener
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []); // Empty array means this runs once on mount

  // 5. Calculate real progress
  const completedItems =
    checklist?.items.filter((item) => item.status === 'COMPLETED').length || 0;
  const totalItems = checklist?.items.length || 8; // Default to 8
  const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  
  // --- FIX: Logic to determine completion and set button text ---
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
  // --- END FIX ---


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
              {/* Using conditional card title */}
              <CardTitle className="text-2xl font-bold">
                {cardTitle}
              </CardTitle>
              {/* Using conditional card description */}
              <CardDescription>
                {cardDescription}
              </CardDescription>
            </div>
            <ListChecks className="h-8 w-8 text-blue-500" />
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 6. Show a loading spinner while fetching */}
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
                {/* Using conditional button text */}
                {buttonText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Quick Actions Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Find Services
              </CardTitle>
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
              <CardTitle className="text-sm font-medium">
                My Bookings
              </CardTitle>
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
    </div>
  );
};

// -------------------------------------
// --- Main Dashboard Page Component ---
// (This part remains the same)
// -------------------------------------
export default function DashboardPage() {
  const { user, loading } = useAuth();

  // 1. Show a loading state while auth is being checked
  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">
          Loading Dashboard...
        </h2>
      </div>
    );
  }

  // 2. If the user is a HOME_BUYER, show the new Welcome screen
  if (user && user.segment === 'HOME_BUYER') {
    return <HomeBuyerWelcome user={user} />;
  }

  // 3. Otherwise, show the default dashboard for existing owners
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* ... (existing owner cards) ... */}
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
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">+2 this month</p>
          </CardContent>
        </Card>
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
            <div className="text-2xl font-bold">$1,250</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Properties</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1</div>
            <p className="text-xs text-muted-foreground">Manage properties</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Completed Jobs
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">View service history</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              You have 3 upcoming bookings this week.
            </CardDescription>
          </CardHeader>
          <CardContent>{/* Placeholder for recent activity */}</CardContent>
        </Card>
        {/* NEW: Service Category Quick Actions */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Book Services</CardTitle>
            <CardDescription>
              Find providers for your home maintenance needs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Handyman Services
              </Link>
            </Button>

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