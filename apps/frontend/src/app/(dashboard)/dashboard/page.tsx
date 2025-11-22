// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import { Booking, Property, User } from '@/types';

// Import the new segment-specific dashboard components
import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';
import { DashboardData, DashboardChecklistItem, ChecklistData } from './types';


export default function DashboardPage() {
  const { user, loading: userLoading } = useAuth();
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    properties: [],
    checklist: null,
    isLoading: true,
    error: null,
  });

  const fetchDashboardData = async () => {
    if (!user) {
      setData(prev => ({ ...prev, isLoading: false, error: 'User not logged in.' }));
      return;
    }

    try {
      setData(prev => ({ ...prev, isLoading: true, error: null }));
      
      const token = localStorage.getItem('accessToken');
      
      const [bookingsRes, propertiesRes, checklistRes] = await Promise.all([
        // Fixed 400 error by using 'createdAt'
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/checklist`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).then(res => res.json()),
      ]);

      // *** DEBUG LOG (NEW) ***
      console.log('DEBUG 5: Raw Checklist API Response:', checklistRes);

      setData(prev => ({
        ...prev,
        bookings: bookingsRes.success ? bookingsRes.data.bookings : [],
        properties: propertiesRes.success ? propertiesRes.data.properties : [],
        // FIXED: Check for a non-null/non-error object structure. 
        // This is a more robust check than relying solely on '.id'.
        checklist: checklistRes && typeof checklistRes === 'object' && !('error' in checklistRes) 
          ? (checklistRes as ChecklistData) 
          : null,
        isLoading: false,
      }));

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setData(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to load dashboard data.' 
      }));
    }
  };

  useEffect(() => {
    // Only fetch data once user object is available (not null)
    if (user && !userLoading) {
      fetchDashboardData();
    }

    const handleFocus = () => {
      if (user && !userLoading) {
        fetchDashboardData();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, userLoading]);

  // --- RENDERING LOGIC (The Router) ---

  if (userLoading || data.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-lg text-gray-600">Loading your personalized dashboard...</p>
      </div>
    );
  }

  if (!user || data.error) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600">Error Loading Dashboard</h2>
        <p className="text-muted-foreground">{data.error || 'Please try logging in again.'}</p>
      </div>
    );
  }

  // FIX: Access the top-level segment field, which is correctly available on the User type.
  const userSegment = user.segment;
  
  // DEBUG 4: Log segment in the router just before routing decision
  // console.log('DEBUG 4: Dashboard Router: Segment read is:', userSegment);

  const checklistItems = (data.checklist?.items || []) as DashboardChecklistItem[];
  
  // CRITICAL: The segment check must match the fixed property in types/index.ts
  if (userSegment === 'HOME_BUYER') {
    // console.log('DEBUG 4: Dashboard Router: Rendering HOME_BUYER Dashboard.');
    return (
      <HomeBuyerDashboard 
        userFirstName={user.firstName}
        bookings={data.bookings}
        properties={data.properties}
        checklistItems={checklistItems}
      />
    );
  }

  // Default to Existing Owner for 'EXISTING_OWNER' or if segment is missing/undefined
  // console.log('DEBUG 4: Dashboard Router: Rendering EXISTING_OWNER Dashboard.');
  return (
    <ExistingOwnerDashboard 
      userFirstName={user.firstName}
      bookings={data.bookings}
      properties={data.properties}
      checklistItems={checklistItems}
    />
  );
}