'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  FileText,
  HelpCircle,
  PackagePlus,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';

import { getScoreColorHex, getStatusColor, getStatusLabel } from './roomVisuals';

type Tip = {
  id: string;
  title: string;
  description?: string;
  ctaLabel: string;
};

type RoomIntelligenceCardProps = {
  healthScore: number;
  itemCount: number;
  docCount: number;
  gapCount: number;
  scoreHistory: number[];
  tips: Tip[];
  onTipAction: (tip: Tip) => void;
  onScrollToItems: () => void;
  onOpenAddDocument: () => void;
  onScrollToGaps: () => void;
};

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(target);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      setValue(Math.round(next));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [duration, target]);

  return value;
}

function generateRoomSummary(itemCount: number, docCount: number, gapCount: number): string {
  if (gapCount > 0 && docCount === 0) {
    return `${itemCount} items tracked, no documents attached, ${gapCount} coverage gap${gapCount === 1 ? '' : 's'}: incomplete protection.`;
  }
  if (gapCount === 0 && docCount === 0) {
    return `${itemCount} items tracked with no coverage gaps, but no documents attached yet.`;
  }
  if (gapCount === 0 && docCount > 0) {
    return `Room is well documented with ${docCount} file${docCount === 1 ? '' : 's'} and ${itemCount} covered item${itemCount === 1 ? '' : 's'}.`;
  }
  return `${itemCount} items tracked - ${gapCount} need attention.`;
}

function tipPriority(title: string): number {
  const normalized = title.toLowerCase();
  if (normalized.includes('coverage gap') || normalized.includes('fix coverage gaps')) return 1;
  if (normalized.includes('attach at least one document') || normalized.includes('document')) return 2;
  if (normalized.includes('add a few more items') || normalized.includes('add items')) return 3;
  return 4;
}

