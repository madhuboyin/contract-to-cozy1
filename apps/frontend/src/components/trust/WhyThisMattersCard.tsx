'use client';

import React, { useState } from 'react';
import { Info, ChevronDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhyThisMattersCardProps {
  explanation: string;
  assumptions?: string[];
  className?: string;
  defaultExpanded?: boolean;
}

export function WhyThisMattersCard({ 
  explanation, 
  assumptions, 
  className, 
  defaultExpanded = false 
}: WhyThisMattersCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn(
      "rounded-xl border border-teal-100 bg-teal-50/30 overflow-hidden transition-all duration-200",
      className
    )}>
      <button 
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-start justify-between p-3.5 text-left group"
      >
        <div className="flex gap-2.5">
          <Info className="h-4 w-4 text-teal-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
          <p className="text-sm font-semibold text-teal-900 leading-snug">
            Why this matters
          </p>
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 text-teal-400 transition-transform duration-200",
          isExpanded ? "rotate-180" : ""
        )} />
      </button>

      {isExpanded && (
        <div className="px-3.5 pb-4 space-y-3 border-t border-teal-100/50 pt-3">
          <p className="text-sm text-teal-800 leading-relaxed">
            {explanation}
          </p>
          
          {assumptions && assumptions.length > 0 && (
            <div className="space-y-2 mt-2">
              <p className="text-[10px] font-bold tracking-normal text-teal-600/70">
                Verifiable Assumptions:
              </p>
              <ul className="space-y-1.5">
                {assumptions.map((assumption, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-teal-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-teal-400 mt-0.5 shrink-0" />
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
