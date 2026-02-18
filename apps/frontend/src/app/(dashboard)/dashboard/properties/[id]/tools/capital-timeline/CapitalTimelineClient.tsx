// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/CapitalTimelineClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Thermometer,
  Droplets,
  Zap,
  Home,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import {
  getLatestTimeline,
  runTimeline,
  TimelineAnalysisDTO,
  TimelineItemDTO,
} from './capitalTimelineApi';

// ─── Helpers ────────────────────────────────────────────────────────
function money(cents: number | null | undefined) {
  if (cents == null) return '\u2014';
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
  return s === e ? String(s) : `${s} \u2013 ${e}`;
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

// ─── Component ──────────────────────────────────────────────────────
export default function CapitalTimelineClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [horizonYears, setHorizonYears] = useState<5 | 10>(10);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<TimelineAnalysisDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const reqRef = React.useRef(0);

  async function load() {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const reqId = ++reqRef.current;
      const analysis = await getLatestTimeline(propertyId);
      if (reqId !== reqRef.current) return;

      if (!analysis || analysis.status === 'STALE') {
        await doRun(horizonYears);
      } else {
        setData(analysis);
        setLoading(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load timeline');
      setLoading(false);
    }
  }

  async function doRun(horizon: 5 | 10) {
    if (!propertyId) return;
    setRunning(true);
    setError(null);

    try {
      const reqId = ++reqRef.current;
      const analysis = await runTimeline(propertyId, horizon);
      if (reqId !== reqRef.current) return;
      setData(analysis);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to compute timeline');
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  function handleHorizonChange(h: 5 | 10) {
    setHorizonYears(h);
    doRun(h);
  }

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // ─── Summary stats ──────────────────────────────────────────────
  const items = data?.items ?? [];
  const totalMin = items.reduce((s, i) => s + (i.estimatedCostMinCents ?? 0), 0);
  const totalMax = items.reduce((s, i) => s + (i.estimatedCostMaxCents ?? 0), 0);
  const highPriorityCount = items.filter((i) => i.priority === 'HIGH').length;

  return (
    <div className="space-y-5 p-4 sm:p-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.12),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.12),transparent_40%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.78))]">
        <div className="rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
          <SectionHeader
            icon="🗓️"
            title="Capital Timeline"
            description={`Predicted major expenses for your home over the next ${horizonYears} years`}
          />
          <div className="mt-4">
            <HomeToolsRail propertyId={propertyId} />
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          </div>
        </div>
      </div>

      {/* Loading */}
      {(loading || running) && !data && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-white/70 bg-white/65 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/45">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-900 dark:border-slate-100" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-4 backdrop-blur">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button
              onClick={() => load()}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
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
          <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 sm:p-6 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">Total Range</p>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                  {money(totalMin)} &ndash; {money(totalMax)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">Items</p>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{items.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">High Priority</p>
                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                  {highPriorityCount > 0 ? (
                    <span className="text-red-600">{highPriorityCount}</span>
                  ) : (
                    <span className="text-green-600">0</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">Confidence</p>
                <div className="mt-1">{confidenceBadge(data.confidence)}</div>
              </div>
            </div>
            {data.summary && (
              <p className="mt-4 border-t border-slate-200/70 pt-3 text-sm text-slate-600 dark:border-slate-700/70 dark:text-slate-300">
                {data.summary}
              </p>
            )}
          </div>

          {/* Timeline Items */}
          {items.length === 0 ? (
            <div className="rounded-2xl border border-white/70 bg-white/70 p-12 text-center shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <Calendar className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-500" />
              <h3 className="mb-2 text-lg font-medium text-slate-900 dark:text-slate-100">No upcoming capital expenses</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Add inventory items to your property to get personalized predictions.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isExpanded = expandedItems.has(item.id);
                const itemName =
                  item.inventoryItem?.name ||
                  categoryLabel(item.category);

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

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
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

                            <div className="flex items-center gap-2 flex-wrap">
                              {eventTypeBadge(item.eventType)}
                              {priorityBadge(item.priority)}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-sm">
                            <div>
                              <span className="text-slate-500 dark:text-slate-300">When: </span>
                              <span className="font-medium text-slate-900 dark:text-slate-100">{windowLabel(item)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-300">Est. Cost: </span>
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {money(item.estimatedCostMinCents)} &ndash; {money(item.estimatedCostMaxCents)}
                              </span>
                            </div>
                            <div>{confidenceBadge(item.confidence)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Why toggle */}
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
                    </div>

                    {/* Expanded explanation */}
                    {isExpanded && (
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
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
    </div>
  );
}
