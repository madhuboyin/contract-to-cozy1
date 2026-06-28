// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/CapitalTimelineClient.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  Thermometer,
  Droplets,
  Zap,
  Home,
  Wrench,
  HelpCircle,
  Pencil,
  BadgeCheck,
  AlertCircle,
  DollarSign,
  Clock,
} from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import {
  getLatestTimeline,
  runTimeline,
  listOverrides,
  createOverride,
  updateOverride,
  deleteOverride,
  TimelineAnalysisDTO,
  TimelineItemDTO,
  OverrideDTO,
  ConfidenceFactor,
} from './capitalTimelineApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileActionRow } from '@/components/mobile/dashboard/MobilePrimitives';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

// ─── Helpers ────────────────────────────────────────────────────────
function money(cents: number | null | undefined) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function yearFromDate(iso: string) {
  return new Date(iso).getFullYear();
}

function windowLabel(item: TimelineItemDTO) {
  const s = yearFromDate(item.windowStart);
  const e = yearFromDate(item.windowEnd);
  return s === e ? String(s) : `${s} – ${e}`;
}

function categoryIcon(cat: string) {
  switch (cat) {
    case 'ROOF':
    case 'EXTERIOR':
    case 'FOUNDATION':
      return <Home className="h-5 w-5" />;
    case 'HVAC':
      return <Thermometer className="h-5 w-5" />;
    case 'WATER_HEATER':
    case 'PLUMBING':
      return <Droplets className="h-5 w-5" />;
    case 'ELECTRICAL':
      return <Zap className="h-5 w-5" />;
    case 'APPLIANCE':
      return <Wrench className="h-5 w-5" />;
    default:
      return <HelpCircle className="h-5 w-5" />;
  }
}

