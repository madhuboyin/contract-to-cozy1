'use client';

import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RiskOfDelayBadgeProps {
  riskText: string;
  className?: string;
}

export function RiskOfDelayBadge({ riskText, className }: RiskOfDelayBadgeProps) {
  return (
    <div className={cn(
      "inline-flex flex-col rounded-xl border border-amber-200 bg-amber-50/50 p-2.5",
      className
    )}>
      <div className="flex items-center gap-2 mb-0.5">
        <div className="rounded-full bg-amber-100 p-1">
          <Clock className="h-3.5 w-3.5 text-amber-700" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
          Risk of Delay
        </span>
      </div>
      <div className="mt-1 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm font-semibold text-amber-900 leading-snug">
          {riskText}
        </p>
      </div>
    </div>
  );
}