function tipVisual(title: string): {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
} {
  const normalized = title.toLowerCase();

  if (normalized.includes('coverage gap')) {
    return {
      Icon: AlertTriangle,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
    };
  }

  if (normalized.includes('document')) {
    return {
      Icon: FileText,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
    };
  }

  if (normalized.includes('appliance')) {
    return {
      Icon: Wrench,
      iconBg: 'bg-sky-100',
      iconColor: 'text-sky-600',
    };
  }

  return {
    Icon: PackagePlus,
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
  };
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 96;
  const height = 32;
  const inset = 2;

  const safeValues = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const spread = Math.max(1, max - min);

  const points = safeValues
    .map((value, index) => {
      const x = inset + (index * (width - inset * 2)) / (safeValues.length - 1);
      const y = inset + (height - inset * 2) * (1 - (value - min) / spread);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function RoomIntelligenceCard({
  healthScore,
  itemCount,
  docCount,
  gapCount,
  scoreHistory,
  tips,
  onTipAction,
  onScrollToItems,
  onOpenAddDocument,
  onScrollToGaps,
}: RoomIntelligenceCardProps) {
  const scoreColor = getScoreColorHex(healthScore);
  const statusLabel = getStatusLabel(healthScore);
  const statusColor = getStatusColor(healthScore);

  const sortedTips = useMemo(
    () => [...tips].sort((a, b) => tipPriority(a.title) - tipPriority(b.title)),
    [tips],
  );
  const topPriorityTip = sortedTips[0] ?? null;

  const hasTrendData = scoreHistory.length > 1;
  const chartData = hasTrendData ? scoreHistory : new Array(12).fill(healthScore);
  const weeklyDelta = useMemo(() => {
    if (!hasTrendData) return null;
    const last = scoreHistory[scoreHistory.length - 1] ?? healthScore;
    const baselineIndex = Math.max(0, scoreHistory.length - 8);
    const baseline = scoreHistory[baselineIndex] ?? last;
    return Math.round(last - baseline);
  }, [hasTrendData, scoreHistory, healthScore]);

  const animatedItemCount = useCountUp(itemCount);
  const animatedDocCount = useCountUp(docCount);
  const animatedGapCount = useCountUp(gapCount);
  const animatedDelta = useCountUp(weeklyDelta ?? 0);

  const priorityBg = healthScore < 40 ? 'bg-red-50/40' : healthScore <= 65 ? 'bg-amber-50/40' : 'bg-emerald-50/30';

  return (
    <section className="w-full max-w-none overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.04]">
      <div className="grid grid-cols-1 divide-y divide-gray-100 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        <div className="p-5 lg:col-span-3">
          <div className="flex items-start gap-5">
            <div className="relative flex-shrink-0">
              <div className="h-[120px] w-[120px]">
                <CircularProgressbar
                  value={healthScore}
                  text={`${Math.round(healthScore)}`}
                  strokeWidth={9}
                  styles={buildStyles({
                    textSize: '26px',
                    textColor: '#111827',
                    pathColor: scoreColor,
                    trailColor: '#e5e7eb',
                    pathTransitionDuration: 0.8,
                  })}
                />
              </div>

              <div className={`mt-2 text-center text-xs font-bold uppercase tracking-wider ${statusColor}`}>{statusLabel}</div>
            </div>

            <div className="flex-1 pt-1">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Room Health</h2>
                <button type="button" className="text-gray-400 transition-colors hover:text-gray-600" aria-label="Room health details">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>

              <p className="text-sm leading-relaxed text-gray-600">{generateRoomSummary(itemCount, docCount, gapCount)}</p>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400">30-day trend</span>
                <div className="h-8 w-24">
                  <Sparkline values={chartData} color={scoreColor} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-5 lg:col-span-2 ${priorityBg}`}>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Top Priority</p>

          {topPriorityTip ? (
            <div className="space-y-2.5">
              {sortedTips.slice(0, 3).map((tip, index) => {
                const { Icon, iconBg, iconColor } = tipVisual(tip.title);

                if (index === 0) {
                  return (
                    <div key={tip.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="mb-3 flex items-start gap-3">
                        <div className={`mt-0.5 flex-shrink-0 rounded-lg p-1.5 ${iconBg}`}>
                          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800">{tip.title}</p>
                          {tip.description ? <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{tip.description}</p> : null}
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-gray-400" />
                      </div>

                      <button
                        type="button"
                        onClick={() => onTipAction(tip)}
                        className="w-full rounded-lg bg-teal-600 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-teal-700"
                      >
                        {tip.ctaLabel} {'->'}
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={tip.id}
                    type="button"
                    onClick={() => onTipAction(tip)}
                    className="flex w-full items-start gap-3 rounded-xl p-3 text-left opacity-75 transition-all duration-150 hover:bg-gray-50 hover:opacity-100"
                  >
                    <div className={`mt-0.5 flex-shrink-0 rounded-lg p-1.5 ${iconBg}`}>
                      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800">{tip.title}</p>
                      {tip.description ? <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{tip.description}</p> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-20 flex-col items-center justify-center gap-1.5">
              <CheckCircle className="h-6 w-6 text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-700">All clear!</p>
              <p className="text-xs text-gray-400">No urgent actions needed</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y border-t border-gray-100 bg-gray-50/50 sm:grid-cols-4 sm:divide-y-0">
        <button
          type="button"
          onClick={onScrollToItems}
          className="p-4 text-center transition-colors hover:bg-gray-50"
        >
          <p className="text-2xl font-display font-bold text-gray-900">{animatedItemCount}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">Items</p>
        </button>

        <button
          type="button"
          onClick={docCount === 0 ? onOpenAddDocument : onScrollToItems}
          className={`group p-4 text-center transition-colors ${docCount === 0 ? 'hover:bg-amber-50' : 'hover:bg-gray-50'}`}
        >
          <p className={`text-2xl font-display font-bold ${docCount === 0 ? 'text-amber-500' : 'text-gray-900'}`}>{animatedDocCount}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">Documents</p>
          {docCount === 0 ? (
            <p className="mt-1 text-[10px] text-amber-500 opacity-0 transition-opacity group-hover:opacity-100">{'Add docs ->'}</p>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onScrollToGaps}
          className={`group p-4 text-center transition-colors ${gapCount > 0 ? 'hover:bg-red-50' : 'hover:bg-gray-50'}`}
        >
          <p className={`text-2xl font-display font-bold ${gapCount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{animatedGapCount}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">Coverage Gaps</p>
          {gapCount > 0 ? (
            <p className="mt-1 text-[10px] text-red-500 opacity-0 transition-opacity group-hover:opacity-100">{'Review ->'}</p>
          ) : null}
        </button>

        <div className="p-4 text-center">
          {weeklyDelta !== null && weeklyDelta !== undefined ? (
            <p
              className={`text-2xl font-display font-bold ${
                weeklyDelta > 0 ? 'text-emerald-600' : weeklyDelta < 0 ? 'text-red-500' : 'text-gray-400'
              }`}
            >
              {weeklyDelta > 0 ? `+${animatedDelta}` : weeklyDelta === 0 ? '0' : animatedDelta}
            </p>
          ) : (
            <>
              <p className="text-lg font-display font-bold text-gray-300">—</p>
              <p className="mt-0.5 text-[9px] text-gray-300">No data yet</p>
            </>
          )}
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">Weekly Change</p>
        </div>
      </div>
    </section>
  );
}
