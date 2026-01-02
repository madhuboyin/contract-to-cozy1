// components/orchestration/ConfidencePopover.tsx
'use client';

import React from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

type Props = {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number; // 0 → 100 (already a percentage from backend)
  explanation?: string[];
};

export const ConfidencePopover: React.FC<Props> = ({
  level,
  score,
  explanation = [],
}) => {
  // 🔑 FIX: Score is already 0-100, don't multiply by 100
  const percent = Math.round(score);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-900"
        >
          <Info className="h-3.5 w-3.5" />
          How is this calculated?
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 text-sm space-y-3">
        <div>
          <div className="font-semibold text-gray-900">
            Confidence: {level}
          </div>
          <div className="text-xs text-muted-foreground">
            Score: {percent}%
          </div>
        </div>

        {explanation.length > 0 ? (
          <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">
            {explanation.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-muted-foreground">
            This confidence is derived from risk severity, asset age,
            exposure, scheduling status, and suppression rules.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};