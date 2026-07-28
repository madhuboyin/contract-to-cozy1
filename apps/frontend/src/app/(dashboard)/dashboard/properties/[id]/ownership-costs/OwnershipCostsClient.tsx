'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  FileSearch,
  RefreshCw,
  Receipt,
  TriangleAlert,
} from 'lucide-react';
import { track } from '@/lib/analytics/events';
import {
  getOwnershipCostChanges,
  getOwnershipCosts,
  recalculateOwnershipCosts,
  type OwnershipCostChangeReadModel,
  type OwnershipCostCurrentLens,
  type OwnershipCostReadModel,
  type OwnershipCostReadModelCategory,
} from './ownershipCostsApi';

const VIEWS = [
  { key: 'current', label: 'Current cost', icon: CircleDollarSign },
  { key: 'changes', label: 'What changed', icon: FileSearch },
  { key: 'forecast', label: 'What may change', icon: CalendarRange },
  { key: 'variability', label: 'Plan a buffer', icon: Activity },
] as const;

const LENSES: Array<{
  key: OwnershipCostCurrentLens;
  label: string;
  description: string;
}> = [
  {
    key: 'OPERATING_EXPENSE',
    label: 'Operating expense',
    description: 'Recurring costs of operating the home; principal and reserves stay separate.',
  },
  {
    key: 'CASH_OUTFLOW',
    label: 'Cash outflow',
    description: 'Supported payments leaving the household, including principal and planned reserves.',
  },
];

type OwnershipCostsView = typeof VIEWS[number]['key'];

