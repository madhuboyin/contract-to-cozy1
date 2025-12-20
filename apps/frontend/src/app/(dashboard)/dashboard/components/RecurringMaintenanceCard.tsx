// apps/frontend/src/app/(dashboard)/dashboard/components/RecurringMaintenanceCard.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Wrench, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChecklistItem } from '@/types'; 
import { format } from 'date-fns';

interface RecurringMaintenanceCardProps {
  maintenance: ChecklistItem[]; 
  isPropertySelected: boolean;
  selectedPropertyId?: string;
}

const getStatusBadge = (task: ChecklistItem) => {
  if (!task.nextDueDate) {
    return { label: 'Pending', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' };
  }

  const dueDate = new Date(task.nextDueDate);
  const now = new Date();
  const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) {
    return { label: 'Overdue', className: 'bg-red-100 text-red-700 hover:bg-red-100' };
  } else if (daysUntilDue <= 14) {
    return { label: 'Due Soon', className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' };
  } else {
    return { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' };
  }
};

export const RecurringMaintenanceCard: React.FC<RecurringMaintenanceCardProps> = ({ 
  maintenance, 
  isPropertySelected,
  selectedPropertyId 
}) => {
  
  const sortedTasks = React.useMemo(() => {
    return [...maintenance]
      .sort((a, b) => {
        const dateA = a.nextDueDate ? new Date(a.nextDueDate).getTime() : Infinity;
        const dateB = b.nextDueDate ? new Date(b.nextDueDate).getTime() : Infinity;
        return dateA - dateB;
      });
  }, [maintenance]);

  const displayTasks = sortedTasks.slice(0, 3);
  const totalTasks = sortedTasks.length;

  return (
    <Card className="h-[320px] flex flex-col border-2 border-gray-100 rounded-2xl shadow-sm hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <CardContent className="p-5 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Maintenance</h3>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
            {totalTasks}
          </Badge>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-hidden">
          {!isPropertySelected ? (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-4xl mb-3">🏠</span>
              <p className="text-sm text-gray-600 mb-4">Select a property</p>
              <Link href="/dashboard/properties">
                <Button variant="outline" size="sm" className="gap-2">
                  View Properties <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : displayTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-4xl mb-3">✅</span>
              <p className="text-sm text-gray-600 mb-4">All maintenance up to date</p>
              <Link href={selectedPropertyId ? `/dashboard/maintenance-setup?propertyId=${selectedPropertyId}` : '/dashboard/maintenance-setup'}>
                <Button variant="outline" size="sm" className="gap-2">
                  Setup Schedule <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {displayTasks.map((task) => {
                const badge = getStatusBadge(task);
                const taskLink = selectedPropertyId 
                  ? `/dashboard/maintenance?propertyId=${selectedPropertyId}&taskId=${task.id}`
                  : `/dashboard/maintenance?taskId=${task.id}`;
                
                return (
                  <Link 
                    key={task.id} 
                    href={taskLink}
                    className="block"
                  >
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm hover:bg-white transition-all cursor-pointer">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1.5 truncate">
                        {task.title}
                      </h4>
                      <p className="text-xs text-gray-600 mb-1.5">
                        {task.nextDueDate 
                          ? `Due: ${format(new Date(task.nextDueDate), 'MMM dd, yyyy')}`
                          : 'No due date'}
                      </p>
                      <Badge variant="secondary" className={`text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA Button */}
        {totalTasks > 0 && isPropertySelected && (
          <div className="mt-auto pt-4">
            <Link href={selectedPropertyId ? `/dashboard/maintenance?propertyId=${selectedPropertyId}` : '/dashboard/maintenance'}>
              <Button 
                variant="ghost" 
                className="w-full text-sm font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-md gap-2"
              >
                View All {totalTasks} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
};