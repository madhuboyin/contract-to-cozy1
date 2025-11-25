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
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    properties: [],
    checklist: null,
    isLoading: true,
    error: null,
  });

  // HIGHEST PRIORITY: Check redirect IMMEDIATELY
  useEffect(() => {
    const checkRedirect = async () => {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║           REDIRECT CHECK - HIGHEST PRIORITY            ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      
      if (userLoading) {
        console.log('⏸️ User still loading, waiting...');
        return;
      }

      if (!user) {
        console.log('❌ No user, skipping redirect check');
        setRedirectChecked(true);
        return;
      }

      if (redirectChecked) {
        console.log('✅ Already checked redirect');
        return;
      }

      console.log('👤 User:', user.firstName);
      console.log('👤 User segment:', user.segment);

      // Only EXISTING_OWNER needs redirect check
      if (user.segment !== 'EXISTING_OWNER') {
        console.log('✋ Not EXISTING_OWNER, no redirect needed');
        setRedirectChecked(true);
        return;
      }

      // Check skip flag FIRST
      const skipFlag = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY);
      const hasSkipped = skipFlag === 'true';
      
      console.log('📦 localStorage skip flag value:', skipFlag);
      console.log('✅ Has skipped?', hasSkipped);

      if (hasSkipped) {
        console.log('✋ User HAS SKIPPED, no redirect needed');
        console.log('   Banner will be shown on dashboard');
        setRedirectChecked(true);
        return;
      }

      // User has NOT skipped - check properties
      console.log('🔍 User has NOT skipped - checking property count...');
      try {
        const propertiesRes = await api.getProperties();
        const propertyCount = propertiesRes.success ? propertiesRes.data.properties.length : 0;
        
        console.log('🏠 Property count:', propertyCount);

        if (propertyCount === 0) {
          console.log('');
          console.log('🚀 REDIRECT TRIGGERED!');
          console.log('   ├─ User segment: EXISTING_OWNER ✅');
          console.log('   ├─ Property count: 0 ✅');
          console.log('   ├─ Has NOT skipped ✅');
          console.log('   └─ Redirecting to: /dashboard/properties/new');
          console.log('');
          
          setShouldRedirect(true);
          router.push('/dashboard/properties/new');
          // Don't set redirectChecked - keep loading state
        } else {
          console.log('✋ User has', propertyCount, 'properties, no redirect needed');
          setRedirectChecked(true);
        }
      } catch (error) {
        console.error('❌ Error checking properties:', error);
        setRedirectChecked(true);
      }
    };

    checkRedirect();
  }, [user, userLoading, redirectChecked, router]);

  // Load dashboard data ONLY after redirect check completes
  const fetchDashboardData = async () => {
    if (!user) {
      console.log('DEBUG: User not logged in, halting fetch.');
      setData(prev => ({ ...prev, isLoading: false, error: 'User not logged in.' }));
      return;
    }

    try {
      console.log('📊 Loading dashboard data...');
      setData(prev => ({ ...prev, isLoading: true, error: null }));
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const CHECKLIST_URL = `${API_URL}/api/checklist`;
      
      const checklistFetchPromise = fetch(CHECKLIST_URL, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        }).then(async (res) => {
            if (!res.ok) {
                throw new Error(`Checklist API returned status ${res.status}.`);
            }
            return res.json();
        });

      const [bookingsRes, propertiesRes, checklistRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        checklistFetchPromise,
      ]);
      
      const newProperties: ScoredProperty[] = propertiesRes.success ? (propertiesRes.data.properties as ScoredProperty[]) : [];

      let fetchedChecklist = null;
      if (typeof checklistRes === 'object' && checklistRes !== null) {
          if (checklistRes.success && checklistRes.data) {
              fetchedChecklist = checklistRes.data;
          } else if (Array.isArray(checklistRes.items)) {
              fetchedChecklist = checklistRes;
          }
      }
      
      console.log('✅ Dashboard data loaded');

      setData({
        bookings: bookingsRes.success ? bookingsRes.data.bookings : [],
        properties: newProperties,
        checklist: fetchedChecklist,
        isLoading: false,
        error: null,
      });

    } catch (error: any) {
      console.error('❌ Failed to fetch dashboard data:', error);
      setData(prev => ({ ...prev, isLoading: false, error: error.message || 'An unexpected error occurred.' }));
    }
  };

  useEffect(() => {
    if (user && !userLoading && redirectChecked && !shouldRedirect) {
      console.log('📊 Redirect check complete, fetching dashboard data...');
      fetchDashboardData();
    }
  }, [user, userLoading, redirectChecked, shouldRedirect]);

  // Show loading while redirect check is happening OR during redirect
  if (userLoading || !redirectChecked || shouldRedirect || data.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="ml-3 text-lg text-gray-600">
          {shouldRedirect ? 'Redirecting to property setup...' : 'Loading your personalized dashboard...'}
        </p>
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
  
  console.log('🎨 Rendering dashboard for', userSegment);
  
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