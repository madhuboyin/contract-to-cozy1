// apps/frontend/src/app/(dashboard)/dashboard/components/HomeBuyerDashboard.tsx

import React from 'react';
import Link from 'next/link';
import { Truck, Sparkles } from 'lucide-react';
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

        {/* AI Moving Concierge - Featured for Home Buyers */}
        <div className="lg:col-span-2">
          <Link href="/dashboard/moving-concierge">
            <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
              {/* Sparkle indicator */}
              <div className="absolute top-4 right-4">
                <Sparkles className="w-6 h-6 text-purple-500 animate-pulse" />
              </div>
              
              {/* NEW badge */}
              <div className="absolute top-4 right-16">
                <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                  NEW FOR HOME BUYERS
                </span>
              </div>
              
              <div className="flex items-center gap-6">
                {/* Icon */}
                <div className="p-4 bg-green-100 rounded-xl group-hover:scale-110 transition-transform">
                  <Truck className="h-10 w-10 text-green-600" />
                </div>
                
                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-green-900 mb-2">
                    AI Moving Concierge
                  </h3>
                  <p className="text-green-700 mb-3">
                    Get a personalized moving timeline, task checklist, cost estimates, and AI recommendations for your move
                  </p>
                  <div className="flex gap-3 text-sm text-green-800">
                    <span>✓ Timeline Planning</span>
                    <span>✓ Task Tracking</span>
                    <span>✓ Cost Estimates</span>
                    <span>✓ Utility Setup</span>
                  </div>
                </div>
                
                {/* Arrow indicator */}
                <div className="text-green-600 group-hover:translate-x-2 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>

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