'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhyThisMattersCardProps {
  children: React.ReactNode;
  assumptions?: string[];
  defaultOpen?: boolean;
  className?: string;
}

export function WhyThisMattersCard({
  children,
  assumptions,
  defaultOpen = false,
  className,
}: WhyThisMattersCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-lg border border-gray-100 bg-gray-50', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span>Why this matters</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <p className="text-[12px] leading-relaxed text-gray-600">{children}</p>
          {assumptions && assumptions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {assumptions.map((assumption, index) => (
                <li key={index} className="flex items-start gap-1.5 text-[11px] text-gray-400">
                  <span className="mt-1 h-1 w-1 rounded-full bg-gray-300 flex-shrink-0" />
                  {assumption}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
