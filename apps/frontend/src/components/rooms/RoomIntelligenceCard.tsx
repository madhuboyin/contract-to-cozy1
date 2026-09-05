'use client';

import 'react-circular-progressbar/dist/styles.css';
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
  healthScore: number | null;
  evaluationState: 'NOT_STARTED' | 'INSUFFICIENT_DATA' | 'SCORED';
  itemCount: number;
  docCount: number;
  gapCount: number;
  valueCount: number;
  scoreHistory: number[];
  tips: Tip[];
  onTipAction: (tip: Tip) => void;
  onScrollToItems: () => void;
  onOpenAddDocument: () => void;
  onScrollToGaps: () => void;
  onAddFirstItem: () => void;
  onEditProfile: () => void;
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

export default function RoomIntelligenceCard({
  healthScore,
  evaluationState,
  itemCount,
  docCount,
  gapCount,
  valueCount,
  scoreHistory,
  tips,
  onTipAction,
  onScrollToItems,
  onOpenAddDocument,
  onScrollToGaps,
  onAddFirstItem,
  onEditProfile,
}: RoomIntelligenceCardProps) {
  const numericScore = healthScore ?? 0;
  const scoreColor = getScoreColorHex(numericScore);
  const statusLabel = getStatusLabel(numericScore);
  const statusColor = getStatusColor(numericScore);

  const topPriorityTip = tips[0] ?? null;
  const completenessPercent = useMemo(() => {
    const score = (itemCount > 0 ? 33 : 0) + (docCount > 0 ? 33 : 0) + (valueCount > 0 ? 34 : 0);
    return Math.max(0, Math.min(100, score));
  }, [docCount, itemCount, valueCount]);

  const hasTrendData = scoreHistory.length > 1;
  const weeklyDelta = useMemo(() => {
    if (!hasTrendData) return null;
    const last = scoreHistory[scoreHistory.length - 1] ?? numericScore;
    const baselineIndex = Math.max(0, scoreHistory.length - 8);
    const baseline = scoreHistory[baselineIndex] ?? last;
    return Math.round(last - baseline);
  }, [hasTrendData, scoreHistory, numericScore]);

  const animatedItemCount = useCountUp(itemCount);
  const animatedDocCount = useCountUp(docCount);
  const animatedGapCount = useCountUp(gapCount);
  const animatedDelta = useCountUp(weeklyDelta ?? 0);

  if (evaluationState !== 'SCORED' || healthScore === null) {
    const hasSomeContext = evaluationState === 'INSUFFICIENT_DATA';

    return (
      <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <PackagePlus className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                {hasSomeContext ? 'More information needed' : 'Room setup'}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                {hasSomeContext ? 'Add an item to calculate room readiness' : 'Room setup not started'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {hasSomeContext
                  ? 'You have started describing this room, but there is not enough inventory information for a meaningful score yet.'
                  : 'No items or room details have been added yet. Add what is in this room or complete its profile to begin personalized tracking.'}
              </p>
              <p className="mt-2 text-xs text-slate-500">A readiness score will appear after there is something meaningful to evaluate.</p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[210px]">
            <button
              type="button"
              onClick={onAddFirstItem}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
            >
              Add first item
            </button>
            <button
              type="button"
              onClick={onEditProfile}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {hasSomeContext ? 'Review room profile' : 'Complete room profile'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x border-t border-slate-100 bg-slate-50/70">
          <div className="p-4 text-center">
            <p className="text-xl font-semibold text-slate-900">{itemCount}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Items</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xl font-semibold text-slate-400">—</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Coverage status</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xl font-semibold text-slate-400">—</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Trend</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="grid grid-cols-1 divide-y divide-gray-100 lg:grid-cols-[minmax(230px,0.9fr)_minmax(0,1.35fr)_minmax(270px,1fr)] lg:divide-x lg:divide-y-0">
        <div className="flex items-center gap-4 p-5">
          <div className="h-20 w-20 flex-shrink-0">
            <CircularProgressbar
              value={numericScore}
              text={`${Math.round(numericScore)}`}
              strokeWidth={9}
              styles={buildStyles({
                textSize: '28px',
                textColor: '#111827',
                pathColor: scoreColor,
                trailColor: '#e5e7eb',
                pathTransitionDuration: 0.8,
              })}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-gray-900">Room health</h2>
              <button type="button" className="text-gray-400 transition-colors hover:text-gray-600" aria-label="Room health details">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className={`mt-1 text-xs font-semibold ${statusColor}`}>{statusLabel}</p>
            <p className="mt-1 text-xs text-gray-500">
              {hasTrendData
                ? `${weeklyDelta && weeklyDelta > 0 ? '+' : ''}${animatedDelta} recent change`
                : 'Trend after another scan'}
            </p>
          </div>
        </div>

        <div className="p-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Top priority</p>

          {topPriorityTip ? (
            <button
              type="button"
              onClick={() => onTipAction(topPriorityTip)}
              className="group flex w-full items-center gap-3 rounded-xl bg-black/[0.02] p-3 text-left transition-colors hover:bg-black/[0.04]"
            >
              {(() => {
                const { Icon, iconBg, iconColor } = tipVisual(topPriorityTip.title);
                return (
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </span>
                );
              })()}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{topPriorityTip.title}</span>
                {topPriorityTip.description ? (
                  <span className="mt-0.5 line-clamp-1 block text-xs text-gray-500">{topPriorityTip.description}</span>
                ) : null}
                <span className="mt-1 block text-xs font-semibold text-teal-700">{topPriorityTip.ctaLabel}</span>
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">All clear</p>
                <p className="text-xs text-emerald-700">No urgent actions</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-black/[0.02] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Room completeness</p>
            <p className="text-sm font-bold text-teal-700">{completenessPercent}%</p>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-label="Room completeness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completenessPercent}
          >
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${completenessPercent}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <button type="button" onClick={onScrollToItems} className="rounded-lg bg-white px-2 py-1.5 text-center hover:bg-gray-50">
              <span className="block text-sm font-bold text-gray-900">{animatedItemCount}</span>
              <span className="text-[10px] text-gray-500">Items</span>
            </button>
            <button type="button" onClick={docCount === 0 ? onOpenAddDocument : onScrollToItems} className="rounded-lg bg-white px-2 py-1.5 text-center hover:bg-gray-50">
              <span className={`block text-sm font-bold ${docCount === 0 ? 'text-amber-600' : 'text-gray-900'}`}>{animatedDocCount}</span>
              <span className="text-[10px] text-gray-500">Docs</span>
            </button>
            <button type="button" onClick={onScrollToGaps} className="rounded-lg bg-white px-2 py-1.5 text-center hover:bg-gray-50">
              <span className={`block text-sm font-bold ${gapCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{animatedGapCount}</span>
              <span className="text-[10px] text-gray-500">Gaps</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
