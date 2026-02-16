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
  const base = 'text-xs font-medium px-2 py-0.5 rounded-full';
  switch (eventType) {
    case 'REPLACE':
      return <span className={`${base} bg-red-50 text-red-700`}>Replace</span>;
    case 'MAJOR_REPAIR':
      return <span className={`${base} bg-amber-50 text-amber-700`}>Major Repair</span>;
    case 'INSPECTION':
      return <span className={`${base} bg-blue-50 text-blue-700`}>Inspection</span>;
    default:
      return <span className={`${base} bg-gray-50 text-gray-700`}>{eventType}</span>;
  }
}

function priorityBadge(priority: string) {
  const base = 'text-xs font-medium px-2 py-0.5 rounded-full';
  switch (priority) {
    case 'HIGH':
      return <span className={`${base} bg-red-100 text-red-800`}>High Priority</span>;
    case 'MEDIUM':
      return <span className={`${base} bg-amber-100 text-amber-800`}>Medium</span>;
    case 'LOW':
      return <span className={`${base} bg-green-100 text-green-800`}>Low</span>;
    default:
      return null;
  }
}

function confidenceBadge(c: string) {
  const base = 'text-xs rounded px-2 py-0.5 border border-black/10';
  if (c === 'HIGH') return <span className={`${base} bg-emerald-50 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} bg-amber-50 text-amber-800`}>Medium confidence</span>;
  return <span className={`${base} bg-black/5 text-black/70`}>Low confidence</span>;
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
    <div className="space-y-6">
      <HomeToolsRail propertyId={propertyId} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capital Timeline</h1>
          <p className="text-sm text-gray-600 mt-1">
            Predicted major expenses for your home over the next {horizonYears} years
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Horizon Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {([5, 10] as const).map((h) => (
              <button
                key={h}
                onClick={() => handleHorizonChange(h)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  horizonYears === h
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {h}yr
              </button>
            ))}
          </div>

          <button
            onClick={() => doRun(horizonYears)}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            Re-analyze
          </button>
        </div>
      </div>

      {/* Loading */}
      {(loading || running) && !data && (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
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
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Range</p>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {money(totalMin)} &ndash; {money(totalMax)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Items</p>
                <p className="mt-1 text-lg font-bold text-gray-900">{items.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">High Priority</p>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {highPriorityCount > 0 ? (
                    <span className="text-red-600">{highPriorityCount}</span>
                  ) : (
                    <span className="text-green-600">0</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Confidence</p>
                <div className="mt-1">{confidenceBadge(data.confidence)}</div>
              </div>
            </div>
            {data.summary && (
              <p className="mt-4 text-sm text-gray-600 border-t border-gray-100 pt-3">
                {data.summary}
              </p>
            )}
          </div>

          {/* Timeline Items */}
          {items.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No upcoming capital expenses</h3>
              <p className="text-sm text-gray-600">
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
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden"
                  >
                    {/* Item Header */}
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 p-2 bg-gray-50 rounded-lg text-gray-600">
                          {categoryIcon(item.category)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900">
                                {itemName}
                              </h3>
                              {item.inventoryItem?.brand && (
                                <p className="text-xs text-gray-500 mt-0.5">
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
                              <span className="text-gray-500">When: </span>
                              <span className="font-medium text-gray-900">{windowLabel(item)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Est. Cost: </span>
                              <span className="font-medium text-gray-900">
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
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors min-h-[44px] px-2 -ml-2 touch-manipulation"
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
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed">
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
