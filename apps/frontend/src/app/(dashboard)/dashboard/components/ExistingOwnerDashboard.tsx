// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React, { useState, useEffect } from 'react';
import Link from 'next/link'; 
import { Booking, Property, ChecklistItem, ScoredProperty } from '@/types'; 
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard'; 
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
// These imports are not needed here as they are rendered in the parent:
// import { PropertyHealthScoreCard } from './PropertyHealthScoreCard'; 
// import { PropertyRiskScoreCard } from './PropertyRiskScoreCard'; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from 'lucide-react';

// --- Updated Props Interface to use canonical types ---
interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[]; 
  checklistItems: ChecklistItem[];
  userFirstName: string;
  selectedPropertyId: string | undefined; 
}

// Helper to format the address for display
const formatAddress = (property: Property) => {
    return `${property.address}, ${property.city}, ${property.state}`;
}

export const ExistingOwnerDashboard = ({ 
  bookings, 
  properties, 
  checklistItems,
  userFirstName,
  // Destructure the prop passed from the parent (DashboardPage)
  selectedPropertyId: parentSelectedPropertyId
}: ExistingOwnerDashboardProps) => {
  
  // Logic to determine the default property: Primary first, otherwise the first one
  const defaultProperty = properties.find(p => p.isPrimary) || properties[0];

  // --- Property Selection State ---
  // Use a local state for property ID selection, initialized with the ID provided by the parent.
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(parentSelectedPropertyId);
  
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  // Sync internal state with external prop, primarily on initial load
  useEffect(() => {
    if (parentSelectedPropertyId && parentSelectedPropertyId !== selectedPropertyId) {
        setSelectedPropertyId(parentSelectedPropertyId);
    }
  }, [parentSelectedPropertyId]);

  const isMultiProperty = properties.length > 1;
  // --- End Property Selection State ---

  // Get the boolean status of property selection
  const isPropertySelected = !!selectedProperty;

  // Filter Logic: Now dependent on selectedPropertyId
  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  
  // 1. Filter checklist items by selected property
  const propertyChecklistItems = selectedPropertyId
    ? checklistItems.filter((item: ChecklistItem) => {
        
        const belongsToSelectedProperty = item.propertyId === selectedPropertyId;
        
        // FIX: Update logic to handle missing (undefined) or null propertyId for single-property users.
        const isLegacyItem = !item.propertyId && !isMultiProperty && selectedPropertyId === defaultProperty?.id;

        return belongsToSelectedProperty || isLegacyItem;
    })
    : [];
  
  // 2. Filter for active (PENDING) tasks for the selected property
  const activeChecklistItems = propertyChecklistItems.filter((item: ChecklistItem) => 
    item.status === 'PENDING' 
  );
  
  // 3. Separate Maintenance from Renewals
  const upcomingMaintenance = activeChecklistItems.filter((item: ChecklistItem) => 
    !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  ); 
  
  // 4. Filter bookings relevant to the selected property
  // Note: UpcomingBookingsCard handles its own filtering/fetching by propertyId,
  // but we can pre-filter here if we were using the parent's bookings array directly.
  // Since UpcomingBookingsCard uses react-query, we just pass the ID.

  return (
    <div className="space-y-6 pb-8">
      {/* FIX: Removed the duplicated "Welcome back" h2 block. It is now handled by the PageHeader in the parent. */}
      
      {/* --- Property Selection Row (MANAGES LOCAL STATE FOR PROPERTY ID) --- */}
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
                                    {property.name ? `${property.name} - ${formatAddress(property)}` : formatAddress(property)}
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

      
      {/* NEW ROW 2: Upcoming Bookings Card (Full width for prominence) */}
      {/* FIX: Added the missing bookings card */}
      <div className="w-full">
        <UpcomingBookingsCard propertyId={selectedPropertyId} />
      </div>

      {/* ROW 3: Recurring Maintenance and Upcoming Renewals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <RecurringMaintenanceCard 
          maintenance={upcomingMaintenance as any}
          isPropertySelected={isPropertySelected} 
        />
        
        <UpcomingRenewalsCard propertyId={selectedPropertyId} /> 
      </div>
      
      {/* ROW 4: Favorite Providers Card (Spans full width) */}
      <div className="w-full"> 
        <FavoriteProvidersCard />
      </div>
      
      <div className="pt-4">
        <Link 
          href="/dashboard/maintenance" 
          className="text-lg font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center"
        >
          View Full Home Management Checklist <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
    </div>
  );
};