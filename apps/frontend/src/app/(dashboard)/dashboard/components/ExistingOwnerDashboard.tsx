// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React from 'react';
import Link from 'next/link'; // FIX 1: Import Link component
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
// FIX 2: Change to named import (assuming UpcomingRenewalsCard.tsx is fixed)
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard'; 
import { MyPropertiesCard } from './MyPropertiesCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { DashboardChecklistItem } from '../types'; 
import { parseISO, isBefore, addDays } from 'date-fns'; 

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
  
  // *** GUARANTEED LOG TO CONFIRM RENDERING ***
  console.log('*** DEBUG 0: ExistingOwnerDashboard component is rendering ***');
  
  // Filter Logic
  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  
  // 1. Filter for active (PENDING) tasks
  const activeChecklistItems = checklistItems.filter(item => 
    item.status === 'PENDING' 
  );
  
  // 2. Identify all active Renewal Category items
  const activeRenewalItems = activeChecklistItems.filter(item => 
    item.serviceCategory && RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  );

  // --- START RENEWALS DEBUG LOGS ---
  console.log('--- RENEWALS DEBUG START ---');

  const today = new Date();
  const nextSevenDays = addDays(today, 7);

  const upcomingRenewals = activeRenewalItems.filter(item => {
      let passesFilter = true;

      // Ensure nextDueDate is valid before trying to parse
      if (item.nextDueDate) {
          const dueDate = parseISO(item.nextDueDate);
          const isExpired = isBefore(dueDate, today);
          const isUpcoming = isBefore(dueDate, nextSevenDays);
          
          // Show expired items OR items coming up in the next 7 days
          passesFilter = isExpired || isUpcoming;
      } else {
          // If due date is null, typically filter it out unless business logic dictates otherwise
          passesFilter = false; 
      }
      
      return passesFilter;
  }).sort((a, b) => {
      // Sort by soonest due date (past dates bubble up first)
      const dateA = parseISO(a.nextDueDate || '2999-12-31').getTime();
      const dateB = parseISO(b.nextDueDate || '2999-12-31').getTime();
      return dateA - dateB;
  });

  console.log('Total Upcoming Renewals Displayed:', upcomingRenewals.length);
  console.log('--- RENEWALS DEBUG END ---');
  // --- END RENEWALS DEBUG LOGS ---


  const upcomingMaintenance = activeChecklistItems.filter(item => 
    // Exclude renewal items from the maintenance list for clarity
    !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  ).filter(item =>
    // Then filter for recurring maintenance tasks
    item.isRecurring
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
        {/* FIX: Remove the 'renewals' prop */}
        <UpcomingRenewalsCard /> 
        {/* Row 2 */}
        <MyPropertiesCard properties={properties} />
        <FavoriteProvidersCard />
      </div>
      
      {/* Expanded View of the full Home Management Checklist */}
      <div className="pt-4">
        <Link href="/dashboard/checklist" className="text-lg font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center">
          View Full Home Management Checklist &rarr;
        </Link>
      </div>
    </div>
  );
};