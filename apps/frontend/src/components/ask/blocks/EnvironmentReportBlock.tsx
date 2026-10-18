import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  Factory,
  Flame,
  Gauge,
  Layers,
  MapPin,
  Mountain,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sprout,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import type { AskGroupedListItemAction, AskPresentationBlock } from '@/features/ask/types';
import { ActionLink } from './context';
import type { AskBlockRendererProps } from './types';

type EnvironmentReportBlockData = Extract<AskPresentationBlock, { type: 'ENVIRONMENT_REPORT' }>;

type DashboardFilter = 'ALL' | 'WEATHER' | 'AIR_DROUGHT' | 'HAZARDS_FLOOD' | 'CLIMATE_HOME';
type WeatherChartMode = 'BOTH' | 'HOURLY' | 'HISTORY';
type FacilityFilter = 'ALL' | 'NONCOMPLIANT' | 'NEARBY';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EPA_PROGRAM_META: Record<string, { label: string; badgeClass: string }> = {
  RCRA: { label: 'RCRA · Hazardous Waste', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80' },
  CWA: { label: 'CWA · Clean Water', badgeClass: 'bg-sky-50 text-sky-800 border-sky-200/80' },
  CAA: { label: 'CAA · Clean Air', badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80' },
  TRI: { label: 'TRI · Toxic Release', badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80' },
  SDWA: { label: 'SDWA · Drinking Water', badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200/80' },
  SEMS: { label: 'Superfund (SEMS)', badgeClass: 'bg-red-50 text-red-800 border-red-200/80' },
};

const DROUGHT_META: Record<'None' | 'D0' | 'D1' | 'D2' | 'D3' | 'D4', {
  label: string;
  short: string;
  barColor: string;
  badgeClass: string;
  level: number;
}> = {
  None: { label: 'No Drought', short: 'None', barColor: '#10b981', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', level: 0 },
  D0: { label: 'Abnormally Dry', short: 'D0 Dry', barColor: '#facc15', badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200', level: 1 },
  D1: { label: 'Moderate Drought', short: 'D1 Mod', barColor: '#f59e0b', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200', level: 2 },
  D2: { label: 'Severe Drought', short: 'D2 Sev', barColor: '#f97316', badgeClass: 'bg-orange-50 text-orange-800 border-orange-200', level: 3 },
  D3: { label: 'Extreme Drought', short: 'D3 Ext', barColor: '#ef4444', badgeClass: 'bg-red-50 text-red-700 border-red-200', level: 4 },
  D4: { label: 'Exceptional Drought', short: 'D4 Exc', barColor: '#881337', badgeClass: 'bg-rose-100 text-rose-900 border-rose-300', level: 5 },
};

function getWeatherMeta(code: number): {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  heroGradient: string;
} {
  if (code === 0) {
    return {
      label: 'Clear Sky',
      Icon: Sun,
      iconColor: 'text-amber-500',
      heroGradient: 'from-sky-500/15 via-blue-500/10 to-amber-400/15',
    };
  }
  if (code === 1 || code === 2) {
    return {
      label: code === 1 ? 'Mainly Clear' : 'Partly Cloudy',
      Icon: CloudSun,
      iconColor: 'text-sky-600',
      heroGradient: 'from-sky-500/15 via-indigo-500/10 to-amber-300/10',
    };
  }
  if (code === 3) {
    return {
      label: 'Overcast',
      Icon: Cloud,
      iconColor: 'text-slate-600',
      heroGradient: 'from-slate-500/15 via-sky-500/10 to-slate-400/10',
    };
  }
  if (code === 45 || code === 48) {
    return {
      label: 'Foggy Conditions',
      Icon: CloudFog,
      iconColor: 'text-slate-500',
      heroGradient: 'from-slate-400/15 via-teal-500/10 to-slate-300/15',
    };
  }
  if (code >= 51 && code <= 57) {
    return {
      label: 'Light Drizzle',
      Icon: CloudDrizzle,
      iconColor: 'text-blue-500',
      heroGradient: 'from-blue-500/15 via-cyan-500/10 to-slate-400/15',
    };
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return {
      label: code >= 80 ? 'Rain Showers' : 'Rain',
      Icon: CloudRain,
      iconColor: 'text-blue-600',
      heroGradient: 'from-blue-600/15 via-indigo-500/10 to-sky-500/15',
    };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return {
      label: 'Snow',
      Icon: CloudSnow,
      iconColor: 'text-cyan-600',
      heroGradient: 'from-cyan-500/15 via-sky-400/10 to-indigo-400/15',
    };
  }
  if (code >= 95) {
    return {
      label: 'Thunderstorm',
      Icon: CloudLightning,
      iconColor: 'text-purple-600',
      heroGradient: 'from-indigo-600/20 via-purple-500/15 to-amber-500/15',
    };
  }
  return {
    label: 'Variable Conditions',
    Icon: CloudSun,
    iconColor: 'text-sky-600',
    heroGradient: 'from-sky-500/15 via-blue-500/10 to-teal-500/10',
  };
}

function getAqiInfo(aqi: number): {
  label: string;
  shortLabel: string;
  colorHex: string;
  badgeClass: string;
  ringClass: string;
  guidance: string;
} {
  if (aqi <= 50) {
    return {
      label: 'Good Air Quality',
      shortLabel: 'Good',
      colorHex: '#10b981',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      ringClass: 'text-emerald-600',
      guidance: 'Ideal for open windows & outdoor projects',
    };
  }
  if (aqi <= 100) {
    return {
      label: 'Moderate Air Quality',
      shortLabel: 'Moderate',
      colorHex: '#f59e0b',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      ringClass: 'text-amber-600',
      guidance: 'Acceptable; sensitive groups monitor outdoor time',
    };
  }
  if (aqi <= 150) {
    return {
      label: 'Unhealthy for Sensitive Groups',
      shortLabel: 'Sensitive Alert',
      colorHex: '#f97316',
      badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
      ringClass: 'text-orange-600',
      guidance: 'Run HVAC recirculation & check MERV filter rating',
    };
  }
  if (aqi <= 200) {
    return {
      label: 'Unhealthy',
      shortLabel: 'Unhealthy',
      colorHex: '#ef4444',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      ringClass: 'text-red-600',
      guidance: 'Keep windows closed and run indoor filtration',
    };
  }
  return {
    label: 'Very Unhealthy / Hazardous',
    shortLabel: 'Hazardous',
    colorHex: '#9333ea',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    ringClass: 'text-purple-600',
    guidance: 'Seal fresh-air intakes and run HEPA filtration',
  };
}

function getFloodRiskInfo(zone: string | null): {
  tier: 'MINIMAL' | 'MODERATE' | 'HIGH' | 'COASTAL' | 'UNKNOWN';
  label: string;
  badgeClass: string;
  scaleIndex: number;
  note: string;
} {
  if (!zone) {
    return {
      tier: 'UNKNOWN',
      label: 'Unmapped',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      scaleIndex: -1,
      note: 'FEMA NFHL layer not reported for parcel',
    };
  }
  const upper = zone.toUpperCase().trim();
  if (upper === 'X' || upper === 'C') {
    return {
      tier: 'MINIMAL',
      label: 'Minimal Flood Hazard',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      scaleIndex: 0,
      note: 'Outside 100- & 500-year FEMA floodplains',
    };
  }
  if (upper.includes('0.2') || upper === 'B' || upper === 'X500') {
    return {
      tier: 'MODERATE',
      label: 'Moderate (500-Yr Zone)',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      scaleIndex: 1,
      note: '0.2% annual chance flood zone',
    };
  }
  if (upper.startsWith('V')) {
    return {
      tier: 'COASTAL',
      label: 'High Coastal Velocity (SFHA)',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      scaleIndex: 3,
      note: '1% annual chance coastal wave velocity zone',
    };
  }
  if (upper.startsWith('A')) {
    return {
      tier: 'HIGH',
      label: 'High Flood Risk (SFHA)',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      scaleIndex: 2,
      note: '1% annual chance Special Flood Hazard Area',
    };
  }
  return {
    tier: 'MODERATE',
    label: `Zone ${upper}`,
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    scaleIndex: 1,
    note: 'Mapped FEMA flood designation',
  };
}

function formatHourShort(isoTime: string): string {
  try {
    const d = new Date(isoTime);
    if (Number.isNaN(d.getTime())) return isoTime.slice(11, 16);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  } catch {
    return '';
  }
}

function formatDayShort(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr.slice(5);
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    return dateStr.slice(5);
  }
}

function formatMonthDay(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr.slice(5);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr.slice(5);
  }
}

function ItemActionButton({
  action,
  entityType,
  entityId,
  onItemAction,
  disabled,
  compact = false,
}: {
  action: AskGroupedListItemAction;
  entityType?: string | null;
  entityId?: string | null;
  onItemAction?: (
    entityType: string | null | undefined,
    entityId: string,
    message: string,
    operationId: string,
    interactionType: AskGroupedListItemAction['interactionType'],
  ) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  if (!onItemAction || !entityId) return null;
  const isPrimary = action.style === 'PRIMARY';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onItemAction(entityType, entityId, action.message, action.operationId, action.interactionType)}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-all disabled: cursor-not-allowed disabled:opacity-50 ${
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      } ${
        isPrimary
          ? 'bg-teal-700 text-white shadow-sm hover:bg-teal-800'
          : 'border border-slate-200/90 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-800'
      }`}
    >
      <Sparkles className="h-3 w-3 shrink-0 opacity-80" />
      <span>{action.label}</span>
    </button>
  );
}

/** Smooth 24-hour temperature SVG curve + rain probability bars */
function HourlyForecastChart({
  hourly,
}: {
  hourly: NonNullable<EnvironmentReportBlockData['sections']['weather']['data']>['hourly'];
}) {
  const slice = useMemo(() => hourly.slice(0, 24), [hourly]);
  if (slice.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-400">
        Hourly curve unavailable
      </div>
    );
  }

  const width = 640;
  const height = 185;
  const padLeft = 28;
  const padRight = 24;
  const padTop = 28;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const temps = slice.map((h) => h.temperatureF);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const rangeT = Math.max(maxT - minT, 6);

  const points = slice.map((item, idx) => {
    const x = padLeft + (idx / Math.max(slice.length - 1, 1)) * plotW;
    const y = padTop + (1 - (item.temperatureF - minT) / rangeT) * plotH;
    return { x, y, ...item };
  });

  const linePath = points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full select-none overflow-visible">
        <defs>
          <linearGradient id="askEnvHourlyTempGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.28" />
            <stop offset="75%" stopColor="#38bdf8" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal subtle guide lines */}
        {[0, 0.5, 1].map((ratio) => {
          const y = padTop + ratio * plotH;
          return (
            <line
              key={ratio}
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}

        {/* Precipitation probability subtle vertical bars at bottom */}
        {points.map((pt, idx) => {
          const prob = Math.max(0, Math.min(100, pt.precipitationProbabilityPercent));
          const barH = (prob / 100) * 26;
          return (
            <g key={`rain-${idx}`}>
              <rect
                x={pt.x - 4}
                y={padTop + plotH - barH}
                width={8}
                height={Math.max(barH, 1.5)}
                rx={2}
                fill={prob >= 50 ? '#3b82f6' : prob >= 25 ? '#60a5fa' : '#cbd5e1'}
                opacity={prob > 0 ? 0.45 : 0.2}
              />
            </g>
          );
        })}

        {/* Area under temperature curve */}
        <path d={areaPath} fill="url(#askEnvHourlyTempGrad)" />

        {/* Temperature curve */}
        <path
          d={linePath}
          fill="none"
          stroke="#0284c7"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Sampled markers & labels every 3 hours */}
        {points.map((pt, idx) => {
          if (idx % 3 !== 0 && idx !== points.length - 1) return null;
          return (
            <g key={`lbl-${idx}`}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={3.5}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth="2"
              />
              <text
                x={pt.x}
                y={pt.y - 8}
                textAnchor="middle"
                className="fill-slate-700 text-[10px] font-semibold"
              >
                {Math.round(pt.temperatureF)}°
              </text>
              {pt.precipitationProbabilityPercent >= 20 && (
                <text
                  x={pt.x}
                  y={padTop + plotH + 13}
                  textAnchor="middle"
                  className="fill-blue-600 text-[9px] font-medium"
                >
                  {Math.round(pt.precipitationProbabilityPercent)}%
                </text>
              )}
              <text
                x={pt.x}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-400 text-[9.5px] font-medium"
              >
                {idx === 0 ? 'Now' : formatHourShort(pt.time)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 30-Day High/Low temperature range band + daily rain bars */
function ThirtyDayHistoryChart({
  history,
}: {
  history: NonNullable<EnvironmentReportBlockData['sections']['weather']['data']>['thirtyDayHistory'];
}) {
  if (history.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-400">
        30-day history unavailable
      </div>
    );
  }

  const width = 640;
  const height = 185;
  const padLeft = 30;
  const padRight = 20;
  const padTop = 22;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allMax = history.map((d) => d.tempMaxF);
  const allMin = history.map((d) => d.tempMinF);
  const minT = Math.min(...allMin);
  const maxT = Math.max(...allMax);
  const rangeT = Math.max(maxT - minT, 10);

  const pts = history.map((d, idx) => {
    const x = padLeft + (idx / Math.max(history.length - 1, 1)) * plotW;
    const yHigh = padTop + (1 - (d.tempMaxF - minT) / rangeT) * plotH;
    const yLow = padTop + (1 - (d.tempMinF - minT) / rangeT) * plotH;
    return { x, yHigh, yLow, ...d };
  });

  const highLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yHigh.toFixed(1)}`).join(' ');
  const lowLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yLow.toFixed(1)}`).join(' ');
  const bandPath = [
    ...pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yHigh.toFixed(1)}`),
    ...[...pts].reverse().map((p) => `L ${p.x.toFixed(1)} ${p.yLow.toFixed(1)}`),
    'Z',
  ].join(' ');

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full select-none overflow-visible">
        <defs>
          <linearGradient id="askEnvHistoryBandGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const y = padTop + ratio * plotH;
          const tempLabel = Math.round(maxT - ratio * rangeT);
          return (
            <g key={ratio}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <text x={4} y={y + 3} className="fill-slate-400 text-[9px] font-medium">
                {tempLabel}°
              </text>
            </g>
          );
        })}

        {/* Daily precipitation bars at bottom */}
        {pts.map((pt, idx) => {
          if (pt.precipitationSumIn <= 0) return null;
          const barH = Math.min(28, Math.max(3, pt.precipitationSumIn * 22));
          return (
            <rect
              key={`precip-${idx}`}
              x={pt.x - 2.5}
              y={padTop + plotH - barH}
              width={5}
              height={barH}
              rx={1.5}
              fill="#3b82f6"
              opacity={0.45}
            />
          );
        })}

        {/* Temperature envelope band */}
        <path d={bandPath} fill="url(#askEnvHistoryBandGrad)" />
        <path d={highLine} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
        <path d={lowLine} fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />

        {/* X-axis date ticks */}
        {pts.map((pt, idx) => {
          if (idx !== 0 && idx !== Math.floor(pts.length / 2) && idx !== pts.length - 1) return null;
          return (
            <text
              key={`dt-${idx}`}
              x={pt.x}
              y={height - 8}
              textAnchor={idx === 0 ? 'start' : idx === pts.length - 1 ? 'end' : 'middle'}
              className="fill-slate-400 text-[9.5px] font-medium"
            >
              {formatMonthDay(pt.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** EPA ECHO Proximity Radar Plot (Property at center, concentric distance rings, facility dots) */
function HazardProximityRadar({
  facilities,
  radiusMiles,
}: {
  facilities: NonNullable<EnvironmentReportBlockData['sections']['hazards']['data']>['facilities'];
  radiusMiles: number;
}) {
  const maxR = Math.max(radiusMiles, 1);
  const size = 210;
  const center = size / 2;
  const outerRadius = 82;

  const plotted = useMemo(() => {
    return facilities.slice(0, 24).map((fac, index) => {
      const dist = fac.distanceMiles != null ? Math.min(fac.distanceMiles, maxR) : (0.25 + ((index * 0.17) % 0.7));
      // Golden-angle distribution so facilities at similar distances spread cleanly around the radar
      const angleRad = (index * 137.508 * Math.PI) / 180;
      const rPx = Math.max(12, (dist / maxR) * outerRadius);
      const x = center + rPx * Math.cos(angleRad);
      const y = center + rPx * Math.sin(angleRad);
      return { ...fac, x, y, dist };
    });
  }, [facilities, maxR, center]);

  return (
    <div className="relative flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-900 to-slate-800 p-3.5 text-white shadow-inner">
      <div className="mb-1 flex w-full items-center justify-between text-[10px] font-medium text-slate-300">
        <span className="inline-flex items-center gap-1">
          <Radio className="h-3 w-3 text-teal-400" />
          EPA Proximity Radar
        </span>
        <span className="rounded-full bg-slate-700/80 px-2 py-0.5 text-[9.5px] text-slate-200">
          {maxR} mi radius
        </span>
      </div>

      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 overflow-visible">
        {/* Radar Sweep Rings */}
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <circle
            key={fraction}
            cx={center}
            cy={center}
            r={outerRadius * fraction}
            fill="none"
            stroke="#334155"
            strokeDasharray={fraction === 1 ? undefined : '2 2'}
            strokeWidth={fraction === 1 ? '1.5' : '1'}
          />
        ))}
        {/* Crosshairs */}
        <line x1={center - outerRadius} y1={center} x2={center + outerRadius} y2={center} stroke="#334155" strokeWidth="0.75" />
        <line x1={center} y1={center - outerRadius} x2={center} y2={center + outerRadius} stroke="#334155" strokeWidth="0.75" />

        {/* Ring distance labels */}
        <text x={center + 3} y={center - outerRadius * 0.5 + 9} className="fill-slate-400 text-[8px]">
          {(maxR * 0.5).toFixed(1)}mi
        </text>
        <text x={center + 3} y={center - outerRadius + 9} className="fill-slate-400 text-[8px]">
          {maxR.toFixed(1)}mi
        </text>

        {/* Plotted Facilities */}
        {plotted.map((fac) => {
          const isViolation = fac.significantNoncompliance;
          const hasPenalty = fac.penaltyCount > 0;
          const fill = isViolation ? '#f43f5e' : hasPenalty ? '#f59e0b' : '#2dd4bf';
          return (
            <g key={fac.registryId}>
              <title>{`${fac.name} (${fac.dist.toFixed(2)} mi)`}</title>
              {isViolation && (
                <circle cx={fac.x} cy={fac.y} r={7} fill="#f43f5e" opacity={0.3} />
              )}
              <circle
                cx={fac.x}
                cy={fac.y}
                r={isViolation ? 4.2 : 3.2}
                fill={fill}
                stroke="#0f172a"
                strokeWidth="1"
              />
            </g>
          );
        })}

        {/* Home center pin */}
        <circle cx={center} cy={center} r={7} fill="#0ea5e9" opacity={0.25} />
        <circle cx={center} cy={center} r={4} fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
      </svg>

      {/* Radar Legend */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-300">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-400 ring-1 ring-white" /> Home
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-teal-400" /> Compliant
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> Penalty
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> Violation
        </span>
      </div>
    </div>
  );
}

/** NOAA 12-Month Seasonal Climate Normals SVG Band Chart */
function ClimateNormalsChart({
  monthly,
}: {
  monthly: NonNullable<
    NonNullable<EnvironmentReportBlockData['sections']['climate']['data']>['normals']['data']
  >['monthly'];
}) {
  const valid = useMemo(
    () => monthly.filter((m) => m.avgHighF != null && m.avgLowF != null),
    [monthly],
  );
  if (valid.length < 6) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-400">
        Monthly climate normals chart unavailable
      </div>
    );
  }

  const width = 560;
  const height = 165;
  const padLeft = 28;
  const padRight = 18;
  const padTop = 22;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const highs = valid.map((m) => m.avgHighF ?? 70);
  const lows = valid.map((m) => m.avgLowF ?? 40);
  const minT = Math.min(...lows);
  const maxT = Math.max(...highs);
  const rangeT = Math.max(maxT - minT, 15);
  const currentMonth = new Date().getMonth() + 1;

  const pts = valid.map((m, idx) => {
    const x = padLeft + (idx / Math.max(valid.length - 1, 1)) * plotW;
    const high = m.avgHighF ?? 70;
    const low = m.avgLowF ?? 40;
    const avg = m.avgTempF ?? (high + low) / 2;
    const yHigh = padTop + (1 - (high - minT) / rangeT) * plotH;
    const yLow = padTop + (1 - (low - minT) / rangeT) * plotH;
    const yAvg = padTop + (1 - (avg - minT) / rangeT) * plotH;
    return { x, yHigh, yLow, yAvg, high, low, avg, month: m.month };
  });

  const bandPath = [
    ...pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yHigh.toFixed(1)}`),
    ...[...pts].reverse().map((p) => `L ${p.x.toFixed(1)} ${p.yLow.toFixed(1)}`),
    'Z',
  ].join(' ');
  const highPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yHigh.toFixed(1)}`).join(' ');
  const lowPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yLow.toFixed(1)}`).join(' ');
  const avgPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yAvg.toFixed(1)}`).join(' ');

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full select-none overflow-visible">
        <defs>
          <linearGradient id="askEnvClimateBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.20" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const y = padTop + ratio * plotH;
          const tVal = Math.round(maxT - ratio * rangeT);
          return (
            <g key={ratio}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={2} y={y + 3} className="fill-slate-400 text-[9px] font-medium">
                {tVal}°
              </text>
            </g>
          );
        })}

        <path d={bandPath} fill="url(#askEnvClimateBand)" />
        <path d={highPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <path d={avgPath} fill="none" stroke="#64748b" strokeWidth="1.25" strokeDasharray="3 3" />
        <path d={lowPath} fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" />

        {pts.map((pt) => {
          const isNow = pt.month === currentMonth;
          return (
            <g key={pt.month}>
              {isNow && (
                <line
                  x1={pt.x}
                  y1={padTop - 6}
                  x2={pt.x}
                  y2={padTop + plotH}
                  stroke="#0d9488"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
              )}
              <circle
                cx={pt.x}
                cy={pt.yHigh}
                r={isNow ? 3.5 : 2.2}
                fill={isNow ? '#d97706' : '#f59e0b'}
              />
              <circle
                cx={pt.x}
                cy={pt.yLow}
                r={isNow ? 3.5 : 2.2}
                fill={isNow ? '#0e7490' : '#0891b2'}
              />
              {(pt.month === 1 || pt.month === 4 || pt.month === 7 || pt.month === 10 || isNow) && (
                <text
                  x={pt.x}
                  y={pt.yHigh - 6}
                  textAnchor="middle"
                  className="fill-amber-700 text-[9px] font-semibold"
                >
                  {Math.round(pt.high)}°
                </text>
              )}
              <text
                x={pt.x}
                y={height - 6}
                textAnchor="middle"
                className={`text-[9.5px] ${isNow ? 'fill-teal-700 font-bold' : 'fill-slate-400 font-medium'}`}
              >
                {MONTH_SHORT[(pt.month - 1) % 12]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function EnvironmentReportBlock({
  block,
  onItemAction,
  itemActionsDisabled,
}: AskBlockRendererProps<EnvironmentReportBlockData>) {
  const [activeTab, setActiveTab] = useState<DashboardFilter>('ALL');
  const [weatherChartMode, setWeatherChartMode] = useState<WeatherChartMode>('BOTH');
  const [facilityFilter, setFacilityFilter] = useState<FacilityFilter>('ALL');

  const { sections, property, insights, preparations, questions, plantAdvisorModules, longTermHazardContext } = block;
  const weatherData = sections.weather.status === 'ok' ? sections.weather.data : undefined;
  const airData = sections.airQuality.status === 'ok' ? sections.airQuality.data : undefined;
  const droughtData = sections.drought.status === 'ok' ? sections.drought.data : undefined;
  const floodData = sections.floodElevation.status === 'ok' ? sections.floodElevation.data : undefined;
  const radonData = sections.radon.status === 'ok' ? sections.radon.data : undefined;
  const hazardsData = sections.hazards.status === 'ok' ? sections.hazards.data : undefined;
  const climateData = sections.climate.status === 'ok' ? sections.climate.data : undefined;
  const normalsData = climateData?.normals.status === 'ok' ? climateData.normals.data : undefined;
  const hardinessData = climateData?.hardinessZone.status === 'ok' ? climateData.hardinessZone.data : undefined;

  const weatherMeta = getWeatherMeta(weatherData?.current.weatherCode ?? 0);
  const WeatherHeroIcon = weatherMeta.Icon;

  const todayForecast = weatherData?.tenDayForecast?.[0];
  const sevenDayForecast = useMemo(
    () => (weatherData?.tenDayForecast ?? []).slice(0, 7),
    [weatherData?.tenDayForecast],
  );
  const weekTempBounds = useMemo(() => {
    if (sevenDayForecast.length === 0) return { min: 40, max: 80 };
    return {
      min: Math.min(...sevenDayForecast.map((d) => d.tempMinF)),
      max: Math.max(...sevenDayForecast.map((d) => d.tempMaxF)),
    };
  }, [sevenDayForecast]);

  const thirtyDayStats = useMemo(() => {
    const hist = weatherData?.thirtyDayHistory ?? [];
    if (hist.length === 0) return null;
    const peakHigh = Math.max(...hist.map((d) => d.tempMaxF));
    const lowestLow = Math.min(...hist.map((d) => d.tempMinF));
    const totalRain = hist.reduce((sum, d) => sum + (d.precipitationSumIn || 0), 0);
    return { peakHigh, lowestLow, totalRain };
  }, [weatherData?.thirtyDayHistory]);

  const aqiInfo = getAqiInfo(airData?.current.aqi ?? 35);
  const floodInfo = getFloodRiskInfo(floodData?.femaFloodZone ?? null);
  const currentDroughtCat = droughtData?.current?.dominantCategory ?? 'None';
  const droughtMeta = DROUGHT_META[currentDroughtCat] ?? DROUGHT_META.None;

  const noncompliantFacilitiesCount = useMemo(
    () => (hazardsData?.facilities ?? []).filter((f) => f.significantNoncompliance).length,
    [hazardsData?.facilities],
  );

  const filteredFacilities = useMemo(() => {
    const list = hazardsData?.facilities ?? [];
    if (facilityFilter === 'NONCOMPLIANT') {
      return list.filter((f) => f.significantNoncompliance || f.penaltyCount > 0);
    }
    if (facilityFilter === 'NEARBY') {
      return list.filter((f) => f.distanceMiles != null && f.distanceMiles <= 0.5);
    }
    return list;
  }, [hazardsData?.facilities, facilityFilter]);

  const showWeather = activeTab === 'ALL' || activeTab === 'WEATHER';
  const showAirDrought = activeTab === 'ALL' || activeTab === 'AIR_DROUGHT';
  const showHazardsFlood = activeTab === 'ALL' || activeTab === 'HAZARDS_FLOOD';
  const showClimateHome = activeTab === 'ALL' || activeTab === 'CLIMATE_HOME';

  return (
    <div className="space-y-4">
      {/* 1. TOP COMMAND HEADER & INTERACTIVE CATEGORY PILLS */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-sky-600 text-white shadow-sm">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-slate-900">
                  {property.name || property.address}
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 ring-1 ring-teal-200/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  Live Environmental Intelligence
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  {property.address}, {property.city}, {property.state} {property.zipCode}
                </span>
                {block.location.countyFips && (
                  <span className="text-slate-400">· FIPS {block.location.countyFips}</span>
                )}
              </p>
            </div>
          </div>

          {block.actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {block.actions.map((action) => (
                <ActionLink key={action.id} action={action} />
              ))}
            </div>
          )}
        </div>

        {/* Interactive Section Switcher */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          {([
            { id: 'ALL', label: 'Complete Dashboard', badge: '7 Sources' },
            {
              id: 'WEATHER',
              label: 'Weather & Forecast',
              badge: weatherData ? `${Math.round(weatherData.current.temperatureF)}°F` : undefined,
            },
            {
              id: 'AIR_DROUGHT',
              label: 'Air Quality & Drought',
              badge: airData ? `AQI ${Math.round(airData.current.aqi)}` : undefined,
            },
            {
              id: 'HAZARDS_FLOOD',
              label: 'Flood, Radon & EPA',
              badge: hazardsData ? `${hazardsData.totalFacilitiesInRadius} EPA` : undefined,
            },
            {
              id: 'CLIMATE_HOME',
              label: 'Climate & Home Impact',
              badge: hardinessData ? `Zone ${hardinessData.zone}` : undefined,
            },
          ] as const).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      active ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. ATMOSPHERIC WEATHER HERO + 4-SIGNAL VITAL STRIP */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 7 cols: Live Weather Hero Card */}
        <div
          className={`relative overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-br ${weatherMeta.heroGradient} bg-white p-5 shadow-sm lg:col-span-7`}
        >
          {weatherData ? (
            <div className="flex h-full flex-col justify-between gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-900 shadow-sm backdrop-blur">
                    <WeatherHeroIcon className={`h-3.5 w-3.5 ${weatherMeta.iconColor}`} />
                    {weatherMeta.label}
                  </span>
                  <div className="mt-3 flex items-baseline gap-3">
                    <span className="text-5xl font-extrabold tracking-tight text-slate-900">
                      {Math.round(weatherData.current.temperatureF)}°F
                    </span>
                    <div className="text-xs font-medium text-slate-600">
                      <div>Feels like {Math.round(weatherData.current.apparentTemperatureF)}°F</div>
                      {todayForecast && (
                        <div className="mt-0.5 font-semibold text-slate-700">
                          H: {Math.round(todayForecast.tempMaxF)}° · L: {Math.round(todayForecast.tempMinF)}°
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Large visual weather badge */}
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/85 shadow-sm ring-1 ring-sky-100 backdrop-blur">
                  <WeatherHeroIcon className={`h-9 w-9 ${weatherMeta.iconColor}`} />
                </div>
              </div>

              {/* 3 Glassmorphic Weather Telemetry Tiles */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <Droplets className="h-3.5 w-3.5 text-sky-500" />
                    Humidity
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">
                    {Math.round(weatherData.current.humidityPercent)}%
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(100, Math.max(5, weatherData.current.humidityPercent))}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <Wind className="h-3.5 w-3.5 text-teal-600" />
                    Wind Speed
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">
                    {weatherData.current.windSpeedMph.toFixed(1)} <span className="text-xs font-medium text-slate-500">mph</span>
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-slate-500">
                    {weatherData.current.windSpeedMph >= 20 ? 'Breezy / Gusty' : 'Light surface wind'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <CloudRain className="h-3.5 w-3.5 text-blue-600" />
                    Precipitation
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">
                    {weatherData.current.precipitationIn.toFixed(2)} <span className="text-xs font-medium text-slate-500">in</span>
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-slate-500">
                    {todayForecast && todayForecast.precipitationSumIn > 0
                      ? `${todayForecast.precipitationSumIn.toFixed(2)} in today`
                      : 'Dry current hour'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-44 flex-col items-center justify-center text-center">
              <Cloud className="h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700">Live Weather Feed Unavailable</p>
              <p className="text-xs text-slate-500">{sections.weather.reason || 'Open-Meteo feed temporarily offline'}</p>
            </div>
          )}
        </div>

        {/* Right 5 cols: 4-Signal Environmental Vital Strip */}
        <div className="grid grid-cols-2 gap-3 lg:col-span-5">
          {/* Tile 1: Air Quality */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Air Quality</span>
              <Gauge className={`h-4 w-4 ${aqiInfo.ringClass}`} />
            </div>
            {airData ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-slate-900">{Math.round(airData.current.aqi)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${aqiInfo.badgeClass}`}>
                    {aqiInfo.shortLabel}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>PM2.5: <strong className="text-slate-700">{airData.current.pm2_5.toFixed(1)}</strong></span>
                  <span>PM10: <strong className="text-slate-700">{airData.current.pm10.toFixed(1)}</strong></span>
                </div>
              </>
            ) : (
              <div className="mt-2 text-xs text-slate-400">Unavailable</div>
            )}
          </div>

          {/* Tile 2: Flood & Elevation */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Flood & Elev</span>
              <Mountain className="h-4 w-4 text-sky-600" />
            </div>
            {floodData ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-slate-900">
                    Zone {floodData.femaFloodZone || 'X'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className={`truncate rounded-full border px-2 py-0.5 text-[10px] font-bold ${floodInfo.badgeClass}`}>
                    {floodInfo.tier === 'MINIMAL' ? 'Minimal Risk' : floodInfo.label}
                  </span>
                  {floodData.elevationFeet != null && (
                    <span className="text-[11px] font-semibold text-slate-600">
                      {Math.round(floodData.elevationFeet)} ft
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-2 text-xs text-slate-400">Unavailable</div>
            )}
          </div>

          {/* Tile 3: Drought Monitor */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Drought</span>
              <Flame className="h-4 w-4 text-amber-500" />
            </div>
            {droughtData ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xl font-extrabold text-slate-900">{droughtMeta.short}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${droughtMeta.badgeClass}`}>
                    {droughtMeta.label}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-2 text-xs text-slate-400">Unavailable</div>
            )}
          </div>

          {/* Tile 4: Radon & Hardiness */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Radon & USDA</span>
              <Sprout className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <div>
                <div className="text-lg font-extrabold text-slate-900">
                  {radonData ? `Zone ${radonData.zone}` : '—'}
                </div>
                <div className="text-[10px] font-medium text-slate-500">
                  {radonData ? `${radonData.zoneDescription} Radon` : 'Radon N/A'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold text-teal-700">
                  {hardinessData ? hardinessData.zone.toUpperCase() : '—'}
                </div>
                <div className="text-[10px] font-medium text-slate-500">Hardiness</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ACTIVE WEATHER SIGNALS, INTERACTIVE CHECKLIST & QUICK HOME CONTEXT */}
      {showClimateHome && (insights.length > 0 || preparations.length > 0 || questions.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Weather Signals & Affected Home Systems */}
          {insights.length > 0 && (
            <div className={`space-y-3 ${preparations.length > 0 || questions.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
              {insights.map((insight) => {
                const isAction = insight.severity === 'action';
                const isWatch = insight.severity === 'watch';
                return (
                  <div
                    key={insight.id}
                    className={`rounded-2xl border p-4 shadow-sm ${
                      isAction
                        ? 'border-rose-200 bg-gradient-to-r from-rose-50/80 via-white to-white'
                        : isWatch
                        ? 'border-amber-200 bg-gradient-to-r from-amber-50/80 via-white to-white'
                        : 'border-sky-200/80 bg-gradient-to-r from-sky-50/60 via-white to-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isAction
                              ? 'bg-rose-600 text-white'
                              : isWatch
                              ? 'bg-amber-500 text-white'
                              : 'bg-sky-600 text-white'
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {isAction ? 'Action Recommended' : isWatch ? 'Weather Watch' : 'Home Advisory'}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {insight.timeframe}
                        </span>
                      </div>

                      {insight.actions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {insight.actions.map((act) => (
                            <ItemActionButton
                              key={act.id}
                              action={act}
                              entityType={insight.entityType}
                              entityId={insight.entityId ?? insight.id}
                              onItemAction={onItemAction}
                              disabled={itemActionsDisabled}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <h4 className="mt-2 text-sm font-bold text-slate-900">{insight.title}</h4>
                    <p className="mt-0.5 text-xs text-slate-600">{insight.homeImplication}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {insight.affectedSystems.map((sys) => (
                        <span
                          key={sys}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                        >
                          <Layers className="h-3 w-3 text-teal-600" />
                          {sys}
                        </span>
                      ))}
                      {insight.recommendedActions.slice(0, 3).map((rec) => (
                        <span
                          key={rec}
                          className="inline-flex items-center gap-1 rounded-md bg-teal-50/80 px-2 py-0.5 text-[11px] font-medium text-teal-800"
                        >
                          <CheckCircle2 className="h-3 w-3 text-teal-600" />
                          {rec}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Right Column: Interactive Preparation Checklist + Home Context Prompts */}
          {(preparations.length > 0 || questions.length > 0) && (
            <div className={`space-y-3 ${insights.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
              {preparations.map((prep) => {
                const pct = prep.progress.total > 0 ? Math.round((prep.progress.resolved / prep.progress.total) * 100) : 0;
                return (
                  <div key={prep.id} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                          Interactive Preparation Checklist
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{prep.title}</h4>
                      </div>
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                        {prep.progress.resolved}/{prep.progress.total} ({pct}%)
                      </span>
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-3 space-y-2">
                      {prep.items.map((item) => {
                        const isDone = item.status === 'COMPLETED';
                        const isSkipped = item.status === 'CANCELED';
                        return (
                          <div
                            key={item.id}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                              isDone
                                ? 'border-emerald-200/70 bg-emerald-50/40 text-slate-600'
                                : isSkipped
                                ? 'border-slate-200/60 bg-slate-50/60 text-slate-400 line-through'
                                : 'border-slate-200/90 bg-white text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-medium">
                              <CheckCircle2
                                className={`h-4 w-4 shrink-0 ${
                                  isDone ? 'text-emerald-600' : isSkipped ? 'text-slate-300' : 'text-slate-300'
                                }`}
                              />
                              <span>{item.label}</span>
                            </div>
                            {item.actions.length > 0 && (
                              <div className="flex items-center gap-1">
                                {item.actions.map((act) => (
                                  <ItemActionButton
                                    key={act.id}
                                    action={act}
                                    entityType={item.entityType}
                                    entityId={item.entityId}
                                    onItemAction={onItemAction}
                                    disabled={itemActionsDisabled}
                                    compact
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {questions.map((q) => (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/70 to-white p-3.5 shadow-sm"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">{q.prompt}</div>
                    <div className="text-[11px] text-slate-600">{q.reason}</div>
                  </div>
                  {q.actions.map((act) => (
                    <ItemActionButton
                      key={act.id}
                      action={act}
                      entityType={q.entityType}
                      entityId={q.entityId ?? q.id}
                      onItemAction={onItemAction}
                      disabled={itemActionsDisabled}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. 7-DAY FORECAST RANGE BARS + 24-HOUR & 30-DAY WEATHER CHARTS */}
      {showWeather && weatherData && (
        <div className="space-y-4">
          {/* 7-Day Forecast Strip with Apple Weather-Style Temperature Range Bars */}
          {sevenDayForecast.length > 0 && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-amber-500" />
                  <h4 className="text-sm font-bold text-slate-900">7-Day Temperature & Precipitation Outlook</h4>
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                  Weekly span: {Math.round(weekTempBounds.min)}°F – {Math.round(weekTempBounds.max)}°F
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
                {sevenDayForecast.map((day, idx) => {
                  const meta = getWeatherMeta(day.weatherCode);
                  const DayIcon = meta.Icon;
                  const span = Math.max(weekTempBounds.max - weekTempBounds.min, 8);
                  const leftPct = Math.max(0, Math.min(85, ((day.tempMinF - weekTempBounds.min) / span) * 100));
                  const widthPct = Math.max(14, Math.min(100 - leftPct, ((day.tempMaxF - day.tempMinF) / span) * 100));

                  return (
                    <div
                      key={day.date}
                      className={`flex flex-col justify-between rounded-xl border p-3 transition-all ${
                        idx === 0
                          ? 'border-sky-200 bg-sky-50/40 shadow-sm'
                          : 'border-slate-200/70 bg-slate-50/40 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{formatDayShort(day.date, idx)}</span>
                        <span className="text-[10px] text-slate-400">{day.date.slice(5)}</span>
                      </div>

                      <div className="my-2.5 flex items-center justify-between">
                        <DayIcon className={`h-6 w-6 ${meta.iconColor}`} />
                        {day.precipitationSumIn > 0 ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            <Droplets className="h-2.5 w-2.5" />
                            {day.precipitationSumIn.toFixed(2)}&quot;
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400">Dry</span>
                        )}
                      </div>

                      {/* Temperature range bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span className="text-slate-500">{Math.round(day.tempMinF)}°</span>
                          <span className="text-slate-900">{Math.round(day.tempMaxF)}°</span>
                        </div>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className="absolute top-0 h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-amber-500"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 24-Hour Curve & 30-Day History Interactive Charts */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-sky-600" />
                <h4 className="text-sm font-bold text-slate-900">Hourly & 30-Day Weather Telemetry</h4>
              </div>

              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                {([
                  { id: 'BOTH', label: 'Side-by-Side' },
                  { id: 'HOURLY', label: '24-Hour Outlook' },
                  { id: 'HISTORY', label: '30-Day History' },
                ] as const).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setWeatherChartMode(mode.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      weatherChartMode === mode.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`grid grid-cols-1 gap-4 ${
                weatherChartMode === 'BOTH' ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
              }`}
            >
              {(weatherChartMode === 'BOTH' || weatherChartMode === 'HOURLY') && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Next 24 Hours (Temp °F & Rain Chance %)</span>
                    <span className="text-[10px] font-medium text-sky-700">Line: Temp · Bars: Rain %</span>
                  </div>
                  <HourlyForecastChart hourly={weatherData.hourly} />
                </div>
              )}

              {(weatherChartMode === 'BOTH' || weatherChartMode === 'HISTORY') && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">Past 30 Days (High/Low Band & Rain)</span>
                    {thirtyDayStats && (
                      <div className="flex items-center gap-2 text-[10px] font-semibold">
                        <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700">
                          Peak {Math.round(thirtyDayStats.peakHigh)}°F
                        </span>
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">
                          Low {Math.round(thirtyDayStats.lowestLow)}°F
                        </span>
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                          Rain {thirtyDayStats.totalRain.toFixed(1)}&quot;
                        </span>
                      </div>
                    )}
                  </div>
                  <ThirtyDayHistoryChart history={weatherData.thirtyDayHistory} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. AIR QUALITY SPECTRUM + U.S. DROUGHT MONITOR 12-WEEK PROGRESSION */}
      {showAirDrought && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Air Quality Spectrum Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600" />
                <h4 className="text-sm font-bold text-slate-900">Air Quality & Particulate Spectrum</h4>
              </div>
              {airData && (
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${aqiInfo.badgeClass}`}>
                  AQI {Math.round(airData.current.aqi)} · {aqiInfo.shortLabel}
                </span>
              )}
            </div>

            {airData ? (
              <div className="mt-3.5 space-y-4">
                {/* EPA 0-300+ Color Spectrum Bar with Live Pin */}
                <div>
                  <div className="mb-1 flex justify-between text-[10px] font-semibold text-slate-400">
                    <span>0 Good</span>
                    <span>50 Mod</span>
                    <span>100 Sens</span>
                    <span>150 Unhealthy</span>
                    <span>200+ Haz</span>
                  </div>
                  <div className="relative h-3 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 via-50% to-rose-600 shadow-inner">
                    <div
                      className="absolute -top-1 h-5 w-2.5 -translate-x-1/2 rounded-full border-2 border-white bg-slate-900 shadow-md"
                      style={{ left: `${Math.min(98, Math.max(2, (airData.current.aqi / 250) * 100))}%` }}
                      title={`Current AQI: ${airData.current.aqi}`}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-600">{aqiInfo.guidance}</p>
                </div>

                {/* PM2.5 and PM10 Concentration Progress Bars */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">Fine Particles (PM2.5)</span>
                      <span className="font-bold text-slate-900">{airData.current.pm2_5.toFixed(1)} µg/m³</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-teal-600"
                        style={{ width: `${Math.min(100, (airData.current.pm2_5 / 35) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">EPA 24h standard: 35 µg/m³</div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">Coarse Dust (PM10)</span>
                      <span className="font-bold text-slate-900">{airData.current.pm10.toFixed(1)} µg/m³</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-600"
                        style={{ width: `${Math.min(100, (airData.current.pm10 / 150) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">EPA 24h standard: 150 µg/m³</div>
                  </div>
                </div>

                {/* Recent Daily AQI Spark Bars */}
                {airData.history.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span>Recent Daily AQI Trend ({airData.history.slice(-14).length} days)</span>
                      <span className="text-[10px] text-slate-400">
                        Peak AQI {Math.round(Math.max(...airData.history.map((h) => h.avgAqi)))}
                      </span>
                    </div>
                    <div className="flex h-12 items-end gap-1 rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                      {airData.history.slice(-14).map((day) => {
                        const hPct = Math.max(15, Math.min(100, (day.avgAqi / 150) * 100));
                        const barColor =
                          day.avgAqi <= 50
                            ? 'bg-emerald-500'
                            : day.avgAqi <= 100
                            ? 'bg-amber-400'
                            : 'bg-orange-500';
                        return (
                          <div key={day.date} className="group relative flex h-full flex-1 items-end">
                            <div
                              className={`w-full rounded-sm ${barColor} transition-all group-hover:opacity-80`}
                              style={{ height: `${hPct}%` }}
                              title={`${day.date}: AQI ${Math.round(day.avgAqi)}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 text-xs text-slate-400">Air quality telemetry unavailable.</div>
            )}
          </div>

          {/* U.S. Drought Monitor Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-bold text-slate-900">U.S. Drought Monitor & Soil Moisture</h4>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${droughtMeta.badgeClass}`}>
                {droughtMeta.label}
              </span>
            </div>

            {droughtData ? (
              <div className="mt-3.5 space-y-4">
                {/* 6-tier Drought Scale Strip */}
                <div className="grid grid-cols-6 gap-1.5">
                  {(['None', 'D0', 'D1', 'D2', 'D3', 'D4'] as const).map((cat) => {
                    const meta = DROUGHT_META[cat];
                    const isCurrent = currentDroughtCat === cat;
                    return (
                      <div
                        key={cat}
                        className={`rounded-lg border p-2 text-center transition-all ${
                          isCurrent
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200/70 bg-slate-50/60 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1 text-[11px] font-bold">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: meta.barColor }}
                          />
                          {cat}
                        </div>
                        <div className={`mt-0.5 truncate text-[9px] ${isCurrent ? 'text-slate-200' : 'text-slate-400'}`}>
                          {cat === 'None' ? 'Normal' : meta.label.replace(' Drought', '')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 12-Week Drought Progression Visual Timeline */}
                {droughtData.history.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span>12-Week County Drought Progression</span>
                      <span className="text-[10px] text-slate-400">USDM Weekly Snapshots</span>
                    </div>
                    <div className="flex h-16 items-end gap-1.5 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                      {droughtData.history.slice(0, 12).reverse().map((wk) => {
                        const meta = DROUGHT_META[wk.dominantCategory] ?? DROUGHT_META.None;
                        const heightPct = Math.max(22, ((meta.level + 1) / 6) * 100);
                        return (
                          <div key={wk.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                            <div
                              className="w-full rounded-t-sm transition-all"
                              style={{ height: `${heightPct}%`, backgroundColor: meta.barColor }}
                              title={`Week of ${wk.date}: ${meta.label}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600">
                  <strong className="text-slate-800">Foundation & Landscaping Note:</strong>{' '}
                  {currentDroughtCat === 'None'
                    ? 'Soil moisture is within normal seasonal bounds—no drought-induced foundation shrinkage risk.'
                    : 'Elevated dryness can cause expansive clay soil contraction around perimeter footings and stress turf/shrubs.'}
                </div>
              </div>
            ) : (
              <div className="mt-4 text-xs text-slate-400">Drought monitor data unavailable.</div>
            )}
          </div>
        </div>
      )}

      {/* 6. FLOOD & ELEVATION SCALE + EPA RADON 3-TIER METER + EPA ECHO RADAR */}
      {showHazardsFlood && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* FEMA Flood Zone & USGS Elevation Visual Scale */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mountain className="h-4 w-4 text-sky-600" />
                  <h4 className="text-sm font-bold text-slate-900">FEMA Flood Hazard & USGS Topographic Elevation</h4>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${floodInfo.badgeClass}`}>
                  {floodInfo.label}
                </span>
              </div>

              {floodData ? (
                <div className="mt-3.5 space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        FEMA NFHL Zone
                      </span>
                      <div className="mt-1 text-2xl font-extrabold text-slate-900">
                        Zone {floodData.femaFloodZone || 'X'}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
                        {floodData.femaZoneSubtype || floodInfo.note}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        USGS 3DEP Elevation
                      </span>
                      <div className="mt-1 text-2xl font-extrabold text-slate-900">
                        {floodData.elevationFeet != null ? `${Math.round(floodData.elevationFeet)} ft` : '—'}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">Above mean sea level (NAVD88)</div>
                    </div>
                  </div>

                  {/* 4-Tier Flood Risk Scale */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Zone X / C', sub: 'Minimal Risk', idx: 0, activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-900' },
                      { label: '0.2% Annual', sub: '500-Yr Moderate', idx: 1, activeClass: 'border-amber-500 bg-amber-50 text-amber-900' },
                      { label: 'Zone A / AE', sub: '100-Yr High SFHA', idx: 2, activeClass: 'border-red-500 bg-red-50 text-red-900' },
                      { label: 'Zone V / VE', sub: 'Coastal Wave', idx: 3, activeClass: 'border-rose-600 bg-rose-50 text-rose-900' },
                    ].map((tier) => {
                      const active = floodInfo.scaleIndex === tier.idx;
                      return (
                        <div
                          key={tier.label}
                          className={`rounded-xl border p-2 text-center ${
                            active
                              ? `${tier.activeClass} ring-1 ring-current`
                              : 'border-slate-200/70 bg-slate-50/40 text-slate-400'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{tier.label}</div>
                          <div className="text-[9.5px]">{tier.sub}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-xs text-slate-400">Flood & elevation data unavailable.</div>
              )}
            </div>

            {/* EPA Radon Potential 3-Tier Meter */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  <h4 className="text-sm font-bold text-slate-900">EPA Indoor Radon Potential</h4>
                </div>
                {radonData && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      radonData.zone === 1
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : radonData.zone === 2
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    EPA Zone {radonData.zone} · {radonData.zoneDescription}
                  </span>
                )}
              </div>

              {radonData ? (
                <div className="mt-3.5 space-y-3.5">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      {
                        zone: 1,
                        title: 'Zone 1 · High',
                        range: '> 4.0 pCi/L',
                        activeClass: 'border-red-500 bg-red-50 text-red-900',
                      },
                      {
                        zone: 2,
                        title: 'Zone 2 · Moderate',
                        range: '2.0 – 4.0 pCi/L',
                        activeClass: 'border-amber-500 bg-amber-50 text-amber-900',
                      },
                      {
                        zone: 3,
                        title: 'Zone 3 · Low',
                        range: '< 2.0 pCi/L',
                        activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-900',
                      },
                    ] as const).map((tier) => {
                      const active = radonData.zone === tier.zone;
                      return (
                        <div
                          key={tier.zone}
                          className={`rounded-xl border p-3 text-center transition-all ${
                            active
                              ? `${tier.activeClass} shadow-sm ring-1 ring-current`
                              : 'border-slate-200/70 bg-slate-50/40 text-slate-400'
                          }`}
                        >
                          <div className="text-xs font-extrabold">{tier.title}</div>
                          <div className="mt-0.5 text-[11px] font-semibold">{tier.range}</div>
                          {active && (
                            <div className="mt-1.5 inline-block rounded-full bg-white/80 px-2 py-0.5 text-[9.5px] font-bold">
                              Your County
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs">
                    <span className="text-slate-600">
                      Mapped Area:{' '}
                      <strong className="text-slate-900">
                        {[radonData.countyName, radonData.stateName].filter(Boolean).join(', ') || property.state}
                      </strong>
                    </span>
                    <span className="text-[11px] font-semibold text-teal-700">
                      EPA Action Threshold: 4.0 pCi/L
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-xs text-slate-400">EPA Radon zone mapping unavailable.</div>
              )}
            </div>
          </div>

          {/* EPA ECHO Regulated Facilities Radar + Interactive Explorer */}
          {hazardsData && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-slate-700" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      EPA ECHO Nearby Regulated Facilities ({hazardsData.searchRadiusMiles}-Mile Radius)
                    </h4>
                  </div>
                </div>

                {/* Filter buttons */}
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  {([
                    { id: 'ALL', label: `All (${hazardsData.facilities.length})` },
                    { id: 'NONCOMPLIANT', label: `Alerts (${noncompliantFacilitiesCount})` },
                    { id: 'NEARBY', label: 'Within 0.5 mi' },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFacilityFilter(tab.id)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                        facilityFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3 KPI Strip + Radar + Facility Grid */}
              <div className="mt-3.5 grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Left 4 cols: Proximity Radar + 3 KPI Pills */}
                <div className="space-y-3 lg:col-span-4">
                  <HazardProximityRadar
                    facilities={hazardsData.facilities}
                    radiusMiles={hazardsData.searchRadiusMiles}
                  />
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2">
                      <div className="text-lg font-extrabold text-slate-900">
                        {hazardsData.totalFacilitiesInRadius}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500">Tracked Sites</div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2">
                      <div
                        className={`text-lg font-extrabold ${
                          noncompliantFacilitiesCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {noncompliantFacilitiesCount}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500">Violations</div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2">
                      <div className="text-lg font-extrabold text-slate-900">
                        {hazardsData.totalPenaltiesInRadius || '$0'}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500">Penalties</div>
                    </div>
                  </div>
                </div>

                {/* Right 8 cols: Compact Visual Facility Cards */}
                <div className="lg:col-span-8">
                  {filteredFacilities.length > 0 ? (
                    <div className="grid max-h-[320px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                      {filteredFacilities.slice(0, 12).map((fac) => {
                        const isViolation = fac.significantNoncompliance;
                        return (
                          <div
                            key={fac.registryId}
                            className={`flex flex-col justify-between rounded-xl border p-3 transition-all ${
                              isViolation
                                ? 'border-rose-200 bg-rose-50/30'
                                : 'border-slate-200/80 bg-slate-50/40 hover:bg-white'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <h5 className="line-clamp-1 text-xs font-bold text-slate-900" title={fac.name}>
                                  {fac.name}
                                </h5>
                                {fac.distanceMiles != null && (
                                  <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">
                                    {fac.distanceMiles.toFixed(2)} mi
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">{fac.address}</p>

                              {/* EPA Program Chips */}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(fac.programs.length > 0 ? fac.programs : ['EPA Registered']).map((prog) => {
                                  const meta = EPA_PROGRAM_META[prog];
                                  return (
                                    <span
                                      key={prog}
                                      className={`rounded border px-1.5 py-0.5 text-[9.5px] font-semibold ${
                                        meta ? meta.badgeClass : 'border-slate-200 bg-white text-slate-600'
                                      }`}
                                    >
                                      {meta ? meta.label : prog}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px]">
                              <span
                                className={`inline-flex items-center gap-1 font-bold ${
                                  isViolation ? 'text-rose-700' : 'text-emerald-700'
                                }`}
                              >
                                {isViolation ? (
                                  <>
                                    <ShieldAlert className="h-3 w-3" /> Significant Noncompliance
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" /> No Active Violation
                                  </>
                                )}
                              </span>
                              <span className="text-slate-400">
                                {fac.inspectionCount} insp · {fac.penaltyCount} pen
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 text-xs text-slate-500">
                      No facilities match the selected filter within {hazardsData.searchRadiusMiles} mile.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. CLIMATE NORMALS (1991-2020) + USDA HARDINESS + PLANT & HAZARD REPLAY */}
      {showClimateHome && (
        <div className="space-y-4">
          {(normalsData || hardinessData) && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-teal-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    NOAA 30-Year Seasonal Climate Normals & USDA Hardiness
                  </h4>
                </div>
                {normalsData && (
                  <span className="text-[11px] font-medium text-slate-500">
                    Station: {normalsData.stationName}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Left 4 cols: Hardiness Badge + HDD/CDD Balance */}
                <div className="flex flex-col justify-between gap-3 lg:col-span-4">
                  <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        USDA Plant Hardiness
                      </span>
                      <Sprout className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-emerald-950">
                        Zone {hardinessData?.zone?.toUpperCase() || '—'}
                      </span>
                    </div>
                    {hardinessData?.temperatureRangeF && (
                      <div className="mt-1 text-xs font-medium text-emerald-800">
                        Avg Annual Extreme Minimum: <strong>{hardinessData.temperatureRangeF}</strong>
                      </div>
                    )}
                  </div>

                  {normalsData && (
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Annual HVAC Load Balance (Degree Days)
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs font-medium text-sky-700">Heating (HDD)</div>
                          <div className="text-lg font-extrabold text-slate-900">
                            {normalsData.annualHeatingDegreeDays?.toLocaleString() ?? '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-amber-700">Cooling (CDD)</div>
                          <div className="text-lg font-extrabold text-slate-900">
                            {normalsData.annualCoolingDegreeDays?.toLocaleString() ?? '—'}
                          </div>
                        </div>
                      </div>
                      {normalsData.annualHeatingDegreeDays != null &&
                        normalsData.annualCoolingDegreeDays != null && (
                          <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full bg-sky-500"
                              style={{
                                width: `${Math.round(
                                  (normalsData.annualHeatingDegreeDays /
                                    Math.max(
                                      1,
                                      normalsData.annualHeatingDegreeDays + normalsData.annualCoolingDegreeDays,
                                    )) *
                                    100,
                                )}%`,
                              }}
                              title="Heating Degree Days Share"
                            />
                            <div className="h-full flex-1 bg-amber-500" title="Cooling Degree Days Share" />
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Right 8 cols: 12-Month Temperature Normals SVG Band Chart */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5 lg:col-span-8">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Monthly Average High & Low Envelope (Jan – Dec)
                    </span>
                    <span className="text-[10px] font-semibold text-teal-700">
                      Dashed vertical line = Current Month
                    </span>
                  </div>
                  {normalsData ? (
                    <ClimateNormalsChart monthly={normalsData.monthly} />
                  ) : (
                    <div className="flex h-36 items-center justify-center text-xs text-slate-400">
                      NOAA station monthly normals unavailable
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Plant Care Modules & Long-Term Hazard Replay Strip */}
          {(plantAdvisorModules.length > 0 ||
            (longTermHazardContext &&
              (longTermHazardContext.hazards.length > 0 || longTermHazardContext.emptyState))) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {plantAdvisorModules.map((mod) => (
                <div
                  key={mod.id}
                  className="flex flex-col justify-between rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        <Sprout className="h-3 w-3" />
                        Plant Weather Shield · {mod.trigger.replace('_', ' ')}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-slate-900">{mod.title}</h4>
                    <p className="mt-1 text-xs text-slate-600">{mod.summary}</p>
                    {(mod.plantNames.length > 0 || mod.roomNames.length > 0) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {mod.plantNames.map((p) => (
                          <span
                            key={p}
                            className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                          >
                            {p}
                          </span>
                        ))}
                        {mod.roomNames.map((r) => (
                          <span
                            key={r}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {mod.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-emerald-100 pt-2.5">
                      {mod.actions.map((act) => (
                        <ItemActionButton
                          key={act.id}
                          action={act}
                          entityType="PROPERTY"
                          entityId={mod.id}
                          onItemAction={onItemAction}
                          disabled={itemActionsDisabled}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {longTermHazardContext && (
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        <ShieldAlert className="h-3 w-3 text-teal-600" />
                        Historical Hazard Replay
                      </span>
                      {longTermHazardContext.checkedThrough && (
                        <span className="text-[10px] text-slate-400">
                          Checked through {longTermHazardContext.checkedThrough.slice(0, 10)}
                        </span>
                      )}
                    </div>

                    {longTermHazardContext.hazards.length > 0 ? (
                      <div className="mt-2.5 space-y-2">
                        {longTermHazardContext.hazards.slice(0, 3).map((haz) => (
                          <div
                            key={haz.propertyMatchId}
                            className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-900">{haz.title}</span>
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                {haz.hazardLabel}
                              </span>
                            </div>
                            {haz.factualSummary && (
                              <p className="mt-0.5 text-[11px] text-slate-600">{haz.factualSummary}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 text-xs text-emerald-900">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>
                          {longTermHazardContext.emptyState ||
                            'No historical severe hazard replay matches recorded for this property.'}
                        </span>
                      </div>
                    )}
                  </div>

                  {longTermHazardContext.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
                      {longTermHazardContext.actions.map((act) => (
                        <ItemActionButton
                          key={act.id}
                          action={act}
                          entityType="PROPERTY"
                          entityId={block.id}
                          onItemAction={onItemAction}
                          disabled={itemActionsDisabled}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
