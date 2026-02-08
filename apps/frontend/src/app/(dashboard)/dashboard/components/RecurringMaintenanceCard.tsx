'use client';

import React from 'react';
import Link from 'next/link';
import { Wrench, ArrowRight, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PropertyMaintenanceTask } from '@/types'; 
import { format, differenceInDays } from 'date-fns';

interface RecurringMaintenanceCardProps {
  maintenance: PropertyMaintenanceTask[]; 
  isPropertySelected: boolean;
  selectedPropertyId?: string;
}

const getStatusBadge = (task: PropertyMaintenanceTask) => {
  if (!task.nextDueDate) {
    return { label: 'Pending', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' };
  }

  const dueDate = new Date(task.nextDueDate);
  const now = new Date();
  const daysUntilDue = differenceInDays(dueDate, now);

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
      .filter(task => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
      .sort((a, b) => {
        const dateA = a.nextDueDate ? new Date(a.nextDueDate).getTime() : Infinity;
        const dateB = b.nextDueDate ? new Date(b.nextDueDate).getTime() : Infinity;
        return dateA - dateB;
      });
  }, [maintenance]);

  const displayTasks = sortedTasks.slice(0, 3);
  const totalTasks = sortedTasks.length;

  const maintenanceUrl = selectedPropertyId 
    ? `/dashboard/maintenance?propertyId=${selectedPropertyId}`
    : '/dashboard/maintenance';

  return (
    <Card className="w-full min-h-[320px] h-full flex flex-col border-2 border-gray-100 rounded-2xl shadow-sm hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden">
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
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Wrench className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                Select a property to view upcoming maintenance
              </p>
            </div>
          ) : totalTasks === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
              <p className="text-sm font-medium text-gray-700">All maintenance up to date</p>
              <Link href="/dashboard/maintenance-setup">
                <Button variant="link" className="mt-2 text-blue-600">
                  Setup Schedule <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {displayTasks.map((task) => {
                const statusBadge = getStatusBadge(task);
                return (
                // Inside displayTasks.map:
                <div key={task.id} className="flex items-start justify-between p-3 rounded-lg bg-gray-50">
                  {/* FIXED: min-w-0 is required for truncate to work inside a flex parent */}
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Due {task.nextDueDate ? format(new Date(task.nextDueDate), 'MMM dd') : 'N/A'}
                    </p>
                  </div>
                  <Badge className={`shrink-0 ${statusBadge.className}`}>
                    {statusBadge.label}
                  </Badge>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with View All Link */}
        {totalTasks > 0 && (
          <div className="pt-4 border-t border-gray-100 mt-auto">
            <Link href={maintenanceUrl}>
              <Button 
                variant="ghost" 
                className="w-full justify-between text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                View all maintenance tasks
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
};