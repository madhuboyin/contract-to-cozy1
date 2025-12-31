// apps/frontend/src/components/tasks/MaintenanceTaskCard.tsx
'use client';

import { useState } from 'react';
import { format, parseISO, isPast, isWithinInterval, addDays } from 'date-fns';
import { 
  Calendar, 
  DollarSign, 
  Edit, 
  Trash2, 
  MoreVertical,
  Clock,
  AlertCircle,
  Repeat,
  Link as LinkIcon,
  Wrench,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskPriorityBadge } from './TaskPriorityBadge';
import { PropertyMaintenanceTask } from '@/types';

interface MaintenanceTaskCardProps {
  task: PropertyMaintenanceTask;
  onEdit?: (task: PropertyMaintenanceTask) => void;
  onDelete?: (task: PropertyMaintenanceTask) => void;
  onStatusChange?: (task: PropertyMaintenanceTask, newStatus: string) => void;
  onLinkBooking?: (task: PropertyMaintenanceTask) => void;
  compact?: boolean;
}

export function MaintenanceTaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  onLinkBooking,
  compact = false,
}: MaintenanceTaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate due date status
  const getDueDateStatus = () => {
    if (!task.nextDueDate) return null;
    
    const dueDate = parseISO(task.nextDueDate);
    const now = new Date();
    const sevenDaysFromNow = addDays(now, 7);
    
    if (isPast(dueDate)) {
      return { type: 'overdue', label: 'Overdue', className: 'text-red-600' };
    }
    
    if (isWithinInterval(dueDate, { start: now, end: sevenDaysFromNow })) {
      return { type: 'due-soon', label: 'Due Soon', className: 'text-orange-600' };
    }
    
    return { type: 'upcoming', label: 'Upcoming', className: 'text-gray-600' };
  };

  const dueDateStatus = getDueDateStatus();

  // Get source badge
  const getSourceBadge = () => {
    const sourceLabels: Record<string, string> = {
      USER_CREATED: 'Manual',
      ACTION_CENTER: 'Action Center',
      SEASONAL: 'Seasonal',
      RISK_ASSESSMENT: 'Risk Report',
      WARRANTY_RENEWAL: 'Warranty',
      TEMPLATE: 'Template',
    };

    const sourceColors: Record<string, string> = {
      USER_CREATED: 'bg-blue-100 text-blue-800',
      ACTION_CENTER: 'bg-purple-100 text-purple-800',
      SEASONAL: 'bg-green-100 text-green-800',
      RISK_ASSESSMENT: 'bg-red-100 text-red-800',
      WARRANTY_RENEWAL: 'bg-yellow-100 text-yellow-800',
      TEMPLATE: 'bg-gray-100 text-gray-800',
    };

    return {
      label: sourceLabels[task.source] || task.source,
      className: sourceColors[task.source] || 'bg-gray-100 text-gray-800',
    };
  };

  const sourceBadge = getSourceBadge();

  return (
    <Card className={`hover:shadow-md transition-shadow ${compact ? 'mb-2' : 'mb-4'}`}>
      <CardContent className={`${compact ? 'p-4' : 'p-6'}`}>
        <div className="space-y-3">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg truncate">{task.title}</h3>
                {task.isRecurring && (
                  <span title="Recurring task">
                    <Repeat className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  </span>
                )}
              </div>
              
              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} variant="compact" />
                <TaskPriorityBadge priority={task.priority} variant="compact" />
                <Badge variant="outline" className={`${sourceBadge.className} text-xs`}>
                  {sourceBadge.label}
                </Badge>
                
                {task.serviceCategory && (
                  <Badge variant="outline" className="text-xs bg-gray-50">
                    <Wrench className="h-3 w-3 mr-1" />
                    {task.serviceCategory}
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(task)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Task
                  </DropdownMenuItem>
                )}
                {onStatusChange && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onStatusChange(task, 'IN_PROGRESS')}>
                      Start Task
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStatusChange(task, 'COMPLETED')}>
                      Mark Complete
                    </DropdownMenuItem>
                  </>
                )}
                {onLinkBooking && !task.bookingId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onLinkBooking(task)}>
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Link Booking
                    </DropdownMenuItem>
                  </>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onDelete(task)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Task
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-sm text-gray-600 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Details Row */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {/* Due Date */}
            {task.nextDueDate && (
              <div className={`flex items-center gap-1 ${dueDateStatus?.className}`}>
                <Calendar className="h-4 w-4" />
                <span className="font-medium">
                  {format(parseISO(task.nextDueDate), 'MMM d, yyyy')}
                </span>
                {dueDateStatus && dueDateStatus.type !== 'upcoming' && (
                  <span className="text-xs ml-1">({dueDateStatus.label})</span>
                )}
              </div>
            )}

            {/* Estimated Cost */}
            {task.estimatedCost && (
              <div className="flex items-center gap-1 text-gray-600">
                <DollarSign className="h-4 w-4" />
                <span>${task.estimatedCost.toLocaleString()}</span>
              </div>
            )}

            {/* Recurring Info */}
            {task.isRecurring && task.frequency && (
              <div className="flex items-center gap-1 text-gray-600">
                <Clock className="h-4 w-4" />
                <span className="capitalize">{task.frequency.toLowerCase().replace('_', ' ')}</span>
              </div>
            )}

            {/* Booking Link */}
            {task.bookingId && (
              <div className="flex items-center gap-1 text-blue-600">
                <LinkIcon className="h-4 w-4" />
                <span className="text-xs">Booking linked</span>
              </div>
            )}
          </div>

          {/* Risk Level Warning */}
          {task.riskLevel && (task.riskLevel === 'CRITICAL' || task.riskLevel === 'HIGH') && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>{task.riskLevel} Risk:</strong> Immediate attention recommended
              </span>
            </div>
          )}

          {/* Expandable Details */}
          {!compact && (task.assetType || task.actualCost || task.lastCompletedDate) && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-gray-600 hover:text-gray-900"
              >
                {isExpanded ? 'Show Less' : 'Show More Details'}
              </Button>
              
              {isExpanded && (
                <div className="mt-2 p-3 bg-gray-50 rounded text-sm space-y-2">
                  {task.assetType && (
                    <div>
                      <span className="font-medium">Asset:</span> {task.assetType}
                    </div>
                  )}
                  {task.actualCost && (
                    <div>
                      <span className="font-medium">Actual Cost:</span> ${task.actualCost.toLocaleString()}
                    </div>
                  )}
                  {task.lastCompletedDate && (
                    <div>
                      <span className="font-medium">Last Completed:</span>{' '}
                      {format(parseISO(task.lastCompletedDate), 'MMM d, yyyy')}
                    </div>
                  )}
                  {task.createdAt && (
                    <div>
                      <span className="font-medium">Created:</span>{' '}
                      {format(new Date(task.createdAt), 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}