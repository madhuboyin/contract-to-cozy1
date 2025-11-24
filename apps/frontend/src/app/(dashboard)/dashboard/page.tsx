// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import { Booking, Property, User } from '@/types';
// CRITICAL FIX: Import ScoredProperty and HealthScoreResult from local types
import { DashboardChecklistItem, ScoredProperty, HealthScoreResult } from './types'; 

// Import the new segment-specific dashboard components
import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';

// UPDATE INTERFACE: DashboardData must now store properties as ScoredProperty[]
interface DashboardData {
    bookings: Booking[];
    properties: ScoredProperty[]; // Changed from Property[]
    checklist: { id: string, items: DashboardChecklistItem[] } | null;
    isLoading: boolean;
    error: string | null;
}

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
      console.log('DEBUG: User not logged in, halting fetch.');
      setData(prev => ({ ...prev, isLoading: false, error: 'User not logged in.' }));
      return;
    }

    try {
      console.log('DEBUG: Starting fetchDashboardData...');
      setData(prev => ({ ...prev, isLoading: true, error: null }));
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const CHECKLIST_URL = `${API_URL}/api/checklist`;
      
      // DEBUG: Log the API URL being used
      console.log(`DEBUG: Checking NEXT_PUBLIC_API_URL: ${API_URL}`);
      console.log(`DEBUG: Final Checklist URL: ${CHECKLIST_URL}`);
      
      const checklistFetchPromise = fetch(CHECKLIST_URL, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        }).then(async (res) => {
            // CRITICAL FIX: Check for successful HTTP status (e.g., 200-299) before parsing.
            if (!res.ok) {
                // If it fails (e.g., 404, 500), throw an error to be caught below, preventing JSON parse errors.
                const errorText = await res.text();
                console.error(`ERROR: Checklist fetch failed with status ${res.status}. Response start: ${errorText.substring(0, 100)}`);
                throw new Error(`Checklist API returned status ${res.status}.`);
            }
            console.log('DEBUG: Checklist fetch successful (res.ok is true). Attempting JSON parse.');
            return res.json();
        });


      const [bookingsRes, propertiesRes, checklistRes] = await Promise.all([
        // Fixed 400 error by using 'createdAt'
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        checklistFetchPromise, // Use the new robust fetch logic
      ]);

      console.log('DEBUG: Promise.all resolved.');
      
      const newProperties: ScoredProperty[] = propertiesRes.success ? (propertiesRes.data.properties as ScoredProperty[]) : [];

      // FIX: Ensure checklist is set robustly.
      const isChecklistSuccess = typeof checklistRes === 'object' && checklistRes !== null && checklistRes.success;

      // DEBUG: Log the checklist data status
      console.log(`DEBUG: Checklist Success Status: ${isChecklistSuccess}`);
      console.log(`DEBUG: Fetched Checklist Data (partial): ID=${isChecklistSuccess ? checklistRes.data.id : 'N/A'}, Items Count=${isChecklistSuccess ? checklistRes.data.items.length : 0}`);

      setData({
        bookings: bookingsRes.success ? bookingsRes.data.bookings : [],
        properties: newProperties, // Now correctly typed and passed
        checklist: isChecklistSuccess ? checklistRes.data : null, // Uses the robust check
        isLoading: false,
        error: null,
      });

    } catch (error: any) {
      // CRITICAL DEBUG: Catch and log the entire error object
      console.error('CRITICAL ERROR: Failed to fetch dashboard data:', error);
      setData(prev => ({ ...prev, isLoading: false, error: error.message || 'An unexpected error occurred.' }));
    }
  };

  useEffect(() => {
    if (user && !userLoading) {
      fetchDashboardData();
    }
  }, [user, userLoading]);

  // Handle Loading/Error States
  if (userLoading || data.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="ml-3 text-lg text-gray-600">Loading your personalized dashboard...</p>
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
  
  const checklistItems = (data.checklist?.items || []) as DashboardChecklistItem[];
  
  // CRITICAL DEBUG: Log the final number of checklist items being passed down
  console.log(`DEBUG: Final Checklist Items to Dashboard: ${checklistItems.length}`);
  
  // CRITICAL: The segment check must match the fixed property in types/index.ts
  if (userSegment === 'HOME_BUYER') {
    return (
      <HomeBuyerDashboard 
        userFirstName={user.firstName}
        bookings={data.bookings}
        properties={data.properties} // Now ScoredProperty[]
        checklistItems={checklistItems}
      />
    );
  }

  // Default to Existing Owner for 'EXISTING_OWNER' or if segment is missing/undefined
  return (
    <ExistingOwnerDashboard 
      userFirstName={user.firstName}
      bookings={data.bookings}
      properties={data.properties} // Now ScoredProperty[]
      checklistItems={checklistItems}
    />
  );
}