function categoryLabel(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventTypeBadge(eventType: string) {
  const base = 'text-xs font-medium px-2.5 py-1 rounded-full border shadow-sm backdrop-blur';
  switch (eventType) {
    case 'REPLACE':
      return <span className={`${base} border-red-200/70 bg-red-50/85 text-red-700`}>Replace</span>;
    case 'MAJOR_REPAIR':
      return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-700`}>Major Repair</span>;
    case 'INSPECTION':
      return <span className={`${base} border-blue-200/70 bg-blue-50/85 text-blue-700`}>Inspection</span>;
    default:
      return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>{eventType}</span>;
  }
}

function priorityBadge(priority: string) {
  const base = 'text-xs font-medium px-2.5 py-1 rounded-full border shadow-sm backdrop-blur';
  switch (priority) {
    case 'HIGH':
      return <span className={`${base} border-red-200/70 bg-red-100/80 text-red-800`}>High Priority</span>;
    case 'MEDIUM':
      return <span className={`${base} border-amber-200/70 bg-amber-100/80 text-amber-800`}>Medium</span>;
    case 'LOW':
      return <span className={`${base} border-emerald-200/70 bg-emerald-100/80 text-emerald-800`}>Low</span>;
    default:
      return null;
  }
}

function confidenceBadge(c: string) {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
  if (c === 'HIGH') return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium confidence</span>;
  return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>Low confidence</span>;
}

function userDataBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-teal-200/70 bg-teal-50/85 px-2.5 py-1 text-xs font-medium text-teal-700 shadow-sm backdrop-blur dark:border-teal-700/70 dark:bg-teal-900/55 dark:text-teal-300">
      <BadgeCheck className="h-3 w-3" />
      Your data
    </span>
  );
}

function mapTimelineCategoryToRadarCategory(category: string): string {
  switch (category) {
    case 'HVAC':       return 'HVAC';
    case 'WATER_HEATER': return 'WATER_HEATER';
    case 'PLUMBING':   return 'PLUMBING';
    case 'ELECTRICAL': return 'ELECTRICAL';
    case 'ROOF':
    case 'EXTERIOR':   return 'ROOFING';
    case 'FOUNDATION': return 'FOUNDATION';
    case 'APPLIANCE':  return 'APPLIANCE_REPLACEMENT';
    default:           return 'GENERAL_HANDYMAN';
  }
}

// ─── Override form ───────────────────────────────────────────────────
type EditFormValues = {
  plannedYear: string;
  plannedMonth: string;
  costMin: string;
  costMax: string;
  yearsRemaining: string;
  skipItem: boolean;
};

function buildFormFromOverrides(overrides: OverrideDTO[]): EditFormValues {
  const pd = overrides.find(o => o.type === 'PLANNED_DATE');
  const co = overrides.find(o => o.type === 'COST_OVERRIDE');
  const rl = overrides.find(o => o.type === 'ADJUST_REMAINING_LIFE');
  const di = overrides.find(o => o.type === 'DISABLE_ITEM');

  let plannedYear = '';
  let plannedMonth = '';
  if (pd?.payload?.date) {
    const d = new Date(pd.payload.date as string);
    plannedYear = d.getFullYear().toString();
    plannedMonth = (d.getMonth() + 1).toString();
  }

  return {
    plannedYear,
    plannedMonth,
    costMin: co?.payload?.minCents != null
      ? Math.round((co.payload.minCents as number) / 100).toString()
      : '',
    costMax: co?.payload?.maxCents != null
      ? Math.round((co.payload.maxCents as number) / 100).toString()
      : '',
    yearsRemaining: rl?.payload?.remainingYears != null
      ? (rl.payload.remainingYears as number).toString()
      : '',
    skipItem: !!di,
  };
}

async function persistOverrides(
  propertyId: string,
  inventoryItemId: string,
  form: EditFormValues,
  existing: OverrideDTO[],
) {
  const ops: Promise<unknown>[] = [];

  // PLANNED_DATE
  const existingPD = existing.find(o => o.type === 'PLANNED_DATE');
  if (form.plannedYear.trim()) {
    const yr = parseInt(form.plannedYear.trim(), 10);
    const mo = parseInt(form.plannedMonth || '6', 10);
    const date = new Date(yr, mo - 1, 1).toISOString();
    if (existingPD) {
      ops.push(updateOverride(propertyId, existingPD.id, { payload: { date } }));
    } else {
      ops.push(createOverride(propertyId, { inventoryItemId, type: 'PLANNED_DATE', payload: { date }, note: null }));
    }
  } else if (existingPD) {
    ops.push(deleteOverride(propertyId, existingPD.id));
  }

  // COST_OVERRIDE
  const existingCO = existing.find(o => o.type === 'COST_OVERRIDE');
  const minCents = form.costMin.trim() ? Math.round(parseFloat(form.costMin) * 100) : null;
  const maxCents = form.costMax.trim() ? Math.round(parseFloat(form.costMax) * 100) : null;
  if (minCents != null || maxCents != null) {
    const payload: Record<string, number> = {};
    if (minCents != null) payload.minCents = minCents;
    if (maxCents != null) payload.maxCents = maxCents;
    if (existingCO) {
      ops.push(updateOverride(propertyId, existingCO.id, { payload }));
    } else {
      ops.push(createOverride(propertyId, { inventoryItemId, type: 'COST_OVERRIDE', payload, note: null }));
    }
  } else if (existingCO) {
    ops.push(deleteOverride(propertyId, existingCO.id));
  }

  // ADJUST_REMAINING_LIFE — only applies when no planned date is set
  const existingARL = existing.find(o => o.type === 'ADJUST_REMAINING_LIFE');
  if (form.yearsRemaining.trim() && !form.plannedYear.trim()) {
    const remainingYears = parseFloat(form.yearsRemaining.trim());
    if (!isNaN(remainingYears) && remainingYears >= 0) {
      if (existingARL) {
        ops.push(updateOverride(propertyId, existingARL.id, { payload: { remainingYears } }));
      } else {
        ops.push(createOverride(propertyId, { inventoryItemId, type: 'ADJUST_REMAINING_LIFE', payload: { remainingYears }, note: null }));
      }
    }
  } else if (existingARL) {
    ops.push(deleteOverride(propertyId, existingARL.id));
  }

  // DISABLE_ITEM
  const existingDI = existing.find(o => o.type === 'DISABLE_ITEM');
  if (form.skipItem && !existingDI) {
    ops.push(createOverride(propertyId, { inventoryItemId, type: 'DISABLE_ITEM', payload: {}, note: null }));
  } else if (!form.skipItem && existingDI) {
    ops.push(deleteOverride(propertyId, existingDI.id));
  }

  await Promise.all(ops);
}

// ─── Timeline Chart ──────────────────────────────────────────────────
function TimelineChart({
  items,
  horizonYears,
}: {
  items: TimelineItemDTO[];
  horizonYears: number;
}) {
  if (items.length === 0) return null;

  const now = new Date();
  const chartStartYear = now.getFullYear();
  const chartEndYear = chartStartYear + horizonYears;
  const chartStart = new Date(chartStartYear, 0, 1);
  const chartEnd = new Date(chartEndYear, 0, 1);
  const totalMs = chartEnd.getTime() - chartStart.getTime();
  const years = Array.from({ length: horizonYears }, (_, i) => chartStartYear + i);

  function toPct(date: Date): number {
    return Math.max(0, Math.min(100, ((date.getTime() - chartStart.getTime()) / totalMs) * 100));
  }

  const todayPct = toPct(now);

  function barBg(priority: string) {
    if (priority === 'HIGH') return 'bg-red-400/80 border-red-300/80';
    if (priority === 'MEDIUM') return 'bg-amber-400/80 border-amber-300/80';
    return 'bg-emerald-400/80 border-emerald-300/80';
  }
  function barText(priority: string) {
    if (priority === 'HIGH') return 'text-red-950 dark:text-red-900';
    if (priority === 'MEDIUM') return 'text-amber-950 dark:text-amber-900';
    return 'text-emerald-950 dark:text-emerald-900';
  }

  // Prorate each item's mid-cost across the years it spans
  const yearCosts = new Map<number, number>();
  for (const item of items) {
    if (item.estimatedCostMinCents == null || item.estimatedCostMaxCents == null) continue;
    const midCost = (item.estimatedCostMinCents + item.estimatedCostMaxCents) / 2;
    const startYr = new Date(item.windowStart).getFullYear();
    const endYr = new Date(item.windowEnd).getFullYear();
    const span = Math.max(1, endYr - startYr + 1);
    for (let yr = startYr; yr <= endYr; yr++) {
      if (yr >= chartStartYear && yr < chartEndYear) {
        yearCosts.set(yr, (yearCosts.get(yr) ?? 0) + midCost / span);
      }
    }
  }

  const maxYearCost = yearCosts.size > 0 ? Math.max(...yearCosts.values()) : 0;
  const colPct = 100 / horizonYears;
  const minWidth = Math.max(480, horizonYears * 90);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div style={{ minWidth: `${minWidth}px` }}>

        {/* Year header */}
        <div className="relative flex border-b border-slate-200/60 pb-2 dark:border-slate-700/40">
          {years.map((yr) => (
            <div
              key={yr}
              style={{ width: `${colPct}%` }}
              className="text-center text-xs font-medium text-slate-400 dark:text-slate-500"
            >
              {yr}
            </div>
          ))}
        </div>

        {/* Bars + grid */}
        <div className="relative pb-1 pt-5">

          {/* Grid column lines */}
          {years.map((_, i) => (
            <div
              key={i}
              className="absolute bottom-0 top-0 border-l border-slate-100/80 dark:border-slate-800/50"
              style={{ left: `${(i / horizonYears) * 100}%` }}
            />
          ))}

          {/* Today marker */}
          {todayPct > 0.5 && todayPct < 99 && (
            <div
              className="absolute bottom-0 top-0 z-10 border-l-2 border-teal-500/80 dark:border-teal-400/70"
              style={{ left: `${todayPct}%` }}
            >
              <span className="absolute left-1.5 top-0 whitespace-nowrap text-[10px] font-semibold leading-tight text-teal-600 dark:text-teal-400">
                Today
              </span>
            </div>
          )}

          {/* Item bars */}
          <div className="space-y-1.5">
            {items.map((item) => {
              const startPct = toPct(new Date(item.windowStart));
              const endPct = toPct(new Date(item.windowEnd));
              const widthPct = Math.max(1.5, endPct - startPct);
              const name = item.inventoryItem?.name || categoryLabel(item.category);
              const isNarrow = widthPct < 7;

              return (
                <div key={item.id} className="relative h-7">
                  <div
                    className={`absolute top-0.5 h-6 rounded-full border ${barBg(item.priority)} flex items-center overflow-hidden transition-opacity hover:opacity-80`}
                    style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                    title={`${name} · ${windowLabel(item)} · ${money(item.estimatedCostMinCents)} – ${money(item.estimatedCostMaxCents)}`}
                  >
                    {!isNarrow && (
                      <span className={`truncate px-2.5 text-xs font-medium ${barText(item.priority)}`}>
                        {name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Annual cost row */}
        <div className="flex border-t border-slate-200/60 pt-2 dark:border-slate-700/40">
          {years.map((yr) => {
            const cost = yearCosts.get(yr);
            const isHeaviest = cost != null && maxYearCost > 0 && cost / maxYearCost >= 0.9;
            return (
              <div
                key={yr}
                style={{ width: `${colPct}%` }}
                className={`text-center text-xs ${
                  cost
                    ? isHeaviest
                      ? 'font-bold text-red-600 dark:text-red-400'
                      : 'font-medium text-slate-600 dark:text-slate-300'
                    : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {cost ? money(Math.round(cost)) : '—'}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex flex-wrap items-center gap-3 px-0.5">
          {(
            [
              { label: 'High priority', color: 'bg-red-400/80' },
              { label: 'Medium', color: 'bg-amber-400/80' },
              { label: 'Low', color: 'bg-emerald-400/80' },
            ] as const
          ).map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span className={`inline-block h-2.5 w-5 rounded-full ${color}`} />
              {label}
            </span>
          ))}
          {todayPct > 0.5 && todayPct < 99 && (
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span className="inline-block h-2.5 w-0.5 rounded-full bg-teal-500/80" />
              Today
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
            Est. annual spend (mid)
          </span>
        </div>

      </div>
    </div>
  );
}

// ─── Confidence Nudges ───────────────────────────────────────────────
function ConfidenceNudge({
  item,
  propertyId,
  onOpenEdit,
}: {
  item: TimelineItemDTO;
  propertyId: string;
  onOpenEdit: (focus: 'cost' | 'age') => void;
}) {
  const missing = item.missingFactors ?? [];
  if (missing.length === 0 || item.confidence === 'HIGH') return null;

  const chipBase =
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors touch-manipulation';

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {missing.includes('INSTALL_DATE') && (
        <button
          onClick={() => onOpenEdit('age')}
          className={`${chipBase} border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100/90 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50`}
        >
          <Clock className="h-3 w-3 flex-shrink-0" />
          Age is estimated — correct it
          <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-50" />
        </button>
      )}
      {missing.includes('REPLACEMENT_COST') && (
        <button
          onClick={() => onOpenEdit('cost')}
          className={`${chipBase} border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100/90 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50`}
        >
          <DollarSign className="h-3 w-3 flex-shrink-0" />
          No cost on file — add your estimate
          <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-50" />
        </button>
      )}
      {missing.includes('CONDITION') && item.inventoryItemId && (
        <Link
          href={`/dashboard/properties/${propertyId}/inventory/items/${item.inventoryItemId}`}
          className={`${chipBase} border-slate-200/70 bg-slate-50/85 text-slate-600 hover:bg-slate-100/90 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:bg-slate-800/50`}
        >
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          Condition unknown — update in inventory
          <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-50" />
        </Link>
      )}
    </div>
  );
}

// ─── Item Edit Panel ─────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ItemEditPanel({
  item,
  propertyId,
  existingOverrides,
  onSaved,
  onCancel,
  initialFocus,
}: {
  item: TimelineItemDTO;
  propertyId: string;
  existingOverrides: OverrideDTO[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
  initialFocus?: 'cost' | 'age';
}) {
  const [form, setForm] = useState<EditFormValues>(() => buildFormFromOverrides(existingOverrides));
  const costMinRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialFocus === 'cost') costMinRef.current?.focus();
      else if (initialFocus === 'age') ageRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [initialFocus]);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function set<K extends keyof EditFormValues>(key: K, value: EditFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const isWorking = saving || clearing;
  const hasExistingOverrides = existingOverrides.length > 0;
  const currentYear = new Date().getFullYear();

  async function handleSave() {
    if (!item.inventoryItemId) return;
    setLocalError(null);
    setSaving(true);
    try {
      await persistOverrides(propertyId, item.inventoryItemId, form, existingOverrides);
      await onSaved();
    } catch {
      setLocalError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  async function handleClearAll() {
    if (existingOverrides.length === 0) { onCancel(); return; }
    setLocalError(null);
    setClearing(true);
    try {
      await Promise.all(existingOverrides.map(o => deleteOverride(propertyId, o.id)));
      await onSaved();
    } catch {
      setLocalError('Failed to clear overrides. Please try again.');
      setClearing(false);
    }
  }

  return (
    <div className="border-t border-teal-100/60 dark:border-teal-800/30">
      <div className="p-4 sm:p-5">
        <div className="rounded-xl border border-teal-100/80 bg-teal-50/50 p-4 dark:border-teal-800/40 dark:bg-teal-950/25">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Correct this estimate
          </p>

          <div className="space-y-5">
            {/* ── Planned date ── */}
            <div>
              <p className="mb-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                When is this planned?
              </p>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Set a target date to pin the timeline window.
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={form.plannedMonth}
                  onChange={e => set('plannedMonth', e.target.value)}
                  disabled={isWorking}
                  aria-label="Month"
                  className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 dark:text-slate-200 dark:border-slate-600"
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1)}>{m}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={currentYear}
                  max={currentYear + 30}
                  placeholder="Year"
                  value={form.plannedYear}
                  onChange={e => set('plannedYear', e.target.value)}
                  disabled={isWorking}
                  aria-label="Year"
                  className="h-9 w-24"
                />
              </div>
            </div>

            {/* ── Cost estimate ── */}
            <div>
              <p className="mb-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                Cost estimate
              </p>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Enter a contractor quote or your own estimate to override the AI projection.
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500">
                    $
                  </span>
                  <Input
                    ref={costMinRef}
                    type="number"
                    min={0}
                    placeholder="Low"
                    value={form.costMin}
                    onChange={e => set('costMin', e.target.value)}
                    disabled={isWorking}
                    aria-label="Low cost estimate"
                    className="h-9 pl-6"
                  />
                </div>
                <span className="flex-shrink-0 text-sm text-slate-400 dark:text-slate-500">to</span>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="High"
                    value={form.costMax}
                    onChange={e => set('costMax', e.target.value)}
                    disabled={isWorking}
                    aria-label="High cost estimate"
                    className="h-9 pl-6"
                  />
                </div>
              </div>
            </div>

            {/* ── Years remaining (hidden when planned date is set) ── */}
            {!form.plannedYear.trim() && (
              <div>
                <p className="mb-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                  Years until replacement
                </p>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Correct the AI&apos;s age estimate if it got the install year wrong.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    ref={ageRef}
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    placeholder="e.g. 4"
                    value={form.yearsRemaining}
                    onChange={e => set('yearsRemaining', e.target.value)}
                    disabled={isWorking}
                    aria-label="Years until replacement"
                    className="h-9 w-24"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">years from now</span>
                </div>
              </div>
            )}

            {/* ── Skip item ── */}
            <div className="rounded-lg border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/50 dark:bg-slate-900/40">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.skipItem}
                  onChange={e => set('skipItem', e.target.checked)}
                  disabled={isWorking}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-teal-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Already replaced or not applicable
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Removes this item from your capital plan after re-analysis.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {localError && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{localError}</p>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isWorking}
              className="h-9 rounded-xl text-sm"
            >
              {saving ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save & Re-analyze'
              )}
            </Button>

            {hasExistingOverrides && (
              <button
                onClick={handleClearAll}
                disabled={isWorking}
                className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-400"
              >
                {clearing ? 'Clearing…' : 'Clear all overrides'}
              </button>
            )}

            <button
              onClick={onCancel}
              disabled={isWorking}
              className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function CapitalTimelineClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const requestedAssumptionSetId = searchParams.get('assumptionSetId');
  const backHref = `/dashboard/properties/${propertyId}`;

  const [horizonYears, setHorizonYears] = useState<5 | 10>(10);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<TimelineAnalysisDTO | null>(null);
  const [activeAssumptionSetId, setActiveAssumptionSetId] = useState<string | null>(requestedAssumptionSetId);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<{ id: string; focus?: 'cost' | 'age' } | null>(null);
  const [overridesByInventoryItemId, setOverridesByInventoryItemId] = useState<Map<string, OverrideDTO[]>>(new Map());
  const [showChart, setShowChart] = useState(true);

  const reqRef = React.useRef(0);

  async function loadOverrides() {
    if (!propertyId) return;
    try {
      const overrides = await listOverrides(propertyId);
      const map = new Map<string, OverrideDTO[]>();
      for (const o of overrides) {
        if (!o.inventoryItemId) continue;
        const existing = map.get(o.inventoryItemId) ?? [];
        map.set(o.inventoryItemId, [...existing, o]);
      }
      setOverridesByInventoryItemId(map);
    } catch {
      // non-fatal
    }
  }

  async function doRun(horizon: 5 | 10, assumptionSetId: string | null = activeAssumptionSetId) {
    if (!propertyId) return;
    setRunning(true);
    setError(null);

    try {
      const reqId = ++reqRef.current;
      const next = await runTimeline(propertyId, horizon, { assumptionSetId });
      if (reqId !== reqRef.current) return;
      setData(next.analysis);
      if (next.assumptionSetId) setActiveAssumptionSetId(next.assumptionSetId);
      await loadOverrides();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to compute timeline');
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }

  async function load() {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const reqId = ++reqRef.current;
      const latest = await getLatestTimeline(propertyId);
      loadOverrides(); // fire in parallel, non-blocking
      if (reqId !== reqRef.current) return;
      if (latest.assumptionSetId) setActiveAssumptionSetId(latest.assumptionSetId);

      if (!latest.analysis || latest.analysis.status === 'STALE') {
        await doRun(horizonYears, latest.assumptionSetId ?? activeAssumptionSetId);
      } else {
        setData(latest.analysis);
        setLoading(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load timeline');
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (requestedAssumptionSetId) setActiveAssumptionSetId(requestedAssumptionSetId);
  }, [requestedAssumptionSetId]);

  function handleHorizonChange(h: 5 | 10) {
    setHorizonYears(h);
    doRun(h, activeAssumptionSetId);
  }

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleOverrideSaved() {
    setEditingItem(null);
    await doRun(horizonYears);
  }

  // ─── Summary stats ──────────────────────────────────────────────
  const items = data?.items ?? [];
  const totalMin = items.reduce((s, i) => s + (i.estimatedCostMinCents ?? 0), 0);
  const totalMax = items.reduce((s, i) => s + (i.estimatedCostMaxCents ?? 0), 0);
  const highPriorityCount = items.filter((i) => i.priority === 'HIGH').length;

  const nextAction = (() => {
    if (!propertyId || !data) return null;
    const firstHighPriority = items.find((item) => item.priority === 'HIGH');
    if (firstHighPriority) {
      const mappedCategory = mapTimelineCategoryToRadarCategory(firstHighPriority.category);
      const itemLabel = firstHighPriority.inventoryItem?.name || categoryLabel(firstHighPriority.category);
      const p = new URLSearchParams({ launchSurface: 'home_tools', category: mappedCategory, label: itemLabel });
      return {
        label: `Price-check: ${itemLabel}`,
        reason: 'Start with your highest-priority capital item before booking work.',
        href: `/dashboard/properties/${propertyId}/tools/service-price-radar?${p.toString()}`,
      };
    }
    const assumptionSetQuery = activeAssumptionSetId
      ? `?assumptionSetId=${encodeURIComponent(activeAssumptionSetId)}`
      : '';
    return {
      label: 'Compare sell / hold / rent outcomes',
      reason: 'No urgent item is due now, so validate your broader ownership strategy next.',
      href: `/dashboard/properties/${propertyId}/tools/sell-hold-rent${assumptionSetQuery}`,
    };
  })();

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Capital Timeline"
      subtitle={`Predicted major expenses over the next ${horizonYears} years.`}
      trust={{
        confidenceLabel: data?.confidence
          ? `${data.confidence.toLowerCase()} confidence across projected line items`
          : 'Confidence updates after analysis run',
        freshnessLabel: 'Updated from latest property context and selected horizon',
        sourceLabel: 'Capital timeline analysis + inventory/home asset state + planning assumptions',
        rationale: 'Prioritizes high-cost, high-likelihood capital events so homeowners can sequence budget and action timing.',
      }}
      rail={(
        <div className="space-y-3">
          <HomeToolsRail propertyId={propertyId} context="capital-timeline" currentToolId="capital-timeline" />
          <MobileActionRow className="justify-between">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
              {([5, 10] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => handleHorizonChange(h)}
                  className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all ${
                    horizonYears === h
                      ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
                  }`}
                >
                  {h}yr
                </button>
              ))}
            </div>

            <button
              onClick={() => doRun(horizonYears)}
              disabled={running}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-slate-300/70 bg-white/85 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-white disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
              Re-analyze
            </button>
          </MobileActionRow>
        </div>
      )}
    >
      {/* Loading */}
      {(loading || running) && !data && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-white/70 bg-white/65 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/45">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-900 dark:border-slate-100" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-4 backdrop-blur">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button
              onClick={() => load()}
              className="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Data */}
      {data && !loading && (
        <>
          {/* Summary Bar */}
          <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-6 dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <div>
                <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-300">Total Range</p>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                  {money(totalMin)} &ndash; {money(totalMax)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-300">Items</p>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{items.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-300">High Priority</p>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                  {highPriorityCount > 0 ? (
                    <span className="text-red-600">{highPriorityCount}</span>
                  ) : (
                    <span className="text-green-600">0</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-300">Confidence</p>
                <div className="mt-1">{confidenceBadge(data.confidence)}</div>
              </div>
            </div>
            {data.summary && (
              <p className="mt-4 border-t border-slate-200/70 pt-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300">
                {data.summary}
              </p>
            )}
            {nextAction && (
              <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
                <p className="mb-0 text-xs tracking-normal text-slate-500 dark:text-slate-300">Next action</p>
                <p className="mb-0 mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{nextAction.reason}</p>
                <Button asChild className="mt-3 h-9 rounded-xl text-sm">
                  <Link href={nextAction.href}>{nextAction.label}</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Visual Timeline Chart */}
          {items.length > 0 && (
            <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Visual Timeline
                </p>
                <button
                  onClick={() => setShowChart((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  {showChart ? (
                    <><ChevronUp className="h-3.5 w-3.5" />Hide</>
                  ) : (
                    <><ChevronDown className="h-3.5 w-3.5" />Show</>
                  )}
                </button>
              </div>
              {showChart && <TimelineChart items={items} horizonYears={horizonYears} />}
            </div>
          )}

          {/* Timeline Items */}
          {items.length === 0 ? (
            <div className="rounded-2xl border border-white/70 bg-white/70 p-12 text-center shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <Calendar className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-500" />
              <h3 className="mb-2 text-lg font-medium text-slate-900 dark:text-slate-100">
                No upcoming capital expenses
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Add inventory items to your property to get personalized predictions.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isExpanded = expandedItems.has(item.id);
                const isEditing = editingItem?.id === item.id;
                const canEdit = !!item.inventoryItemId;
                const itemOverrides = item.inventoryItemId
                  ? (overridesByInventoryItemId.get(item.inventoryItemId) ?? [])
                  : [];
                const hasOverrides = itemOverrides.length > 0;
                const itemName = item.inventoryItem?.name || categoryLabel(item.category);

                return (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38"
                  >
                    {/* Item Header */}
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 rounded-xl border border-white/70 bg-white/75 p-2 text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
                          {categoryIcon(item.category)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {itemName}
                              </h3>
                              {item.inventoryItem?.brand && (
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
                                  {item.inventoryItem.brand}
                                  {item.inventoryItem.model ? ` ${item.inventoryItem.model}` : ''}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
                              {eventTypeBadge(item.eventType)}
                              {priorityBadge(item.priority)}
                              {canEdit && (
                                <button
                                  onClick={() => setEditingItem(isEditing ? null : { id: item.id })}
                                  disabled={running}
                                  aria-label={isEditing ? 'Close editor' : 'Edit this estimate'}
                                  className={`inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border p-1.5 text-xs font-medium transition-all disabled:opacity-40 ${
                                    isEditing
                                      ? 'border-teal-300/70 bg-teal-100/80 text-teal-700 dark:border-teal-700/70 dark:bg-teal-900/55 dark:text-teal-300'
                                      : 'border-slate-200/70 bg-white/70 text-slate-400 hover:border-slate-300/70 hover:bg-white hover:text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-500 dark:hover:text-slate-300'
                                  }`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-6">
                            <div>
                              <span className="text-slate-500 dark:text-slate-300">When: </span>
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {windowLabel(item)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-300">Est. Cost: </span>
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {money(item.estimatedCostMinCents)} &ndash; {money(item.estimatedCostMaxCents)}
                              </span>
                            </div>
                            <div>
                              {hasOverrides ? userDataBadge() : confidenceBadge(item.confidence)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Confidence nudges + Why toggle — hidden while editing */}
                      {!isEditing && (
                        <>
                          <ConfidenceNudge
                            item={item}
                            propertyId={propertyId}
                            onOpenEdit={(focus) => setEditingItem({ id: item.id, focus })}
                          />
                          <button
                            onClick={() => toggleExpand(item.id)}
                            className="mt-3 -ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 touch-manipulation dark:text-slate-300 dark:hover:text-slate-100"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            Why this?
                          </button>
                        </>
                      )}
                    </div>

                    {/* Edit panel */}
                    {isEditing && (
                      <ItemEditPanel
                        item={item}
                        propertyId={propertyId}
                        existingOverrides={itemOverrides}
                        onSaved={handleOverrideSaved}
                        onCancel={() => setEditingItem(null)}
                        initialFocus={editingItem?.focus}
                      />
                    )}

                    {/* Expanded explanation */}
                    {isExpanded && !isEditing && (
                      <div className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
                        <div className="rounded-xl border border-white/70 bg-white/72 p-3 text-sm leading-relaxed text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
                          {item.why}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </ToolWorkspaceTemplate>
  );
}
