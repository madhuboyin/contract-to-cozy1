'use client';

// apps/frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx
//
// Admin-only product analytics dashboard.
// Mirrors the knowledge-admin page pattern for role guard, layout and styling.

import React, { useState, useCallback } from 'react';
import {
  Activity,
  BarChart2,
  ChevronDown,
  Filter,
  Home,
  Info,
  Layers,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAdminAnalyticsOverview,
  useAdminAnalyticsTrends,
  useAdminAnalyticsFeatureAdoption,
  useAdminAnalyticsFunnel,
  useAdminAnalyticsCohorts,
  useAdminAnalyticsTopTools,
  useAdminAnalyticsPhase1Pilot,
  useAdminAnalyticsPhase6Pilot,
} from '@/hooks/useAdminAnalytics';
import AdminAnalyticsLineChart from '@/components/admin-analytics/AdminAnalyticsLineChart';
import {
  OverviewCardsSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from '@/components/admin-analytics/AdminAnalyticsSkeleton';
import { decideAdminPhase6PilotAdmission, type AdminAnalyticsFilters } from '@/lib/api/adminAnalytics';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { ScrollFadeX } from '@/components/ui/ScrollFadeX';

// ============================================================================
// HELPERS
// ============================================================================

function pct(v: number | null | undefined) {
  if (v == null) return '—';
  return (v * 100).toFixed(1) + '%';
}

function num(v: number | null | undefined) {
  if (v == null) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'k';
  return String(Math.round(v));
}

function dec(v: number | null | undefined, places = 1) {
  if (v == null) return '—';
  return v.toFixed(places);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// ERROR BANNER
// ============================================================================

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
      {message}
    </div>
  );
}

// ============================================================================
// SECTION WRAPPER
// ============================================================================

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
          {Icon && <Icon className="h-5 w-5 text-slate-400" />}
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-sm text-slate-500">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ============================================================================
// OVERVIEW CARD
// ============================================================================

function OverviewCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold tracking-normal text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Phase1PilotSection({
  filters,
  enabled,
}: {
  filters: AdminAnalyticsFilters;
  enabled: boolean;
}) {
  const pilotQ = useAdminAnalyticsPhase1Pilot(filters, enabled);

  if (pilotQ.isLoading) return <OverviewCardsSkeleton />;
  if (pilotQ.isError) {
    return (
      <ErrorBanner message="Phase 1 pilot metrics are unavailable for this period." />
    );
  }
  if (!pilotQ.data) return null;

  const { eligibility, metrics, metricVersion } = pilotQ.data;
  const rows = [
    { label: 'Minimum setup completed', metric: metrics.minimumSetupCompletion },
    { label: 'Useful + new recommendation', metric: metrics.usefulNewRecommendationIdentification },
    { label: 'First action resolved in 30 days', metric: metrics.actionResolutionWithin30Days },
  ];

  return (
    <Section
      title="Phase 1 Pilot Scorecard"
      description="Exact pilot denominators and framework targets for trigger-first activation."
      icon={Sparkles}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge variant="outline" className="rounded-full">{metricVersion}</Badge>
        <span className="font-semibold text-slate-700">{num(eligibility.eligibleHomes)} eligible homes</span>
        <span>{eligibility.definition}</span>
      </div>
      {eligibility.eligibleHomes === 0 ? (
        <AdminRouteState
          state="empty"
          title="No Phase 1 pilot homes in this window"
          description="A home becomes eligible when its trigger-first entry context is captured."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {rows.map(({ label, metric }) => {
            const metTarget = metric.target != null && metric.rate >= metric.target;
            return (
              <div key={label} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  {metric.target != null && (
                    <Badge
                      variant="outline"
                      className={metTarget
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'}
                    >
                      {metTarget ? 'Target met' : `Target ${pct(metric.target)}`}
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{pct(metric.rate)}</p>
                <p className="text-xs text-slate-500">
                  {num(metric.numerator)} of {num(metric.denominator)} eligible homes
                </p>
                <p className="mt-3 text-xs leading-5 text-slate-500">{metric.definition}</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Useful in any form: {pct(metrics.usefulRecommendationAny.rate)} ({num(metrics.usefulRecommendationAny.numerator)} of {num(metrics.usefulRecommendationAny.denominator)}). This supplemental measure has no launch target.
      </p>
    </Section>
  );
}

function Phase6PilotSection({ filters, enabled }: { filters: AdminAnalyticsFilters; enabled: boolean }) {
  const pilotQ = useAdminAnalyticsPhase6Pilot(filters, enabled);
  const [busyPropertyId, setBusyPropertyId] = useState<string | null>(null);

  async function decide(propertyId: string, decision: 'ADMITTED' | 'REJECTED') {
    const cohortKey = decision === 'ADMITTED' ? window.prompt('Controlled cohort key')?.trim() : null;
    if (decision === 'ADMITTED' && !cohortKey) return;
    const reason = decision === 'REJECTED' ? window.prompt('Admission rejection reason')?.trim() : '';
    if (decision === 'REJECTED' && !reason) return;
    setBusyPropertyId(propertyId);
    try {
      await decideAdminPhase6PilotAdmission(propertyId, { decision, cohortKey, reasons: reason ? [reason] : [] });
      await pilotQ.refetch();
    } finally { setBusyPropertyId(null); }
  }

  if (pilotQ.isLoading) return <OverviewCardsSkeleton />;
  if (pilotQ.isError || !pilotQ.data) return <ErrorBanner message="Phase 6 pilot controls are unavailable." />;
  const gate = pilotQ.data.expansionGate;
  const criteria = [
    ['Milestone completion', gate.milestoneCompletion.value, gate.milestoneCompletion.threshold],
    ['Recommendation comprehension', gate.recommendationComprehension.value, gate.recommendationComprehension.threshold],
    ['Verified outcome write-back', gate.verifiedOutcomeWriteBack.value, gate.verifiedOutcomeWriteBack.threshold],
    ['Provider quality visibility', gate.providerQualityVisibility.value, gate.providerQualityVisibility.threshold],
    ['Recurring-care conversion', gate.recurringCareConversion.value, gate.recurringCareConversion.threshold],
  ] as const;
  return <Section title="Phase 6 controlled pilot and expansion gate" description={pilotQ.data.humanPolicyApprovalEnforced ? 'Operator admission and all six evidence requirements must pass before expansion.' : 'Beta mode: operator admission is advisory; evidence-based expansion reporting remains active.'} icon={Layers}>
    <div className="mb-4 grid gap-3 sm:grid-cols-4"><OverviewCard label="Qualified" value={pilotQ.data.cohort.eligible} /><OverviewCard label="Admitted" value={pilotQ.data.cohort.admitted} /><OverviewCard label="Activated" value={pilotQ.data.cohort.activatedPlans} /><OverviewCard label="Expansion" value={gate.status.replace(/_/g, ' ')} /></div>
    <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{criteria.map(([label, value, threshold]) => <div key={label} className="rounded-xl border p-3 text-sm"><p className="font-medium">{label}</p><p className="text-slate-500">{pct(value)} · target {pct(threshold)}</p></div>)}<div className="rounded-xl border p-3 text-sm"><p className="font-medium">Unresolved blocker time</p><p className="text-slate-500">{dec(gate.unresolvedBlockerHoursPerJourney.value)} hours/journey · max {gate.unresolvedBlockerHoursPerJourney.thresholdMaximum}</p></div></div>
    <p className="mb-3 text-xs text-slate-500">Evidence floor: {gate.sampleSize.completedJourneys}/{gate.sampleSize.minimumCompletedJourneys} completed journeys and {gate.sampleSize.providerJourneys}/{gate.sampleSize.minimumProviderJourneys} provider journeys.</p>
    <div className="space-y-2">{pilotQ.data.admissionQueue.map(item => <div key={item.propertyId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-mono text-xs">{item.propertyId}</p><p className="text-xs text-slate-500">{item.qualificationDecision} · {item.admissionDecision}{item.cohortKey ? ` · ${item.cohortKey}` : ''}</p></div>{item.qualificationDecision === 'ELIGIBLE' && item.admissionDecision !== 'ADMITTED' && <div className="flex gap-2"><Button size="sm" disabled={busyPropertyId === item.propertyId} onClick={() => void decide(item.propertyId, 'ADMITTED')}>Admit</Button><Button size="sm" variant="outline" disabled={busyPropertyId === item.propertyId} onClick={() => void decide(item.propertyId, 'REJECTED')}>Reject</Button></div>}</div>)}</div>
  </Section>;
}

// ============================================================================
// FILTER BAR
// ============================================================================

const PRESET_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const MODULE_OPTIONS = [
  { value: '', label: 'All modules' },
  { value: 'property', label: 'Property' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'risk', label: 'Risk' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'claims', label: 'Claims' },
  { value: 'incidents', label: 'Incidents' },
  { value: 'hidden_assets', label: 'Hidden Assets' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'home_pulse', label: 'Home Pulse' },
  { value: 'digital_twin', label: 'Digital Twin' },
  { value: 'financial', label: 'Financial' },
];

function FilterBar({
  filters,
  onChange,
  onRefresh,
}: {
  filters: AdminAnalyticsFilters;
  onChange: (f: AdminAnalyticsFilters) => void;
  onRefresh: () => void;
}) {
  const activePreset = PRESET_RANGES.find(
    (p) => filters.from === daysAgo(p.days) && filters.to === today(),
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {/* Row 1 (mobile): presets + refresh; Row 1 (desktop): inline with rest */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-1 shadow-sm">
          {PRESET_RANGES.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange({ ...filters, from: daysAgo(p.days), to: today() })}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activePreset?.label === p.label
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="sm:hidden h-8 rounded-full px-3 text-xs text-slate-500 hover:text-slate-900"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Row 2 (mobile): date inputs + module filter */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Custom date inputs */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
            className="h-9 min-w-0 w-[130px] rounded-lg border border-slate-200 px-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            aria-label="Start date"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
            className="h-9 min-w-0 w-[130px] rounded-lg border border-slate-200 px-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            aria-label="End date"
          />
        </div>

        {/* Module filter */}
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <select
            value={filters.moduleKey ?? ''}
            onChange={(e) =>
              onChange({ ...filters, moduleKey: e.target.value || undefined })
            }
            className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-7 pr-7 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            aria-label="Module filter"
          >
            {MODULE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
        </div>

        {/* Active filter indicator */}
        {filters.moduleKey && (
          <Badge
            variant="outline"
            className="cursor-pointer rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-normal text-slate-600 hover:bg-slate-100"
            onClick={() => onChange({ ...filters, moduleKey: undefined })}
          >
            {filters.moduleKey} ×
          </Badge>
        )}
      </div>

      {/* Refresh — desktop only (mobile refresh is inline above) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="hidden sm:flex ml-auto h-8 rounded-full px-3 text-xs text-slate-500 hover:text-slate-900"
      >
        <RefreshCw className="mr-1.5 h-3 w-3" />
        Refresh
      </Button>
    </div>
  );
}

// ============================================================================
// FUNNEL SECTION
// ============================================================================

function FunnelSection({ filters, enabled }: { filters: AdminAnalyticsFilters; enabled: boolean }) {
  const q = useAdminAnalyticsFunnel(filters, enabled);

  if (q.isLoading) return <ChartSkeleton label="Activation Funnel" />;
  if (q.isError)
    return (
      <Section title="Activation Funnel" icon={Layers}>
        <ErrorBanner message="Unable to load funnel data." />
      </Section>
    );
  if (!q.data)
    return (
      <Section title="Activation Funnel" icon={Layers}>
        <p className="text-sm text-slate-500">No funnel data for this period.</p>
      </Section>
    );

  const { stages } = q.data;
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <Section
      title="Activation Funnel"
      description="Users progressing through the activation journey."
      icon={Layers}
    >
      <div className="space-y-2.5">
        {stages.map((stage, i) => {
          const widthPct = (stage.count / maxCount) * 100;
          return (
            <div key={stage.stage}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{stage.label}</span>
                <div className="flex items-center gap-3 text-slate-500">
                  {stage.conversionFromPrevious != null && (
                    <span className="font-mono">{pct(stage.conversionFromPrevious)} conv.</span>
                  )}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {num(stage.count)}
                  </span>
                </div>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-800 transition-all"
                  style={{ width: `${widthPct}%`, opacity: 1 - i * 0.12 }}
                />
              </div>
              {stage.dropoffFromPrevious != null && stage.dropoffFromPrevious > 0 && (
                <p className="mt-0.5 text-right text-[11px] text-slate-400">
                  −{num(stage.dropoffFromPrevious)} dropped off
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ============================================================================
// ENGAGEMENT BREAKDOWN
// ============================================================================

function EngagementBreakdown({
  filters,
  enabled,
}: {
  filters: AdminAnalyticsFilters;
  enabled: boolean;
}) {
  const q = useAdminAnalyticsFeatureAdoption(filters, enabled);

  if (q.isLoading) return <ChartSkeleton label="Engagement by Module" />;
  if (q.isError)
    return (
      <Section title="Engagement by Module" icon={BarChart2}>
        <ErrorBanner message="Unable to load engagement data." />
      </Section>
    );

  // Aggregate to module level
  const byModule = new Map<string, { events: number; homes: number }>();
  (q.data?.features ?? []).forEach((f) => {
    const existing = byModule.get(f.moduleKey) ?? { events: 0, homes: 0 };
    byModule.set(f.moduleKey, {
      events: existing.events + f.totalEvents,
      homes: Math.max(existing.homes, f.uniqueHomes),
    });
  });

  const modules = Array.from(byModule.entries())
    .sort((a, b) => b[1].events - a[1].events)
    .slice(0, 8);

  if (modules.length === 0)
    return (
      <Section title="Engagement by Module" icon={BarChart2}>
        <p className="py-4 text-center text-sm text-slate-500">
          No interaction data for this period.
        </p>
      </Section>
    );

  const maxEvents = Math.max(...modules.map(([, v]) => v.events), 1);

  return (
    <Section
      title="Engagement by Module"
      description="Where users spend time across product features."
      icon={BarChart2}
    >
      <div className="space-y-2">
        {modules.map(([moduleKey, { events, homes }]) => (
          <div key={moduleKey} className="flex items-center gap-3">
            <div className="w-28 shrink-0 text-xs font-medium capitalize text-slate-600 sm:w-32">
              {moduleKey.replace(/_/g, ' ')}
            </div>
            <div className="flex-1">
              <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${(events / maxEvents) * 100}%` }}
                />
              </div>
            </div>
            <div className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-500">
              <span className="font-semibold text-slate-900">{num(events)}</span> events
            </div>
            <div className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-slate-400 sm:block">
              {num(homes)} homes
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============================================================================
// DECISION GUIDED SECTION
// ============================================================================

function DecisionGuidedSection({
  filters,
  enabled,
  overview,
}: {
  filters: AdminAnalyticsFilters;
  enabled: boolean;
  overview: ReturnType<typeof useAdminAnalyticsOverview>['data'];
}) {
  if (!overview)
    return (
      <Section title="Decisions Guided" icon={Zap}>
        <p className="text-sm text-slate-500">Loading…</p>
      </Section>
    );

  const { decisionsGuided } = overview;
  const topModules = [...decisionsGuided.byModule]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const maxCount = Math.max(...topModules.map((m) => m.count), 1);

  return (
    <Section
      title="Decisions Guided"
      description="Moments where the product supported a homeowner decision."
      icon={Zap}
    >
      <div className="mb-4 flex items-center gap-4">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-slate-950">
            {num(decisionsGuided.totalDecisionsGuided)}
          </p>
          <p className="text-xs text-slate-400">total decisions guided</p>
        </div>
      </div>

      {topModules.length === 0 ? (
        <p className="text-sm text-slate-500">No decision events for this period.</p>
      ) : (
        <div className="space-y-2">
          {topModules.map((m) => (
            <div key={m.moduleKey} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-xs font-medium capitalize text-slate-600 sm:w-32">
                {m.moduleKey.replace(/_/g, ' ')}
              </div>
              <div className="flex-1">
                <div className="h-3.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{ width: `${(m.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
              <div className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-900">
                {num(m.count)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ============================================================================
// AHA JOURNEY (TESTING SUPPORT)
// ============================================================================

function AhaJourneySection({
  filters,
  enabled,
}: {
  filters: AdminAnalyticsFilters;
  enabled: boolean;
}) {
  const q = useAdminAnalyticsFeatureAdoption(filters, enabled);

  if (q.isLoading)
    return (
      <Section title="Aha Journey Events" icon={Sparkles}>
        <ChartSkeleton label="Aha Journey Events" />
      </Section>
    );

  if (q.isError)
    return (
      <Section title="Aha Journey Events" icon={Sparkles}>
        <ErrorBanner message="Unable to load Aha journey event data." />
      </Section>
    );

  const ahaFeatures = (q.data?.features ?? []).filter((f) =>
    f.featureKey.startsWith('dashboard_aha_'),
  );

  if (ahaFeatures.length === 0)
    return (
      <Section
        title="Aha Journey Events"
        description="No Aha dashboard events were found in the selected period."
        icon={Sparkles}
      >
        <p className="text-sm text-slate-500">
          Expected events: <code>dashboard_aha_viewed</code>, <code>dashboard_aha_cta_clicked</code>,{' '}
          <code>dashboard_aha_celebrated</code>.
        </p>
      </Section>
    );

  const eventStats = {
    viewed: { events: 0, homes: 0 },
    clicked: { events: 0, homes: 0 },
    celebrated: { events: 0, homes: 0 },
  };

  for (const feature of ahaFeatures) {
    if (feature.featureKey.includes('viewed')) {
      eventStats.viewed.events += feature.totalEvents;
      eventStats.viewed.homes += feature.uniqueHomes;
    } else if (feature.featureKey.includes('cta_clicked')) {
      eventStats.clicked.events += feature.totalEvents;
      eventStats.clicked.homes += feature.uniqueHomes;
    } else if (feature.featureKey.includes('celebrated')) {
      eventStats.celebrated.events += feature.totalEvents;
      eventStats.celebrated.homes += feature.uniqueHomes;
    }
  }

  const eventCtr =
    eventStats.viewed.events > 0 ? eventStats.clicked.events / eventStats.viewed.events : null;
  const celebrationRate =
    eventStats.viewed.events > 0
      ? eventStats.celebrated.events / eventStats.viewed.events
      : null;

  const sortedRows = [...ahaFeatures].sort((a, b) => b.totalEvents - a.totalEvents);

  return (
    <Section
      title="Aha Journey Events"
      description="Testing visibility for dashboard Aha flow engagement."
      icon={Sparkles}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <OverviewCard
          label="Aha Viewed"
          value={num(eventStats.viewed.events)}
          sub={`${num(eventStats.viewed.homes)} homes`}
        />
        <OverviewCard
          label="Aha CTA Clicked"
          value={num(eventStats.clicked.events)}
          sub={`${num(eventStats.clicked.homes)} homes`}
        />
        <OverviewCard
          label="Aha Celebrated"
          value={num(eventStats.celebrated.events)}
          sub={`${num(eventStats.celebrated.homes)} homes`}
        />
        <OverviewCard
          label="CTA / View"
          value={eventCtr != null ? pct(eventCtr) : '—'}
          sub="click-through ratio"
        />
        <OverviewCard
          label="Celebrate / View"
          value={celebrationRate != null ? pct(celebrationRate) : '—'}
          sub="celebration trigger rate"
        />
      </div>

      <ScrollFadeX>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event Key</TableHead>
              <TableHead>Module</TableHead>
              <TableHead className="text-right">Unique Homes</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">Adoption</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={`${row.moduleKey}/${row.featureKey}`}>
                <TableCell className="font-mono text-xs text-slate-700">{row.featureKey}</TableCell>
                <TableCell className="font-mono text-xs capitalize text-slate-500">
                  {row.moduleKey.replace(/_/g, ' ')}
                </TableCell>
                <TableCell className="text-right tabular-nums text-slate-700">
                  {num(row.uniqueHomes)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-slate-600">
                  {num(row.totalEvents)}
                </TableCell>
                <TableCell className="text-right text-xs font-semibold text-slate-700">
                  {pct(row.adoptionRate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </ScrollFadeX>
    </Section>
  );
}

// ============================================================================
// FEATURE ADOPTION TABLE
// ============================================================================

function FeatureAdoptionTable({
  filters,
  enabled,
}: {
  filters: AdminAnalyticsFilters;
  enabled: boolean;
}) {
  const [sortBy, setSortBy] = useState<'adoptionRate' | 'uniqueHomes' | 'totalEvents'>(
    'uniqueHomes',
  );
  const [desc, setDesc] = useState(true);
  const q = useAdminAnalyticsFeatureAdoption(filters, enabled);

  function handleSort(col: typeof sortBy) {
    if (sortBy === col) setDesc((d) => !d);
    else {
      setSortBy(col);
      setDesc(true);
    }
  }

  function SortHead({
    col,
    label,
  }: {
    col: typeof sortBy;
    label: string;
  }) {
    const active = sortBy === col;
    return (
      <TableHead
        className={`cursor-pointer select-none text-right ${active ? 'text-slate-900' : ''}`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center justify-end gap-1">
          {label}
          {active && <span className="opacity-60">{desc ? '↓' : '↑'}</span>}
        </span>
      </TableHead>
    );
  }

  if (q.isLoading)
    return (
      <Section title="Feature Adoption" icon={Activity}>
        <TableSkeleton rows={8} />
      </Section>
    );
  if (q.isError)
    return (
      <Section title="Feature Adoption" icon={Activity}>
        <ErrorBanner message="Unable to load feature adoption data." />
      </Section>
    );

  const features = [...(q.data?.features ?? [])].sort((a, b) => {
    const va = a[sortBy] ?? 0;
    const vb = b[sortBy] ?? 0;
    return desc ? vb - va : va - vb;
  });

  return (
    <Section
      title="Feature Adoption"
      description={`${q.data?.totalActivatedHomes ?? '—'} activated homes to date. Adoption % = homes using the feature in this period ÷ homes activated to date.`}
      icon={Activity}
    >
      {features.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          No feature activity found for this date range.
        </div>
      ) : (
        <ScrollFadeX>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Feature</TableHead>
                <SortHead col="uniqueHomes" label="Unique Homes" />
                <SortHead col="totalEvents" label="Events" />
                <SortHead col="adoptionRate" label="Adoption" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map((f) => (
                <TableRow key={`${f.moduleKey}/${f.featureKey}`}>
                  <TableCell className="font-mono text-xs capitalize text-slate-500">
                    {f.moduleKey.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">
                    {f.featureKey.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-700">
                    {num(f.uniqueHomes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">
                    {num(f.totalEvents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-800"
                          style={{ width: `${Math.min(f.adoptionRate * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-700">
                        {pct(f.adoptionRate)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </ScrollFadeX>
      )}
    </Section>
  );
}

// ============================================================================
// TOP TOOLS TABLE
// ============================================================================

function TopToolsTable({
  filters,
  enabled,
}: {
  filters: AdminAnalyticsFilters;
  enabled: boolean;
}) {
  const q = useAdminAnalyticsTopTools({ ...filters, topN: 15 }, enabled);

  if (q.isLoading)
    return (
      <Section title="Top Used Tools" icon={TrendingUp}>
        <TableSkeleton rows={6} />
      </Section>
    );
  if (q.isError)
    return (
      <Section title="Top Used Tools" icon={TrendingUp}>
        <ErrorBanner message="Unable to load top tools data." />
      </Section>
    );

  const tools = q.data?.tools ?? [];

  return (
    <Section
      title="Top Used Tools"
      description="Most-used features ranked by unique homes."
      icon={TrendingUp}
    >
      {tools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          No tool usage data for this period.
        </div>
      ) : (
        <ScrollFadeX>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Module</TableHead>
                <TableHead className="text-right">Unique Homes</TableHead>
                <TableHead className="text-right">Events</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((t) => (
                <TableRow key={`${t.moduleKey}/${t.featureKey}`}>
                  <TableCell className="tabular-nums text-slate-400">{t.rank}</TableCell>
                  <TableCell className="font-medium text-slate-900">{t.label}</TableCell>
                  <TableCell className="font-mono text-xs capitalize text-slate-500">
                    {t.moduleKey.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-700">
                    {num(t.uniqueHomes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">
                    {num(t.totalEvents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </ScrollFadeX>
      )}
    </Section>
  );
}

// ============================================================================
// COHORT TABLE
// ============================================================================

function CohortTable({ enabled }: { enabled: boolean }) {
  const [cohortType, setCohortType] = useState<'weekly' | 'monthly'>('monthly');
  const q = useAdminAnalyticsCohorts({ cohortType, limit: 8 }, enabled);

  if (q.isLoading)
    return (
      <Section title="Cohort Retention" icon={Users}>
        <TableSkeleton rows={6} />
      </Section>
    );
  if (q.isError)
    return (
      <Section title="Cohort Retention" icon={Users}>
        <ErrorBanner message="Unable to load cohort data." />
      </Section>
    );

  const cohorts = q.data?.cohorts ?? [];

  // Find max week offset across all cohorts for column headers
  const maxWeek = cohorts.reduce(
    (m, c) => Math.max(m, ...c.retentionByWeek.map((r) => r.weekOffset)),
    0,
  );
  const weekCols = Array.from({ length: Math.min(maxWeek + 1, 13) }, (_, i) => i);

  function retentionColor(rate: number) {
    if (rate >= 0.7) return 'bg-emerald-100 text-emerald-800';
    if (rate >= 0.4) return 'bg-amber-50 text-amber-700';
    if (rate >= 0.15) return 'bg-slate-100 text-slate-600';
    return 'bg-white text-slate-400';
  }

  return (
    <Section
      title="Cohort Retention"
      description="Week-over-week retention by signup cohort."
      icon={Users}
    >
      <div className="mb-4 flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 w-fit">
        {(['monthly', 'weekly'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setCohortType(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
              cohortType === t
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {cohorts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Not enough data yet to show cohort retention. Cohorts build over time.
        </div>
      ) : (
        <ScrollFadeX>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-2 pr-3 text-left font-semibold text-slate-600">Cohort</th>
                <th className="pb-2 pr-3 text-right font-semibold text-slate-600">Size</th>
                {weekCols.map((w) => (
                  <th
                    key={w}
                    className="min-w-[52px] pb-2 text-center font-semibold text-slate-400"
                  >
                    W{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => {
                const byWeek = new Map(c.retentionByWeek.map((r) => [r.weekOffset, r]));
                return (
                  <tr key={c.cohortKey} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 font-mono font-medium text-slate-700">
                      {c.cohortKey}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                      {num(c.cohortSize)}
                    </td>
                    {weekCols.map((w) => {
                      const row = byWeek.get(w);
                      if (!row)
                        return (
                          <td key={w} className="py-1.5 text-center text-slate-200">
                            —
                          </td>
                        );
                      return (
                        <td key={w} className="py-1.5 text-center">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums ${retentionColor(row.retentionRate)}`}
                          >
                            {pct(row.retentionRate)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </ScrollFadeX>
      )}
    </Section>
  );
}

// ============================================================================
// TRENDS CHARTS SECTION
// ============================================================================

function TrendsSection({ filters, enabled }: { filters: AdminAnalyticsFilters; enabled: boolean }) {
  const q = useAdminAnalyticsTrends(filters, enabled);

  if (q.isLoading)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton label="Active Homes Trend" />
        <ChartSkeleton label="Interactions Trend" />
      </div>
    );

  if (q.isError)
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
        Unable to load trend data.
      </div>
    );

  const series = q.data?.series ?? [];
  const xLabels = series.map((p) => p.date);
  const wahValues = series.map((p) => p.wah);
  const activeValues = series.map((p) => p.activeProperties);
  const eventValues = series.map((p) => p.eventCount);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-950">
            <Home className="h-4 w-4 text-slate-400" />
            Active Homes
          </CardTitle>
          <CardDescription className="text-xs">
            Daily active properties and 7-day rolling WAH (est. — rolling sum, may overcount homes active on multiple days).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {xLabels.length < 2 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Not enough data for this period.
            </p>
          ) : (
            <AdminAnalyticsLineChart
              xLabels={xLabels}
              series={[
                { key: 'wah', label: 'WAH (7d)', values: wahValues, color: '#0f172a' },
                { key: 'active', label: 'Daily Active', values: activeValues, color: '#94a3b8', dash: '4 3' },
              ]}
              ariaLabel="Active homes trend"
              height={160}
            />
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-slate-200/80 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-950">
            <Activity className="h-4 w-4 text-slate-400" />
            Interactions
          </CardTitle>
          <CardDescription className="text-xs">
            Total homeowner interaction events per day. Admin analytics activity excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {xLabels.length < 2 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Not enough data for this period.
            </p>
          ) : (
            <AdminAnalyticsLineChart
              xLabels={xLabels}
              series={[
                { key: 'events', label: 'Events', values: eventValues, color: '#475569' },
              ]}
              ariaLabel="Interaction events trend"
              height={160}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const DEFAULT_FILTERS: AdminAnalyticsFilters = {
  from: daysAgo(30),
  to: today(),
};

export default function AnalyticsAdminPage() {
  const guard = useAdminGuard({
    title: 'Admin Analytics',
    subtitle: 'Monitor activation, engagement, adoption, and value delivery.',
  });
  const isAdmin = guard.isAdmin;
  const [filters, setFilters] = useState<AdminAnalyticsFilters>(DEFAULT_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const overviewQ = useAdminAnalyticsOverview(filters, isAdmin);

  // Track when overview data last loaded successfully
  React.useEffect(() => {
    if (overviewQ.data) setLastFetched(new Date());
  }, [overviewQ.data]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setFilters((f) => ({ ...f })); // triggers re-render / re-fetch
  }, []);

  if (guard.status !== 'ready') return guard.node;

  // ── Page ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile desktop-recommended banner */}
      <div className="lg:hidden mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="font-semibold">Best viewed on desktop.</span> This analytics dashboard contains wide data tables that work best on a larger screen.
      </div>
    <AdminConsoleShell
      title="Admin Analytics"
      subtitle="Monitor activation, engagement, adoption, and value delivery across Contract-to-Cozy."
      actions={
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded px-3 text-xs"
          onClick={handleRefresh}
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Refresh all
        </Button>
      }
      chips={
        <>
          <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold tracking-normal text-white hover:bg-slate-900">
            Platform Analytics
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-normal text-slate-600"
          >
            Internal
          </Badge>
          {lastFetched ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              Refreshed {lastFetched.toLocaleTimeString()}
            </span>
          ) : null}
        </>
      }
    >

        {/* ── Header ── */}
        <div className="space-y-1">
          <p className="text-xs tracking-normal text-slate-500">Operational View</p>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Dense metrics for activation, engagement, adoption, and value delivery, with refresh controls for rapid ops review.
          </p>
        </div>

        {/* ── Filter Bar ── */}
        <FilterBar filters={filters} onChange={setFilters} onRefresh={handleRefresh} />

        {/* ── Overview Cards ── */}
        {overviewQ.isLoading ? (
          <OverviewCardsSkeleton />
        ) : overviewQ.isError ? (
          <AdminRouteState
            state="error"
            title="Overview metrics unavailable"
            description="Unable to load overview analytics right now. Refresh and retry."
            action={
              <Button variant="outline" size="sm" className="rounded-full" onClick={handleRefresh}>
                Retry overview
              </Button>
            }
          />
        ) : overviewQ.data ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <OverviewCard
              label="Activated Homes"
              value={num(overviewQ.data.activation.activatedProperties)}
              sub={`${pct(overviewQ.data.activation.activationRate)} of ${num(overviewQ.data.activation.totalProperties)} total`}
            />
            <OverviewCard
              label="Weekly Active Homes"
              value={num(overviewQ.data.activeHomes.weeklyActiveHomes)}
              sub={`${num(overviewQ.data.activeHomes.monthlyActiveHomes)} monthly · exact distinct count`}
            />
            <OverviewCard
              label="WAH / MAH Ratio"
              value={overviewQ.data.activeHomes.wahOverMah != null ? dec(overviewQ.data.activeHomes.wahOverMah, 2) : '—'}
              sub="Stickiness · higher = better"
            />
            <OverviewCard
              label="Avg Interactions"
              value={dec(overviewQ.data.interactions.avgInteractionsPerActiveHome)}
              sub="per MAH · admin events excluded"
            />
            <OverviewCard
              label="Decisions Guided"
              value={num(overviewQ.data.decisionsGuided.totalDecisionsGuided)}
              sub={`+${num(overviewQ.data.activation.newActivationsInPeriod)} new activations`}
            />
          </div>
        ) : (
          <AdminRouteState
            state="empty"
            title="No overview data in this window"
            description="Adjust date range or module filter to load analytics data."
          />
        )}

        {/* ── Phase 1 Pilot ── */}
        <Phase1PilotSection
          filters={filters}
          enabled={isAdmin}
          key={`phase1-pilot-${refreshKey}`}
        />

        <Phase6PilotSection filters={filters} enabled={isAdmin} key={`phase6-pilot-${refreshKey}`} />

        {/* ── Trends ── */}
        <TrendsSection filters={filters} enabled={isAdmin} key={`trends-${refreshKey}`} />

        {/* ── Funnel + Engagement side by side on wide desktop ── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <FunnelSection filters={filters} enabled={isAdmin} key={`funnel-${refreshKey}`} />
          <EngagementBreakdown filters={filters} enabled={isAdmin} key={`engage-${refreshKey}`} />
        </div>

        {/* ── Decisions Guided ── */}
        {overviewQ.data && (
          <DecisionGuidedSection
            filters={filters}
            enabled={isAdmin}
            overview={overviewQ.data}
          />
        )}

        {/* ── Aha Journey (testing) ── */}
        <AhaJourneySection filters={filters} enabled={isAdmin} key={`aha-${refreshKey}`} />

        {/* ── Feature Adoption ── */}
        <FeatureAdoptionTable filters={filters} enabled={isAdmin} key={`adopt-${refreshKey}`} />

        {/* ── Top Tools ── */}
        <TopToolsTable filters={filters} enabled={isAdmin} key={`tools-${refreshKey}`} />

        {/* ── Cohort Retention ── */}
        <CohortTable enabled={isAdmin} key={`cohort-${refreshKey}`} />

        {/* ── Footer / trust cues ── */}
        <div className="space-y-1 text-center">
          <p className="text-xs text-slate-400">
            Showing data from{' '}
            <span className="font-medium text-slate-500">
              {filters.from ? fmtDate(filters.from) : '—'}
            </span>{' '}
            to{' '}
            <span className="font-medium text-slate-500">
              {filters.to ? fmtDate(filters.to) : '—'}
            </span>
            {lastFetched && (
              <>
                {' · '}Fetched{' '}
                <span className="font-medium text-slate-500">
                  {lastFetched.toLocaleTimeString()}
                </span>
              </>
            )}
          </p>
          <p className="text-[11px] text-slate-300">
            <Info className="mr-1 inline h-3 w-3" />
            Queries run live · Admin activity excluded from engagement counts · View events deduplicated (1hr window) · WAH trend line is an estimate
          </p>
        </div>
    </AdminConsoleShell>
    </>
  );
}
