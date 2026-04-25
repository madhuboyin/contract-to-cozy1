"use client";

import React, { useMemo } from "react";
import { PropertyScoreTrendPoint } from "@/types";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtTick(dateIso: string) {
  const dt = new Date(dateIso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

interface ScoreTrendChartProps {
  points: PropertyScoreTrendPoint[];
  ariaLabel?: string;
}

interface ScoreDeltaIndicatorProps {
  delta: number | null | undefined;
}

export function ScoreDeltaIndicator({ delta }: ScoreDeltaIndicatorProps) {
  if (delta === null || delta === undefined) {
    return (
      <span className="text-xs text-gray-500 inline-flex items-center gap-1">
        <Minus className="h-3 w-3" />
        No weekly change
      </span>
    );
  }

  const isUp = delta > 0;
  const isDown = delta < 0;
  return (
    <span
      className={`text-xs inline-flex items-center gap-1 ${
        isUp ? "text-green-600" : isDown ? "text-red-600" : "text-gray-500"
      }`}
    >
      {isUp ? (
        <TrendingUp className="h-3 w-3" />
      ) : isDown ? (
        <TrendingDown className="h-3 w-3" />
      ) : (
        <Minus className="h-3 w-3" />
      )}
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)} vs last week
    </span>
  );
}

export function ScoreTrendChart({ points, ariaLabel }: ScoreTrendChartProps) {
  const toTime = (weekStart: string) => {
    const t = new Date(weekStart).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const sorted = useMemo(
    () =>
      [...(points || [])].sort(
        (a, b) => toTime(a.weekStart) - toTime(b.weekStart)
      ),
    [points]
  );

  if (sorted.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <div className="text-2xl mb-2">📈</div>
        <p className="text-sm font-medium text-gray-600">Score history will appear here</p>
        <p className="text-xs text-gray-400 mt-1">Check back after your next weekly snapshot</p>
      </div>
    );
  }

  const w = 760;
  const h = 220;
  const padL = 34;
  const padR = 18;
  const padT = 12;
  const padB = 30;

  const all = sorted.map((p) => p.score);
  const rawMin = Math.min(...all, 0);
  const rawMax = Math.max(...all, 100);
  const span = Math.max(1, rawMax - rawMin);
  const minY = clamp(rawMin - Math.max(2, span * 0.1), 0, 100);
  const maxY = clamp(rawMax + Math.max(2, span * 0.1), 0, 100);
  const ySpan = Math.max(1, maxY - minY);

  const xFor = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, sorted.length - 1);
  const yFor = (v: number) => padT + (h - padT - padB) * (1 - (v - minY) / ySpan);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minY + (maxY - minY) * t);
  const xTicks = [
    { idx: 0, label: fmtTick(sorted[0].weekStart) },
    { idx: Math.floor((sorted.length - 1) / 2), label: fmtTick(sorted[Math.floor((sorted.length - 1) / 2)].weekStart) },
    { idx: sorted.length - 1, label: fmtTick(sorted[sorted.length - 1].weekStart) },
  ];

  const path = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.score)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-[220px] text-black/80"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel || "Score trend"}
    >
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="currentColor" strokeOpacity="0.16" />

      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={yFor(v)} x2={w - padR} y2={yFor(v)} stroke="currentColor" strokeOpacity="0.07" />
          <text x={padL - 8} y={yFor(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.45">
            {Math.round(v)}
          </text>
        </g>
      ))}

      <path d={path} fill="none" stroke="currentColor" strokeWidth={3} strokeOpacity="0.85" />

      {sorted.map((p, i) => {
        const isLast = i === sorted.length - 1;
        const dt = new Date(p.weekStart);
        const label = Number.isNaN(dt.getTime()) ? p.weekStart : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return (
          <g key={p.weekStart}>
            <circle cx={xFor(i)} cy={yFor(p.score)} r={isLast ? 4.5 : 3} fill="currentColor" fillOpacity={isLast ? 1 : 0.5}>
              <title>{`Week of ${label} · Score: ${Math.round(p.score)}`}</title>
            </circle>
          </g>
        );
      })}

      {xTicks.map((tick, idx) => (
        <text key={idx} x={xFor(tick.idx)} y={h - 8} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.45">
          {tick.label}
        </text>
      ))}
    </svg>
  );
}
