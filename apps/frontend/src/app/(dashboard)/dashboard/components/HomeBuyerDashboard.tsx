// apps/frontend/src/app/(dashboard)/dashboard/components/HomeBuyerDashboard.tsx

import React from 'react';
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { HomeBuyerChecklistCard } from './HomeBuyerChecklistCard';
import { MyPropertiesCard } from './MyPropertiesCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { DashboardChecklistItem } from '../types';

// FIX: Define the missing interface here
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

  // 1. Filter the raw checklistItems down to the set intended for the Home Buyer Card
  // Assuming the Home Buyer card displays all checklist items (since they are non-recurring/initial)
  const homeBuyerItems = checklistItems.filter(item => 
    !item.isRecurring // Filter out any recurring items that may have been created
  ).sort((a, b) => {
    // Basic sort to keep presentation consistent (e.g., by sort order or creation date)
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });
  
  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome to your new home journey, {userFirstName}</h2>
        <p className="text-muted-foreground">Stay on track with your home buying checklist.</p>
      </div>

      {/* START LAYOUT FIX: Use a 2-column grid for flexibility */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ROW 1: Checklist Card (Spans two columns for prominence) */}
        <div className="lg:col-span-2">
            <HomeBuyerChecklistCard items={homeBuyerItems} />
        </div>

        {/* ROW 2, Slot 1: My Properties Card */}
        <MyPropertiesCard properties={properties} />
        
        {/* ROW 2, Slot 2: Upcoming Bookings Card */}
        <UpcomingBookingsCard /> 
        
        {/* ROW 3: Favorite Providers Card (Spans two columns) */}
        <div className="lg:col-span-2">
            <FavoriteProvidersCard />
        </div>
      </div>
      {/* END LAYOUT FIX */}
    </div>
  );
};