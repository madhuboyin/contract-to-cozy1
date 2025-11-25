// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import { Booking, Property, User } from '@/types';
import { DashboardChecklistItem, ScoredProperty, HealthScoreResult } from './types'; 

// Import the segment-specific dashboard components
import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';

interface DashboardData {
    bookings: Booking[];
    properties: ScoredProperty[];
    checklist: { id: string, items: DashboardChecklistItem[] } | null;
    isLoading: boolean;
    error: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
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
      
      console.log(`DEBUG: Checking NEXT_PUBLIC_API_URL: ${API_URL}`);
      console.log(`DEBUG: Final Checklist URL: ${CHECKLIST_URL}`);
      
      const checklistFetchPromise = fetch(CHECKLIST_URL, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        }).then(async (res) => {
            if (!res.ok) {
                const errorText = await res.text();
                console.error(`ERROR: Checklist fetch failed with status ${res.status}. Response start: ${errorText.substring(0, 100)}`);
                throw new Error(`Checklist API returned status ${res.status}.`);
            }
            console.log('DEBUG: Checklist fetch successful (res.ok is true). Attempting JSON parse.');
            return res.json();
        });

      const [bookingsRes, propertiesRes, checklistRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        checklistFetchPromise,
      ]);

      console.log('DEBUG: Promise.all resolved.');
      
      const newProperties: ScoredProperty[] = propertiesRes.success ? (propertiesRes.data.properties as ScoredProperty[]) : [];

      // Extract checklist data
      let fetchedChecklist = null;
      let isChecklistSuccess = false;

      if (typeof checklistRes === 'object' && checklistRes !== null) {
          if (checklistRes.success && checklistRes.data) {
              fetchedChecklist = checklistRes.data;
              isChecklistSuccess = true;
          } else if (Array.isArray(checklistRes.items)) {
              fetchedChecklist = checklistRes;
              isChecklistSuccess = true;
          }
      }
      
      console.log(`DEBUG: Checklist Success Status: ${isChecklistSuccess}`);
      console.log(`DEBUG: Fetched Checklist Data (partial): ID=${fetchedChecklist ? fetchedChecklist.id : 'N/A'}, Items Count=${fetchedChecklist ? fetchedChecklist.items.length : 0}`);

      setData({
        bookings: bookingsRes.success ? bookingsRes.data.bookings : [],
        properties: newProperties,
        checklist: fetchedChecklist,
        isLoading: false,
        error: null,
      });

    } catch (error: any) {
      console.error('CRITICAL ERROR: Failed to fetch dashboard data:', error);
      setData(prev => ({ ...prev, isLoading: false, error: error.message || 'An unexpected error occurred.' }));
    }
  };

  useEffect(() => {
    if (user && !userLoading) {
      fetchDashboardData();
    }
  }, [user, userLoading]);

  // NEW: Redirect logic for EXISTING_OWNER with no properties
  useEffect(() => {
    if (!userLoading && !data.isLoading && user) {
      const userSegment = user.segment;
      
      // Check if user is EXISTING_OWNER AND has no properties
      if (userSegment === 'EXISTING_OWNER' && data.properties.length === 0) {
        console.log('DEBUG: New EXISTING_OWNER detected with no properties, redirecting to property setup...');
        router.push('/dashboard/properties/new');
      }
    }
  }, [user, userLoading, data.isLoading, data.properties, router]);

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

  const userSegment = user.segment;
  const checklistItems = (data.checklist?.items || []) as DashboardChecklistItem[];
  
  console.log(`DEBUG: Final Checklist Items to Dashboard: ${checklistItems.length}`);
  
  if (userSegment === 'HOME_BUYER') {
    return (
      <HomeBuyerDashboard 
        userFirstName={user.firstName}
        bookings={data.bookings}
        properties={data.properties}
        checklistItems={checklistItems}
      />
    );
  }

  // Default to Existing Owner
  return (
    <ExistingOwnerDashboard 
      userFirstName={user.firstName}
      bookings={data.bookings}
      properties={data.properties}
      checklistItems={checklistItems}
    />
  );
}