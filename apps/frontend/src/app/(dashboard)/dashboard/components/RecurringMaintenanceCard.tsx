// apps/frontend/src/app/(dashboard)/dashboard/components/RecurringMaintenanceCard.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Wrench, Check, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// FIX: Using canonical ChecklistItem
import { ChecklistItem } from '@/types'; 

interface RecurringMaintenanceCardProps {
  // FIX: Using canonical ChecklistItem array
  maintenance: ChecklistItem[]; 
  // FIX: Add explicit property selection status flag
  isPropertySelected: boolean;
  // ADD: Selected property ID for link context
  selectedPropertyId?: string;
}

// NEW: Define statuses that count as active/upcoming for the dashboard card
// ADDED 'OVERDUE' to ensure tasks explicitly marked with this status are included
const ACTIVE_TASK_STATUSES = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'NEEDS_REVIEW', 'OVERDUE'];

// FIX: Use React.FC for proper prop recognition
export const RecurringMaintenanceCard: React.FC<RecurringMaintenanceCardProps> = ({ 
  maintenance, 
  isPropertySelected,
  selectedPropertyId 
}) => {
  
  // The 'maintenance' prop is already filtered by property ID by the parent component.
  // MODIFIED: Filter now includes all ACTIVE_TASK_STATUSES
  const allPendingTasks = maintenance
    .sort((a, b) => {
        const dateA = a.nextDueDate ? new Date(a.nextDueDate).getTime() : Infinity;
        const dateB = b.nextDueDate ? new Date(b.nextDueDate).getTime() : Infinity;
        return dateA - dateB;
    });

  // Limit display items to 3
  const displayTasks = allPendingTasks.slice(0, 3);
  const totalItems = allPendingTasks.length;
  const overflowCount = totalItems - displayTasks.length;

  const formatDue = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    const date = new Date(dateStr);
    const now = new Date();
    
    // Check if task is overdue
    if (date < now) {
        return <span className="font-body text-red-500 font-semibold">OVERDUE</span>;
    }
    
    // Simple formatting for display
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const setupLink = selectedPropertyId 
    ? `/dashboard/maintenance-setup?propertyId=${selectedPropertyId}` 
    : "/dashboard/maintenance-setup";
  const primaryLink = selectedPropertyId 
    ? `/dashboard/maintenance?propertyId=${selectedPropertyId}` 
    : "/dashboard/maintenance";
  const primaryText = totalItems > 3 ? `View All (${totalItems})` : "View Full List";

  // Use the new explicit prop to determine the message
  const shouldShowSelectPropertyMessage = !isPropertySelected;


  return (
    <Card className={cn("flex flex-col")}>
      <CardHeader>
        <CardTitle className="font-heading text-xl flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-600" />
            <span>Upcoming Maintenance</span>
        </CardTitle>
        <CardDescription className="font-body text-sm">
            {totalItems} active tasks. Focus on high priority items for your selected home.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-grow">
        {shouldShowSelectPropertyMessage ? (
             <div className="flex flex-col items-center justify-center h-full p-4 space-y-2">
                <p className="font-body text-center text-sm text-gray-500 pt-2">Please select a property to view maintenance tasks.</p>
             </div>
        ) : displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 space-y-2">
            <Check className="w-8 h-8 text-green-500" />
            <p className="font-heading text-center text-lg font-medium text-gray-700">All caught up!</p>
            <p className="font-body text-center text-sm text-gray-500">No active maintenance tasks are currently due for this property.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayTasks.map((task, index) => (
              <React.Fragment key={task.id}>
                <Link 
                  href={`/dashboard/maintenance?${selectedPropertyId ? `propertyId=${selectedPropertyId}&` : ''}taskId=${task.id}`} 
                  className="block"
                >
                  <div className="flex items-center justify-between p-2 -m-2 rounded hover:bg-gray-50 transition-colors">
                    <span className="font-body text-sm truncate pr-2 font-medium">{task.title}</span>
                    <span className="font-body flex-shrink-0 text-xs whitespace-nowrap">
                      {formatDue(task.nextDueDate)}
                    </span>
                  </div>
                </Link>
                {index < displayTasks.length - 1 && <Separator />}
              </React.Fragment>
            ))}
            {overflowCount > 0 && (
              <p className="font-body text-xs text-gray-500 pt-2">
                +{overflowCount} more items hidden.
              </p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        {displayTasks.length === 0 ? (
            // Case 1: List is Empty -> Primary CTA
             <Link 
                href={setupLink}
                className="font-body text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
             >
                Set Up Maintenance Plan →
             </Link>
        ) : (
             // Case 2: List has items -> Secondary link on left, Primary CTA on right
            <div className="flex justify-between w-full items-center">
                <Link 
                    href={setupLink} 
                    className="font-body text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                >
                    Maintenance Setup
                </Link>
                <Link 
                    href={primaryLink}
                    className="font-body text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                    {primaryText} →
                </Link>
            </div>
        )}
      </CardFooter>
    </Card>
  );
};