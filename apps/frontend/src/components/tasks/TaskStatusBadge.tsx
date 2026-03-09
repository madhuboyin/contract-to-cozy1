// apps/frontend/src/components/tasks/TaskStatusBadge.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { HelpCircle } from 'lucide-react';
import { MaintenanceTaskStatus, HomeBuyerTaskStatus } from '@/types';
import { getTaskStatusIcon } from '@/lib/config/iconMapping';
import { resolveIcon } from '@/lib/icons';

interface TaskStatusBadgeProps {
  status: MaintenanceTaskStatus | HomeBuyerTaskStatus | string;
  variant?: 'default' | 'compact';
}

const STATUS_CONFIG = {
  // Maintenance Task Statuses
  PENDING: {
    label: 'Pending',
    iconName: getTaskStatusIcon('PENDING'),
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    iconName: getTaskStatusIcon('IN_PROGRESS'),
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  COMPLETED: {
    label: 'Completed',
    iconName: getTaskStatusIcon('COMPLETED'),
    className: 'bg-green-100 text-green-800 border-green-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    iconName: getTaskStatusIcon('CANCELLED'),
    className: 'bg-gray-100 text-gray-800 border-gray-300',
  },
  // Home Buyer Task Statuses
  NOT_NEEDED: {
    label: 'Not Needed',
    iconName: 'HelpCircle',
    className: 'bg-gray-100 text-gray-600 border-gray-300',
  },
} as const;

export function TaskStatusBadge({ status, variant = 'default' }: TaskStatusBadgeProps) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || {
    label: status,
    iconName: getTaskStatusIcon(status),
    className: 'bg-gray-100 text-gray-800 border-gray-300',
  };

  const Icon = resolveIcon(config.iconName, HelpCircle);
  const isCompact = variant === 'compact';

  return (
    <Badge
      variant="outline"
      className={`rounded-full ${config.className} ${isCompact ? 'text-xs py-0 px-2' : 'text-sm py-1 px-3'}`}
    >
      <Icon className={`${isCompact ? 'h-3 w-3' : 'h-4 w-4'} ${isCompact ? 'mr-1' : 'mr-1.5'}`} />
      {config.label}
    </Badge>
  );
}

// Utility function for getting status color class
export function getStatusColorClass(status: string): string {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  return config?.className || 'bg-gray-100 text-gray-800 border-gray-300';
}

// Utility function for checking if status is actionable
export function isActionableStatus(status: string): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS';
}
