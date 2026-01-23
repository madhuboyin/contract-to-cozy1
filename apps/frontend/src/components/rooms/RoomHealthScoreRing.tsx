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

  /**
   * Label is the small uppercase line (e.g. "Room health" or "At risk").
   * If label equals the computed rating, we auto-hide the rating line to avoid repetition.
   */
  label?: string;

  /** Subtext under rating */
  sublabel?: string;

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

function computeRating(v: number) {
  return v >= 85 ? 'Excellent' : v >= 70 ? 'Good' : v >= 50 ? 'Needs attention' : 'At risk';
}

function norm(s?: string) {
  return String(s || '').trim().toLowerCase();
}

export default function RoomHealthScoreRing({
  value,
  size = 88,
  strokeWidth = 12,
  label = 'Room health',
  sublabel,
  whyTitle = 'Why this score?',
  whyFactors,
}: Props) {
  const v = clamp(Math.round(value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  const rating = computeRating(v);

  // ✅ avoid "At risk" appearing twice (label + rating)
  const showRating = norm(label) !== norm(rating);

  const factors = Array.isArray(whyFactors) ? whyFactors.filter(Boolean) : [];
  const hasWhy = factors.length > 0;

  return (
    <div className="flex items-center gap-4">
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
          className="fill-black text-[16px] font-semibold"
        >
          {v}
        </text>
      </svg>

      <div className="min-w-0">
        {/* top row: label + why */}
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>

          {hasWhy && (
            <div className="relative inline-flex group">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-black/10"
                aria-label={whyTitle}
              >
                ⓘ {whyTitle}
              </button>

              {/* Tooltip / Popover */}
              <div
                className={[
                  // mobile: show below
                  'absolute left-0 top-full mt-2',
                  // desktop: prefer to the right of the button
                  'md:left-full md:top-1/2 md:mt-0 md:ml-2 md:-translate-y-1/2',
                  'w-[320px] max-w-[calc(100vw-2rem)]',
                  'rounded-2xl border border-black/10 bg-white p-3 shadow-lg',
                  'opacity-0 pointer-events-none',
                  'group-hover:opacity-100 group-hover:pointer-events-auto',
                  'group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
                  'transition-opacity duration-150',
                  'z-50',
                ].join(' ')}
              >
                <div className="text-sm font-medium">{whyTitle}</div>

                <div className="mt-2 space-y-2">
                  {factors.slice(0, 6).map((f, idx) => {
                    const it = impactText(f.impact);
                    return (
                      <div key={idx} className="text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-gray-900">{f.label || 'Factor'}</div>
                          {it && <div className="text-gray-500 whitespace-nowrap">{it}</div>}
                        </div>
                        {f.detail ? (
                          <div className="mt-0.5 text-gray-600">{f.detail}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {factors.length > 6 && (
                  <div className="mt-2 text-xs text-gray-500">+{factors.length - 6} more factors</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* rating line */}
        {showRating ? (
          <div className="text-sm font-medium leading-tight">{rating}</div>
        ) : null}

        {/* sublabel */}
        {sublabel ? <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div> : null}
      </div>
    </div>
  );
}
