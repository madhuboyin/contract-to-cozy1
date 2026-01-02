// components/orchestration/ConfidenceBar.tsx
'use client';

import React from 'react';

type Props = {
  score: number; // 0 → 100 (already a percentage from backend)
  level: 'HIGH' | 'MEDIUM' | 'LOW';
};

export const ConfidenceBar: React.FC<Props> = ({ score, level }) => {
  if (
    score === undefined ||
    score === null ||
    Number.isNaN(score)
  ) {
    return (
      <div className="text-xs text-muted-foreground">
        Confidence unavailable
      </div>
    );
  }
  
  // 🔑 FIX: Score is already 0-100, don't multiply by 100
  const percent = Math.round(score);

  const color =
    level === 'HIGH'
      ? 'bg-green-600'
      : level === 'MEDIUM'
      ? 'bg-amber-500'
      : 'bg-red-600';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Confidence</span>
        <span>{percent}%</span>
      </div>

      <div className="h-2 rounded bg-gray-200 overflow-hidden">
        <div
          className={`h-full ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};