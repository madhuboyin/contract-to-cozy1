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
import { InsuranceSummaryCard } from './InsuranceSummaryCard';
import { EquityOverviewCard } from './EquityOverviewCard';
import { MaintenanceForecast } from './MaintenanceForecast';
import { motion } from 'framer-motion';


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
  const sectionMotion = (index: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: index * 0.08 },
  });

  return (
    <div className="space-y-6 pb-8 md:space-y-8">
      <div className="tier-context mb-8 space-y-6">
        <section className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <AlertTriangle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Here&apos;s what needs your attention today</h2>
              <p className="text-sm text-gray-500">
                A quick summary of urgent items, progress, and estimated costs.
              </p>
            </div>
          </div>
          <HomePulse stats={stats} selectedPropertyId={selectedPropertyId} />
        </section>

        <HomeHealthNudge propertyId={selectedPropertyId} />
        <MaintenanceForecast propertyId={selectedPropertyId} mode="next-up" />
        <EquityOverviewCard
          propertyId={selectedPropertyId}
          healthScore={selectedProperty?.healthScore?.totalScore ?? null}
        />
        <InsuranceSummaryCard propertyId={selectedPropertyId} />
        <MaintenanceForecast propertyId={selectedPropertyId} mode="timeline" />

        {selectedPropertyId && (
          <motion.section className="space-y-3" {...sectionMotion(4)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">Action Center</h2>
                  <p className="text-sm text-gray-500">Prioritized tasks to keep your home on track.</p>
                </div>
              </div>
              <Link
                href={`/dashboard/actions${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`}
                className="inline-flex w-fit min-h-[44px] items-center whitespace-nowrap text-base font-semibold text-blue-600 transition-colors hover:text-blue-700 md:text-lg"
              >
                View all
              </Link>
            </div>

            <ActionCenter propertyId={selectedPropertyId} maxItems={5} />
          </motion.section>
        )}

        <FavoriteProvidersCard />
      </div>

      <div className="tier-activity space-y-4 opacity-95">
        <SeasonalChecklistCard propertyId={selectedPropertyId} />

        <motion.section className="space-y-3" {...sectionMotion(5)}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Activity Center</h2>
              <p className="text-sm text-gray-500">
                Track upcoming bookings, maintenance, and renewals for your home.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
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
        </motion.section>
      </div>

      <div className="pt-4">
        <Link
          href={`/dashboard/maintenance${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`}
          className="flex items-center text-lg font-semibold text-blue-600 transition-colors hover:text-blue-700"
        >
          View Full Home Management Checklist
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </div>
  );
};
