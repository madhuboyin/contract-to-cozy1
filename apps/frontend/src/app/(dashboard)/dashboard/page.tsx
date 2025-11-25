// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import { Booking, Property, User } from '@/types';
import { DashboardChecklistItem, ScoredProperty, HealthScoreResult } from './types'; 

import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';

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
      
      const checklistFetchPromise = fetch(CHECKLIST_URL, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        }).then(async (res) => {
            if (!res.ok) {
                const errorText = await res.text();
                console.error(`ERROR: Checklist fetch failed with status ${res.status}`);
                throw new Error(`Checklist API returned status ${res.status}.`);
            }
            return res.json();
        });

      const [bookingsRes, propertiesRes, checklistRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        checklistFetchPromise,
      ]);

      console.log('DEBUG: Promise.all resolved.');
      
      const newProperties: ScoredProperty[] = propertiesRes.success ? (propertiesRes.data.properties as ScoredProperty[]) : [];

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
      
      console.log(`DEBUG: Properties count: ${newProperties.length}`);

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

  // Redirect check with EXTENSIVE logging
  useEffect(() => {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║          DASHBOARD REDIRECT CHECK TRIGGERED              ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('⏰ Time:', new Date().toISOString());
    console.log('👤 User loading:', userLoading);
    console.log('📊 Data loading:', data.isLoading);
    console.log('🧑 User exists:', !!user);
    
    if (user) {
      console.log('👤 User segment:', user.segment);
      console.log('🏠 Properties count:', data.properties.length);
    }
    
    const hasSkipped = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY);
    console.log('📦 localStorage skip flag:', hasSkipped);
    console.log('✅ Skip flag is true?', hasSkipped === 'true');
    
    if (!userLoading && !data.isLoading && user) {
      const userSegment = user.segment;
      const propertyCount = data.properties.length;
      const skipFlagValue = hasSkipped === 'true';
      
      console.log('');
      console.log('🔍 DECISION LOGIC:');
      console.log('   ├─ Is EXISTING_OWNER?', userSegment === 'EXISTING_OWNER');
      console.log('   ├─ Has 0 properties?', propertyCount === 0);
      console.log('   └─ Has NOT skipped?', !skipFlagValue);
      console.log('');
      
      if (userSegment === 'EXISTING_OWNER' && propertyCount === 0 && !skipFlagValue) {
        console.log('🚀 REDIRECTING to /dashboard/properties/new');
        console.log('   Reason: New EXISTING_OWNER with no properties who has not skipped');
        router.push('/dashboard/properties/new');
      } else if (userSegment === 'EXISTING_OWNER' && propertyCount === 0 && skipFlagValue) {
        console.log('✋ NOT REDIRECTING');
        console.log('   Reason: User has skipped property setup');
        console.log('   Banner should be visible on dashboard');
      } else {
        console.log('✋ NOT REDIRECTING');
        console.log('   Reason: Not a new EXISTING_OWNER or already has properties');
      }
    } else {
      console.log('⏸️ SKIPPING REDIRECT CHECK - Still loading');
    }
    
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
  }, [user, userLoading, data.isLoading, data.properties, router]);

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

  return (
    <ExistingOwnerDashboard 
      userFirstName={user.firstName}
      bookings={data.bookings}
      properties={data.properties}
      checklistItems={checklistItems}
    />
  );
}