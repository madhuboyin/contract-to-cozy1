// apps/frontend/src/components/rooms/RoomHealthScoreRing.tsx
'use client';

import React from 'react';

type Props = {
  value: number; // 0..100
  size?: number; // px
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export default function RoomHealthScoreRing({
  value,
  size = 72,
  strokeWidth = 10,
  label = 'Health',
  sublabel,
}: Props) {
  const v = clamp(Math.round(value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
          className="fill-none stroke-black/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="fill-none stroke-black"
          style={{
            strokeDasharray: `${dash} ${c - dash}`,
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: 'stroke-dasharray 500ms ease',
          }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          className="fill-black text-[14px] font-semibold"
        >
          {v}
        </text>
      </svg>

      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
        <div className="text-sm font-medium leading-tight">
          {v >= 85 ? 'Excellent' : v >= 70 ? 'Good' : v >= 50 ? 'Needs attention' : 'At risk'}
        </div>
        {sublabel ? <div className="text-xs opacity-60 mt-0.5">{sublabel}</div> : null}
      </div>
    </div>
  );
}
