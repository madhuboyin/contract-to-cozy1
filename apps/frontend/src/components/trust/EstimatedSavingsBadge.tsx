import React from 'react';
import { TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EstimatedSavingsBadgeProps {
  amount: number;
  period?: string;
  basis?: string;
  className?: string;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function EstimatedSavingsBadge({
  amount,
  period,
  basis,
  className,
}: EstimatedSavingsBadgeProps) {
  if (amount <= 0) return null;

  return (
    <span
      title={basis}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200',
        className
      )}
    >
      <TrendingDown className="h-3 w-3 flex-shrink-0" />
      Save {formatUsd(amount)}
      {period && <span className="font-normal text-emerald-600">/{period}</span>}
    </span>
  );
}
