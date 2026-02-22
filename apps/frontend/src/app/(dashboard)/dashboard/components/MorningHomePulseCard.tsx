'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cloud,
  CloudSun,
  DollarSign,
  Flame,
  Loader2,
  Shield,
  Snowflake,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wind,
  Wrench,
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
import Link from 'next/link';

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
    return 'Your risk level score (0-100) based on current weather conditions, overdue maintenance, and property-specific factors. Lower is better.';
  }
  return 'Financial score reflects expected cost efficiency based on projected maintenance and risk trends.';
}

function formatDaysAgo(input?: string | null) {
  if (!input) return 'Unknown';
  const then = new Date(input);
  if (Number.isNaN(then.getTime())) return 'Unknown';
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.floor((Date.now() - then.getTime()) / msPerDay));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatDeltaPoints(delta: number) {
  const rounded = Math.round(delta);
  if (!Number.isFinite(rounded) || rounded === 0) {
    return { label: 'No change', className: 'bg-gray-100 text-gray-500' };
  }
  if (rounded > 0) {
    return { label: `▲ +${rounded} pts`, className: 'bg-emerald-100 text-emerald-700' };
  }
  return { label: `▼ ${Math.abs(rounded)} pts`, className: 'bg-red-100 text-red-700' };
}

function getPulseCardStyle(kind: SummaryKind, score: number) {
  if (kind === 'RISK') {
    if (score >= 80) return 'bg-red-50/40 border-red-200/60';
    if (score >= 60) return 'bg-amber-50/40 border-amber-200/60';
    return 'bg-emerald-50/40 border-emerald-200/60';
  }

  if (score >= 80) return 'bg-emerald-50/40 border-emerald-200/60';
  if (score >= 60) return 'bg-teal-50/40 border-teal-200/60';
  return 'bg-amber-50/40 border-amber-200/60';
}

