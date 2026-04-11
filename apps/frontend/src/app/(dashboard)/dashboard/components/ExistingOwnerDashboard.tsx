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
import { ArrowRight, Activity, AlertTriangle, ClipboardList, Sparkles } from 'lucide-react';
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

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
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
  const estimatedImpact = Number(stats?.totalEstimatedCost ?? 0);
  const overdueCount = Number(stats?.overdue ?? 0);
  const urgentCount = Number((stats?.byPriority?.urgent ?? 0) + (stats?.byPriority?.high ?? 0));
  const totalAttentionItems = overdueCount + urgentCount;
  const completionRate =
    Number(stats?.total ?? 0) > 0
      ? Math.round(((stats?.completed ?? 0) / Number(stats?.total ?? 1)) * 100)
      : 0;
  const attentionHeadline =
    estimatedImpact > 0
      ? `${formatUsd(estimatedImpact)} estimated impact needs review`
      : totalAttentionItems > 0
        ? `${totalAttentionItems} items may cost more if delayed`
        : 'Nothing urgent right now';
  const attentionSubline =
    totalAttentionItems > 0
      ? 'Top issues are ranked by downside first so one action creates immediate protection.'
      : 'Your biggest items are already being tracked and monitored.';
  const sectionMotion = (index: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: index * 0.08 },
  });

  return (
    <div className="space-y-6 pb-8 md:space-y-8">
      <div className="tier-context mb-8 space-y-6">
        <section className="space-y-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/70 to-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-100 p-2 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">What matters most today</h2>
              <p className="text-sm text-gray-600">{attentionHeadline}</p>
              <p className="text-xs text-gray-500 mt-1">{attentionSubline}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Estimated impact</p>
              <p className="text-base font-semibold text-emerald-900">
                {estimatedImpact > 0 ? formatUsd(estimatedImpact) : 'No major cost risk'}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/75 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">Delay risk</p>
              <p className="text-base font-semibold text-amber-900">
                {totalAttentionItems > 0 ? `${totalAttentionItems} priority item${totalAttentionItems === 1 ? '' : 's'}` : 'Low'}
              </p>
            </div>
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">Momentum</p>
              <p className="text-base font-semibold text-blue-900">
                {completionRate > 0 ? `${completionRate}% completion` : 'Build today'}
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

      <div className="tier-activity space-y-4 opacity-95 rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 shadow-sm">
        <SeasonalChecklistCard propertyId={selectedPropertyId} />

        <motion.section className="space-y-3" {...sectionMotion(5)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Activity Center</h2>
                <p className="text-sm text-gray-500">
                  Operational details for bookings, recurring upkeep, and renewals.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              Keep this zone lightweight and current
            </span>
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
