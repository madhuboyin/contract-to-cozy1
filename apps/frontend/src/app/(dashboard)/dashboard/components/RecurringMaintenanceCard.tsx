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
        return <span className="text-red-500 font-semibold">OVERDUE</span>;
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
        <CardTitle className="text-xl flex items-center space-x-2">
            <Wrench className="w-5 h-5 text-gray-500" />
            <span>Upcoming Maintenance</span>
        </CardTitle>
        <CardDescription>
            {totalItems} active tasks. Focus on high priority items for your primary residence.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-grow">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 space-y-2">
            <Check className="w-8 h-8 text-green-500" />
            <p className="text-center text-lg font-medium text-gray-700">All caught up!</p>
            <p className="text-center text-sm text-gray-500">No active maintenance tasks are currently due.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {displayTasks.map((task) => (
              <Link key={task.id} href={`/dashboard/maintenance?taskId=${task.id}`}>
                <li className="flex items-center justify-between text-sm hover:bg-gray-50 p-2 -m-2 rounded transition-colors">
                  <span className="truncate pr-2 font-medium">{task.title}</span>
                  <span className="flex-shrink-0 text-xs whitespace-nowrap">
                    {formatDue(task.nextDueDate)}
                  </span>
                </li>
              </Link>
            ))}
            {overflowCount > 0 && (
                <li className="text-xs text-gray-500 pt-2">
                    +{overflowCount} more items hidden.
                </li>
            )}
          </ul>
        )}
      </CardContent>
      {/* FIX: Implement dual links in CardFooter when tasks exist */}
      <CardFooter className="border-t pt-4">
        {displayTasks.length === 0 ? (
            // Case 1: List is Empty -> Full-width link to Setup
             <Button variant="outline" className="w-full h-8 text-xs font-semibold text-blue-600 hover:text-blue-700" asChild>
                <Link href={setupLink}>Set Up Maintenance Plan →</Link>
            </Button>
        ) : (
             // Case 2: List has items -> Two links: Setup on left, List/More on right
            <div className="flex justify-between w-full items-center">
                <Link 
                    href={setupLink} 
                    className="text-xs font-semibold text-gray-600 hover:text-blue-700 underline"
                >
                    Maintenance Setup
                </Link>
                <Button variant="ghost" className="h-8 text-xs font-semibold text-blue-600 hover:text-blue-700" asChild>
                    <Link href={primaryLink}>{primaryText}</Link>
                </Button>
            </div>
        )}
      </CardFooter>
    </Card>
  );
};