// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Booking, ChecklistItem, ScoredProperty, MaintenanceTaskStats, PropertyMaintenanceTask } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { SeasonalChecklistCard } from '@/app/(dashboard)/dashboard/components/SeasonalChecklistCard';
import { ArrowRight, Activity } from 'lucide-react';


// Local Home Updates
import { LocalUpdatesCarousel } from '@/components/localUpdates/LocalUpdatesCarousel';
import { LocalUpdate } from '@/types';
import { ActionCenter } from '@/components/orchestration/ActionCenter';
import { api } from '@/lib/api/client';
import { HomePulse } from './HomePulse';


interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[];
  checklistItems: ChecklistItem[];
  selectedPropertyId: string | undefined;
}

export const ExistingOwnerDashboard = ({
  bookings,
  properties,
  checklistItems,
  selectedPropertyId,
}: ExistingOwnerDashboardProps) => {
  // PHASE 5: Fetch new PropertyMaintenanceTask statistics
  const [stats, setStats] = useState<MaintenanceTaskStats | null>(null);
  
  // 🔑 Fetch actual PropertyMaintenanceTask data
  const [maintenanceTasks, setMaintenanceTasks] = useState<PropertyMaintenanceTask[]>([]);
  
  // 🔑 NEW: Fetch actual Booking data for selected property
  const [propertyBookings, setPropertyBookings] = useState<Booking[]>([]);

  // Local Home Updates
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);

  // PHASE 5: Fetch statistics, tasks, AND bookings
  useEffect(() => {
    if (!selectedPropertyId) return;

    const fetchMaintenanceData = async () => {
      try {
        // Fetch stats, tasks, and bookings in parallel
        const [statsResponse, tasksResponse, bookingsResponse] = await Promise.all([
          api.getMaintenanceTaskStats(selectedPropertyId),
          api.getMaintenanceTasks(selectedPropertyId, {
            includeCompleted: false,
          }),
          api.listBookings({ propertyId: selectedPropertyId }),
        ]);

        if (statsResponse.success) {
          setStats(statsResponse.data);
        }

        if (tasksResponse.success) {
          setMaintenanceTasks(tasksResponse.data);
        }

        // 🔑 NEW: Set bookings
        if (bookingsResponse.success && bookingsResponse.data?.bookings) {
          setPropertyBookings(Array.isArray(bookingsResponse.data.bookings) 
            ? bookingsResponse.data.bookings 
            : []);
        }
      } catch (error) {
        console.error('Failed to fetch maintenance data:', error);
      }
    };

    fetchMaintenanceData();
  }, [selectedPropertyId]);

  // Fetch local updates
  useEffect(() => {
    if (!selectedPropertyId) return;

    api
      .getLocalUpdates(selectedPropertyId)
      .then((res) => {
        if (res.success) {
          setLocalUpdates(res.data.updates);
        }
      })
      .catch(() => {
        // fail silently
      });
  }, [selectedPropertyId]);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const isPropertySelected = !!selectedProperty;

  return (
    <div className="space-y-2 pb-8">
      {/* Header */}
      {/* Home Pulse — compact health strip */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">
          Here&apos;s what needs your attention today
        </h2>
        <HomePulse stats={stats} selectedPropertyId={selectedPropertyId} />
      </div>


      {/* Action Center (Top Actions) */}
      {selectedPropertyId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Action Center
            </h2>
            <Link
              href={`/dashboard/actions${
                selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''
              }`}
              className="text-lg font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center"
            >
              View all
            </Link>
          </div>

          <ActionCenter propertyId={selectedPropertyId} maxItems={5} />
        </div>
      )}

      {/* Local Home Updates (Helpful Suggestions) */}
      {localUpdates.length > 0 && (
        <LocalUpdatesCarousel
          updates={localUpdates}
          onDismiss={async (id) => {
            setLocalUpdates((prev) => prev.filter((u) => u.id !== id));
            await api.dismissLocalUpdate(id);
          }}
          onCtaClick={(id) => {
            const u = localUpdates.find((x) => x.id === id);
            if (u?.ctaUrl) {
              window.open(u.ctaUrl, '_blank', 'noopener,noreferrer');
            }
          }}
        />
      )}

      {/* NEW ROW: Seasonal Checklist + Favorite Providers */}
      <div className="grid gap-6 md:grid-cols-2">
        <SeasonalChecklistCard propertyId={selectedPropertyId} />
        <FavoriteProvidersCard />
      </div>

      {/* Activity Center */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Activity className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Activity Center</h2>
          <p className="text-sm text-gray-500">
            Track upcoming bookings, maintenance, and renewals for your home.
          </p>
        </div>
      </div>

      {/* Activity Cards (Original 3 cards) */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 items-start">  
        <UpcomingBookingsCard 
          bookings={propertyBookings}
          isPropertySelected={isPropertySelected}
          selectedPropertyId={selectedPropertyId}
        />
        <RecurringMaintenanceCard
          maintenance={maintenanceTasks}
          isPropertySelected={isPropertySelected}
          selectedPropertyId={selectedPropertyId}
        />
        <UpcomingRenewalsCard propertyId={selectedPropertyId} />
      </div>

      {/* Footer CTA */}
      <div className="pt-4">
        <Link
          href={`/dashboard/maintenance${
            selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''
          }`}
          className="text-lg font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center"
        >
          View Full Home Management Checklist
          <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
    </div>
  );
};
