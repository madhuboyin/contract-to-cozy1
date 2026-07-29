'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Archive,
  ArrowLeft,
  Bell,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  FileSearch,
  RefreshCw,
  Receipt,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { track } from '@/lib/analytics/events';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import {
  createOwnershipCostScenario,
  deleteOwnershipCostScenario,
  getOwnershipCostChanges,
  getOwnershipCostForecast,
  getOwnershipCostDecisions,
  getOwnershipCosts,
  getOwnershipCostVariability,
  listOwnershipCostScenarios,
  recalculateOwnershipCostForecast,
  recalculateOwnershipCosts,
  recordOwnershipCostPlanningDecision,
  recordOwnershipCostDecision,
  updateOwnershipCostNotificationPreferences,
  updateOwnershipCostScenario,
  type OwnershipCostChangeReadModel,
  type OwnershipCostCategory,
  type OwnershipCostCurrentLens,
  type OwnershipCostDecisionAction,
  type OwnershipCostDecisionReadModel,
  type OwnershipCostForecastReadModel,
  type OwnershipCostReadModel,
  type OwnershipCostReadModelCategory,
  type OwnershipCostScenarioReadModel,
  type OwnershipCostVariabilityReadModel,
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

function isMissingOptionalOwnershipCostRoute(
  cause: unknown,
  routeName: string,
) {
  return cause instanceof Error
    && cause.message.toLowerCase().includes(`ownership-costs/${routeName}`)
    && cause.message.toLowerCase().includes('not found');
}

const FORECAST_HORIZONS = [1, 3, 5, 10] as const;

function rateLabel(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

function ForecastPlanningView({
  propertyId,
  lens,
}: {
  propertyId: string;
  lens: OwnershipCostCurrentLens;
}) {
  const [horizonYears, setHorizonYears] = useState(5);
  const [forecast, setForecast] =
    useState<OwnershipCostForecastReadModel | null>(null);
  const [scenarios, setScenarios] =
    useState<OwnershipCostScenarioReadModel[]>([]);
  const [scenarioName, setScenarioName] = useState('');
  const [overrideCategory, setOverrideCategory] =
    useState<OwnershipCostCategory>('PROPERTY_TAX');
  const [growthPercent, setGrowthPercent] = useState('');
  const [annualAdjustmentDollars, setAnnualAdjustmentDollars] = useState('');
  const [busy, setBusy] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const loadForecast = useCallback(async () => {
    setBusy(true);
    setForecastError(null);
    try {
      const [nextForecast, nextScenarios] = await Promise.all([
        getOwnershipCostForecast(propertyId, lens, horizonYears),
        listOwnershipCostScenarios(propertyId),
      ]);
      setForecast(nextForecast);
      setScenarios(nextScenarios);
      if (
        !nextForecast.drivers.some(
          (driver) => driver.category === overrideCategory,
        )
        && nextForecast.drivers[0]
      ) {
        setOverrideCategory(nextForecast.drivers[0].category);
      }
    } catch (cause) {
      setForecastError(
        cause instanceof Error
          ? cause.message
          : 'The forward planning range is temporarily unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }, [horizonYears, lens, overrideCategory, propertyId]);

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  async function persistBaseForecast() {
    setBusy(true);
    setForecastError(null);
    try {
      setForecast(
        await recalculateOwnershipCostForecast(
          propertyId,
          lens,
          horizonYears,
        ),
      );
      track('workflow_step_reached', {
        tool: 'ownership-costs',
        propertyId,
        step: 'forecast_saved',
      });
    } catch (cause) {
      setForecastError(
        cause instanceof Error
          ? cause.message
          : 'The forecast could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveScenario() {
    const growth = growthPercent.trim() === ''
      ? null
      : Number(growthPercent) / 100;
    const adjustment = annualAdjustmentDollars.trim() === ''
      ? null
      : Math.round(Number(annualAdjustmentDollars) * 100);
    if (!scenarioName.trim()) {
      setForecastError('Enter a scenario name.');
      return;
    }
    if (growth != null && (!Number.isFinite(growth) || growth < -0.25 || growth > 0.5)) {
      setForecastError('Annual growth must be between -25% and 50%.');
      return;
    }
    if (
      adjustment != null
      && (!Number.isSafeInteger(adjustment)
        || Math.abs(adjustment) > 100_000_000)
    ) {
      setForecastError('Annual adjustment must be between -$1,000,000 and $1,000,000.');
      return;
    }
    setBusy(true);
    setForecastError(null);
    try {
      await createOwnershipCostScenario(propertyId, {
        name: scenarioName,
        lens,
        horizonYears,
        overrides: {
          ...(growth == null ? {} : {
            categoryGrowthRates: { [overrideCategory]: growth },
          }),
          ...(adjustment == null ? {} : {
            categoryAnnualAdjustmentsCents: {
              [overrideCategory]: adjustment,
            },
          }),
        },
      });
      setScenarioName('');
      setGrowthPercent('');
      setAnnualAdjustmentDollars('');
      setScenarios(await listOwnershipCostScenarios(propertyId));
      track('workflow_step_reached', {
        tool: 'ownership-costs',
        propertyId,
        step: 'scenario_saved',
      });
    } catch (cause) {
      setForecastError(
        cause instanceof Error
          ? cause.message
          : 'The scenario could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function renameScenario(scenario: OwnershipCostScenarioReadModel) {
    const name = window.prompt('Rename scenario', scenario.name)?.trim();
    if (!name || name === scenario.name) return;
    setBusy(true);
    try {
      await updateOwnershipCostScenario(
        propertyId,
        scenario.id,
        { name },
      );
      setScenarios(await listOwnershipCostScenarios(propertyId));
    } catch (cause) {
      setForecastError(
        cause instanceof Error ? cause.message : 'Rename failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveScenario(scenario: OwnershipCostScenarioReadModel) {
    setBusy(true);
    try {
      await updateOwnershipCostScenario(
        propertyId,
        scenario.id,
        { status: 'ARCHIVED' },
      );
      setScenarios(await listOwnershipCostScenarios(propertyId));
    } catch (cause) {
      setForecastError(
        cause instanceof Error ? cause.message : 'Archive failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeScenario(scenario: OwnershipCostScenarioReadModel) {
    if (!window.confirm(`Delete “${scenario.name}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteOwnershipCostScenario(propertyId, scenario.id);
      setScenarios(await listOwnershipCostScenarios(propertyId));
    } catch (cause) {
      setForecastError(
        cause instanceof Error ? cause.message : 'Delete failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!forecast && busy) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-600">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Building the forward planning range…
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {forecastError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {forecastError}
        </div>
      )}

      <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">
              Forward planning range
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-700">
              Starts after the latest ownership-cost period. Values are nominal
              dollars and are never presented as observed history.
            </p>
          </div>
          <label className="text-sm font-medium text-slate-800">
            Forecast horizon
            <select
              value={horizonYears}
              onChange={(event) => setHorizonYears(Number(event.target.value))}
              className="mt-1 block min-h-11 rounded-xl border border-slate-300 bg-white px-3"
            >
              {FORECAST_HORIZONS.map((years) => (
                <option key={years} value={years}>
                  {years} {years === 1 ? 'year' : 'years'}
                </option>
              ))}
            </select>
          </label>
        </div>
        {forecast && (
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current base
              </dt>
              <dd className="mt-1 text-xl font-semibold text-slate-950">
                {moneyFromCents(forecast.baseSnapshot.annualCents)}
              </dd>
            </div>
            <div className="rounded-xl bg-white p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Base case at horizon
              </dt>
              <dd className="mt-1 text-xl font-semibold text-slate-950">
                {moneyFromCents(forecast.summary.endYear.baseCents)}
              </dd>
            </div>
            <div className="rounded-xl bg-white p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Low–high range
              </dt>
              <dd className="mt-1 text-xl font-semibold text-slate-950">
                {moneyFromCents(forecast.summary.endYear.lowCents)} –{' '}
                {moneyFromCents(forecast.summary.endYear.highCents)}
              </dd>
            </div>
          </dl>
        )}
        <button
          type="button"
          onClick={() => void persistBaseForecast()}
          disabled={busy || !forecast}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {forecast?.forecastId ? 'Forecast saved' : 'Save this forecast'}
        </button>
      </section>

      {forecast && (
        <>
          <section aria-labelledby="forecast-periods-heading">
            <h3 id="forecast-periods-heading" className="text-base font-semibold text-slate-950">
              Annual planning range
            </h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[640px] w-full text-left text-sm">
                <caption className="sr-only">
                  Forward low, base, and high ownership-cost planning ranges
                </caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Forward year</th>
                    <th scope="col" className="px-4 py-3">Low</th>
                    <th scope="col" className="px-4 py-3">Base</th>
                    <th scope="col" className="px-4 py-3">High</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {forecast.periods.map((period) => (
                    <tr key={period.year}>
                      <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                        {period.year}
                      </th>
                      <td className="px-4 py-3">{moneyFromCents(period.lowCents)}</td>
                      <td className="px-4 py-3 font-semibold">{moneyFromCents(period.baseCents)}</td>
                      <td className="px-4 py-3">{moneyFromCents(period.highCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="forecast-drivers-heading">
            <h3 id="forecast-drivers-heading" className="text-base font-semibold text-slate-950">
              What drives the range
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Ranked by the category’s low-to-high sensitivity at the selected horizon.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {forecast.drivers.map((driver) => (
                <article key={driver.category} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-slate-950">{driver.label}</h4>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                      {driver.rateSource.toLowerCase().replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{driver.rateSourceLabel}</p>
                  <div className="mt-3 text-sm text-slate-700">
                    Annual rate: {rateLabel(driver.lowRate)} /{' '}
                    <strong>{rateLabel(driver.baseRate)}</strong> /{' '}
                    {rateLabel(driver.highRate)}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Horizon sensitivity: {moneyFromCents(driver.sensitivityCents)}
                  </div>
                  {driver.knownEvents.map((event) => (
                    <div key={`${event.year}:${event.label}`} className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-900">
                      {event.year}: {event.label} ({moneyFromCents(event.deltaCents)})
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="scenario-builder-heading" className="rounded-2xl border border-slate-200 p-5">
            <h3 id="scenario-builder-heading" className="text-base font-semibold text-slate-950">
              Save a planning scenario
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Scenario overrides do not change canonical facts. Growth is
              bounded from -25% to 50% annually and adjustments are limited to
              ±$1,000,000.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium text-slate-800">
                Scenario name
                <input
                  value={scenarioName}
                  onChange={(event) => setScenarioName(event.target.value)}
                  maxLength={80}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                  placeholder="Higher tax case"
                />
              </label>
              <label className="text-sm font-medium text-slate-800">
                Category
                <select
                  value={overrideCategory}
                  onChange={(event) => setOverrideCategory(
                    event.target.value as OwnershipCostCategory,
                  )}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                >
                  {forecast.drivers.map((driver) => (
                    <option key={driver.category} value={driver.category}>
                      {driver.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-800">
                Annual growth %
                <input
                  type="number"
                  min="-25"
                  max="50"
                  step="0.1"
                  value={growthPercent}
                  onChange={(event) => setGrowthPercent(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                  placeholder="Optional"
                />
              </label>
              <label className="text-sm font-medium text-slate-800">
                Annual adjustment $
                <input
                  type="number"
                  min="-1000000"
                  max="1000000"
                  step="1"
                  value={annualAdjustmentDollars}
                  onChange={(event) => setAnnualAdjustmentDollars(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                  placeholder="Optional"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void saveScenario()}
              disabled={busy}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save scenario
            </button>
          </section>

          <section aria-labelledby="saved-scenarios-heading">
            <h3 id="saved-scenarios-heading" className="text-base font-semibold text-slate-950">
              Saved scenarios
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Compare horizon results side by side. A stale badge means canonical inputs changed after the scenario was saved.
            </p>
            {scenarios.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                No saved scenarios yet.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <caption className="sr-only">Saved scenario comparison</caption>
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Scenario</th>
                      <th scope="col" className="px-4 py-3">Base snapshot</th>
                      <th scope="col" className="px-4 py-3">Horizon base</th>
                      <th scope="col" className="px-4 py-3">Range</th>
                      <th scope="col" className="px-4 py-3">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {scenarios.map((scenario) => (
                      <tr key={scenario.id}>
                        <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                          {scenario.name}
                          {scenario.isStale && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                              Stale
                            </span>
                          )}
                          {scenario.staleReason && (
                            <div className="mt-1 max-w-xs text-xs font-normal text-amber-800">
                              {scenario.staleReason}
                            </div>
                          )}
                        </th>
                        <td className="px-4 py-3">
                          Through {dateLabel(scenario.forecast.baseSnapshot.periodEnd)}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {moneyFromCents(scenario.forecast.summary.endYear.baseCents)}
                        </td>
                        <td className="px-4 py-3">
                          {moneyFromCents(scenario.forecast.summary.endYear.lowCents)} –{' '}
                          {moneyFromCents(scenario.forecast.summary.endYear.highCents)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void renameScenario(scenario)}
                              disabled={busy}
                              className="min-h-10 rounded-lg border border-slate-300 px-3 font-medium"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => void archiveScenario(scenario)}
                              disabled={busy}
                              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 font-medium"
                            >
                              <Archive className="h-4 w-4" />
                              Archive
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeScenario(scenario)}
                              disabled={busy}
                              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-rose-300 px-3 font-medium text-rose-700"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <details className="rounded-2xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Forecast limitations
            </summary>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {forecast.limitations.map((limitation) => (
                <li key={limitation} className="flex gap-2">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-teal-600" />
                  {limitation}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-medium text-slate-800">
              {forecast.disclaimer}
            </p>
          </details>
        </>
      )}
    </div>
  );
}

function BufferPlanningView({
  propertyId,
  lens,
}: {
  propertyId: string;
  lens: OwnershipCostCurrentLens;
}) {
  const router = useRouter();
  const [variability, setVariability] =
    useState<OwnershipCostVariabilityReadModel | null>(null);
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [loadingBuffer, setLoadingBuffer] = useState(true);
  const [recording, setRecording] = useState<
    'MONTHLY_CASH_BUFFER' | 'CAPITAL_RESERVE' | null
  >(null);

  const loadVariability = useCallback(async () => {
    setLoadingBuffer(true);
    setBufferError(null);
    try {
      setVariability(await getOwnershipCostVariability(propertyId, lens));
    } catch (cause) {
      setBufferError(
        cause instanceof Error
          ? cause.message
          : 'Variability planning is temporarily unavailable.',
      );
    } finally {
      setLoadingBuffer(false);
    }
  }, [lens, propertyId]);

  useEffect(() => {
    void loadVariability();
  }, [loadVariability]);

  async function handoff(
    decisionType: 'MONTHLY_CASH_BUFFER' | 'CAPITAL_RESERVE',
  ) {
    setRecording(decisionType);
    setBufferError(null);
    try {
      const decision = await recordOwnershipCostPlanningDecision(
        propertyId,
        lens,
        decisionType,
      );
      track('action_taken', {
        tool: 'ownership-costs',
        propertyId,
        actionType: decisionType === 'MONTHLY_CASH_BUFFER'
          ? 'send_monthly_buffer_to_budget'
          : 'send_capital_need_to_reserve',
      });
      router.push(decision.handoff.href);
    } catch (cause) {
      setBufferError(
        cause instanceof Error
          ? cause.message
          : 'The planning handoff could not be recorded.',
      );
      setRecording(null);
    }
  }

  if (loadingBuffer && !variability) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-600">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Checking observed cost history…
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {bufferError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {bufferError}
        </div>
      )}

      {variability && !variability.eligibility.eligible && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <div className="flex gap-3">
            <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <div>
              <h3 className="font-semibold text-slate-950">
                Not enough cost history to measure variability
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {variability.eligibility.comparableObservedPeriods} of{' '}
                {variability.eligibility.requiredComparablePeriods} required
                comparable annual periods are available. Estimates, benchmarks,
                forecasts, synthetic history, partial periods, and unstable
                category definitions do not qualify.
              </p>
              {variability.eligibility.excludedCategories.length > 0 && (
                <details className="mt-3 text-sm text-slate-700">
                  <summary className="cursor-pointer font-semibold">
                    Why categories were excluded
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {variability.eligibility.excludedCategories.map((item) => (
                      <li key={item.category}>
                        {item.category.toLowerCase().replace(/_/g, ' ')}: {item.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </section>
      )}

      {variability?.eligibility.eligible && variability.measured.recurring && (
        <>
          <section aria-labelledby="measured-range-heading">
            <div>
              <h3 id="measured-range-heading" className="text-base font-semibold text-slate-950">
                Measured observed dollar range
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Uses only the stable recurring categories supported across all
                three comparable annual periods.
              </p>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Observed low
                </dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">
                  {moneyFromCents(
                    variability.measured.recurring.observedLowCents,
                  )}
                </dd>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Observed average
                </dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">
                  {moneyFromCents(
                    variability.measured.recurring.averageAnnualCents,
                  )}
                </dd>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Observed high
                </dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">
                  {moneyFromCents(
                    variability.measured.recurring.observedHighCents,
                  )}
                </dd>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Largest annual swing
                </dt>
                <dd className="mt-1 text-xl font-semibold text-slate-950">
                  {moneyFromCents(
                    variability.measured.recurring.maxYearOverYearSwingCents,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="observed-periods-heading">
            <h3 id="observed-periods-heading" className="text-base font-semibold text-slate-950">
              Comparable observed periods
            </h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[640px] w-full text-left text-sm">
                <caption className="sr-only">
                  Recurring and one-time ownership cost by observed annual period
                </caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Observed year</th>
                    <th scope="col" className="px-4 py-3">Recurring cost</th>
                    <th scope="col" className="px-4 py-3">One-time capital</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {variability.measured.periods.map((period) => (
                    <tr key={period.snapshotId}>
                      <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                        {period.year}
                      </th>
                      <td className="px-4 py-3">
                        {moneyFromCents(period.recurringCents)}
                      </td>
                      <td className="px-4 py-3">
                        {moneyFromCents(period.oneTimeCents)}
                        <span className="ml-2 text-xs text-slate-500">
                          excluded from recurring variability
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="category-variability-heading">
            <h3 id="category-variability-heading" className="text-base font-semibold text-slate-950">
              Recurring categories measured
            </h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {variability.measured.categoryBreakdown.map((category) => (
                <article key={category.category} className="rounded-2xl border border-slate-200 p-4">
                  <h4 className="font-semibold text-slate-950">
                    {category.label}
                  </h4>
                  <p className="mt-2 text-sm text-slate-700">
                    Observed range {moneyFromCents(category.observedLowCents)} –{' '}
                    {moneyFromCents(category.observedHighCents)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Standard deviation {moneyFromCents(
                      category.standardDeviationCents,
                    )}
                  </p>
                </article>
              ))}
            </div>
            <details className="mt-4 rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                Variability formula
              </summary>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {variability.measured.recurring.formula}
              </p>
            </details>
          </section>
        </>
      )}

      {variability && (
        <>
          <section aria-labelledby="scenario-buffer-heading" className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
            <h3 id="scenario-buffer-heading" className="text-base font-semibold text-slate-950">
              Scenario planning buffer
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              This is planning support derived from the forward scenario range,
              not measured volatility. Recurring cash and one-time capital are
              kept separate so the same amount is not sent twice.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-700">
                  Monthly recurring cash buffer
                </h4>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {moneyFromCents(
                    variability.planningBuffer.monthlyCashBufferCents,
                  )} / month
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {variability.planningBuffer.monthlyMethod}
                </p>
                <button
                  type="button"
                  onClick={() => void handoff('MONTHLY_CASH_BUFFER')}
                  disabled={
                    !variability.planningBuffer.monthlyHandoff.enabled
                    || recording != null
                  }
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {recording === 'MONTHLY_CASH_BUFFER'
                    ? 'Recording…'
                    : 'Send monthly buffer to Budget Planner'}
                </button>
              </article>
              <article className="rounded-2xl bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-700">
                  Known one-time capital reserve
                </h4>
                <div className="mt-2 text-2xl font-semibold text-slate-950">
                  {moneyFromCents(
                    variability.planningBuffer.capitalReserveCents,
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {variability.planningBuffer.capitalMethod}
                </p>
                <button
                  type="button"
                  onClick={() => void handoff('CAPITAL_RESERVE')}
                  disabled={
                    !variability.planningBuffer.capitalHandoff.enabled
                    || recording != null
                  }
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {recording === 'CAPITAL_RESERVE'
                    ? 'Recording…'
                    : 'Send capital need to Reserve Fund'}
                </button>
              </article>
            </div>
            <p className="mt-4 text-xs font-medium text-blue-900">
              {variability.planningBuffer.nonDuplicationRule}
            </p>
          </section>

          <details className="rounded-2xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Variability and buffer limitations
            </summary>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {variability.limitations.map((limitation) => (
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
  );
}

export default function OwnershipCostsClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
  const [decisionData, setDecisionData] =
    useState<OwnershipCostDecisionReadModel | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (forceRefresh: boolean) => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    setChangeError(null);
    setDecisionError(null);
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
      try {
        setDecisionData(await getOwnershipCostDecisions(propertyId));
      } catch (decisionCause) {
        setDecisionData(null);
        if (!isMissingOptionalOwnershipCostRoute(decisionCause, 'decisions')) {
          setDecisionError(
            decisionCause instanceof Error
              ? decisionCause.message
              : 'Action decisions are temporarily unavailable.',
          );
        }
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

  function decisionForChange(
    change: OwnershipCostChangeReadModel['changes'][number],
  ) {
    const sourceActionId = change.id
      ? `ownership-cost-change:${change.id}`
      : `ownership-cost-category:${propertyId}:${change.category}`;
    return decisionData?.decisions.find(
      (decision) => decision.sourceActionId === sourceActionId,
    ) ?? null;
  }

  async function actOnChange(
    change: OwnershipCostChangeReadModel['changes'][number],
    action: OwnershipCostDecisionAction,
  ) {
    let reason: string | undefined;
    let revisitAt: string | undefined;
    if (['DISMISS', 'NO_ACTION', 'RESOLVE'].includes(action)) {
      reason = window.prompt(
        action === 'RESOLVE'
          ? 'What did you decide or complete?'
          : 'Why does this not need action right now?',
      )?.trim();
      if (!reason) return;
    }
    if (action === 'SNOOZE') {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      const selected = window.prompt(
        'Revisit on (YYYY-MM-DD)',
        defaultDate.toISOString().slice(0, 10),
      )?.trim();
      if (!selected) return;
      const parsed = new Date(`${selected}T12:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        setDecisionError('Enter a valid revisit date.');
        return;
      }
      revisitAt = parsed.toISOString();
      reason = 'Homeowner scheduled a review.';
    }
    const sourceActionId = change.id
      ? `ownership-cost-change:${change.id}`
      : `ownership-cost-category:${propertyId}:${change.category}`;
    setDecisionBusy(sourceActionId);
    setDecisionError(null);
    try {
      const decision = await recordOwnershipCostDecision(propertyId, {
        action,
        category: change.category,
        ...(change.id ? { sourceChangeId: change.id } : {}),
        sourceActionId,
        explanation: change.explanation,
        reason,
        revisitAt,
      });
      setDecisionData(await getOwnershipCostDecisions(propertyId));
      track(action === 'RESOLVE' ? 'action_completed' : 'action_taken', {
        tool: 'ownership-costs',
        propertyId,
        actionType: `change_${action.toLowerCase()}`,
      });
      if (action === 'ACCEPT') router.push(decision.destination.href);
    } catch (cause) {
      setDecisionError(
        cause instanceof Error
          ? cause.message
          : 'The homeowner decision could not be recorded.',
      );
    } finally {
      setDecisionBusy(null);
    }
  }

  async function toggleNotification(
    type: keyof OwnershipCostDecisionReadModel['notificationPreferences'],
    enabled: boolean,
  ) {
    setDecisionBusy(`notification:${type}`);
    setDecisionError(null);
    try {
      const saved = await updateOwnershipCostNotificationPreferences(
        propertyId,
        { [type]: enabled },
      );
      setDecisionData((current) => current
        ? { ...current, notificationPreferences: saved.preferences }
        : current);
      track('action_taken', {
        tool: 'ownership-costs',
        propertyId,
        actionType: `notification_${type.toLowerCase()}_${enabled ? 'on' : 'off'}`,
      });
    } catch (cause) {
      setDecisionError(
        cause instanceof Error
          ? cause.message
          : 'Notification preference could not be saved.',
      );
    } finally {
      setDecisionBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href={`/dashboard/properties/${propertyId}`}
        className="inline-flex items-center gap-2 text-sm font-medium !text-slate-700 hover:!text-slate-950"
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

      <PropertyContextCapturePanel
        propertyId={propertyId}
        featureKey="OWNERSHIP_COSTS"
        operationKey="VIEW_ANALYSIS"
        onCaptured={() => load(true)}
      />

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

      {decisionError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {decisionError}
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
                      className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold !text-teal-800 hover:!text-teal-950"
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
                            className="font-semibold !text-teal-800 hover:!text-teal-950"
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
                    {changeData.changes.map((change) => {
                      const currentDecision = decisionForChange(change);
                      const terminal = currentDecision && [
                        'DISMISSED',
                        'NO_ACTION',
                        'RESOLVED',
                      ].includes(currentDecision.lifecycleState);
                      const actionKey = change.id
                        ? `ownership-cost-change:${change.id}`
                        : `ownership-cost-category:${propertyId}:${change.category}`;
                      return (
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
                          {terminal ? (
                            <button
                              type="button"
                              disabled={decisionBusy === actionKey}
                              onClick={() => void actOnChange(change, 'REOPEN')}
                              className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                            >
                              Reopen
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={decisionBusy === actionKey}
                                onClick={() => void actOnChange(change, 'ACCEPT')}
                                className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {currentDecision?.destination.label ?? 'Take action'}
                              </button>
                              <button
                                type="button"
                                disabled={decisionBusy === actionKey}
                                onClick={() => void actOnChange(change, 'SAVE')}
                                className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                disabled={decisionBusy === actionKey}
                                onClick={() => void actOnChange(change, 'SNOOZE')}
                                className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                              >
                                Snooze
                              </button>
                              <button
                                type="button"
                                disabled={decisionBusy === actionKey}
                                onClick={() => void actOnChange(change, 'NO_ACTION')}
                                className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                              >
                                No action
                              </button>
                              {currentDecision && (
                                <>
                                  <button
                                    type="button"
                                    disabled={decisionBusy === actionKey}
                                    onClick={() => void actOnChange(change, 'RESOLVE')}
                                    className="min-h-11 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                                  >
                                    Resolve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={decisionBusy === actionKey}
                                    onClick={() => void actOnChange(change, 'DISMISS')}
                                    className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-60"
                                  >
                                    Dismiss
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        {currentDecision && (
                          <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                            <span className="font-semibold">
                              {currentDecision.lifecycleState.toLowerCase().replace(/_/g, ' ')}
                            </span>
                            {' · '}
                            Owner: {currentDecision.owner.toLowerCase().replace(/_/g, ' ')}
                            {currentDecision.revisitAt
                              ? ` · Revisit ${dateLabel(currentDecision.revisitAt)}`
                              : ''}
                          </div>
                        )}
                      </article>
                      );
                    })}
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
        ) : view === 'forecast' ? (
          <ForecastPlanningView propertyId={propertyId} lens={lens} />
        ) : view === 'variability' ? (
          <BufferPlanningView propertyId={propertyId} lens={lens} />
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
            This canonical view is intentionally gated until its evidence contract is delivered in the corresponding implementation slice.
          </div>
        )}
      </section>

      {decisionData && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900">
            <Bell className="h-4 w-4 text-teal-700" />
            Ownership-cost reminders and revisit events
          </summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Choose which changes should return to your attention. Snoozed
            decisions remain attached to their source snapshot and explanation.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([
              ['MATERIAL_CHANGE', 'Material observed changes'],
              ['UPCOMING_EVENT', 'Upcoming renewals and known events'],
              ['STALE_SCENARIO', 'Scenarios made stale by new facts'],
              ['MISSING_HIGH_IMPACT_FACT', 'Missing high-impact cost facts'],
            ] as const).map(([type, label]) => (
              <label
                key={type}
                className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={decisionData.notificationPreferences[type]}
                  disabled={decisionBusy === `notification:${type}`}
                  onChange={(event) => void toggleNotification(
                    type,
                    event.target.checked,
                  )}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
              </label>
            ))}
          </div>
          {decisionData.revisitEvents.length > 0 && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Scheduled revisits
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {decisionData.revisitEvents.map((event) => (
                  <li key={event.decisionId}>
                    {event.category.toLowerCase().replace(/_/g, ' ')} ·{' '}
                    {dateLabel(event.revisitAt)} · {event.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            {decisionData.lifecycleRule}
          </p>
        </details>
      )}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        This is educational planning support, not financial, tax, insurance,
        mortgage, valuation, or investment advice. Missing categories are not zero.
      </section>
    </main>
  );
}
