// apps/frontend/src/components/rooms/RoomHealthScoreRing.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

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

  /** Subtext under rating (default variant only, unless you want it in hero too) */
  sublabel?: string;

  whyTitle?: string;
  whyFactors?: WhyFactor[];

  /** layout preset */
  variant?: Variant;

  /** If true, render ONLY the ring */
  ringOnly?: boolean;

  /** Optional override for rating text */
  ratingOverride?: string;

  /** Animation duration (ms) */
  animateMs?: number;
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

/** Subtle color banding */
function ringToneClass(v: number) {
  // subtle but clear
  if (v >= 75) return 'text-emerald-600';
  if (v >= 50) return 'text-amber-600';
  return 'text-orange-600';
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/** Tween number smoothly using rAF */
function useAnimatedNumber(target: number, durationMs: number) {
  const [animated, setAnimated] = useState(target);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(target);
  const startRef = useRef<number>(0);
  const targetRef = useRef(target);

  useEffect(() => {
    const t = clamp(Number.isFinite(target) ? target : 0);
    targetRef.current = t;

    if (prefersReducedMotion() || durationMs <= 0) {
      fromRef.current = t;
      setAnimated(t);
      return;
    }

    // Start from current displayed value to avoid jumps
    const from = clamp(Number.isFinite(animated) ? animated : 0);
    fromRef.current = from;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const p = clamp(elapsed / durationMs, 0, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (t - from) * eased;

      setAnimated(next);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setAnimated(t);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return animated;
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
  animateMs = 650,
}: Props) {
  const target = clamp(Math.round(Number.isFinite(value) ? value : 0));
  const animatedValue = useAnimatedNumber(target, animateMs);
  const v = clamp(Math.round(animatedValue)); // display int

  const resolvedSize = size ?? (variant === 'hero' ? 190 : 88);
  const resolvedStrokeWidth = strokeWidth ?? (variant === 'hero' ? 18 : 12);

  const r = (resolvedSize - resolvedStrokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  const rating = ratingOverride || computeRating(target);

  // ✅ avoid "At risk" appearing twice (label + rating)
  const showRating = norm(label) !== norm(rating);

  const factors = Array.isArray(whyFactors) ? whyFactors.filter(Boolean) : [];
  const hasWhy = factors.length > 0;

  const valueTextClass =
    variant === 'hero'
      ? 'fill-slate-900 text-[28px] font-bold drop-shadow-[0_2px_4px_rgba(15,23,42,0.18)] dark:fill-slate-100'
      : 'fill-slate-900 text-[18px] font-bold drop-shadow-[0_1px_2px_rgba(15,23,42,0.14)] dark:fill-slate-100';

  const ringClass = useMemo(() => ringToneClass(v), [v]);

  // --- shared SVG ---
  const RingSvg = (
    <svg width={resolvedSize} height={resolvedSize} className="shrink-0">
      <circle
        cx={resolvedSize / 2}
        cy={resolvedSize / 2}
        r={r}
        strokeWidth={resolvedStrokeWidth}
        className="fill-none stroke-slate-300/80 dark:stroke-slate-700/80"
      />
      <circle
        cx={resolvedSize / 2}
        cy={resolvedSize / 2}
        r={r}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        className="fill-none stroke-current"
        style={{
          strokeDasharray: `${dash} ${c - dash}`,
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: prefersReducedMotion() ? undefined : 'stroke-dasharray 650ms ease',
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

  if (ringOnly) {
    return <div className={ringClass}>{RingSvg}</div>;
  }

  return (
    <div className={variant === 'hero' ? 'flex items-center gap-5' : 'flex items-center gap-4'}>
      {/* ring + color */}
      <div className={ringClass}>{RingSvg}</div>

      <div className="min-w-0">
        {/* top row: label + why */}
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>

          {hasWhy && (
            <div className="relative group">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-slate-300/70 bg-white/80 px-2 py-0.5 text-[11px] text-slate-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                aria-label={whyTitle}
              >
                ⓘ Why this score?
              </button>

              <div
                className={[
                  'absolute left-0 top-full mt-2 w-[340px] max-w-[85vw]',
                  'rounded-2xl border border-white/75 bg-white/82 p-3 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.7)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/88',
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
