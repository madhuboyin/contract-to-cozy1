// apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx

import React from 'react';
import Link from 'next/link'; 
import { Booking, Property, ChecklistItem, ScoredProperty } from '@/types'; 
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { RecurringMaintenanceCard } from './RecurringMaintenanceCard';
import { UpcomingRenewalsCard } from './UpcomingRenewalsCard'; 
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { ArrowRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

// [NEW IMPORT] Component that triggers the call-to-action
import { MaintenanceNudgeCard } from './MaintenanceNudgeCard'; 

// --- Updated Props Interface ---
interface ExistingOwnerDashboardProps {
  bookings: Booking[];
  properties: ScoredProperty[]; 
  checklistItems: ChecklistItem[];
  userFirstName: string;
  selectedPropertyId: string | undefined; 
  // FIX 1: Add the new required prop from the parent page
  consolidatedActionCount: number;
}

// Helper to format the address for display - NOT NEEDED HERE ANYMORE
// const formatAddress = (property: Property) => {
//     return `${property.address}, ${property.city}, ${property.state}`;
// }

export const ExistingOwnerDashboard = ({ 
  bookings, 
  properties, 
  checklistItems,
  // userFirstName is kept but not used, as greeting is in parent
  // selectedPropertyId is now the source of truth passed from the parent
  selectedPropertyId,
  // FIX 2: Destructure the new prop
  consolidatedActionCount
}: ExistingOwnerDashboardProps) => {
  
  // Logic to determine the default property: Primary first, otherwise the first one
  const defaultProperty = properties.find(p => p.isPrimary) || properties[0];

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  
  const isMultiProperty = properties.length > 1; 

  // Get the boolean status of property selection
  const isPropertySelected = !!selectedProperty;

  // Filter Logic: Now depends purely on the received selectedPropertyId
  const RENEWAL_CATEGORIES = ['INSURANCE', 'WARRANTY', 'FINANCE', 'ADMIN', 'ATTORNEY'];
  
  // 🔍 DEBUG: Log initial data
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏠 ExistingOwnerDashboard DEBUG START');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Total checklistItems received:', checklistItems.length);
  console.log('🏠 Selected PropertyId:', selectedPropertyId);
  console.log('🏘️ isMultiProperty:', isMultiProperty);
  console.log('📋 All items:', checklistItems.map(i => ({ id: i.id, title: i.title, propertyId: i.propertyId, status: i.status, category: i.serviceCategory })));
  
  // 1. Filter checklist items by selected property
  const propertyChecklistItems = selectedPropertyId
    ? checklistItems.filter((item: ChecklistItem) => {
        
        const belongsToSelectedProperty = item.propertyId === selectedPropertyId;
        
        // Handle legacy items for single-property users
        const isLegacyItem = !item.propertyId && !isMultiProperty && selectedPropertyId === defaultProperty?.id;

        return belongsToSelectedProperty || isLegacyItem;
    })
    : [];
  
  console.log('✅ Step 1 - After property filter:', propertyChecklistItems.length);
  console.log('   Items:', propertyChecklistItems.map(i => ({ title: i.title, propertyId: i.propertyId, status: i.status, category: i.serviceCategory })));
  
  // AFTER - Use the same statuses as RecurringMaintenanceCard:
  const ACTIVE_TASK_STATUSES = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'NEEDS_REVIEW', 'OVERDUE'];
  const activeChecklistItems = propertyChecklistItems.filter((item: ChecklistItem) => 
    ACTIVE_TASK_STATUSES.includes(item.status)
  );
  
  console.log('✅ Step 2 - After status filter:', activeChecklistItems.length);
  console.log('   Status breakdown:', propertyChecklistItems.reduce((acc: any, item: ChecklistItem) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {}));
  console.log('   Items:', activeChecklistItems.map(i => ({ title: i.title, status: i.status, category: i.serviceCategory })));
  
  // 3. Separate Maintenance from Renewals
  const upcomingMaintenance = activeChecklistItems.filter((item: ChecklistItem) => 
    !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory as string)
  );
  
  console.log('✅ Step 3 - After category filter (upcomingMaintenance):', upcomingMaintenance.length);
  console.log('   Category breakdown:', activeChecklistItems.reduce((acc: any, item: ChecklistItem) => {
    const cat = item.serviceCategory || 'NO_CATEGORY';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {}));
  console.log('   Final items to pass to card:', upcomingMaintenance.map(i => ({ title: i.title, status: i.status, category: i.serviceCategory, nextDueDate: i.nextDueDate })));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏠 ExistingOwnerDashboard DEBUG END');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // [NEW LOGIC] Renders the high-contrast nudge card if action is required.
  const renderNudgeCard = selectedProperty ? (
    // Add margin top to separate it from the scorecards grid above it in page.tsx
    <div className="mt-4">
      <MaintenanceNudgeCard 
        property={selectedProperty} 
        // FIX 3: Pass the new required prop to the MaintenanceNudgeCard
        consolidatedActionCount={consolidatedActionCount} 
      />
    </div>
  ) : null;


  return (
    <div className="space-y-6 pb-8">
      {/* FIX: Removed duplicate welcome message block */}
      
      {/* FIX: Removed the Property Selection Row JSX */}
      
      {/* [NEW ROW 1: MAINTENANCE NUDGE CARD] Inserted here for high visibility after scores */}
      {renderNudgeCard}

      {/* NEW ROW 2: Upcoming Bookings Card (Full width for prominence) */}
      {/* NOTE: This component remains here but will now be rendered below the Nudge Card */}
      <div className="w-full">
        <UpcomingBookingsCard propertyId={selectedPropertyId} />
      </div>

      {/* ROW 3: Recurring Maintenance and Upcoming Renewals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <RecurringMaintenanceCard 
          maintenance={upcomingMaintenance as any}
          isPropertySelected={isPropertySelected}
          selectedPropertyId={selectedPropertyId}
        />
        
        <UpcomingRenewalsCard propertyId={selectedPropertyId} /> 
      </div>
      
      {/* ROW 4: Favorite Providers Card (Spans full width) */}
      <div className="w-full"> 
        <FavoriteProvidersCard />
      </div>
      
      <div className="pt-4">
        <Link 
          href={`/dashboard/maintenance${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`}
          className="text-lg font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center"
        >
          View Full Home Management Checklist <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
    </div>
  );
};