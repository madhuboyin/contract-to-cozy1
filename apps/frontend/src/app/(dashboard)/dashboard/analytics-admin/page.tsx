'use client';

// apps/frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx
//
// Admin-only product analytics dashboard.
// Mirrors the knowledge-admin page pattern for role guard, layout and styling.

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  BarChart2,
  ChevronDown,
  Filter,
  Home,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { DashboardShell } from '@/components/DashboardShell';
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
} from '@/hooks/useAdminAnalytics';
import AdminAnalyticsLineChart from '@/components/admin-analytics/AdminAnalyticsLineChart';
import {
  OverviewCardsSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from '@/components/admin-analytics/AdminAnalyticsSkeleton';
import type { AdminAnalyticsFilters } from '@/lib/api/adminAnalytics';

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
// ACCESS STATE (same as knowledge-admin)
// ============================================================================

function AccessState({ title, description }: { title: string; description: string }) {
  return (
    <DashboardShell className="py-10">
      <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">{description}</p>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </DashboardShell>
  );
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
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
    <div className="flex flex-wrap items-center gap-3">
      {/* Preset buttons */}
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

      {/* Custom date inputs */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
          aria-label="Start date"
        />
        <span className="text-xs text-slate-400">–</span>
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
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
          className="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-7 pr-7 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
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
          className="cursor-pointer rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600 hover:bg-slate-100"
          onClick={() => onChange({ ...filters, moduleKey: undefined })}
        >
          {filters.moduleKey} ×
        </Badge>
      )}

      {/* Refresh */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="ml-auto h-8 rounded-full px-3 text-xs text-slate-500 hover:text-slate-900"
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
      description="Users progressing through the CtC activation journey."
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
                <p className="mt-0.5 text-right text-[10px] text-slate-400">
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
      description="Where users spend time across CtC features."
      icon={BarChart2}
    >
      <div className="space-y-2">
        {modules.map(([moduleKey, { events, homes }]) => (
          <div key={moduleKey} className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-xs font-medium capitalize text-slate-600">
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
            <div className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">
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
      description="Moments where CtC actively drove a homeowner decision."
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
              <div className="w-32 shrink-0 text-xs font-medium capitalize text-slate-600">
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
      description={`${q.data?.totalActivatedHomes ?? '—'} activated homes in period.`}
      icon={Activity}
    >
      {features.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          No feature activity found for this date range.
        </div>
      ) : (
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
  const { user, loading } = useAuth();
  const [filters, setFilters] = useState<AdminAnalyticsFilters>(DEFAULT_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const isAdmin = !loading && user?.role === 'ADMIN';

  const overviewQ = useAdminAnalyticsOverview(filters, isAdmin);

  // Track when overview data last loaded successfully
  React.useEffect(() => {
    if (overviewQ.data) setLastFetched(new Date());
  }, [overviewQ.data]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setFilters((f) => ({ ...f })); // triggers re-render / re-fetch
  }, []);

  // ── Auth guards ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardShell className="py-10">
        <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
          <CardContent className="flex items-center justify-center gap-3 py-16 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking admin access…
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <AccessState
        title="Sign in required"
        description="This internal analytics view requires authentication."
      />
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <AccessState
        title="Admin access required"
        description="Only CtC admins can view the product analytics dashboard."
      />
    );
  }

  // ── Page ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_30%,#f8fafc_100%)]">
      <DashboardShell className="space-y-6 py-8 md:py-10">

        {/* ── Header ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white hover:bg-slate-900">
              Platform Analytics
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600"
            >
              Internal
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Admin Analytics
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
            Monitor activation, engagement, adoption, and value delivery across Contract-to-Cozy.
          </p>
        </div>

        {/* ── Filter Bar ── */}
        <FilterBar filters={filters} onChange={setFilters} onRefresh={handleRefresh} />

        {/* ── Overview Cards ── */}
        {overviewQ.isLoading ? (
          <OverviewCardsSkeleton />
        ) : overviewQ.isError ? (
          <ErrorBanner message="Unable to load overview metrics." />
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
        ) : null}

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
      </DashboardShell>
    </div>
  );
}
