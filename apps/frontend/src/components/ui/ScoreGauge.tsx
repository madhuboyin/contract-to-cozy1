'use client';

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CircularProgressbarWithChildren, buildStyles } from 'react-circular-progressbar';

export interface ScoreGaugeProps {
  value: number;
  label: string;
  sublabel: string;
  prefix?: string;
  animate?: boolean;
  size?: 'sm' | 'md' | 'lg';
  displayValue?: string;
  tooltipText?: string;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function useCountUp(target: number, duration = 800, enabled = true) {
  const [count, setCount] = React.useState(enabled ? 0 : target);

  React.useEffect(() => {
    if (!enabled) {
      setCount(target);
      return;
    }

    const start = performance.now();
    const from = 0;
    const to = target;
    let raf = 0;

    const frame = (ts: number) => {
      const elapsed = ts - start;
      const t = clamp(elapsed / duration, 0, 1);
      // easeInOutQuad
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const next = Math.round(from + (to - from) * eased);
      setCount(next);
      if (t < 1) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration, enabled, target]);

  return count;
}

function gaugeColorClass(value: number) {
  if (value >= 80) return 'text-emerald-500';
  if (value >= 60) return 'text-teal-500';
  if (value >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function gaugePathColor(value: number) {
  if (value >= 80) return '#10b981';
  if (value >= 60) return '#14b8a6';
  if (value >= 40) return '#f59e0b';
  return '#ef4444';
}

function sublabelColorClass(value: number) {
  if (value >= 80) return 'text-emerald-600';
  if (value >= 60) return 'text-teal-600';
  if (value >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function defaultTooltip(label: string) {
  if (label.toLowerCase() === 'health') {
    return 'Health score measures how well-maintained your home is across all tracked items.';
  }
  if (label.toLowerCase() === 'risk') {
    return 'Risk score estimates your current exposure based on asset condition, coverage, and local risk factors.';
  }
  if (label.toLowerCase() === 'financial') {
    return 'Financial score reflects expected cost efficiency based on projected maintenance and risk trends.';
  }
  return `${label} score is based on your latest property data.`;
}

function centerFontSize(size: 'sm' | 'md' | 'lg', display: string) {
  const compact = display.replace(/[^\da-zA-Z]/g, '');
  const length = compact.length;

  if (size === 'lg') {
    if (length >= 8) return 22;
    if (length >= 6) return 28;
    if (length >= 4) return 34;
    return 42;
  }

  if (size === 'md') {
    if (length >= 8) return 16;
    if (length >= 6) return 20;
    if (length >= 4) return 24;
    return 30;
  }

  if (length >= 6) return 14;
  if (length >= 4) return 16;
  return 20;
}

export default function ScoreGauge({
  value,
  label,
  sublabel,
  prefix,
  animate = true,
  size = 'md',
  displayValue,
  tooltipText,
}: ScoreGaugeProps) {
  const safeValue = clamp(Number.isFinite(value) ? value : 0);
  const animatedValue = useCountUp(safeValue, 800, animate);
  const renderedValue = animate ? animatedValue : safeValue;

  const sizeMap = {
    sm: 60,
    md: 88,
    lg: 110,
  } as const;
  const px = sizeMap[size];

  const display =
    displayValue ??
    `${prefix ?? ''}${Math.round(renderedValue).toLocaleString()}`;
  const displayFontSize = centerFontSize(size, display);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-[44px] flex-col items-center rounded-lg px-2 py-1 text-center"
          >
            <div
              className={`relative ${gaugeColorClass(safeValue)}`}
              style={{ width: px, height: px }}
            >
              <CircularProgressbarWithChildren
                value={renderedValue}
                strokeWidth={8}
                styles={buildStyles({
                  pathColor: gaugePathColor(safeValue),
                  trailColor: '#e5e7eb',
                  strokeLinecap: 'round',
                })}
              >
                <span
                  className="max-w-[84%] truncate text-center font-display font-bold leading-none tracking-tight text-gray-900"
                  style={{ fontSize: `${displayFontSize}px` }}
                  title={display}
                >
                  {display}
                </span>
              </CircularProgressbarWithChildren>
            </div>
            <span className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {label}
            </span>
            <span className={`text-sm ${sublabelColorClass(safeValue)}`}>{sublabel}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left">
          {tooltipText || defaultTooltip(label)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
