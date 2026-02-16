// apps/frontend/src/components/orchestration/TaskStatusBadge.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, CheckCircle, AlertCircle, Clock, Repeat } from 'lucide-react';

interface TaskStatusBadgeProps {
  checklistItem: {
    id: string;
    title: string;
    nextDueDate: string | null;
    isRecurring: boolean;
    frequency: string | null;
    status: string;
    lastCompletedDate: string | null;
  };
}

function formatDueDate(dateString: string | null): string {
  if (!dateString) return 'No date set';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return `Overdue by ${Math.abs(diffDays)} days`;
  } else if (diffDays === 0) {
    return 'Due today';
  } else if (diffDays === 1) {
    return 'Due tomorrow';
  } else if (diffDays <= 7) {
    return `Due in ${diffDays} days`;
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  }
}

function formatFrequency(frequency: string | null): string {
  if (!frequency) return '';
  
  const frequencyMap: Record<string, string> = {
    'DAILY': 'daily',
    'WEEKLY': 'weekly',
    'BIWEEKLY': 'every 2 weeks',
    'MONTHLY': 'monthly',
    'QUARTERLY': 'quarterly',
    'BIANNUALLY': 'twice yearly',
    'ANNUALLY': 'annually',
  };
  
  return frequencyMap[frequency.toUpperCase()] || frequency.toLowerCase();
}

function getStatusColor(status: string, nextDueDate: string | null): string {
  const normalized = status.toUpperCase();
  
  if (normalized === 'COMPLETED') {
    return 'text-green-700 bg-green-50 border-green-200';
  }
  
  if (nextDueDate) {
    const date = new Date(nextDueDate);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return 'text-red-700 bg-red-50 border-red-200';
    }
  }
  
  return 'text-gray-700 bg-gray-50 border-gray-200';
}

function getStatusIcon(status: string, nextDueDate: string | null) {
  const normalized = status.toUpperCase();
  
  if (normalized === 'COMPLETED') {
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  }
  
  if (nextDueDate) {
    const date = new Date(nextDueDate);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  }
  
  return <Clock className="h-4 w-4 text-gray-600" />;
}

function getStatusLabel(status: string, lastCompletedDate: string | null): string {
  const normalized = status.toUpperCase();
  
  if (normalized === 'COMPLETED' && lastCompletedDate) {
    const date = new Date(lastCompletedDate);
    return `Completed ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  
  if (normalized === 'IN_PROGRESS') {
    return 'In Progress';
  }
  
  if (normalized === 'NEEDS_REVIEW') {
    return 'Needs Review';
  }
  
  return 'Pending';
}

export const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ checklistItem }) => {
  const isOverdue = checklistItem.nextDueDate 
    ? new Date(checklistItem.nextDueDate) < new Date() && checklistItem.status !== 'COMPLETED'
    : false;

  const statusColorClass = getStatusColor(checklistItem.status, checklistItem.nextDueDate);

  return (
    <div className="mt-3 rounded-md border bg-gray-50 p-3 text-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 space-y-2">
          {/* Status Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${statusColorClass} text-xs font-medium`}>
              {getStatusIcon(checklistItem.status, checklistItem.nextDueDate)}
              {getStatusLabel(checklistItem.status, checklistItem.lastCompletedDate)}
            </div>
            
            {isOverdue && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                <AlertCircle className="h-3 w-3" />
                Overdue
              </span>
            )}
          </div>

          {/* Due Date */}
          {checklistItem.nextDueDate && (
            <div className="flex items-center gap-1.5 text-xs text-gray-700">
              <Calendar className="h-3.5 w-3.5 text-gray-500" />
              <span className={isOverdue ? 'font-semibold text-red-700' : ''}>
                {formatDueDate(checklistItem.nextDueDate)}
              </span>
            </div>
          )}

          {/* Recurring Indicator */}
          {checklistItem.isRecurring && checklistItem.frequency && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Repeat className="h-3.5 w-3.5 text-gray-500" />
              <span>Repeats {formatFrequency(checklistItem.frequency)}</span>
            </div>
          )}
        </div>

        {/* View Task Link */}
        <Link
          href={`/dashboard/maintenance?taskId=${checklistItem.id}`}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap min-h-[44px] inline-flex items-center touch-manipulation"
        >
          View task →
        </Link>
      </div>
    </div>
  );
};