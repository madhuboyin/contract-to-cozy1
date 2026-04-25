'use client';

import React from 'react';
import { PiggyBank, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EstimatedUpside } from '@/lib/types/trust';

interface EstimatedSavingsBadgeProps {
  upside: EstimatedUpside;
  className?: string;
}

export function EstimatedSavingsBadge({ upside, className }: EstimatedSavingsBadgeProps) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const periodLabel = {
    monthly: '/mo',
    annual: '/year',
    'one-time': ' once',
  }[upside.period];

  return (
    <div className={cn(
      "inline-flex flex-col rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5",
      className
    )}>
      <div className="flex items-center gap-2 mb-0.5">
        <div className="rounded-full bg-emerald-100 p-1">
          <PiggyBank className="h-3.5 w-3.5 text-emerald-700" />
        </div>
        <span className="text-[10px] font-bold tracking-normal text-emerald-800">
          Estimated Savings
        </span>
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-lg font-bold text-emerald-900 leading-none">
          {formatAmount(upside.amount)}
        </span>
        <span className="text-[11px] font-semibold text-emerald-700">
          {periodLabel}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-emerald-700/70 font-medium border-t border-emerald-100 pt-1">
        Based on: {upside.basis}
      </p>
    </div>
  );
}
