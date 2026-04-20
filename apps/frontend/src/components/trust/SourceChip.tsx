'use client';

import React from 'react';
import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourceChipProps {
  source: string;
  className?: string;
}

export function SourceChip({ source, className }: SourceChipProps) {
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-lg bg-slate-100/60 px-2 py-1 text-[11px] font-medium text-slate-500 border border-slate-200/50",
      className
    )}>
      <Database className="h-3 w-3 opacity-60" />
      <span className="truncate max-w-[200px]">{source}</span>
    </div>
  );
}