function extractFirstCount(input: string): number | null {
  const match = input.match(/(\d+)\s+item/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractCurrency(input: string): string | null {
  const match = input.match(/\$\s?[\d,]+(?:\.\d+)?/);
  if (!match) return null;
  return match[0].replace(/\s+/g, '').replace(/\.00$/, '');
}

function extractDateLabel(input: string): string | null {
  const match = input.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\b/i
  );
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

function scoreStatusClass(kind: SummaryKind, score: number) {
  if (kind === 'RISK') {
    if (score >= 80) return 'text-red-600';
    if (score >= 60) return 'text-amber-600';
    if (score >= 40) return 'text-teal-600';
    return 'text-emerald-600';
  }
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-teal-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
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
  const recallSignalText = `${payload.surprise.headline} ${payload.surprise.detail}`;
  const hasRecallSignal = /recall|affected|safety/i.test(recallSignalText);
  const recallMatchCount = extractFirstCount(recallSignalText) ?? 1;
  const noOverdueActive = snapshot.streaks.noOverdueTasks > 0;

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
    <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-lg ring-1 ring-black/[0.04] md:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-400 via-teal-500 to-emerald-400" />

      <div className="mb-5 flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-xl bg-teal-50 p-2">
            <CloudSun className="h-5 w-5 text-teal-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 md:text-2xl">{payload.title}</h2>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">{payload.dateLabel}</p>
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

      <div className="mb-4 md:hidden">{weatherAlert}</div>

      <div className="grid items-stretch gap-4 md:grid-cols-3">
        {payload.summary.map((row) => {
          const label = getMetricLabel(row.kind, row.value);
          const gaugeLabel = row.kind === 'RISK' ? 'RISK LEVEL' : row.label.toUpperCase();
          const scoreValue =
            row.kind === 'RISK'
              ? Math.round(getMetricPosition('RISK', row.value) * 100)
              : Math.round(row.value);
          const riskExposure = new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          }).format(Math.max(0, row.value));
          const weeklyBadge = formatDeltaPoints(row.delta);
          const triggerIsLow = payload.weatherInsight.severity === 'LOW';
          const triggerPill = triggerIsLow
            ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">No active triggers</span>
            : freezeRiskMatch
              ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Freeze warning</span>
              : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Weather alert</span>;

          const inferredGapCount = hasRecallSignal ? recallMatchCount : scoreValue >= 60 ? 1 : 0;
          const annualCost =
            extractCurrency(`${row.reason} ${payload.homeWin.detail} ${payload.surprise.detail}`) ?? 'No data yet';
          const nextRenewal = extractDateLabel(`${payload.surprise.headline} ${payload.surprise.detail}`) ?? 'Not scheduled';
          const detailRows =
            row.kind === 'HEALTH'
              ? [
                  {
                    key: 'maintenance-actions',
                    icon: Wrench,
                    label: 'Maintenance actions',
                    value: noOverdueActive ? 'All clear' : '1 required',
                    valueClassName: noOverdueActive ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-amber-700',
                  },
                  {
                    key: 'last-inspection',
                    icon: Clock3,
                    label: 'Last inspection',
                    value: formatDaysAgo(snapshot.generatedAt),
                    valueClassName: 'text-xs font-semibold text-gray-800',
                  },
                  {
                    key: 'weekly-change',
                    icon: TrendingUp,
                    label: 'Weekly change',
                    value: weeklyBadge.label,
                    valueClassName:
                      weeklyBadge.label === 'No change'
                        ? 'text-xs font-semibold text-gray-500'
                        : weeklyBadge.label.startsWith('▲')
                          ? 'text-xs font-semibold text-emerald-700'
                          : 'text-xs font-semibold text-red-700',
                  },
                ]
              : row.kind === 'RISK'
                ? [
                    {
                      key: 'risk-exposure',
                      icon: AlertTriangle,
                      label: 'Exposure',
                      value: riskExposure,
                      valueClassName: 'text-xs font-semibold text-amber-700',
                    },
                    {
                      key: 'active-trigger',
                      icon: Cloud,
                      label: 'Active trigger',
                      value: triggerPill,
                      valueClassName: '',
                    },
                    {
                      key: 'coverage-gap',
                      icon: Shield,
                      label: 'Coverage gap',
                      value:
                        inferredGapCount > 0
                          ? `${inferredGapCount} item${inferredGapCount !== 1 ? 's' : ''} unprotected`
                          : 'Fully covered',
                      valueClassName:
                        inferredGapCount > 0
                          ? 'text-xs font-semibold text-red-700'
                          : 'text-xs font-semibold text-emerald-700',
                    },
                  ]
                : [
                    {
                      key: 'annual-cost',
                      icon: DollarSign,
                      label: 'Annual maintenance cost',
                      value: annualCost,
                      valueClassName: 'text-xs font-semibold text-gray-800',
                    },
                    {
                      key: 'savings',
                      icon: TrendingDown,
                      label: 'Potential savings',
                      value:
                        scoreValue >= 90
                          ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Optimized
                            </span>
                          )
                          : '$220-$760',
                      valueClassName: 'text-xs font-semibold text-emerald-700',
                    },
                    {
                      key: 'next-renewal',
                      icon: CalendarDays,
                      label: 'Next renewal',
                      value: nextRenewal,
                      valueClassName: 'text-xs font-semibold text-gray-800',
                    },
                  ];

          return (
            <div
              key={row.kind}
              className={`min-h-[340px] rounded-xl border p-5 ${getPulseCardStyle(row.kind, scoreValue)} flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {gaugeLabel}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${weeklyBadge.className}`}>
                  {weeklyBadge.label}
                </span>
              </div>

              <div className="mt-2 flex flex-col items-center">
                <div className="md:hidden">
                  <ScoreGauge
                    value={scoreValue}
                    label={gaugeLabel}
                    sublabel={label}
                    size="pulse-sm"
                    strokeWidth={9}
                    animate
                    showLabel={false}
                    showSublabel={false}
                    tooltipText={scoreTooltip(row.kind)}
                    direction={row.kind === 'RISK' ? 'lower-better' : 'higher-better'}
                  />
                </div>
                <div className="hidden md:block">
                  <ScoreGauge
                    value={scoreValue}
                    label={gaugeLabel}
                    sublabel={label}
                    size="pulse-md"
                    strokeWidth={9}
                    animate
                    showLabel={false}
                    showSublabel={false}
                    tooltipText={scoreTooltip(row.kind)}
                    direction={row.kind === 'RISK' ? 'lower-better' : 'higher-better'}
                  />
                </div>
                <span className={`mt-2 text-base font-semibold ${scoreStatusClass(row.kind, scoreValue)}`}>
                  {label}
                </span>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="space-y-0 px-1">
                  {detailRows.map((detail) => (
                    <div
                      key={detail.key}
                      className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0"
                    >
                      <div className="flex items-center gap-2 text-gray-500">
                        <detail.icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs">{detail.label}</span>
                      </div>
                      <span className={detail.valueClassName || 'text-xs font-semibold text-gray-800'}>
                        {detail.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
            noOverdueActive
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {noOverdueActive
            ? `No overdue tasks · ${dailyStreak}-day streak active`
            : `Overdue tasks detected · ${snapshot.streaks.microActionCompleted}-day micro-action streak`}
        </div>

        {hasRecallSignal ? (
          <Link
            href={`/dashboard/properties/${propertyId}/recalls`}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Recall check: {recallMatchCount} item{recallMatchCount !== 1 ? 's' : ''} may be affected →
          </Link>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            {payload.homeWin.headline}
          </div>
        )}
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
