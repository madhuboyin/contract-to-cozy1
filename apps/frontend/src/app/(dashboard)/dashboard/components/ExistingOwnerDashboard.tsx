// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React, { useState, useEffect } from 'react';
import Link from 'next/link'; 
// FIX: Import ChecklistItem and ScoredProperty from '@/types' (canonical location)
import { Booking, Property, ChecklistItem, ScoredProperty } from '@/types'; 
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard'; 
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
// Removed redundant DashboardChecklistItem import
import { PropertyHealthScoreCard } from './PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './PropertyRiskScoreCard'; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from 'lucide-react';

// --- Updated Props Interface to use canonical types ---
interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[]; 
  checklistItems: ChecklistItem[]; // Using the now-compatible ChecklistItem
  userFirstName: string;
}

// Helper to format the address for display (Simplified version: just the address and city)
const formatAddress = (property: Property) => {
    return property.address; 
}

export const ExistingOwnerDashboard = ({ 
  bookings, 
  properties, 
  checklistItems,
  userFirstName
}: ExistingOwnerDashboardProps) => {
  
  // Logic to determine the default property: Primary first, otherwise the first one
  const defaultProperty = properties.find(p => p.isPrimary) || properties[0];

  // --- Property Selection State ---
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(defaultProperty?.id);
  
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  // Set default selected property ID on mount if properties are available
  useEffect(() => {
    if (!selectedPropertyId && defaultProperty) {
        setSelectedPropertyId(defaultProperty.id);
    }
  }, [defaultProperty, selectedPropertyId]);

  const isMultiProperty = properties.length > 1;
  // --- End Property Selection State ---

  // Filter Logic: Now dependent on selectedPropertyId
  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  
  // 1. Filter checklist items by selected property
  const propertyChecklistItems = checklistItems.filter(item => 
      // This line now compiles and filters correctly
      item.propertyId === selectedPropertyId
  );
  
  // 2. Filter for active (PENDING) tasks for the selected property
  const activeChecklistItems = propertyChecklistItems.filter(item => 
    item.status === 'PENDING' 
  );
  
  // 3. Separate Maintenance from Renewals
  const upcomingMaintenance = activeChecklistItems.filter(item => 
    // Filter out renewal-related categories
    !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  ); 

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {userFirstName}</h2>
        <p className="text-muted-foreground">Monitor your home's health and maintenance schedule.</p>
      </div>
      
      {/* --- Property Selection Row (NEW) --- */}
      {selectedProperty && (
        <div className="mt-2 flex items-center space-x-3">
            {!isMultiProperty ? (
                // Scenario 1: Single Property - Show simplified address as standard paragraph text
                <p className="text-lg font-medium text-gray-700">
                    {selectedProperty.name || 'Your Home'}: {formatAddress(selectedProperty)}
                </p>
            ) : (
                // Scenario 2: Multiple Properties - Show Dropdown
                <div className="flex items-center space-x-2">
                    <Select 
                        value={selectedPropertyId} 
                        onValueChange={setSelectedPropertyId}
                    >
                        <SelectTrigger className="w-[300px] text-lg font-medium">
                            <SelectValue placeholder="Select a property" />
                        </SelectTrigger>
                        <SelectContent>
                            {properties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                    {property.name || formatAddress(property)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <Link href="/dashboard/properties" className="text-sm text-blue-500 hover:underline">
                {isMultiProperty ? 'Manage Properties' : 'View Details'}
            </Link>
        </div>
      )}
      {/* --- End Property Selection Row --- */}

      {/* Grid Layout - Cards dynamically update based on selectedProperty */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* ROW 1, Slot 1: Property Health Score */}
        {selectedProperty && (
            <div className="md:col-span-1">
                <PropertyHealthScoreCard property={selectedProperty} /> 
            </div>
        )}
        
        {/* ROW 1, Slot 2: Risk Score Card */}
        <div className="md:col-span-1">
            <PropertyRiskScoreCard propertyId={selectedPropertyId} /> 
        </div>
        
        {/* ROW 1, Slot 3/4: Upcoming Bookings Card */}
        <div className="md:col-span-2">
            <UpcomingBookingsCard propertyId={selectedPropertyId} /> 
        </div>

        {/* ROW 2: Recurring Maintenance and Upcoming Renewals */}
        <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecurringMaintenanceCard maintenance={upcomingMaintenance as any} />
          
          <UpcomingRenewalsCard propertyId={selectedPropertyId} /> 
        </div>
        
        {/* ROW 3: Favorite Providers Card (Spans full width) */}
        <div className="lg:col-span-4"> 
          <FavoriteProvidersCard />
        </div>
      </div>
      
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