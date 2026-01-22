// apps/frontend/src/components/rooms/RoomHealthScoreRing.tsx
'use client';

import React from 'react';

type WhyFactor = {
  label: string;
  detail?: string;
  impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
};

type Props = {
  value: number; // 0..100
  size?: number; // px
  strokeWidth?: number;
  label?: string;
  sublabel?: string;

  // ✅ NEW (optional)
  whyTitle?: string;
  whyFactors?: WhyFactor[];
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function impactText(impact?: WhyFactor['impact']) {
  if (impact === 'POSITIVE') return '↑ helps';
  if (impact === 'NEGATIVE') return '↓ hurts';
  if (impact === 'NEUTRAL') return '• neutral';
  return null;
}

export default function RoomHealthScoreRing({
  value,
  size = 72,
  strokeWidth = 10,
  label = 'Health',
  sublabel,
  whyTitle = 'Why this score?',
  whyFactors,
}: Props) {
  const v = clamp(Math.round(value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  const hasWhy = Array.isArray(whyFactors) && whyFactors.length > 0;

  const rating =
    v >= 85 ? 'Excellent' : v >= 70 ? 'Good' : v >= 50 ? 'Needs attention' : 'At risk';

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
        {/* Label row + hover */}
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>

          {hasWhy && (
            <div className="relative">
              {/* Trigger */}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-black/10"
                aria-label={whyTitle}
              >
                ⓘ Why this score?
              </button>

              {/* Popover (hover/focus) */}
              <div
                className={[
                  // hidden by default
                  'pointer-events-none opacity-0',
                  // show on hover of parent (using :hover + :focus-within)
                  'group-hover:opacity-100 group-hover:pointer-events-auto',
                  'peer-focus:opacity-100 peer-focus:pointer-events-auto',
                ].join(' ')}
              />

              {/* We use a wrapper with group behavior */}
              <div className="group inline-block">
                {/* Invisible hover/focus anchor sits on trigger via layout */}
                <div className="absolute inset-0" />

                <div
                  className={[
                    'absolute left-0 top-full mt-2 w-[320px] max-w-[80vw]',
                    'rounded-2xl border border-black/10 bg-white p-3 shadow-lg',
                    // show/hide
                    'opacity-0 pointer-events-none',
                    'group-hover:opacity-100 group-hover:pointer-events-auto',
                    'group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
                    'transition-opacity duration-150',
                    'z-50',
                  ].join(' ')}
                >
                  <div className="text-sm font-medium">{whyTitle}</div>

                  <div className="mt-2 space-y-2">
                    {whyFactors!.slice(0, 6).map((f, idx) => {
                      const it = impactText(f.impact);
                      return (
                        <div key={idx} className="text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-gray-900">{f.label}</div>
                            {it && <div className="text-gray-500 whitespace-nowrap">{it}</div>}
                          </div>
                          {f.detail && <div className="mt-0.5 text-gray-600">{f.detail}</div>}
                        </div>
                      );
                    })}
                  </div>

                  {whyFactors!.length > 6 && (
                    <div className="mt-2 text-xs text-gray-500">
                      +{whyFactors!.length - 6} more factors
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="text-sm font-medium leading-tight">{rating}</div>
        {sublabel ? <div className="text-xs opacity-60 mt-0.5">{sublabel}</div> : null}
      </div>
    </div>
  );
}
