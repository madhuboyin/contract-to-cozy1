//apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React from 'react';
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
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
  
  // Calculate the cutoff date (7 days from now)
  const today = new Date();
  const oneWeekFromNow = addDays(today, 7);

  // --- RENEWALS DEBUG LOGS ---
  console.log('--- RENEWALS DEBUG START ---');
  console.log('Total Checklist Items Received:', checklistItems.length);
  console.log('Total PENDING Checklist Items:', activeChecklistItems.length);
  console.log('Total Active Renewal Items (by Category):', activeRenewalItems.length);
  console.log('Current Date (Local Time):', today.toLocaleString());
  console.log('Cutoff Date (Expiring/Expired by):', oneWeekFromNow.toLocaleString());

  // 3. APPLY DATE LOGIC: Show items that are overdue OR expiring within 7 days.
  const upcomingRenewals = activeRenewalItems.filter(item => {
      if (!item.nextDueDate) {
          // console.log(`[RENEWAL ITEM ${item.id}] Skipped: No nextDueDate`);
          return false; // Skip items without a renewal date
      }
      
      const dueDate = parseISO(item.nextDueDate);

      // The condition: due date is currently or was in the past 
      // OR the due date is before the cutoff date (one week from now).
      const passesFilter = isBefore(dueDate, oneWeekFromNow);

      console.log(`[RENEWAL ITEM ${item.id} - ${item.title}] Status: ${item.status}, Category: ${item.serviceCategory}, Due Date: ${item.nextDueDate}, Passes Date Filter? ${passesFilter}`);
      
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
        <UpcomingRenewalsCard renewals={upcomingRenewals} />

        {/* Row 2 */}
        <MyPropertiesCard properties={properties} className="md:col-span-2" />
        <FavoriteProvidersCard />
      </div>
    </div>
  );
};