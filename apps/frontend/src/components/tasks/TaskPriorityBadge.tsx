// apps/frontend/src/components/tasks/TaskPriorityBadge.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowUp, Minus, ArrowDown } from 'lucide-react';
import { MaintenanceTaskPriority } from '@/types';

interface TaskPriorityBadgeProps {
  priority: MaintenanceTaskPriority | string;
  variant?: 'default' | 'compact' | 'minimal';
  showIcon?: boolean;
}

const PRIORITY_CONFIG = {
  URGENT: {
    label: 'Urgent',
    icon: AlertTriangle,
    className: 'bg-red-100 text-red-800 border-red-300 font-semibold',
    iconClassName: 'text-red-600',
  },
  HIGH: {
    label: 'High',
    icon: ArrowUp,
    className: 'bg-orange-100 text-orange-800 border-orange-300',
    iconClassName: 'text-orange-600',
  },
  MEDIUM: {
    label: 'Medium',
    icon: Minus,
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    iconClassName: 'text-yellow-600',
  },
  LOW: {
    label: 'Low',
    icon: ArrowDown,
    className: 'bg-green-100 text-green-800 border-green-300',
    iconClassName: 'text-green-600',
  },
} as const;

export function TaskPriorityBadge({ 
  priority, 
  variant = 'default',
  showIcon = true 
}: TaskPriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] || {
    label: priority,
    icon: Minus,
    className: 'bg-gray-100 text-gray-800 border-gray-300',
    iconClassName: 'text-gray-600',
  };

  const Icon = config.icon;
  const isCompact = variant === 'compact';
  const isMinimal = variant === 'minimal';

  if (isMinimal) {
    return (
      <span className={`inline-flex items-center ${config.iconClassName}`}>
        <Icon className="h-3 w-3" />
      </span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${isCompact ? 'text-xs py-0 px-2' : 'text-sm py-1 px-3'}`}
    >
      {showIcon && (
        <Icon className={`${isCompact ? 'h-3 w-3' : 'h-4 w-4'} ${isCompact ? 'mr-1' : 'mr-1.5'}`} />
      )}
      {config.label}
    </Badge>
  );
}

// Utility function for getting priority color class
export function getPriorityColorClass(priority: string): string {
  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG];
  return config?.className || 'bg-gray-100 text-gray-800 border-gray-300';
}

// Utility function for getting priority sort order (higher number = higher priority)
export function getPrioritySortOrder(priority: string): number {
  const order: Record<string, number> = {
    URGENT: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };
  return order[priority] || 0;
}

// Utility function for determining if priority is high-urgency
export function isHighPriority(priority: string): boolean {
  return priority === 'URGENT' || priority === 'HIGH';
}