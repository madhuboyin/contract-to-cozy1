'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudSun,
  Flame,
  Loader2,
  Snowflake,
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
import ScoreGauge from '@/components/ui/ScoreGauge';
import humanizeActionType from '@/lib/utils/humanize';
import LottieBadge from '@/components/ui/LottieBadge';
import {
  flamePulseAnimation,
  snowflakePulseAnimation,
} from '@/components/animations/lottieData';

type MorningHomePulseCardProps = {
  propertyId?: string;
};

type SummaryKind = 'HEALTH' | 'RISK' | 'FINANCIAL';

const RISK_EXPOSURE_CAP = 15000;

function toneForSeverity(severity: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (severity === 'HIGH') return 'border-red-200 bg-red-50 text-red-700 shadow-lg';
  if (severity === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700 shadow-lg';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function freezeLottieTone(severity: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (severity === 'HIGH') {
    return {
      iconClass: 'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-red-700',
      reducedBgClass: 'bg-red-100',
      speed: 1.2,
    };
  }
  if (severity === 'MEDIUM') {
    return {
      iconClass: 'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-amber-700',
      reducedBgClass: 'bg-amber-100',
      speed: 1,
    };
  }
  return {
    iconClass: 'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-blue-700',
    reducedBgClass: 'bg-blue-100',
    speed: 0.8,
  };
}

function streakTone(days: number) {
  if (days >= 21) {
    return {
      badgeClass: 'bg-orange-50 text-orange-700',
      iconClass: 'absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-orange-600',
      reducedBgClass: 'bg-orange-100',
      speed: 1.15,
    };
  }
  if (days >= 7) {
    return {
      badgeClass: 'bg-amber-50 text-amber-700',
      iconClass: 'absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-amber-600',
      reducedBgClass: 'bg-amber-100',
      speed: 1,
    };
  }
  return {
    badgeClass: 'bg-teal-50 text-teal-700',
    iconClass: 'absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-teal-600',
    reducedBgClass: 'bg-teal-100',
    speed: 0.8,
  };
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
    return clamp(value / RISK_EXPOSURE_CAP, 0, 1);
  }
  return clamp(value / 100, 0, 1);
}

