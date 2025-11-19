import React from 'react';
import { Booking, Property } from '@/types';
import { HomeBuyerChecklistCard } from './HomeBuyerChecklistCard';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { MyPropertiesCard } from './MyPropertiesCard';
import { DashboardChecklistItem } from '../types'; // Import the unified type

interface HomeBuyerDashboardProps {
  bookings: Booking[];
  properties: Property[];
  checklistItems: DashboardChecklistItem[]; 
  userFirstName: string;
}

export const HomeBuyerDashboard = ({ 
  bookings, 
  properties, 
  checklistItems,
  userFirstName 
}: HomeBuyerDashboardProps) => {
  return (
    <div className="space-y-8 pb-8"> 
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome, {userFirstName}!</h2>
        <p className="text-muted-foreground">Let's get you cozy in your new home.</p>
      </div>

      {/* --- ROW 1: HOME BUYING CHECKLIST (FULL WIDTH) ---
        This card now occupies its own row, spanning 100% of the available width. 
      */}
      <div>
        <HomeBuyerChecklistCard items={checklistItems} className="min-h-[400px]" />
      </div>
      
      {/* --- ROW 2: BOOKINGS & PROPERTY (SPLIT 2-COLUMN GRID) ---
        This section uses a standard 2-column grid to put the smaller cards side-by-side.
      */}
      <h3 className="text-2xl font-bold tracking-tight pt-4">Your Home Transition Details</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6"> 
        {/* Upcoming Bookings Card (1/2 width) */}
        <UpcomingBookingsCard bookings={bookings} />
        
        {/* My Property Card (1/2 width) */}
        <MyPropertiesCard properties={properties} />
      </div>
    </div>
  );
};