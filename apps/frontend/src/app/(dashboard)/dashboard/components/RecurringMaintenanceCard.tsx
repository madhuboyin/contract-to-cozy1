// apps/frontend/src/app/(dashboard)/dashboard/components/RecurringMaintenanceCard.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Wrench, Check, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DashboardChecklistItem } from '../types'; 

interface RecurringMaintenanceCardProps {
  maintenance: DashboardChecklistItem[];
  className?: string;
}

export const RecurringMaintenanceCard = ({ maintenance, className }: RecurringMaintenanceCardProps) => {
  
  // CRITICAL FIX: Removed the restrictive filter: `&& t.isRecurring`
  // We now display all maintenance tasks passed to the component, provided they are PENDING.
  const allPendingTasks = maintenance
    .filter(t => t.status === 'PENDING') 
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
  
  const setupLink = "/dashboard/maintenance-setup";
  const primaryLink = "/dashboard/maintenance";
  const primaryText = totalItems > 3 ? `View All (${totalItems})` : "View Full List";

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="font-heading text-xl flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-600" />
            <span>Upcoming Maintenance</span>
        </CardTitle>
        <CardDescription className="font-body text-sm">
            {totalItems} active tasks. Focus on high priority items for your primary residence.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-grow">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 space-y-2">
            <Check className="w-8 h-8 text-green-500" />
            <p className="font-heading text-center text-lg font-medium text-gray-700">All caught up!</p>
            <p className="font-body text-center text-sm text-gray-500">No active maintenance tasks are currently due.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {displayTasks.map((task) => (
              <Link key={task.id} href={`/dashboard/maintenance?taskId=${task.id}`}>
                <li className="flex items-center justify-between hover:bg-gray-50 p-2 -m-2 rounded transition-colors">
                  <span className="font-body text-sm truncate pr-2 font-medium">{task.title}</span>
                  <span className="font-body flex-shrink-0 text-xs whitespace-nowrap">
                    {formatDue(task.nextDueDate)}
                  </span>
                </li>
              </Link>
            ))}
            {overflowCount > 0 && (
                <li className="font-body text-xs text-gray-500 pt-2">
                    +{overflowCount} more items hidden.
                </li>
            )}
          </ul>
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