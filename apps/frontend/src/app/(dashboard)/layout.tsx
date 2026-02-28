'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { PropertyProvider } from '@/lib/property/PropertyContext';
import type { User } from '@/types';
import { AIChat } from '@/components/AIChat';
import AppShell from '@/components/navigation/AppShell';
import DashboardCommandPalette from '@/components/navigation/DashboardCommandPalette';
import { PropertySetupBanner } from '@/components/PropertySetupBanner';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: User | null; loading: boolean };
  const router = useRouter();
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const bannerFetchedRef = useRef(false);

  useEffect(() => {
    if (bannerFetchedRef.current) return;

    const fetchPropertyCount = async () => {
      if (!user || user.segment !== 'EXISTING_OWNER') {
        setShowBanner(false);
        return;
      }

      bannerFetchedRef.current = true;

      try {
        const response = await api.getProperties();

        if (!response.success) {
          setShowBanner(false);
          return;
        }

        const count = response.data.properties.length;
        setPropertyCount(count);

        const hasSkipped = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY) === 'true';
        setShowBanner(count === 0 && !hasSkipped);
      } catch {
        setShowBanner(false);
      }
    };

    if (!loading && user) {
      fetchPropertyCount();
    }
  }, [user, loading]);

  useEffect(() => {
    if (!loading && user?.role === 'PROVIDER') {
      router.replace('/providers/dashboard');
    }
  }, [loading, user, router]);

  const handleDismissBanner = () => {
    localStorage.setItem(PROPERTY_SETUP_SKIPPED_KEY, 'true');
    setShowBanner(false);
  };

  const handleRefresh = async () => {
    setRefreshKey((prev) => prev + 1);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user && user.role === 'PROVIDER') {
    return null;
  }

  return (
    <NotificationProvider>
      <PropertyProvider>
        <AppShell
          user={user}
          banner={
            showBanner ? (
              <PropertySetupBanner show={showBanner} onDismiss={handleDismissBanner} />
            ) : null
          }
        >
          <PullToRefresh onRefresh={handleRefresh}>
            <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
              <div key={`${refreshKey}-${propertyCount ?? 'none'}`}>{children}</div>
            </div>
          </PullToRefresh>
        </AppShell>

        <DashboardCommandPalette />
        <AIChat />
      </PropertyProvider>
    </NotificationProvider>
  );
}

export default DashboardLayout;
