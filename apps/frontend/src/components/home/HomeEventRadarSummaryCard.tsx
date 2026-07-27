'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Radar,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type { RadarMonitoringState, RadarOverview } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const MONITORING_COPY: Record<
  RadarMonitoringState,
  { label: string; description: string; attention: boolean }
> = {
  ACTIVE: {
    label: 'Monitoring active',
    description: 'Live sources are checking this home.',
    attention: false,
  },
  PARTIAL: {
    label: 'Partial monitoring',
    description: 'Some categories are monitored and others are not covered.',
    attention: true,
  },
  DEGRADED: {
    label: 'Monitoring delayed',
    description: 'One or more live sources are stale or failing.',
    attention: true,
  },
  UNCOVERED: {
    label: 'Monitoring unavailable',
    description: 'Live event monitoring is not available for this home yet.',
    attention: true,
  },
  SETUP_NEEDED: {
    label: 'Setup needed',
    description: 'Complete this home’s location details to enable monitoring.',
    attention: true,
  },
};

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function lastCheckLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `Last successful check ${date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function radarHomeEmptyCopy(
  state: RadarMonitoringState,
): string {
  if (state === 'ACTIVE') return 'No active material events from the sources covering this home.';
  if (state === 'PARTIAL') return 'No active material events from covered sources. Some categories are not monitored.';
  if (state === 'DEGRADED') return 'Monitoring is delayed, so this view is not confirmation that no events exist.';
  if (state === 'SETUP_NEEDED') return 'Monitoring cannot evaluate this home until setup is complete.';
  return 'Live event monitoring is not available for this home.';
}

export function HomeEventRadarSummaryCard({ propertyId }: { propertyId: string }) {
  const query = useQuery({
    queryKey: ['radar-overview', propertyId, 'unified-home-summary'],
    queryFn: () => api.getRadarOverview(propertyId),
    staleTime: 2 * 60 * 1000,
    retry: 1,
    retryDelay: 250,
  });

  const baseHref =
    `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-event-radar`
    + '?launchSurface=unified_home';

  if (query.isLoading) {
    return (
      <Card className="rounded-[24px] border-slate-200 shadow-sm" role="status">
        <CardContent className="p-5 text-sm text-slate-500">
          Loading Home Event Radar summary…
        </CardContent>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card className="rounded-[24px] border-rose-200 bg-rose-50/60 shadow-sm" role="alert">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-rose-900">Radar summary is unavailable.</p>
            <p className="mt-1 text-sm text-rose-800">
              This is not an all-clear. Monitoring status could not be loaded.
            </p>
          </div>
          <Button type="button" variant="outline" className="shrink-0 rounded-full bg-white" onClick={() => query.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const overview: RadarOverview = query.data;
  const presentation = MONITORING_COPY[overview.monitoringState];
  const summary = overview.homeSummary;
  const urgent = summary.mostUrgentMatch;
  const checkedAt = lastCheckLabel(overview.lastSuccessfulCheckAt);

  return (
    <Card
      className={cn(
        'rounded-[24px] shadow-sm',
        presentation.attention
          ? 'border-amber-200 bg-amber-50/40'
          : 'border-slate-200 bg-white',
      )}
      aria-labelledby="home-radar-summary-heading"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn(
              'rounded-xl p-2.5',
              presentation.attention
                ? 'bg-amber-100 text-amber-700'
                : 'bg-teal-100 text-teal-700',
            )}>
              <Radar className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <CardTitle id="home-radar-summary-heading" className="text-lg">
                Home Event Radar
              </CardTitle>
              <p className="mt-1 text-sm text-slate-600">{presentation.description}</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'rounded-full bg-white',
              presentation.attention
                ? 'border-amber-300 text-amber-800'
                : 'border-emerald-200 text-emerald-700',
            )}
          >
            {presentation.attention
              ? <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden />
              : <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />}
            {presentation.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold text-slate-950">
            {summary.activeMaterialEventCount}
          </span>
          <span className="text-sm text-slate-600">
            active material event{summary.activeMaterialEventCount === 1 ? '' : 's'}
          </span>
          {presentation.attention && checkedAt ? (
            <span className="text-xs text-amber-800">· {checkedAt}</span>
          ) : null}
        </div>

        {urgent ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full">
                {humanize(urgent.sourceFamily)}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {humanize(urgent.severity)} severity
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {humanize(urgent.impact)} property impact
              </Badge>
            </div>
            <h3 className="mt-3 font-semibold text-slate-950">{urgent.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{urgent.explanation}</p>
            <p className="mt-2 text-xs text-slate-500">Source: {urgent.sourceName}</p>
            <Button asChild size="sm" className="mt-4 rounded-full">
              <Link href={urgent.href}>
                Review event
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <div className={cn(
            'rounded-2xl border p-4 text-sm',
            presentation.attention
              ? 'border-amber-200 bg-white text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800',
          )}>
            {summary.activeMaterialEventCount > 0
              ? `${summary.activeMaterialEventCount} active material event${summary.activeMaterialEventCount === 1 ? ' is' : 's are'} still being evaluated. Open Radar for the latest available evidence.`
              : radarHomeEmptyCopy(overview.monitoringState)}
          </div>
        )}

        <Link
          href={urgent?.href ?? baseHref}
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 underline underline-offset-2"
        >
          {urgent ? 'Open Home Event Radar' : 'View monitoring details'}
        </Link>
      </CardContent>
    </Card>
  );
}
