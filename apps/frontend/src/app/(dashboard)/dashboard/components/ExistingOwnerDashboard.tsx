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
import { ArrowRight, Activity, AlertTriangle, ClipboardList } from 'lucide-react';
import { ActionCenter } from '@/components/orchestration/ActionCenter';
import { api } from '@/lib/api/client';
import { HomePulse } from './HomePulse';
import { HomeHealthNudge } from './verification/HomeHealthNudge';


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

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const isPropertySelected = !!selectedProperty;

  return (
    <div className="space-y-5 pb-8 md:space-y-6">
      {/* Attention Summary */}
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Here&apos;s what needs your attention today
            </h2>
            <p className="text-sm text-gray-500">
              A quick summary of urgent items, progress, and estimated costs.
            </p>
          </div>
        </div>
        <HomePulse stats={stats} selectedPropertyId={selectedPropertyId} />
      </section>

      {/* Verification Nudge */}
      <HomeHealthNudge propertyId={selectedPropertyId} />

      <div className="w-full border-t border-gray-200" />


      {/* Action Center (Top Actions) */}
      {selectedPropertyId && (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ClipboardList className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Action Center
                </h2>
                <p className="text-sm text-gray-500">
                  Prioritized tasks to keep your home on track.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/actions${
                selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''
              }`}
              className="inline-flex w-fit min-h-[44px] items-center whitespace-nowrap text-base md:text-lg font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all
            </Link>
          </div>

          <ActionCenter propertyId={selectedPropertyId} maxItems={5} />
        </section>
      )}
      <div className="w-full border-t border-gray-200" />

      {/* NEW ROW: Seasonal Checklist + Favorite Providers */}
      <div className="grid gap-6 md:grid-cols-2">
        <SeasonalChecklistCard propertyId={selectedPropertyId} />
        <FavoriteProvidersCard />
      </div>
      <div className="w-full border-t border-gray-200" />

      {/* Activity Center */}
      <section className="space-y-3">
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
      </section>
      <div className="w-full border-t border-gray-200" />

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
