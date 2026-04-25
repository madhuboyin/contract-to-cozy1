'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock3, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  completeMicroAction,
  dismissMicroAction,
  getDailySnapshot,
  type PulseSummaryKind,
} from '@/lib/api/dailySnapshotApi';
import { api } from '@/lib/api/client';
import {
  CompactInsightStrip,
  EmptyStateCard,
  MetricRow,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  PreviewListRow,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';

function formatSummaryValue(kind: PulseSummaryKind, value: number): string {
  if (kind === 'RISK') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value || 0);
  }
  return `${Math.round(value || 0)}/100`;
}

function buildInsights(summary: Array<{ kind: PulseSummaryKind; delta: number; reason: string }>) {
  return summary
    .slice(0, 3)
    .map((entry) => ({
      label: `${entry.kind} ${entry.delta > 0 ? '+' : ''}${Math.round(entry.delta)} • ${entry.reason}`,
      tone: entry.delta > 0 ? ('good' as const) : ('elevated' as const),
    }));
}

export default function DailySnapshotPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId || searchParams.get('propertyId') || undefined;

  const snapshotQuery = useQuery({
    queryKey: ['daily-snapshot-page', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return getDailySnapshot(propertyId, { force: true });
    },
    enabled: !!propertyId,
    staleTime: 30 * 1000,
  });

  const historyQuery = useQuery({
    queryKey: ['daily-snapshot-history', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      return (await api.getHomeScoreHistory(propertyId, 12)) || [];
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!propertyId || !snapshotQuery.data?.microAction?.id) return null;
      return completeMicroAction(propertyId, snapshotQuery.data.microAction.id);
    },
    onSuccess: async () => {
      await snapshotQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['daily-snapshot-page', propertyId] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!propertyId || !snapshotQuery.data?.microAction?.id) return null;
      return dismissMicroAction(propertyId, snapshotQuery.data.microAction.id);
    },
    onSuccess: async () => {
      await snapshotQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['daily-snapshot-page', propertyId] });
    },
  });

  if (!propertyId) {
    return (
      <MobilePageContainer className="space-y-7 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">
        <EmptyStateCard
          title="Select a property"
          description="Daily Snapshot needs a selected property context."
          action={
            <Link
              href="/dashboard/properties"
              className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
            >
              Open Properties
            </Link>
          }
        />
      </MobilePageContainer>
    );
  }

  const snapshot = snapshotQuery.data;
  const summary = snapshot?.payload?.summary || [];
  const microAction = snapshot?.microAction;
  const weather = snapshot?.payload?.weatherInsight;

  return (
    <MobilePageContainer className="space-y-7 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection>
        <Link href={`/dashboard?propertyId=${encodeURIComponent(propertyId)}`} className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <MobileSectionHeader title="Daily Home Snapshot" subtitle="What changed and what to do next" />
      </MobileSection>

      {snapshotQuery.isLoading ? (
        <SummaryCard title="Loading snapshot" subtitle="Gathering today's home intelligence">
          <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">Please wait a moment...</p>
        </SummaryCard>
      ) : snapshot ? (
        <>
          <MobileSection>
            <SummaryCard
              title="Since Last Visit"
              subtitle={snapshot.payload.dateLabel || 'Current period summary'}
              action={<StatusChip tone="info">{snapshot.streaks.dailyPulseCheckin} day streak</StatusChip>}
            >
              <CompactInsightStrip items={buildInsights(summary)} />
            </SummaryCard>
          </MobileSection>

          <MobileSection>
            <SummaryCard
              title="Weather + Risk Signal"
              subtitle={weather?.headline || 'No weather signal'}
              action={<StatusChip tone={weather?.severity === 'HIGH' ? 'danger' : weather?.severity === 'MEDIUM' ? 'elevated' : 'info'}>{weather?.severity || 'LOW'}</StatusChip>}
            >
              <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">{weather?.detail || 'No weather detail available.'}</p>
            </SummaryCard>
          </MobileSection>

          <MobileSection>
            <SummaryCard
              title="Score Movement"
              subtitle="Latest changes"
              action={<Sparkles className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />}
            >
              {summary.map((item) => (
                <MetricRow
                  key={item.kind}
                  label={item.label}
                  value={formatSummaryValue(item.kind, item.value)}
                  trend={
                    <span className={item.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {item.delta > 0 ? '+' : ''}{Math.round(item.delta)}
                    </span>
                  }
                />
              ))}
            </SummaryCard>
          </MobileSection>

          <MobileSection>
            <SummaryCard
              title="Recommended Micro Action"
              subtitle={microAction?.title || 'No action available'}
              action={
                <StatusChip tone={microAction?.status === 'COMPLETED' ? 'good' : microAction?.status === 'DISMISSED' ? 'info' : 'needsAction'}>
                  {microAction?.status || 'PENDING'}
                </StatusChip>
              }
            >
              <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
                {microAction?.description || 'No micro-action generated for this snapshot.'}
              </p>
              {microAction ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void completeMutation.mutateAsync()}
                    disabled={completeMutation.isPending || dismissMutation.isPending || microAction.status !== 'PENDING'}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete
                  </button>
                  <button
                    type="button"
                    onClick={() => void dismissMutation.mutateAsync()}
                    disabled={completeMutation.isPending || dismissMutation.isPending || microAction.status !== 'PENDING'}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Dismiss
                  </button>
                </div>
              ) : null}
              {microAction?.etaMinutes ? (
                <p className="mb-0 inline-flex items-center gap-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                  <Clock3 className="h-3.5 w-3.5" /> About {microAction.etaMinutes} min
                </p>
              ) : null}
            </SummaryCard>
          </MobileSection>

          <MobileSection>
            <SummaryCard
              title="Weekly Trend Log"
              subtitle="Recent HomeScore changes"
              action={<StatusChip tone="info">{historyQuery.data?.length || 0} points</StatusChip>}
            >
              {(historyQuery.data || []).slice(-5).reverse().map((point) => (
                <PreviewListRow
                  key={point.weekStart}
                  title={new Date(point.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  subtitle={`Home ${Math.round(point.homeScore)} • Health ${Math.round(point.healthScore || 0)} • Risk ${Math.round(point.riskScore || 0)}`}
                  icon={<ShieldAlert className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />}
                />
              ))}
            </SummaryCard>
          </MobileSection>
        </>
      ) : (
        <EmptyStateCard title="Snapshot unavailable" description="Could not load the daily snapshot for this property." />
      )}
    </MobilePageContainer>
  );
}
