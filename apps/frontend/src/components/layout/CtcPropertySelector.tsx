// apps/frontend/src/components/layout/CtcPropertySelector.tsx
'use client';

import React from 'react';
import { Home, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CtcPropertySelectorProps {
  propertyName?: string;
  className?: string;
  onClick?: () => void;
}

export function CtcPropertySelector({ 
  propertyName = 'Main Home', 
  className,
  onClick 
}: CtcPropertySelectorProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 h-9 px-3 rounded-lg",
        "border border-slate-200 bg-white hover:bg-slate-50",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400",
        className
      )}
    >
      <Home className="h-4 w-4 text-slate-600 shrink-0" />
      <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]">
        {propertyName}
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    </button>
  );
}
