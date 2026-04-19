import React from 'react';
import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  level: 'high' | 'medium' | 'low';
  score?: number;
  className?: string;
}

const LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: 'High confidence',
  medium: 'Based on estimates',
  low: 'Limited data — verify',
};

const STYLES: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-teal-50 text-teal-700 border-teal-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-500 border-gray-200',
};

const DOT_STYLES: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-teal-500',
  medium: 'bg-amber-500',
  low: 'bg-gray-400',
};

export function ConfidenceBadge({ level, score, className }: ConfidenceBadgeProps) {
  const label = score !== undefined ? `${score}% confident` : LABELS[level];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        STYLES[level],
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', DOT_STYLES[level])} />
      {label}
    </span>
  );
}
