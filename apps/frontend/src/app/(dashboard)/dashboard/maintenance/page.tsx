// apps/frontend/src/app/(dashboard)/dashboard/maintenance/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Wrench, Calendar, Settings, Plus, Edit } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query'; 

// Assuming DashboardChecklistItem is imported or defined globally,
// but defining it locally for clarity based on the previous context:
interface DashboardChecklistItem {
    id: string;
    title: string;
    description: string | null;
    status: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
    serviceCategory: string | null;
    isRecurring: boolean;
    frequency: string | null;
    nextDueDate: string | null;
    lastCompletedDate: string | null;
}

// Categories to EXCLUDE (Renewals and Financial items)
const RENEWAL_CATEGORIES = [
  'INSURANCE',
  'WARRANTY',
  'FINANCE',
  'ADMIN',
  'ATTORNEY',
];


// Helper to format days until due (FIXED Union Type Access Error)
// FIX 1: Ensure consistent return type (object) to avoid the union type access error in JSX.
const formatDueDate = (dueDateString: string | null) => {
    if (!dueDateString) return { text: 'N/A', color: 'text-gray-500' }; 

    const days = differenceInDays(parseISO(dueDateString), new Date());
    
    if (days < 0) {
        return { text: `Overdue by ${Math.abs(days)} days`, color: 'text-red-600' };
    }
    if (days <= 30) {
        return { text: `Due in ${days} days`, color: 'text-orange-500' };
    }
    return { text: `Due ${format(parseISO(dueDateString), 'MMM dd, yyyy')}`, color: 'text-gray-700' };
};


// --- Main Page Component ---
export default function MaintenancePage() {
  const { toast } = useToast();

  // Fetch the user's full checklist
  const { data: checklistRes, isLoading, refetch } = useQuery({
    queryKey: ['full-home-checklist'],
    // FIX 2: getChecklist needs to be added to API client
    queryFn: () => api.getChecklist(),
  });

  const allChecklistItems = useMemo(() => {
    if (!checklistRes?.success || !checklistRes.data.items) {
      console.error("Error fetching checklist data:", checklistRes?.message);
      return [];
    }
    // FIX 3: Explicitly cast the fetched items array to resolve implicit 'any' error
    return checklistRes.data.items as DashboardChecklistItem[];
  }, [checklistRes]);


  // Filter the list for active, recurring, non-renewal maintenance tasks
  const maintenanceItems = useMemo(() => {
    return allChecklistItems
      .filter(item => item.isRecurring)
      .filter(item => item.status === 'PENDING') // Only track active, pending items
      .filter(item => 
        // Exclude renewal categories
        !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory)
      )
      .sort((a, b) => { // FIX 4: Corrected sorting parameters (resolved itemA/itemB error)
        // Sort by soonest Next Due Date
        const dateA = a.nextDueDate ? parseISO(a.nextDueDate).getTime() : Infinity;
        const dateB = b.nextDueDate ? parseISO(b.nextDueDate).getTime() : Infinity;
        return dateA - dateB;
      });
  }, [allChecklistItems]);


  if (isLoading) {
    return (
      <div className="space-y-6 pb-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mt-10" />
        <p className="text-center text-gray-500">Loading maintenance tasks...</p>
      </div>
    );
  }


  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-7 h-7 text-blue-600" /> Recurring Maintenance
        </h2>
        
        {/* Link to the Setup Page to add new tasks */}
        <Button asChild>
          <Link href="/dashboard/maintenance-setup">
            <Plus className="w-4 h-4 mr-2" /> Add New Tasks
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground">Manage your recurring home maintenance schedule, separate from renewals and finances.</p>

      {maintenanceItems.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Recurring Maintenance Found</CardTitle>
          <CardDescription>
            Visit <Link href="/dashboard/maintenance-setup" className="text-blue-600 hover:underline">Maintenance Setup</Link> to add scheduled tasks.
          </CardDescription>
        </Card>
      )}

      {maintenanceItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {maintenanceItems.map(item => {
            const dueDateInfo = formatDueDate(item.nextDueDate);
            const isAlert = dueDateInfo.color !== 'text-gray-700';

            return (
              <Card 
                key={item.id} 
                className={cn(
                  "flex flex-col",
                  isAlert ? "border-orange-400 bg-orange-50/50" : "border-gray-200"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">
                      {item.title}
                    </CardTitle>
                    <div className={cn(
                      "text-xs font-semibold px-2 py-1 rounded-full",
                      isAlert ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                    )}>
                      {item.frequency || 'One-time'}
                    </div>
                  </div>
                  <CardDescription>
                    Category: {item.serviceCategory || 'General'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 pt-3 text-sm">
                    <p className="text-gray-600 line-clamp-2">{item.description || 'No detailed description provided.'}</p>
                    
                    <div className="flex items-center gap-2 border-t pt-3">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className={cn('font-medium', dueDateInfo.color)}>
                            {dueDateInfo.text}
                        </span>
                    </div>
                    {item.lastCompletedDate && (
                        <div className="text-xs text-muted-foreground">
                            Last done: {format(parseISO(item.lastCompletedDate), 'MMM dd, yyyy')}
                        </div>
                    )}
                </CardContent>
                <div className="flex border-t">
                  <Button variant="ghost" className="w-1/2 rounded-none text-blue-600" asChild>
                    <Link href={`/dashboard/checklist`}>
                        <Settings className="w-4 h-4 mr-2" /> View/Edit
                    </Link>
                  </Button>
                  {/* Action button would trigger the mark-complete API call */}
                  <Button variant="ghost" className="w-1/2 rounded-none rounded-br-lg text-green-600 hover:bg-green-50">
                    <Edit className="w-4 h-4 mr-2" /> Mark Complete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}