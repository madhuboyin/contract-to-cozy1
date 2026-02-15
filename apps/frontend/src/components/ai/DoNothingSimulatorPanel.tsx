'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  createDoNothingScenario,
  deleteDoNothingScenario,
  DoNothingDeductibleStrategy,
  DoNothingInputOverrides,
  DoNothingRiskTolerance,
  DoNothingRunDTO,
  DoNothingScenarioDTO,
  getLatestDoNothingRun,
  listDoNothingScenarios,
  runDoNothingSimulation,
  updateDoNothingScenario,
} from '@/lib/api/doNothingSimulatorApi';
import { Button } from '@/components/ui/button';

const HORIZON_OPTIONS = [6, 12, 24, 36] as const;
type Horizon = (typeof HORIZON_OPTIONS)[number];
const CUSTOM_SCENARIO_KEY = '__CUSTOM__';

type FormState = {
  name: string;
  horizonMonths: Horizon;
  skipMaintenance: boolean;
  skipWarranty: boolean;
  deductibleStrategy: DoNothingDeductibleStrategy;
  cashBufferUsd: string;
  riskTolerance: DoNothingRiskTolerance;
  ignoreTopRisks: string;
};

const DEFAULT_FORM_STATE: FormState = {
  name: 'Do nothing 12 months',
  horizonMonths: 12,
  skipMaintenance: true,
  skipWarranty: true,
  deductibleStrategy: 'KEEP_HIGH',
  cashBufferUsd: '',
  riskTolerance: 'MEDIUM',
  ignoreTopRisks: '',
};

type DoNothingSimulatorPanelProps = {
  propertyId: string;
};

function moneyFromCents(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value / 100);
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function parseNonNegativeNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function runStatusTone(status?: DoNothingRunDTO['status']): string {
  if (status === 'READY') return 'bg-emerald-100 text-emerald-700';
  if (status === 'STALE') return 'bg-amber-100 text-amber-700';
  if (status === 'ERROR') return 'bg-rose-100 text-rose-700';
  return 'bg-gray-100 text-gray-700';
}

