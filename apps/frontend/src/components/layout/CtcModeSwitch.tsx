// apps/frontend/src/components/layout/CtcModeSwitch.tsx
'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CTC_MODES, getActiveModeFromPath, type CtcMode } from '@/lib/navigation/ctcModeRoutes';

interface CtcModeSwitchProps {
  propertyId?: string;
  className?: string;
}

export function CtcModeSwitch({ propertyId, className }: CtcModeSwitchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const activeMode = getActiveModeFromPath(pathname || '');

  const handleModeClick = (mode: CtcMode) => {
    const config = CTC_MODES.find(m => m.key === mode);
    if (config) {
      router.push(config.getHref(propertyId));
    }
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 h-9 p-1 rounded-lg",
        "border border-slate-200 bg-slate-50/50",
        className
      )}
    >
      {CTC_MODES.map((mode) => {
        const isActive = activeMode === mode.key;
        return (
          <button
            key={mode.key}
            type="button"
            onClick={() => handleModeClick(mode.key)}
            className={cn(
              "px-3 h-7 rounded-md text-sm font-medium transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-teal-500/20",
              isActive
                ? "bg-teal-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white"
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
