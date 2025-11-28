// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React from 'react';
import Link from 'next/link'; 
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard'; 
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { DashboardChecklistItem, ScoredProperty } from '../types'; 
import { PropertyHealthScoreCard } from './PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './PropertyRiskScoreCard'; 

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
    // This is the correct filter: include the task if its category is missing OR 
    // if the category is not one of the renewal types.
    !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  ); 
  // No secondary filter on item.isRecurring is applied here.

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {userFirstName}</h2>
        <p className="text-muted-foreground">Monitor your home's health and maintenance schedule.</p>
      </div>

      {/* NEW LAYOUT IMPLEMENTATION - Use 4 columns on large screens to fit Risk, Health, and Bookings */}
      {/* Use grid-rows-1/2 to try and make the first row match the second row's heights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-fr">
        
        {/* ROW 1, Slot 1: Property Health Score */}
        {primaryProperty && (
            <div className="md:col-span-1 h-full">
                {/* h-full ensures the card takes max available height in the grid cell */}
                <PropertyHealthScoreCard property={primaryProperty} />
            </div>
        )}
        
        {/* [NEW ADDITION] ROW 1, Slot 2: Risk Score Card - Place next to Health Check */}
        <div className="md:col-span-1 h-full">
             <PropertyRiskScoreCard /> 
        </div>
        
        {/* ROW 1, Slots 3 & 4: Upcoming Bookings Card (Spans two columns on medium/large) */}
        {/* h-full ensures the card takes max available height in the grid cell */}
        <div className="md:col-span-2 h-full">
            <UpcomingBookingsCard /> 
        </div>

        {/* ROW 2: Recurring Maintenance and Upcoming Renewals */}
        {/* This row naturally fills the remaining space */}
        <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecurringMaintenanceCard maintenance={upcomingMaintenance} />
          <UpcomingRenewalsCard />
        </div>
        
        {/* ROW 3: Favorite Providers Card (Spans full width) */}
        <div className="lg:col-span-4"> 
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