function severityTone(value: 'LOW' | 'MEDIUM' | 'HIGH'): string {
  if (value === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (value === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function likelihoodTone(value?: DoNothingRunDTO['incidentLikelihood']): string {
  if (value === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (value === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  if (value === 'LOW') return 'bg-emerald-100 text-emerald-700';
  return 'bg-gray-100 text-gray-700';
}

function decisionImpactTone(impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL') {
  if (impact === 'POSITIVE') return 'bg-emerald-50 text-emerald-700';
  if (impact === 'NEGATIVE') return 'bg-rose-50 text-rose-700';
  return 'bg-gray-100 text-gray-700';
}

function formFromScenario(scenario: DoNothingScenarioDTO): FormState {
  const overrides = scenario.inputOverrides || {};

  return {
    name: scenario.name,
    horizonMonths: (HORIZON_OPTIONS.includes(scenario.horizonMonths as Horizon)
      ? scenario.horizonMonths
      : 12) as Horizon,
    skipMaintenance: Boolean(overrides.skipMaintenance),
    skipWarranty: Boolean(overrides.skipWarranty),
    deductibleStrategy: overrides.deductibleStrategy ?? 'UNCHANGED',
    cashBufferUsd:
      overrides.cashBufferCents !== undefined && Number.isFinite(overrides.cashBufferCents)
        ? String((overrides.cashBufferCents || 0) / 100)
        : '',
    riskTolerance: overrides.riskTolerance ?? 'MEDIUM',
    ignoreTopRisks: Array.isArray(overrides.ignoreTopRisks) ? overrides.ignoreTopRisks.join(', ') : '',
  };
}

function buildOverrides(form: FormState): DoNothingInputOverrides {
  const cashBufferUsd = parseNonNegativeNumber(form.cashBufferUsd);
  const ignoreTopRisks = form.ignoreTopRisks
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toUpperCase());

  return {
    skipMaintenance: form.skipMaintenance,
    skipWarranty: form.skipWarranty,
    deductibleStrategy: form.deductibleStrategy,
    cashBufferCents: cashBufferUsd !== undefined ? Math.round(cashBufferUsd * 100) : undefined,
    ignoreTopRisks: ignoreTopRisks.length > 0 ? ignoreTopRisks : undefined,
    riskTolerance: form.riskTolerance,
  };
}

export default function DoNothingSimulatorPanel({ propertyId }: DoNothingSimulatorPanelProps) {
  const [scenarios, setScenarios] = useState<DoNothingScenarioDTO[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(CUSTOM_SCENARIO_KEY);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM_STATE);

  const [run, setRun] = useState<DoNothingRunDTO | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [savingScenario, setSavingScenario] = useState(false);
  const [deletingScenario, setDeletingScenario] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId]
  );

  const fetchScenarios = async () => {
    if (!propertyId) return;
    const next = await listDoNothingScenarios(propertyId);
    setScenarios(next);
  };

  const fetchLatestRun = async (params?: { scenarioId?: string; horizonMonths?: Horizon }) => {
    if (!propertyId) return;
    const result = await getLatestDoNothingRun(propertyId, params);
    if (result.exists) {
      setHasRun(true);
      setRun(result.run);
    } else {
      setHasRun(false);
      setRun(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!propertyId) return;
      setLoading(true);
      setError(null);
      try {
        const [nextScenarios, latestRunResult] = await Promise.all([
          listDoNothingScenarios(propertyId),
          getLatestDoNothingRun(propertyId),
        ]);

        if (cancelled) return;

        setScenarios(nextScenarios);
        setSelectedScenarioId(CUSTOM_SCENARIO_KEY);
        setForm(DEFAULT_FORM_STATE);

        if (latestRunResult.exists) {
          setHasRun(true);
          setRun(latestRunResult.run);
        } else {
          setHasRun(false);
          setRun(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load Do-Nothing Simulator.');
        setHasRun(false);
        setRun(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const onScenarioChange = async (value: string) => {
    setSelectedScenarioId(value);
    setError(null);

    if (value === CUSTOM_SCENARIO_KEY) {
      setForm((prev) => ({
        ...prev,
        name: prev.name.trim() ? prev.name : `Do nothing ${prev.horizonMonths} months`,
      }));
      try {
        await fetchLatestRun({ horizonMonths: form.horizonMonths });
      } catch (err: any) {
        setError(err?.message || 'Failed to load latest run.');
      }
      return;
    }

    const scenario = scenarios.find((entry) => entry.id === value);
    if (!scenario) return;

    const nextForm = formFromScenario(scenario);
    setForm(nextForm);

    try {
      await fetchLatestRun({ scenarioId: scenario.id, horizonMonths: scenario.horizonMonths as Horizon });
    } catch (err: any) {
      setError(err?.message || 'Failed to load scenario run.');
    }
  };

  const handleSaveScenario = async () => {
    if (!propertyId) return;
    const normalizedName = form.name.trim() || `Do nothing ${form.horizonMonths} months`;
    const payload = {
      name: normalizedName,
      horizonMonths: form.horizonMonths,
      inputOverrides: buildOverrides({ ...form, name: normalizedName }),
    } as const;

    setSavingScenario(true);
    setError(null);

    try {
      if (selectedScenario && selectedScenarioId !== CUSTOM_SCENARIO_KEY) {
        const updated = await updateDoNothingScenario(propertyId, selectedScenario.id, payload);
        await fetchScenarios();
        setSelectedScenarioId(updated.id);
        setForm(formFromScenario(updated));
      } else {
        const created = await createDoNothingScenario(propertyId, payload);
        await fetchScenarios();
        setSelectedScenarioId(created.id);
        setForm(formFromScenario(created));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save scenario.');
    } finally {
      setSavingScenario(false);
    }
  };

  const handleDeleteScenario = async () => {
    if (!propertyId || !selectedScenario || selectedScenarioId === CUSTOM_SCENARIO_KEY) return;

    setDeletingScenario(true);
    setError(null);

    try {
      await deleteDoNothingScenario(propertyId, selectedScenario.id);
      await fetchScenarios();
      setSelectedScenarioId(CUSTOM_SCENARIO_KEY);
      setForm(DEFAULT_FORM_STATE);
      await fetchLatestRun({ horizonMonths: DEFAULT_FORM_STATE.horizonMonths });
    } catch (err: any) {
      setError(err?.message || 'Failed to delete scenario.');
    } finally {
      setDeletingScenario(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!propertyId) return;

    setRunning(true);
    setError(null);

    try {
      const createdRun = await runDoNothingSimulation(propertyId, {
        scenarioId:
          selectedScenarioId !== CUSTOM_SCENARIO_KEY && selectedScenario
            ? selectedScenario.id
            : undefined,
        horizonMonths: form.horizonMonths,
        inputOverrides: buildOverrides(form),
      });

      setHasRun(true);
      setRun(createdRun);
    } catch (err: any) {
      setError(err?.message || 'Failed to run simulation.');
    } finally {
      setRunning(false);
    }
  };

  const handleRefreshRun = async () => {
    setError(null);
    try {
      if (selectedScenarioId !== CUSTOM_SCENARIO_KEY && selectedScenario) {
        await fetchLatestRun({ scenarioId: selectedScenario.id, horizonMonths: form.horizonMonths });
      } else {
        await fetchLatestRun({ horizonMonths: form.horizonMonths });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh run.');
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm text-gray-600">Loading simulator…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        Educational insights only. This tool does not recommend specific insurers, products, or providers.
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-black/10 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600">
            Scenario
            <select
              value={selectedScenarioId}
              onChange={(event) => void onScenarioChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value={CUSTOM_SCENARIO_KEY}>Custom run</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600">
            Scenario name
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Do nothing 12 months"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs text-gray-600">
            Horizon
            <select
              value={form.horizonMonths}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, horizonMonths: Number(event.target.value) as Horizon }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {HORIZON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} months
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600">
            Deductible strategy
            <select
              value={form.deductibleStrategy}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  deductibleStrategy: event.target.value as DoNothingDeductibleStrategy,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="UNCHANGED">Unchanged</option>
              <option value="KEEP_HIGH">Keep high</option>
              <option value="RAISE">Raise</option>
              <option value="LOWER">Lower</option>
            </select>
          </label>

          <label className="text-xs text-gray-600">
            Cash buffer (USD)
            <input
              type="number"
              min={0}
              value={form.cashBufferUsd}
              onChange={(event) => setForm((prev) => ({ ...prev, cashBufferUsd: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs text-gray-600">
            Risk tolerance
            <select
              value={form.riskTolerance}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, riskTolerance: event.target.value as DoNothingRiskTolerance }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </label>

          <label className="text-xs text-gray-600 md:col-span-2">
            Ignore top risks (comma separated, optional)
            <input
              value={form.ignoreTopRisks}
              onChange={(event) => setForm((prev) => ({ ...prev, ignoreTopRisks: event.target.value }))}
              placeholder="WATER, WIND_HAIL"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.skipMaintenance}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, skipMaintenance: event.target.checked }))
              }
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-600"
            />
            Skip maintenance
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.skipWarranty}
              onChange={(event) => setForm((prev) => ({ ...prev, skipWarranty: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-600"
            />
            Skip warranty/service plan
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleRunSimulation} disabled={running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running…
              </>
            ) : (
              'Run simulation'
            )}
          </Button>

          <Button type="button" variant="ghost" onClick={handleRefreshRun} disabled={running}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>

          <Button type="button" variant="secondary" onClick={handleSaveScenario} disabled={savingScenario}>
            {savingScenario ? 'Saving…' : selectedScenario ? 'Update scenario' : 'Save scenario'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleDeleteScenario}
            disabled={!selectedScenario || deletingScenario}
          >
            {deletingScenario ? 'Deleting…' : 'Delete scenario'}
          </Button>
        </div>
      </section>

      {!hasRun || !run ? (
        <section className="rounded-2xl border border-black/10 bg-white p-6">
          <h4 className="text-lg font-semibold text-gray-900">No simulation run yet</h4>
          <p className="mt-2 text-sm text-gray-600">
            Run a 6/12/24/36 month do-nothing simulation to see projected risk increase, incident likelihood,
            and minimum actions that avoid most downside.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-teal-700" />
                <h4 className="text-lg font-semibold text-gray-900">Do-Nothing Simulator</h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${runStatusTone(run.status)}`}>
                  {run.status}
                </span>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${likelihoodTone(run.incidentLikelihood)}`}>
                  Incident {run.incidentLikelihood ?? 'N/A'}
                </span>
              </div>
            </div>

            <p className="mt-3 text-sm text-gray-700">{run.summary || 'Simulation completed.'}</p>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                <div className="text-xs text-gray-500">Horizon</div>
                <div className="text-base font-semibold text-gray-900">{run.horizonMonths} months</div>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                <div className="text-xs text-gray-500">Risk delta</div>
                <div className="text-base font-semibold text-gray-900">
                  {run.riskScoreDelta === null || run.riskScoreDelta === undefined ? '—' : `+${run.riskScoreDelta}`}
                </div>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                <div className="text-xs text-gray-500">Cost impact (min)</div>
                <div className="text-base font-semibold text-gray-900">{moneyFromCents(run.expectedCostDeltaCentsMin)}</div>
              </div>
              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                <div className="text-xs text-gray-500">Cost impact (max)</div>
                <div className="text-base font-semibold text-gray-900">{moneyFromCents(run.expectedCostDeltaCentsMax)}</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-500">Computed {formatDate(run.computedAt)}</div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Top risk drivers</h4>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {run.outputs.topRiskDrivers.length === 0 ? (
                <div className="text-sm text-gray-600">No major risk drivers found.</div>
              ) : (
                run.outputs.topRiskDrivers.map((driver) => (
                  <article key={driver.code} className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-gray-900">{driver.title}</h5>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${severityTone(driver.severity)}`}>
                        {driver.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-600">{driver.detail}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Top cost drivers</h4>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {run.outputs.topCostDrivers.length === 0 ? (
                <div className="text-sm text-gray-600">No major cost drivers found.</div>
              ) : (
                run.outputs.topCostDrivers.map((driver) => (
                  <article key={driver.code} className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-gray-900">{driver.title}</h5>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${severityTone(driver.severity)}`}>
                        {driver.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-600">{driver.detail}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Biggest avoidable losses</h4>
            <div className="mt-3 space-y-3">
              {run.outputs.biggestAvoidableLosses.length === 0 ? (
                <div className="text-sm text-gray-600">No major avoidable losses identified.</div>
              ) : (
                run.outputs.biggestAvoidableLosses.map((loss, index) => (
                  <article key={`${loss.title}-${index}`} className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    <h5 className="text-sm font-semibold text-gray-900">{loss.title}</h5>
                    <p className="mt-1 text-xs text-gray-600">{loss.detail}</p>
                    <div className="mt-2 text-xs text-gray-700">
                      Estimated impact: {moneyFromCents(loss.estCostCentsMin)} - {moneyFromCents(loss.estCostCentsMax)}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Minimum actions to avoid most downside</h4>
            <div className="mt-3 space-y-2">
              {run.nextSteps.length === 0 ? (
                <div className="text-sm text-gray-600">No next steps available.</div>
              ) : (
                run.nextSteps.map((step, index) => (
                  <article key={`${step.title}-${index}`} className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-gray-900">{step.title}</h5>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${severityTone(step.priority)}`}>
                        {step.priority}
                      </span>
                    </div>
                    {step.detail && <p className="mt-1 text-xs text-gray-600">{step.detail}</p>}
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 text-left"
              onClick={() => setTraceExpanded((prev) => !prev)}
            >
              <h4 className="text-base font-semibold text-gray-900">Why this changed</h4>
              {traceExpanded ? <ChevronUp className="h-4 w-4 text-gray-600" /> : <ChevronDown className="h-4 w-4 text-gray-600" />}
            </button>

            {traceExpanded && (
              <div className="mt-3 space-y-2">
                {run.decisionTrace.length === 0 ? (
                  <div className="text-sm text-gray-600">No decision trace available.</div>
                ) : (
                  run.decisionTrace.map((trace, index) => (
                    <article key={`${trace.label}-${index}`} className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="text-sm font-semibold text-gray-900">{trace.label}</h5>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${decisionImpactTone(trace.impact)}`}>
                          {trace.impact}
                        </span>
                      </div>
                      {trace.detail && <p className="mt-1 text-xs text-gray-600">{trace.detail}</p>}
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
