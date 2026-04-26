// apps/frontend/src/components/layout/CtcCommandSearch.tsx
'use client';

import React from 'react';
import { Search, Command } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CtcCommandSearchProps {
  className?: string;
  onOpen?: () => void;
}

export function CtcCommandSearch({ className, onOpen }: CtcCommandSearchProps) {
  const handleClick = () => {
    // TODO: Open command palette when available
    if (onOpen) {
      onOpen();
    } else {
      console.log('Command palette not yet implemented');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex items-center gap-3 w-full max-w-[600px] h-12 px-4 rounded-full",
        "border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300",
        "transition-all duration-200 group cursor-text",
        "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400",
        className
      )}
    >
      <Search className="h-4 w-4 text-slate-400 shrink-0" />
      <span className="flex-1 text-left text-sm text-slate-400 truncate">
        Ask your home anything…
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <kbd className="hidden sm:inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-500">
          <Command className="h-2.5 w-2.5" />
        </kbd>
        <kbd className="hidden sm:inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-500">
          K
        </kbd>
      </div>
    </button>
  );
}
