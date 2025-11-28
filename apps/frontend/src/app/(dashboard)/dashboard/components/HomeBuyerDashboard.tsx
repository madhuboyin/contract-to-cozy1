// apps/frontend/src/app/(dashboard)/dashboard/components/HomeBuyerDashboard.tsx

import React from 'react';
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { HomeBuyerChecklistCard } from './HomeBuyerChecklistCard';
import { MyPropertiesCard } from './MyPropertiesCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { DashboardChecklistItem } from '../types';
import { PropertyRiskScoreCard } from './PropertyRiskScoreCard'; 

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

  // FIX: Determine the single property ID to pass to the cards
  // Home Buyer dashboard defaults to the first available property if one exists.
  const primaryPropertyId = properties.length > 0 ? properties[0].id : undefined;

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

      {/* START NEW LAYOUT: 3-column grid for top cards, giving Risk prominence */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Slot 1: Risk Score Card (High priority for Home Buyers) */}
        {/* FIX: Pass the optional primaryPropertyId directly */}
        <PropertyRiskScoreCard propertyId={primaryPropertyId} /> 
        
        {/* Slot 2: Upcoming Bookings Card - FIX: Pass the optional propertyId prop */}
        <div className="md:col-span-1">
            <UpcomingBookingsCard propertyId={primaryPropertyId} />
        </div>
        
        {/* Slot 3: My Properties Card */}
        <div className="md:col-span-1">
            <MyPropertiesCard properties={properties} />
        </div>

      </div>

      {/* Secondary Row for Checklist and Favorites - use a 2-column grid for the rest */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Slot 1: Checklist Card (Spans both columns) */}
        <div className="lg:col-span-2">
            <HomeBuyerChecklistCard items={homeBuyerItems} />
        </div>
        
        {/* Slot 2: Favorite Providers Card (Spans both columns) - Adjusted placement for flow */}
        <div className="lg:col-span-2">
            <FavoriteProvidersCard />
        </div>
      </div>
      {/* END NEW LAYOUT */}
    </div>
  );
};