function getMetricLabel(kind: SummaryKind, value: number): string {
  if (kind === 'RISK') {
    const exposure = Math.round(getMetricPosition(kind, value) * 100);
    if (exposure >= 80) return 'High exposure';
    if (exposure >= 60) return 'Elevated';
    if (exposure >= 40) return 'Watch';
    if (exposure >= 20) return 'Moderate';
    return 'Low exposure';
  }
  const score = Math.round(getMetricPosition(kind, value) * 100);
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
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
  const className = improving ? 'text-emerald-600' : 'text-red-500';
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

function scoreTooltip(kind: SummaryKind) {
  if (kind === 'HEALTH') {
    return 'Health score measures how well-maintained your home is across all tracked items.';
  }
  if (kind === 'RISK') {
    return 'Risk score estimates your current exposure based on condition, coverage, and local hazards.';
  }
  return 'Financial score reflects expected cost efficiency based on projected maintenance and risk trends.';
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
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
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
  const freezeRiskMatch = /freeze|frost|snow|ice|blizzard|pipe/i.test(
    `${secondaryHeadline} ${secondaryDetail}`
  );
  const freezeTone = freezeLottieTone(payload.weatherInsight.severity);
  const dailyStreak = snapshot.streaks.dailyPulseCheckin;
  const streakToneState = streakTone(dailyStreak);

  const weatherAlert = (
    <div className={`rounded-xl border px-3 py-3 ${toneForSeverity(payload.weatherInsight.severity)}`}>
      <div className="flex items-start gap-2">
        {showWeatherAsPrimary && freezeRiskMatch ? (
          <LottieBadge
            animationData={snowflakePulseAnimation}
            icon={Snowflake}
            size={30}
            className="mt-0.5 shrink-0"
            iconClassName={freezeTone.iconClass}
            speed={freezeTone.speed}
            reducedMotionBgClassName={freezeTone.reducedBgClass}
          />
        ) : showWeatherAsPrimary ? (
          <Wind className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{secondaryHeadline}</p>
          <p className="text-sm">{secondaryDetail}</p>
        </div>
      </div>
    </div>
  );

  return (
    <section className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-md ring-1 ring-black/5 backdrop-blur-sm md:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-lg bg-teal-100 p-2">
            <CloudSun className="h-4 w-4 text-teal-700" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-gray-900">{payload.title}</h2>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{payload.dateLabel}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${streakToneState.badgeClass}`}
        >
          {dailyStreak > 0 ? (
            <LottieBadge
              animationData={flamePulseAnimation}
              icon={Flame}
              size={20}
              className="mr-1"
              iconClassName={streakToneState.iconClass}
              speed={streakToneState.speed}
              reducedMotionBgClassName={streakToneState.reducedBgClass}
            />
          ) : null}
          {dailyStreak}-day check-in streak
        </span>
      </div>

      <div className="mb-3 md:hidden">{weatherAlert}</div>

      <div className="grid gap-3 md:grid-cols-3">
        {payload.summary.map((row) => {
          const delta = getDeltaVisual(row.kind, row.delta);
          const label = getMetricLabel(row.kind, row.value);
          const scoreValue =
            row.kind === 'RISK'
              ? Math.round(getMetricPosition('RISK', row.value) * 100)
              : Math.round(row.value);
          const riskExposure =
            row.kind === 'RISK'
              ? new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                }).format(Math.max(0, row.value))
              : null;

          return (
            <div key={row.kind} className="rounded-xl border border-gray-200 bg-white/90 p-3">
              <div className="flex items-center justify-center md:hidden">
                <ScoreGauge
                  value={scoreValue}
                  label={row.label}
                  sublabel={label}
                  size="sm"
                  animate
                  tooltipText={scoreTooltip(row.kind)}
                />
              </div>
              <div className="hidden items-center justify-center md:flex">
                <ScoreGauge
                  value={scoreValue}
                  label={row.label}
                  sublabel={label}
                  size="md"
                  animate
                  tooltipText={scoreTooltip(row.kind)}
                />
              </div>

              <p className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${delta.className}`}>
                {delta.icon === 'UP' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : delta.icon === 'DOWN' ? (
                  <TrendingDown className="h-3 w-3" />
                ) : null}
                {delta.label}
              </p>
              <p className="mt-1 text-sm text-gray-600">{row.reason}</p>
              {row.kind === 'RISK' && riskExposure && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Exposure
                  </p>
                  <p className="text-sm font-semibold text-gray-700">{riskExposure}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="hidden md:block">{weatherAlert}</div>

        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900">
                {humanizeActionType(payload.microAction.title)}
              </p>
              <p className="mt-0.5 text-sm text-gray-600">{payload.microAction.detail}</p>
            </div>
            {!isActionDone ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  className="min-h-[44px] bg-brand-600 px-3 hover:bg-brand-700 md:h-8 md:min-h-0"
                  onClick={handleComplete}
                  disabled={actionBusy !== null}
                >
                  {actionBusy === 'COMPLETE' ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Saving
                    </>
                  ) : (
                    payload.microAction.cta
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 w-11 p-0 md:h-8 md:w-8"
                  onClick={handleDismiss}
                  disabled={actionBusy !== null}
                  aria-label="Dismiss action"
                >
                  {actionBusy === 'DISMISS' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-gray-100 pt-2">
        <p className="truncate text-xs font-medium text-emerald-700">
          {payload.homeWin.headline} · Micro-action streak {snapshot.streaks.microActionCompleted} day(s)
        </p>
        <div className="grid grid-cols-1 gap-1.5 text-xs md:grid-cols-2">
          <div className="truncate rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
            {payload.homeWin.detail}
          </div>
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-indigo-700">
            <span className="inline-flex items-center gap-1 truncate">
              <Sparkles className="h-3.5 w-3.5" />
              {payload.surprise.headline}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}
    </section>
  );
}
