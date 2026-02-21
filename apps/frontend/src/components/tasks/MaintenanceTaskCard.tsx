// apps/frontend/src/components/tasks/MaintenanceTaskCard.tsx
'use client';

import { useState, useEffect } from 'react';
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
  Camera,
  Shield,
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
  const [showPostCompletionNudge, setShowPostCompletionNudge] = useState(false);

  // Auto-dismiss post-completion nudge after 10 seconds
  useEffect(() => {
    if (!showPostCompletionNudge) return;
    const timer = setTimeout(() => setShowPostCompletionNudge(false), 10000);
    return () => clearTimeout(timer);
  }, [showPostCompletionNudge]);

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
    <Card className={`hover:shadow-md transition-shadow active:scale-[0.99] ${compact ? 'mb-2' : 'mb-4'}`}>
      <CardContent className={`${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
        <div className="space-y-4">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="font-bold text-base sm:text-lg truncate leading-tight">{task.title}</h3>
                {task.isRecurring && (
                  <span title="Recurring task">
                    <Repeat className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  </span>
                )}
              </div>
              
              {/* Badges Row - Optimized for wrapping on mobile */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <TaskStatusBadge status={task.status} variant="compact" />
                <TaskPriorityBadge priority={task.priority} variant="compact" />
                <Badge variant="outline" className={`${sourceBadge.className} text-[11px] sm:text-xs px-1.5 py-0`}>
                  {sourceBadge.label}
                </Badge>
                
                {task.serviceCategory && (
                  <Badge variant="outline" className="text-[11px] sm:text-xs bg-gray-50 px-1.5 py-0">
                    <Wrench className="h-3 w-3 mr-1" />
                    {task.serviceCategory}
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreVertical className="h-5 w-5 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
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
                    <DropdownMenuItem onClick={() => {
                      onStatusChange(task, 'COMPLETED');
                      if ((task as any).inventoryItemId && !(task as any).inventoryItemVerified) {
                        setShowPostCompletionNudge(true);
                      }
                    }}>
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
            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Details Row - Stacked on mobile for readability */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-y-3 gap-x-4 text-sm border-t sm:border-t-0 pt-3 sm:pt-0">
            {/* Due Date */}
            {task.nextDueDate && (
              <div className={`flex items-center gap-2 ${dueDateStatus?.className}`}>
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="font-medium whitespace-nowrap">
                  {format(parseISO(task.nextDueDate), 'MMM d, yyyy')}
                </span>
                {dueDateStatus && dueDateStatus.type !== 'upcoming' && (
                  <span className="text-[10px] px-1 bg-current/10 rounded uppercase font-bold">{dueDateStatus.label}</span>
                )}
              </div>
            )}

            {/* Estimated Cost */}
            {task.estimatedCost && (
              <div className="flex items-center gap-2 text-gray-600">
                <DollarSign className="h-4 w-4 shrink-0" />
                <span>Est: ${task.estimatedCost.toLocaleString()}</span>
              </div>
            )}

            {/* Recurring Info */}
            {task.isRecurring && task.frequency && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="capitalize">{task.frequency.toLowerCase().replace('_', ' ')}</span>
              </div>
            )}

            {/* Booking Link */}
            {task.bookingId && (
              <div className="flex items-center gap-2 text-blue-600">
                <LinkIcon className="h-4 w-4 shrink-0" />
                <span className="font-medium">Booking linked</span>
              </div>
            )}
          </div>

          {/* Quick Action Buttons - Visible on mobile for better touch UX */}
          <div className="flex flex-col sm:hidden gap-2 pt-2">
             {!onStatusChange || task.status !== 'COMPLETED' ? (
                <Button
                  onClick={() => {
                    onStatusChange?.(task, 'COMPLETED');
                    if ((task as any).inventoryItemId && !(task as any).inventoryItemVerified) {
                      setShowPostCompletionNudge(true);
                    }
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 h-11"
                >
                  Mark Complete
                </Button>
             ) : null}
             <Button variant="outline" onClick={() => onEdit?.(task)} className="w-full h-11">
                Edit Details
             </Button>
          </div>

          {/* Risk Level Warning */}
          {task.riskLevel && (task.riskLevel === 'CRITICAL' || task.riskLevel === 'HIGH') && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>{task.riskLevel} Risk:</strong> Immediate attention recommended
              </span>
            </div>
          )}

          {/* Expandable Details */}
          {!compact && (task.assetType || task.actualCost || task.lastCompletedDate) && (
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full text-xs text-gray-500 hover:text-gray-900 h-8"
              >
                {isExpanded ? 'Show Less' : 'Show More Details'}
              </Button>
              
              {isExpanded && (
                <div className="mt-2 p-3 bg-gray-50/50 rounded-lg text-sm space-y-2 border border-gray-100 animate-in fade-in slide-in-from-top-1">
                  {task.assetType && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Asset:</span> 
                      <span className="font-medium">{task.assetType}</span>
                    </div>
                  )}
                  {task.actualCost && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Actual Cost:</span>
                      <span className="font-medium">${task.actualCost.toLocaleString()}</span>
                    </div>
                  )}
                  {task.lastCompletedDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last Completed:</span>
                      <span className="font-medium">{format(parseISO(task.lastCompletedDate), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  {task.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created:</span>
                      <span className="font-medium">{format(new Date(task.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Post-completion verification nudge */}
        {showPostCompletionNudge && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg animate-in fade-in slide-in-from-top-1">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  You just maintained {task.title}. Want to verify its details?
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Scan the label to unlock lifespan predictions
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      setShowPostCompletionNudge(false);
                      // Navigate to inventory with verify param
                      if ((task as any).inventoryItemId) {
                        window.location.href = `/dashboard/properties/${task.propertyId}/inventory?itemId=${(task as any).inventoryItemId}&verify=true`;
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md
                      border border-blue-300 text-blue-700 hover:bg-blue-100"
                  >
                    <Camera className="w-3 h-3" />
                    Scan Label
                  </button>
                  <button
                    onClick={() => setShowPostCompletionNudge(false)}
                    className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}