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
import { ArrowRight, AlertTriangle, Calendar, DollarSign, Clock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Local Home Updates
import { LocalUpdatesCarousel } from '@/components/localUpdates/LocalUpdatesCarousel';
import { LocalUpdate } from '@/types';
import { ActionCenter } from '@/components/orchestration/ActionCenter';
import { api } from '@/lib/api/client';

// Existing CTA / Nudge
import { MaintenanceNudgeCard } from './MaintenanceNudgeCard';

interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[];
  checklistItems: ChecklistItem[];
  userFirstName: string;
  selectedPropertyId: string | undefined;
  consolidatedActionCount: number;
  hasAssetDrivenActions: boolean;
}

export const ExistingOwnerDashboard = ({
  bookings,
  properties,
  checklistItems,
  selectedPropertyId,
  consolidatedActionCount,
  hasAssetDrivenActions,
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

  const defaultProperty = properties.find((p) => p.isPrimary) || properties[0];
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const isMultiProperty = properties.length > 1;
  const isPropertySelected = !!selectedProperty;

  const renderNudgeCard = selectedProperty ? (
    <div className="mt-4">
      <MaintenanceNudgeCard
        property={selectedProperty}
        consolidatedActionCount={consolidatedActionCount}
        hasAssetDrivenActions={hasAssetDrivenActions}
      />
    </div>
  ) : null;

  // Calculate urgent tasks count
  const urgentTasksCount = stats ? stats.byPriority.urgent + stats.byPriority.high : 0;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Here's what needs your attention today
        </h2>
      </div>

{/* PHASE 5: Main Statistics Cards */}
{stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Urgent Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-red-600">
                  {urgentTasksCount}
                </div>
                <AlertTriangle className="h-8 w-8 text-red-600 opacity-50" />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {stats.byPriority.urgent} urgent + {stats.byPriority.high} high priority
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Due Soon
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-orange-600">
                  {stats.dueThisWeek}
                </div>
                <Calendar className="h-8 w-8 text-orange-600 opacity-50" />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Due within the next 7 days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Estimated Costs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold text-blue-600">
                  ${stats.totalEstimatedCost.toLocaleString()}
                </div>
                <DollarSign className="h-8 w-8 text-blue-600 opacity-50" />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                For {(stats.pending || 0) + (stats.inProgress || 0)} active tasks
              </p>
            </CardContent>
          </Card>
        </div>
      )}

{/* Task Status Overview */}
{stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Tasks</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {(stats.pending || 0) + (stats.inProgress || 0)}
                  </p>
                </div>
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stats.pending} pending, {stats.inProgress} in progress
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                </div>
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Tasks</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <Clock className="h-6 w-6 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Maintenance Nudge Card */}
      {renderNudgeCard}

      {/* Overdue Alert Banner */}
      {stats && stats.overdue > 0 && (
        <Card className="border-2 border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">
                  {stats.overdue} {stats.overdue === 1 ? 'Task' : 'Tasks'} Overdue
                </h3>
                <p className="text-sm text-red-700">
                  These tasks require immediate attention to prevent issues.
                </p>
              </div>
              <Link href={`/dashboard/maintenance?propertyId=${selectedPropertyId}&filter=overdue`}>
                <span className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer font-medium">
                  View Overdue
                  <ArrowRight className="h-4 w-4 ml-2 inline" />
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Activity Cards (Original 3 cards) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* 🔑 UPDATED: Pass bookings data as prop */}
        <UpcomingBookingsCard 
          bookings={propertyBookings}
          isPropertySelected={isPropertySelected}
          selectedPropertyId={selectedPropertyId}
        />

        {/* 🔑 FIXED: Pass actual PropertyMaintenanceTask[] data */}
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