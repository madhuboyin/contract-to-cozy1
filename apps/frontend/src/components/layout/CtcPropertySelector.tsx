// apps/frontend/src/components/layout/CtcPropertySelector.tsx
'use client';

import React from 'react';
import { Home, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CtcPropertySelectorProps {
  propertyAddress?: string;
  className?: string;
  onClick?: () => void;
}

export function CtcPropertySelector({ 
  propertyAddress = 'Main Home', 
  className,
  onClick 
}: CtcPropertySelectorProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 h-12 px-4 rounded-lg",
        "border border-slate-200 bg-slate-50/50 hover:bg-slate-50",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400",
        className
      )}
    >
      <Home className="h-4 w-4 text-slate-600 shrink-0" />
      <span className="text-sm font-medium text-slate-700 truncate max-w-[140px]">
        {propertyAddress}
      </span>
      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
    </button>
  );
}
