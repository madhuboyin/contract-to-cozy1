'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
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

export default function MorningHomePulseCard({ propertyId }: MorningHomePulseCardProps) {
  const [snapshot, setSnapshot] = useState<DailySnapshotDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<'COMPLETE' | 'DISMISS' | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-teal-100">
            <CloudSun className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{payload.title}</h2>
            <p className="text-sm text-gray-500">{payload.dateLabel}</p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {snapshot.streaks.dailyPulseCheckin}-day check-in streak
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {payload.summary.map((row) => {
          const isPositive = row.delta > 0;
          const isNeutral = row.delta === 0;
          return (
            <div key={row.kind} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{row.label}</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {formatSummaryValue(row.kind, row.value)}
              </p>
              <p
                className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                  isNeutral ? 'text-gray-500' : isPositive ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {isNeutral ? null : isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {isNeutral ? 'No change' : `${row.delta > 0 ? '+' : ''}${row.delta}`}
              </p>
              <p className="mt-1 text-xs text-gray-500 line-clamp-2">{row.reason}</p>
            </div>
          );
        })}
      </div>

      <div className={`rounded-xl border p-3 ${toneForSeverity(payload.weatherInsight.severity)}`}>
        <div className="flex items-start gap-2">
          <Wind className="h-4 w-4 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">{payload.weatherInsight.headline}</p>
            <p className="text-sm">{payload.weatherInsight.detail}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">{payload.microAction.title}</p>
            <p className="mt-1 text-sm text-gray-600">{payload.microAction.detail}</p>
            <p className="mt-1 text-xs text-gray-500">ETA: {payload.microAction.etaMinutes} min</p>
          </div>
          {!isActionDone ? (
            <div className="flex items-center gap-2">
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
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              You&apos;re all set
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-900">{payload.homeWin.headline}</p>
          <p className="mt-1 text-sm text-emerald-800">{payload.homeWin.detail}</p>
          <p className="mt-1 text-xs text-emerald-700">
            Micro-action streak: {snapshot.streaks.microActionCompleted} day(s)
          </p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-900">
            <Sparkles className="h-4 w-4" />
            {payload.surprise.headline}
          </p>
          <p className="mt-1 text-sm text-indigo-800">{payload.surprise.detail}</p>
        </div>
      </div>

      {error ? (
        <div className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}
    </section>
  );
}

