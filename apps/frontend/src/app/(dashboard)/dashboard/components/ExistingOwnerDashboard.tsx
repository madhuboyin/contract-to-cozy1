// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React from 'react';
import Link from 'next/link'; 
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard'; 
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { DashboardChecklistItem, ScoredProperty } from '../types'; 
import { parseISO, isBefore, addDays } from 'date-fns'; 
import { PropertyHealthScoreCard } from './PropertyHealthScoreCard'; 

// --- Temporary/Local Type Definitions (Mirrors backend ScoredProperty) ---
interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[]; 
  checklistItems: DashboardChecklistItem[];
  userFirstName: string;
}

export const ExistingOwnerDashboard = ({ 
  bookings, 
  properties, 
  checklistItems,
  userFirstName
}: ExistingOwnerDashboardProps) => {
  
  // Logic to determine the primary property for the Score Card
  const primaryProperty = properties.find(p => p.isPrimary) || properties[0];

  // Filter Logic
  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  
  // 1. Filter for active (PENDING) tasks
  const activeChecklistItems = checklistItems.filter(item => 
    item.status === 'PENDING' 
  );
  
  // 2. Separate Maintenance from Renewals (FINAL FIX)
  const upcomingMaintenance = activeChecklistItems.filter(item => 
    // Include the task ONLY if it is NOT a renewal category
    !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  ); 
  // No secondary filter on item.isRecurring is applied here.

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {userFirstName}</h2>
        <p className="text-muted-foreground">Monitor your home's health and maintenance schedule.</p>
      </div>

      {/* NEW LAYOUT IMPLEMENTATION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ROW 1: Property Health Score (2/3 width) and Upcoming Bookings (1/3 width) */}
        {primaryProperty && (
            <div className="lg:col-span-2">
                <PropertyHealthScoreCard property={primaryProperty} />
            </div>
        )}
        <UpcomingBookingsCard /> 

        {/* ROW 2: Recurring Maintenance and Upcoming Renewals (Full width split) */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecurringMaintenanceCard maintenance={upcomingMaintenance} />
          <UpcomingRenewalsCard />
        </div>
        
        {/* ROW 3: Favorite Providers Card (Spans full width) */}
        <div className="lg:col-span-3"> 
          <FavoriteProvidersCard />
        </div>
      </div>
      
      {/* Expanded View of the full Home Management Checklist */}
      <div className="pt-4">
        {/* FIX 2: Change link destination from /dashboard/checklist to /dashboard/maintenance */}
        <Link 
          href="/dashboard/maintenance" 
          className="text-lg font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center"
        >
          View Full Home Management Checklist &rarr;
        </Link>
      </div>
    </div>
  );
};