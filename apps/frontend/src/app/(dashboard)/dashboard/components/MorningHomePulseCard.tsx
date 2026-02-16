'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CloudSun,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wind,
  X,
} from 'lucide-react';
import {
  DailySnapshotDTO,
  dismissMicroAction,
  getDailySnapshot,
  completeMicroAction,
} from '@/lib/api/dailySnapshotApi';
import { Button } from '@/components/ui/button';

type MorningHomePulseCardProps = {
  propertyId?: string;
};

type SummaryKind = 'HEALTH' | 'RISK' | 'FINANCIAL';

const RISK_EXPOSURE_CAP = 15000;

function formatSummaryValue(kind: 'HEALTH' | 'RISK' | 'FINANCIAL', value: number): string {
  if (kind === 'RISK' && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
  return Number.isFinite(value) ? `${Math.round(value)}` : '0';
}

function toneForSeverity(severity: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (severity === 'HIGH') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (severity === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

function microActionCompleted(status?: string | null) {
  return status === 'COMPLETED' || status === 'DISMISSED';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getMetricPosition(kind: SummaryKind, value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (kind === 'RISK') {
    const ratio = clamp(value / RISK_EXPOSURE_CAP, 0, 1);
    return 1 - ratio;
  }
  return clamp(value / 100, 0, 1);
}

function getMetricLabel(kind: SummaryKind, value: number): string {
  const score = Math.round(getMetricPosition(kind, value) * 100);
  if (kind === 'RISK') {
    if (score >= 80) return 'Low exposure';
    if (score >= 60) return 'Moderate';
    if (score >= 40) return 'Watch';
    if (score >= 20) return 'Elevated';
    return 'High exposure';
  }
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Watch';
  return 'Needs attention';
}

function getDeltaVisual(kind: SummaryKind, delta: number): {
  label: string;
  className: string;
  icon: 'UP' | 'DOWN' | null;
} {
  if (!Number.isFinite(delta) || delta === 0) {
    return { label: 'No change', className: 'text-gray-500', icon: null };
  }

  const improving = kind === 'RISK' ? delta < 0 : delta > 0;
  const className = improving ? 'text-emerald-600' : 'text-rose-600';
  const icon = delta > 0 ? 'UP' : 'DOWN';

  const label =
    kind === 'RISK'
      ? `${delta > 0 ? '+' : '-'}${new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(Math.abs(delta))}`
      : `${delta > 0 ? '+' : ''}${Math.round(delta)}`;

  return { label, className, icon };
}

function chipTone(kind: SummaryKind): string {
  if (kind === 'HEALTH') return 'border-emerald-200 bg-emerald-50/70';
  if (kind === 'RISK') return 'border-amber-200 bg-amber-50/70';
  return 'border-teal-200 bg-teal-50/70';
}

function segmentPalette(kind: SummaryKind): string[] {
  if (kind === 'RISK') {
    return ['bg-emerald-200', 'bg-emerald-400', 'bg-lime-500', 'bg-amber-500', 'bg-rose-600'];
  }
  return ['bg-lime-200', 'bg-lime-400', 'bg-lime-600', 'bg-green-700', 'bg-green-900'];
}

export default function MorningHomePulseCard({ propertyId }: MorningHomePulseCardProps) {
  const [snapshot, setSnapshot] = useState<DailySnapshotDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<'COMPLETE' | 'DISMISS' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadSnapshot = useCallback(async () => {
    if (!propertyId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getDailySnapshot(propertyId);
      setSnapshot(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load Morning Home Pulse.');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const isActionDone = useMemo(
    () => microActionCompleted(snapshot?.microAction?.status),
    [snapshot?.microAction?.status]
  );

  const handleComplete = async () => {
    if (!propertyId || !snapshot?.microAction?.id || isActionDone) return;
    setActionBusy('COMPLETE');
    try {
      await completeMicroAction(propertyId, snapshot.microAction.id);
      await loadSnapshot();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to complete micro action.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDismiss = async () => {
    if (!propertyId || !snapshot?.microAction?.id || isActionDone) return;
    setActionBusy('DISMISS');
    try {
      await dismissMicroAction(propertyId, snapshot.microAction.id);
      await loadSnapshot();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to dismiss micro action.');
    } finally {
      setActionBusy(null);
    }
  };

  if (!propertyId) return null;

  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="inline-flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
          Loading Morning Home Pulse...
        </div>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-medium text-red-700">{error || 'Unable to load Morning Home Pulse.'}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={loadSnapshot}>
          Try again
        </Button>
      </section>
    );
  }

  const payload = snapshot.payload;
  const showWeatherAsPrimary = payload.weatherInsight.severity !== 'LOW';
  const secondaryHeadline = showWeatherAsPrimary
    ? payload.weatherInsight.headline
    : payload.surprise.headline;
  const secondaryDetail = showWeatherAsPrimary
    ? payload.weatherInsight.detail
    : payload.surprise.detail;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-teal-100 shrink-0">
            <CloudSun className="h-4 w-4 text-teal-700" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{payload.title}</h2>
            <p className="text-xs text-gray-500">{payload.dateLabel}</p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          {snapshot.streaks.dailyPulseCheckin}-day check-in streak
        </span>
      </div>

      <div className="-mx-1 overflow-x-auto md:mx-0 md:overflow-visible">
        <div className="flex min-w-max gap-2 px-1 md:min-w-0 md:px-0">
          {payload.summary.map((row) => {
            const delta = getDeltaVisual(row.kind, row.delta);
            const position = getMetricPosition(row.kind, row.value);
            const statusLabel = getMetricLabel(row.kind, row.value);
            const colors = segmentPalette(row.kind);
            return (
              <div
                key={row.kind}
                className={`w-[230px] shrink-0 rounded-lg border px-3 py-2 md:w-auto md:flex-1 md:min-w-0 ${chipTone(
                  row.kind
                )}`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{row.label}</p>
                  <p className="text-base font-semibold text-gray-900">
                    {formatSummaryValue(row.kind, row.value)}
                  </p>
                  <p className={`inline-flex items-center gap-1 text-xs font-medium ${delta.className}`}>
                    {delta.icon === 'UP' ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : delta.icon === 'DOWN' ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : null}
                    {delta.label}
                  </p>
                </div>
                <div className="relative mt-2">
                  <div className="grid grid-cols-5 gap-0.5 overflow-hidden rounded-full border border-white/60 p-0.5">
                    {colors.map((color, idx) => (
                      <span key={idx} className={`h-2 rounded-full ${color}`} />
                    ))}
                  </div>
                  <span
                    className="absolute -top-3 -translate-x-1/2 text-[16px] leading-none text-black"
                    style={{ left: `${Math.round(position * 100)}%` }}
                  >
                    ▼
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-gray-600">{statusLabel}</p>
                {expanded ? <p className="mt-1 text-xs text-gray-500 line-clamp-2">{row.reason}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`rounded-lg border px-3 py-2 ${toneForSeverity(payload.weatherInsight.severity)}`}>
        <div className="flex items-start gap-2">
          {showWeatherAsPrimary ? (
            <Wind className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{secondaryHeadline}</p>
            <p className="text-sm line-clamp-1">{secondaryDetail}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{payload.microAction.title}</p>
            <p className="mt-0.5 text-sm text-gray-600 line-clamp-1">{payload.microAction.detail}</p>
            <p className="mt-1 text-xs text-gray-500">ETA: {payload.microAction.etaMinutes} min</p>
          </div>
          {!isActionDone ? (
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={handleComplete} disabled={actionBusy !== null}>
                {actionBusy === 'COMPLETE' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    Saving
                  </>
                ) : (
                  payload.microAction.cta
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                disabled={actionBusy !== null}
                aria-label="Dismiss action"
              >
                {actionBusy === 'DISMISS' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" />
              You&apos;re all set
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
        <p className="text-xs text-emerald-700 font-medium truncate">
          {payload.homeWin.headline} · Micro-action streak {snapshot.streaks.microActionCompleted} day(s)
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-teal-700"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              Hide details <ChevronUp className="h-3.5 w-3.5 ml-1" />
            </>
          ) : (
            <>
              Expand details <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </>
          )}
        </Button>
      </div>

      {expanded ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-900">{payload.homeWin.headline}</p>
            <p className="mt-1 text-sm text-emerald-800">{payload.homeWin.detail}</p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-900">
              <Sparkles className="h-4 w-4" />
              {payload.surprise.headline}
            </p>
            <p className="mt-1 text-sm text-indigo-800">{payload.surprise.detail}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}
    </section>
  );
}
