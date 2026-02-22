// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Booking, ScoredProperty, PropertyMaintenanceTask } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { SeasonalChecklistCard } from '@/app/(dashboard)/dashboard/components/SeasonalChecklistCard';
import { ArrowRight, Activity } from 'lucide-react';
import { api } from '@/lib/api/client';
import { InsuranceSummaryCard } from './InsuranceSummaryCard';
import { EquityOverviewCard } from './EquityOverviewCard';
import { MaintenanceForecast } from './MaintenanceForecast';


interface ExistingOwnerDashboardProps {
  properties: ScoredProperty[];
  selectedPropertyId: string | undefined;
}

export const ExistingOwnerDashboard = ({
  properties,
  selectedPropertyId,
}: ExistingOwnerDashboardProps) => {
  const [maintenanceTasks, setMaintenanceTasks] = useState<PropertyMaintenanceTask[]>([]);
  const [propertyBookings, setPropertyBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!selectedPropertyId) return;

    const fetchMaintenanceData = async () => {
      try {
        const [tasksResponse, bookingsResponse] = await Promise.all([
          api.getMaintenanceTasks(selectedPropertyId, {
            includeCompleted: false,
          }),
          api.listBookings({ propertyId: selectedPropertyId }),
        ]);

        if (tasksResponse.success) {
          setMaintenanceTasks(tasksResponse.data);
        }

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
    <div className="space-y-6 pb-8">
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:col-span-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <Activity className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Maintenance Timeline</h2>
              <p className="text-sm text-slate-500">Planned upkeep and expected cost curve.</p>
            </div>
          </div>
          <MaintenanceForecast propertyId={selectedPropertyId} mode="timeline" />
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <Activity className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Next Up</h2>
              <p className="text-sm text-slate-500">Upcoming maintenance focus.</p>
            </div>
          </div>
          <MaintenanceForecast propertyId={selectedPropertyId} mode="next-up" />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 lg:col-span-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <Activity className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Financial & Protection Overview</h2>
              <p className="text-sm text-slate-500">Current equity and coverage posture for your property.</p>
            </div>
          </div>

          <div className="space-y-4">
            <EquityOverviewCard
              propertyId={selectedPropertyId}
              healthScore={selectedProperty?.healthScore?.totalScore ?? null}
            />
            <InsuranceSummaryCard propertyId={selectedPropertyId} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Activity Center</h2>
              <p className="text-sm text-slate-500">
                Upcoming bookings, maintenance, and renewals.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <UpcomingRenewalsCard propertyId={selectedPropertyId} />
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
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <Link
              href={`/dashboard/maintenance${
                selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''
              }`}
              className="flex items-center text-base font-semibold text-blue-600 transition-colors hover:text-blue-700"
            >
              View full home management checklist
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-4">
          <SeasonalChecklistCard propertyId={selectedPropertyId} />
          <FavoriteProvidersCard />
        </aside>
      </div>
    </div>
  );
};
