//apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React from 'react';
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard';
import { MyPropertiesCard } from './MyPropertiesCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
// FIX: Import the unified type from ../types
import { DashboardChecklistItem } from '../types'; 

interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: Property[];
  checklistItems: DashboardChecklistItem[];
  userFirstName: string;
}

export const ExistingOwnerDashboard = ({ 
  bookings, 
  properties, 
  checklistItems,
  userFirstName
}: ExistingOwnerDashboardProps) => {
  
  // Filter Logic
  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  
  // Note: We cast to string for .includes safety since DashboardChecklistItem allows string | null
  const upcomingRenewals = checklistItems.filter(item => 
    item.serviceCategory && RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  );

  const upcomingMaintenance = checklistItems.filter(item => 
    // Include if it's recurring AND NOT a renewal category
    item.isRecurring && 
    (!item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string))
  );

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {userFirstName}</h2>
        <p className="text-muted-foreground">Here is what's happening with your properties today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Row 1 */}
        <UpcomingBookingsCard bookings={bookings} />
        <RecurringMaintenanceCard maintenance={upcomingMaintenance} />
        <UpcomingRenewalsCard renewals={upcomingRenewals} />

        {/* Row 2 */}
        <MyPropertiesCard properties={properties} className="md:col-span-2" />
        <FavoriteProvidersCard />
      </div>
    </div>
  );
};