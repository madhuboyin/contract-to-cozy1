import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RiskOfDelayBadgeProps {
  children: React.ReactNode;
  severity?: 'low' | 'medium' | 'high';
  className?: string;
}

const STYLES: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-blue-50 text-blue-700 border-blue-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
};

const ICON_STYLES: Record<'low' | 'medium' | 'high', string> = {
  low: 'text-blue-500',
  medium: 'text-amber-500',
  high: 'text-red-500',
};

export function RiskOfDelayBadge({
  children,
  severity = 'medium',
  className,
}: RiskOfDelayBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-start gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium leading-relaxed',
        STYLES[severity],
        className
      )}
    >
      <AlertTriangle
        className={cn('h-3 w-3 flex-shrink-0 mt-0.5', ICON_STYLES[severity])}
      />
      <span>If you wait: {children}</span>
    </span>
  );
}
