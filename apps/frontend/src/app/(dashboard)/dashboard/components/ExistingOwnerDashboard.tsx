// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Booking, ChecklistItem, ScoredProperty } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { ArrowRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

// NEW: Local Home Updates
import { LocalUpdatesCarousel } from '@/components/localUpdates/LocalUpdatesCarousel';
import { LocalUpdate } from '@/types';
import { api } from '@/lib/api/client';

// Existing CTA / Nudge
import { MaintenanceNudgeCard } from './MaintenanceNudgeCard';

// --- Props ---
interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[];
  checklistItems: ChecklistItem[];
  userFirstName: string;
  selectedPropertyId: string | undefined;
  consolidatedActionCount: number;
}

export const ExistingOwnerDashboard = ({
  bookings,
  properties,
  checklistItems,
  selectedPropertyId,
  consolidatedActionCount,
}: ExistingOwnerDashboardProps) => {
  // ------------------------------
  // Local Home Updates (NEW)
  // ------------------------------
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);

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
  console.log('localUpdates', localUpdates);    

  // ------------------------------
  // Existing Logic (Unchanged)
  // ------------------------------
  const defaultProperty = properties.find((p) => p.isPrimary) || properties[0];
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const isMultiProperty = properties.length > 1;
  const isPropertySelected = !!selectedProperty;

  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  const ACTIVE_TASK_STATUSES = [
    'PENDING',
    'SCHEDULED',
    'IN_PROGRESS',
    'NEEDS_REVIEW',
    'OVERDUE',
  ];

  const propertyChecklistItems = selectedPropertyId
    ? checklistItems.filter((item) => {
        const belongsToSelectedProperty = item.propertyId === selectedPropertyId;
        const isLegacyItem =
          !item.propertyId &&
          !isMultiProperty &&
          selectedPropertyId === defaultProperty?.id;

        return belongsToSelectedProperty || isLegacyItem;
      })
    : [];

  const activeChecklistItems = propertyChecklistItems.filter((item) =>
    ACTIVE_TASK_STATUSES.includes(item.status)
  );

  const upcomingMaintenance = activeChecklistItems.filter(
    (item) =>
      !item.serviceCategory ||
      !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  );

  const renderNudgeCard = selectedProperty ? (
    <div className="mt-4">
      <MaintenanceNudgeCard
        property={selectedProperty}
        consolidatedActionCount={consolidatedActionCount}
      />
    </div>
  ) : null;

  return (
    <div className="space-y-6 pb-8">
      {/* Maintenance Nudge Card */}
      {renderNudgeCard}
  
      {/* 💡 Local Home Updates (Helpful Suggestions) */}
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

      {/* Activity Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <UpcomingBookingsCard propertyId={selectedPropertyId} />

        <RecurringMaintenanceCard
          maintenance={upcomingMaintenance as any}
          isPropertySelected={isPropertySelected}
          selectedPropertyId={selectedPropertyId}
        />

        <UpcomingRenewalsCard propertyId={selectedPropertyId} />
      </div>

      {/* Favorite Providers */}
      <div className="w-full">
        <FavoriteProvidersCard />
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
