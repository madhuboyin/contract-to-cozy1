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
  
  // Filter for pending, recurring tasks and sort them by due date
  const allPendingTasks = maintenance
    .filter(t => t.status === 'PENDING' && t.isRecurring)
    .sort((a, b) => {
        const dateA = a.nextDueDate ? new Date(a.nextDueDate).getTime() : Infinity;
        const dateB = b.nextDueDate ? new Date(b.nextDueDate).getTime() : Infinity;
        return dateA - dateB;
    });

  // FIX 1: Limit display items to 3
  const displayTasks = allPendingTasks.slice(0, 3);
  const totalItems = allPendingTasks.length;
  const overflowCount = totalItems - displayTasks.length;

  const formatDue = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    const date = new Date(dateStr);
    const now = new Date();
    // Reset time components for accurate day difference
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTargetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = startOfTargetDate.getTime() - startOfToday.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return <span className="text-red-500 font-medium">Overdue</span>;
    if (diffDays === 0) return <span className="text-orange-500 font-medium">Due Today</span>;
    if (diffDays <= 7) return <span className="text-orange-500 font-medium">Due in {diffDays} days</span>;
    return <span className="text-gray-500">{date.toLocaleDateString()}</span>;
  };

  // FIX 2: Dynamic Footer Logic
  const footerLink = overflowCount > 0 
    ? "/dashboard/maintenance" // Link to the list page if overflow exists
    : "/dashboard/maintenance-setup"; // Link to setup page otherwise

  const footerText = overflowCount > 0 
    ? `View ${overflowCount} More Task${overflowCount > 1 ? 's' : ''} →`
    : "Manage Maintenance Plan";
    
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-orange-600" />
          Maintenance
        </CardTitle>
        <CardDescription>Routine tasks to keep home value</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {displayTasks.length === 0 ? ( // FIX 3: Use displayTasks for empty check
          <div className="text-center py-8 text-gray-500">
             <Check className="mx-auto h-8 w-8 text-green-500 mb-2" />
             <p>All caught up!</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {displayTasks.map(task => ( 
              <Link 
                key={task.id} 
                href="/dashboard/maintenance" 
                className="block p-2 rounded-lg hover:bg-gray-100 transition-colors duration-150"
              >
                <li className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 font-medium">{task.title}</span>
                  <span className="flex-shrink-0 text-xs whitespace-nowrap">
                    {formatDue(task.nextDueDate)}
                  </span>
                </li>
              </Link>
            ))}
          </ul>
        )}
      </CardContent>
      {/* FIX 4: Implement Dynamic CardFooter */}
      <CardFooter className="border-t pt-4">
        <Button variant="ghost" className="w-full h-8 text-xs font-semibold text-blue-600 hover:text-blue-700" asChild>
          <Link href={footerLink}>{footerText}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
};