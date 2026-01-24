// apps/frontend/src/components/rooms/RoomHealthScoreRing.tsx
'use client';

import React from 'react';

type WhyFactor = {
  label: string;
  detail?: string;
  impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
};

type Variant = 'default' | 'hero';

type Props = {
  value: number; // 0..100
  size?: number; // px
  strokeWidth?: number;

  /**
   * Label is the small uppercase line (e.g. "Room health" or "At risk").
   * If label equals the computed rating, we auto-hide the rating line to avoid repetition.
   */
  label?: string;

  /** Subtext under rating (default variant only) */
  sublabel?: string;

  whyTitle?: string;
  whyFactors?: WhyFactor[];

  /** NEW: layout preset */
  variant?: Variant;

  /**
   * NEW: If true, render ONLY the ring (no label/rating/sublabel/tooltip).
   * This is useful when the parent wants full layout control.
   */
  ringOnly?: boolean;

  /**
   * NEW (hero only): override rating text if parent wants (optional)
   * If omitted, we compute from score.
   */
  ratingOverride?: string;
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
  variant = 'default',
  ringOnly = false,
  ratingOverride,
}: Props) {
  const v = clamp(Math.round(value));

  // variant defaults
  const resolvedSize = size ?? (variant === 'hero' ? 170 : 88);
  const resolvedStrokeWidth = strokeWidth ?? (variant === 'hero' ? 16 : 12);

  const r = (resolvedSize - resolvedStrokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  const rating = ratingOverride || computeRating(v);

  // ✅ avoid "At risk" appearing twice (label + rating)
  const showRating = norm(label) !== norm(rating);

  const factors = Array.isArray(whyFactors) ? whyFactors.filter(Boolean) : [];
  const hasWhy = factors.length > 0;

  // HERO default: ring-first and bigger text
  const valueTextClass = variant === 'hero' ? 'fill-black text-[22px] font-semibold' : 'fill-black text-[16px] font-semibold';

  // If parent wants *only* ring, return early
  if (ringOnly) {
    return (
      <svg width={resolvedSize} height={resolvedSize} className="shrink-0">
        <circle
          cx={resolvedSize / 2}
          cy={resolvedSize / 2}
          r={r}
          strokeWidth={resolvedStrokeWidth}
          className="fill-none stroke-black/10"
        />
        <circle
          cx={resolvedSize / 2}
          cy={resolvedSize / 2}
          r={r}
          strokeWidth={resolvedStrokeWidth}
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
          className={valueTextClass}
        >
          {v}
        </text>
      </svg>
    );
  }

  return (
    <div className={variant === 'hero' ? 'flex items-center gap-5' : 'flex items-center gap-4'}>
      <svg width={resolvedSize} height={resolvedSize} className="shrink-0">
        <circle
          cx={resolvedSize / 2}
          cy={resolvedSize / 2}
          r={r}
          strokeWidth={resolvedStrokeWidth}
          className="fill-none stroke-black/10"
        />
        <circle
          cx={resolvedSize / 2}
          cy={resolvedSize / 2}
          r={r}
          strokeWidth={resolvedStrokeWidth}
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
          className={valueTextClass}
        >
          {v}
        </text>
      </svg>

      {/* Default + Hero both can render text, but hero is slightly larger */}
      <div className="min-w-0">
        {/* top row: label + why */}
        <div className="flex items-center gap-2">
          <div className={variant === 'hero' ? 'text-xs uppercase tracking-wide text-gray-500' : 'text-xs uppercase tracking-wide text-gray-500'}>
            {label}
          </div>

          {hasWhy && (
            <div className="relative group">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-black/10"
                aria-label={whyTitle}
              >
                ⓘ Why this score?
              </button>

              <div
                className={[
                  'absolute left-0 top-full mt-2 w-[320px] max-w-[80vw]',
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
                          <div className="font-medium text-gray-900">{f.label}</div>
                          {it && <div className="text-gray-500 whitespace-nowrap">{it}</div>}
                        </div>
                        {f.detail && <div className="mt-0.5 text-gray-600">{f.detail}</div>}
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
          <div className={variant === 'hero' ? 'text-base font-semibold leading-tight' : 'text-sm font-medium leading-tight'}>
            {rating}
          </div>
        ) : null}

        {/* sublabel */}
        {sublabel ? <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div> : null}
      </div>
    </div>
  );
}