function moneyFromCents(value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Period unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function percentLabel(value: number | null) {
  if (value == null) return 'Percent unavailable';
  const sign = value > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)}`;
}

function coverageCopy(model: OwnershipCostReadModel) {
  switch (model.snapshot.coverageStatus) {
    case 'CREDIBLE':
      return 'Confirmed current cost';
    case 'PARTIAL':
      return 'Partial current cost';
    case 'ESTIMATE_ONLY':
      return 'Current estimate only';
    default:
      return 'More information needed';
  }
}

function statusStyle(kind: OwnershipCostReadModelCategory['amountKind']) {
  switch (kind) {
    case 'CONFIRMED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'ESTIMATED':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'NOT_APPLICABLE':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-800';
  }
}

function statusLabel(category: OwnershipCostReadModelCategory) {
  if (category.amountKind === 'NOT_APPLICABLE') return 'Not applicable';
  if (category.amountKind === 'MISSING') return 'Missing';
  if (category.amountKind === 'CONFIRMED') return 'Confirmed';
  return category.evidenceStatus === 'BENCHMARK' ? 'Benchmark estimate' : 'Estimated';
}

export default function OwnershipCostsClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const requestedView = searchParams.get('view');
  const view: OwnershipCostsView = VIEWS.some((item) => item.key === requestedView)
    ? requestedView as OwnershipCostsView
    : 'current';
  const requestedLens = searchParams.get('lens');
  const lens: OwnershipCostCurrentLens = requestedLens === 'CASH_OUTFLOW'
    ? 'CASH_OUTFLOW'
    : 'OPERATING_EXPENSE';
  const [data, setData] = useState<OwnershipCostReadModel | null>(null);
  const [changeData, setChangeData] =
    useState<OwnershipCostChangeReadModel | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (forceRefresh: boolean) => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    setChangeError(null);
    try {
      const result = forceRefresh
        ? await recalculateOwnershipCosts(propertyId, lens)
          .catch(() => getOwnershipCosts(propertyId, lens))
        : await getOwnershipCosts(propertyId, lens);
      setData(result);
      try {
        setChangeData(await getOwnershipCostChanges(propertyId, lens));
      } catch (changeCause) {
        setChangeData(null);
        setChangeError(
          changeCause instanceof Error
            ? changeCause.message
            : 'Observed changes are temporarily unavailable.',
        );
      }
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Ownership costs are temporarily unavailable.',
      );
    } finally {
      setLoading(false);
    }
  }, [lens, propertyId]);

  useEffect(() => {
    void load(true);
    track('workflow_started', {
      tool: 'ownership-costs',
      propertyId,
      entryPoint: 'direct',
    });
  }, [load, propertyId]);

  useEffect(() => {
    if (!data) return;
    track('workflow_step_reached', {
      tool: 'ownership-costs',
      propertyId,
      step: `readiness_${data.snapshot.coverageStatus.toLowerCase()}`,
    });
  }, [data, propertyId]);

  const includedCategories = useMemo(
    () => data?.categories.filter((category) =>
      category.includedInSelectedLens) ?? [],
    [data],
  );
  const evidenceTotal = data
    ? data.evidenceSummary.confirmedAnnualCents
      + data.evidenceSummary.estimatedAnnualCents
    : 0;
  const confirmedShare = evidenceTotal > 0 && data
    ? Math.round(
      (data.evidenceSummary.confirmedAnnualCents / evidenceTotal) * 100,
    )
    : 0;

  const viewContent = {
    current: {
      title: 'Current cost and completeness',
      description: 'Confirmed facts, estimates, and missing categories stay visibly separate.',
    },
    changes: {
      title: 'What changed',
      description: 'Only non-overlapping periods with comparable observed evidence appear here. Unsupported reasons remain unexplained.',
    },
    forecast: {
      title: 'What may change',
      description: 'Forward scenarios begin after the latest confirmed period and keep assumptions separate from canonical facts.',
    },
    variability: {
      title: 'Plan for variability',
      description: 'Measured variability is withheld until at least three comparable observed annual periods exist.',
    },
  }[view];

  function correctionClick(category: OwnershipCostReadModelCategory) {
    track('action_taken', {
      tool: 'ownership-costs',
      actionType: `correct_${category.category.toLowerCase()}`,
      propertyId,
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href={`/dashboard/properties/${propertyId}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to property
      </Link>

      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-teal-50/50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <Receipt className="h-3.5 w-3.5" />
              Material financial planning
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Cost of owning this home
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {data?.propertyLabel
                ? `${data.propertyLabel}. `
                : ''}
              See the current cost, how complete it is, and where every number came from.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                {data ? coverageCopy(data) : 'Calculating coverage'}
              </span>
              {data?.snapshot.lastKnownGood && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-900">
                  Last confirmed result
                </span>
              )}
              {data && (
                <span className="text-slate-500">
                  Calculated {dateLabel(data.snapshot.calculatedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-64 rounded-2xl border border-slate-200 bg-white/85 px-4 py-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">
              {lens === 'OPERATING_EXPENSE' ? 'Operating expense' : 'Cash outflow'}
            </div>
            <div className="mt-1 text-3xl font-semibold text-slate-950">
              {moneyFromCents(data?.snapshot.annualTotalCents)}
              <span className="ml-1 text-sm font-normal text-slate-500">/ year</span>
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {moneyFromCents(data?.snapshot.monthlyTotalCents)} / month
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh sources
            </button>
          </div>
        </div>

        <nav aria-label="Ownership cost views" className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const active = item.key === view;
            return (
              <Link
                key={item.key}
                href={`/dashboard/properties/${propertyId}/ownership-costs?view=${item.key}&lens=${lens}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white/75 text-slate-700 hover:border-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </section>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Current ownership cost is unavailable</div>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={() => void load(true)}
            className="mt-3 min-h-10 rounded-xl border border-red-300 bg-white px-3 py-2 font-medium"
          >
            Try again
          </button>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">{viewContent.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {viewContent.description}
        </p>

        {view === 'current' ? (
          <div className="mt-6 space-y-6">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">Choose a cost lens</legend>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {LENSES.map((item) => (
                  <Link
                    key={item.key}
                    href={`/dashboard/properties/${propertyId}/ownership-costs?view=current&lens=${item.key}`}
                    aria-current={lens === item.key ? 'true' : undefined}
                    className={`rounded-2xl border p-4 transition ${
                      lens === item.key
                        ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-950">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{item.description}</span>
                  </Link>
                ))}
              </div>
            </fieldset>

            {data?.stale.isStale && (
              <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div className="font-semibold">Review source freshness</div>
                  <p className="mt-1">{data.stale.reason}</p>
                </div>
              </div>
            )}

            {data && (
              <section aria-labelledby="attention-heading" className="rounded-2xl border border-teal-200 bg-teal-50/70 p-5">
                <h3 id="attention-heading" className="text-sm font-semibold uppercase tracking-wide text-teal-800">
                  What needs attention
                </h3>
                <p className="mt-2 text-lg font-semibold text-slate-950">{data.rankedAction.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{data.rankedAction.detail}</p>
                {data.rankedAction.href && data.rankedAction.label && (
                  <Link
                    href={data.rankedAction.href}
                    onClick={() => {
                      const category = data.categories.find((item) =>
                        item.category === data.rankedAction.category);
                      if (category) correctionClick(category);
                    }}
                    className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {data.rankedAction.label}
                  </Link>
                )}
              </section>
            )}

            <section aria-labelledby="composition-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id="composition-heading" className="text-base font-semibold text-slate-950">
                    Current category composition
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    One missing category does not suppress valid partial amounts.
                  </p>
                </div>
                <div className="text-sm text-slate-600">
                  {data?.coverage.confirmedCategoryCount ?? 0} confirmed ·{' '}
                  {data?.coverage.estimatedCategoryCount ?? 0} estimated ·{' '}
                  {data?.coverage.missingCategoryCount ?? 0} missing
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {includedCategories.map((category) => (
                  <article key={category.category} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-semibold text-slate-950">{category.label}</h4>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusStyle(category.amountKind)}`}>
                        {statusLabel(category)}
                      </span>
                    </div>
                    <div className="mt-3 text-xl font-semibold text-slate-950">
                      {moneyFromCents(category.amountCents)}
                      {category.amountCents != null && (
                        <span className="ml-1 text-xs font-normal text-slate-500">/ year</span>
                      )}
                    </div>
                    <Link
                      href={category.correction.href}
                      onClick={() => correctionClick(category)}
                      className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-teal-700 hover:text-teal-900"
                    >
                      {category.correction.label}
                    </Link>
                  </article>
                ))}
              </div>
            </section>

            {data && (
              <section aria-labelledby="evidence-mix-heading" className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 id="evidence-mix-heading" className="text-base font-semibold text-slate-950">
                      Confirmed and estimated share
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Estimates never appear as confirmed.
                    </p>
                  </div>
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold">{moneyFromCents(data.evidenceSummary.confirmedAnnualCents)}</span> confirmed ·{' '}
                    <span className="font-semibold">{moneyFromCents(data.evidenceSummary.estimatedAnnualCents)}</span> estimated
                  </div>
                </div>
                <div
                  role="img"
                  aria-label={`${confirmedShare}% of the known annual total is confirmed`}
                  className="mt-4 h-3 overflow-hidden rounded-full bg-amber-200"
                >
                  <div className="h-full bg-emerald-500" style={{ width: `${confirmedShare}%` }} />
                </div>
              </section>
            )}

            <section aria-labelledby="evidence-heading">
              <h3 id="evidence-heading" className="text-base font-semibold text-slate-950">
                Where the numbers come from
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Source, period, freshness, and correction destination for each included category.
              </p>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <caption className="sr-only">
                    Current ownership cost categories, evidence, source period, freshness, and correction links
                  </caption>
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Category</th>
                      <th scope="col" className="px-4 py-3">Annual amount</th>
                      <th scope="col" className="px-4 py-3">Evidence</th>
                      <th scope="col" className="px-4 py-3">Source period</th>
                      <th scope="col" className="px-4 py-3">Freshness</th>
                      <th scope="col" className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {includedCategories.map((category) => (
                      <tr key={category.category}>
                        <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                          {category.label}
                        </th>
                        <td className="px-4 py-3 text-slate-700">{moneyFromCents(category.amountCents)}</td>
                        <td className="px-4 py-3 text-slate-700">{statusLabel(category)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {category.periodEnd ? `Through ${dateLabel(category.periodEnd)}` : 'Not available'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{category.freshnessStatus.toLowerCase()}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={category.correction.href}
                            onClick={() => correctionClick(category)}
                            className="font-semibold text-teal-700 hover:text-teal-900"
                          >
                            {category.correction.label}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {data && (
              <details className="rounded-2xl border border-slate-200 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Definitions and limitations
                </summary>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  {data.limitations.map((limitation) => (
                    <li key={limitation} className="flex gap-2">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-teal-600" />
                      {limitation}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : view === 'changes' ? (
          <div className="mt-6 space-y-6">
            {changeError && (
              <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {changeError}
              </div>
            )}

            {!changeData?.comparable ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <div className="flex gap-3">
                  <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Not enough comparable observed history
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {changeData?.reason ??
                        'Add a second comparable bill period to explain a real change.'}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Estimates, modeled backcasts, overlapping periods, and
                      unverified records are excluded.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <section aria-labelledby="change-summary-heading" className="grid gap-3 sm:grid-cols-2">
                  <article className="rounded-2xl border border-slate-200 p-5">
                    <h3 id="change-summary-heading" className="text-sm font-semibold text-slate-600">
                      Recurring annual change
                    </h3>
                    <div className={`mt-2 text-2xl font-semibold ${
                      changeData.totalRecurringDeltaCents > 0
                        ? 'text-rose-700'
                        : changeData.totalRecurringDeltaCents < 0
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                    }`}>
                      {changeData.totalRecurringDeltaCents > 0 ? '+' : ''}
                      {moneyFromCents(changeData.totalRecurringDeltaCents)}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Repeats annually if the supported current amount continues.
                    </p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-600">
                      One-time change
                    </h3>
                    <div className={`mt-2 text-2xl font-semibold ${
                      changeData.totalOneTimeDeltaCents > 0
                        ? 'text-rose-700'
                        : changeData.totalOneTimeDeltaCents < 0
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                    }`}>
                      {changeData.totalOneTimeDeltaCents > 0 ? '+' : ''}
                      {moneyFromCents(changeData.totalOneTimeDeltaCents)}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Recorded project or repair impact; not treated as recurring.
                    </p>
                  </article>
                </section>

                <section aria-labelledby="ranked-changes-heading">
                  <h3 id="ranked-changes-heading" className="text-base font-semibold text-slate-950">
                    Ranked observed changes
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Ranked by annual impact, confidence, materiality, and whether
                    there is an executable next step.
                  </p>
                  <div className="mt-4 space-y-4">
                    {changeData.changes.map((change) => (
                      <article key={`${change.category}:${change.toSnapshotId}`} className="rounded-2xl border border-slate-200 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-semibold text-slate-950">{change.label}</h4>
                              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                change.impact === 'RECURRING'
                                  ? 'border-violet-200 bg-violet-50 text-violet-800'
                                  : 'border-blue-200 bg-blue-50 text-blue-800'
                              }`}>
                                {change.impact === 'RECURRING' ? 'Recurring impact' : 'One-time impact'}
                              </span>
                              {change.materiality.material && (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">
                                  Material
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-700">{change.explanation}</p>
                            {change.explanationStatus === 'UNEXPLAINED' && (
                              <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-amber-800">
                                <TriangleAlert className="h-4 w-4" />
                                Reason unknown — no cause was inferred.
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <div className={`text-2xl font-semibold ${
                              change.deltaCents > 0 ? 'text-rose-700' : 'text-emerald-700'
                            }`}>
                              {change.deltaCents > 0 ? '+' : ''}
                              {moneyFromCents(change.deltaCents)}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {percentLabel(change.deltaPercent)}
                            </div>
                          </div>
                        </div>

                        <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prior period</dt>
                            <dd className="mt-1 text-slate-800">
                              {moneyFromCents(change.priorAnnualCents)} · through {dateLabel(change.priorPeriod.end)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current period</dt>
                            <dd className="mt-1 text-slate-800">
                              {moneyFromCents(change.currentAnnualCents)} · through {dateLabel(change.currentPeriod.end)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence</dt>
                            <dd className="mt-1 text-slate-800">{change.confidence.toLowerCase()}</dd>
                          </div>
                        </dl>

                        <details className="mt-4 rounded-xl border border-slate-200 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                            View source evidence ({change.evidence.length})
                          </summary>
                          <div className="mt-3 overflow-x-auto">
                            <table className="min-w-[640px] w-full text-left text-sm">
                              <caption className="sr-only">
                                Evidence used for the {change.label} observed change
                              </caption>
                              <thead className="text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th scope="col" className="pb-2 pr-4">Source</th>
                                  <th scope="col" className="pb-2 pr-4">Period</th>
                                  <th scope="col" className="pb-2 pr-4">Evidence</th>
                                  <th scope="col" className="pb-2">Verification</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {change.evidence.map((item) => (
                                  <tr key={item.observationId}>
                                    <td className="py-2 pr-4">{item.sourceDomain.toLowerCase().replace(/_/g, ' ')}</td>
                                    <td className="py-2 pr-4">
                                      {dateLabel(item.periodStart)} – {dateLabel(item.periodEnd)}
                                    </td>
                                    <td className="py-2 pr-4">{item.evidenceStatus.toLowerCase().replace(/_/g, ' ')}</td>
                                    <td className="py-2">{item.verificationStatus.toLowerCase().replace(/_/g, ' ')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <Link
                            href={change.action.href}
                            onClick={() => track('action_taken', {
                              tool: 'ownership-costs',
                              actionType: `review_change_${change.category.toLowerCase()}`,
                              propertyId,
                            })}
                            className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                          >
                            {change.action.label}
                          </Link>
                          <span className="text-xs text-slate-500">
                            Dismissal, deferral, and resolution are available when this material change appears in Home Actions.
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <details className="rounded-2xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    Change calculation limits
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    {changeData.limitations.map((limitation) => (
                      <li key={limitation} className="flex gap-2">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-teal-600" />
                        {limitation}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
            This canonical view is intentionally gated until its evidence contract is delivered in the corresponding implementation slice.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        This is educational planning support, not financial, tax, insurance,
        mortgage, valuation, or investment advice. Missing categories are not zero.
      </section>
    </main>
  );
}
