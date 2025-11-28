// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React, { useState, useEffect } from 'react'; // Added useState and useEffect
import Link from 'next/link'; 
import { Booking, Property, ScoredProperty } from '@/types'; // Added Property, ScoredProperty
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard'; 
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { DashboardChecklistItem } from '../types'; 
import { PropertyHealthScoreCard } from './PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './PropertyRiskScoreCard'; 
// Added Select components for the dropdown
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// NOTE: ChevronDown is not strictly necessary here as it is included in SelectTrigger via the component file

// --- Temporary/Local Type Definitions (Mirrors backend ScoredProperty) ---
interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[]; 
  checklistItems: DashboardChecklistItem[];
  userFirstName: string;
}

// Helper to format the address for display
const formatAddress = (property: Property) => {
    // Simplified version: just the address and city
    return `${property.address}, ${property.city}`;
}

export const ExistingOwnerDashboard = ({ 
  bookings, 
  properties, 
  checklistItems,
  userFirstName
}: ExistingOwnerDashboardProps) => {
  
  // Logic to determine the default property: Primary first, otherwise the first one
  const defaultProperty = properties.find(p => p.isPrimary) || properties[0];

  // --- START FIX: Property Selection State ---
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(defaultProperty?.id);
  
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  // Set default selected property ID on mount if properties are available
  useEffect(() => {
    if (!selectedPropertyId && defaultProperty) {
        setSelectedPropertyId(defaultProperty.id);
    }
  }, [defaultProperty, selectedPropertyId]);

  const isMultiProperty = properties.length > 1;
  // --- END FIX: Property Selection State ---


  // Filter Logic (This section is kept mostly original, maintaining its initial scope)
  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  
  // 1. Filter for active (PENDING) tasks
  // NOTE: This currently filters ALL checklist items regardless of the selected property. 
  // For proper multi-property filtering, checklistItems must include a propertyId field and be filtered by selectedPropertyId.
  const activeChecklistItems = checklistItems.filter(item => 
    item.status === 'PENDING' 
  );
  
  // 2. Separate Maintenance from Renewals
  const upcomingMaintenance = activeChecklistItems.filter(item => 
    !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  ); 

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {userFirstName}</h2>
        {/* The 'Monitor' message remains in a separate row as requested. */}
        <p className="text-muted-foreground">Monitor your home's health and maintenance schedule.</p>
      </div>
      
      {/* --- START FIX: Property Selection Row --- */}
      {selectedProperty && (
        <div className="mt-2 flex items-center space-x-3">
            {!isMultiProperty ? (
                // Scenario 1: Single Property - Show Address as standard paragraph text
                <p className="text-lg font-medium text-gray-700">
                    {formatAddress(selectedProperty)}
                </p>
            ) : (
                // Scenario 2: Multiple Properties - Show Dropdown
                <div className="flex items-center space-x-2">
                    {/* Hiding the 'Viewing:' label as it clashes with SelectTrigger UX */}
                    <Select 
                        value={selectedPropertyId} 
                        onValueChange={setSelectedPropertyId}
                    >
                        <SelectTrigger className="w-[300px]">
                            <SelectValue placeholder="Select a property" />
                        </SelectTrigger>
                        <SelectContent>
                            {properties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                    {property.name ? `${property.name} (${formatAddress(property)})` : formatAddress(property)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {/* Optional: Add a quick link to manage properties */}
            <Link href="/dashboard/properties" className="text-sm text-blue-500 hover:underline">
                {isMultiProperty ? 'Manage Properties' : 'View Property Details'}
            </Link>
        </div>
      )}
      {/* --- END FIX: Property Selection Row --- */}

      {/* Grid Layout - Cards dynamically update based on selectedProperty */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* ROW 1, Slot 1: Property Health Score */}
        {selectedProperty && (
            <div className="md:col-span-1">
                {/* PASSING selectedProperty */}
                <PropertyHealthScoreCard property={selectedProperty} /> 
            </div>
        )}
        
        {/* ROW 1, Slot 2: Risk Score Card */}
        {selectedPropertyId && (
            <div className="md:col-span-1">
                {/* PASSING selectedPropertyId to the refactored card */}
                <PropertyRiskScoreCard propertyId={selectedPropertyId} /> 
            </div>
        )}
        
        {/* ROW 1, Slot 3/4: Upcoming Bookings Card */}
        <div className="md:col-span-2">
            {/* NOTE: This card should ideally filter bookings by selectedPropertyId */}
            <UpcomingBookingsCard /> 
        </div>

        {/* ROW 2: Recurring Maintenance and Upcoming Renewals */}
        <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecurringMaintenanceCard maintenance={upcomingMaintenance} />
          {/* NOTE: This card should ideally filter renewals by selectedPropertyId */}
          <UpcomingRenewalsCard /> 
        </div>
        
        {/* ROW 3: Favorite Providers Card (Spans full width) */}
        <div className="lg:col-span-4"> 
          <FavoriteProvidersCard />
        </div>
      </div>
      
      {/* Link to Maintenance Checklist */}
      <div className="pt-4">
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