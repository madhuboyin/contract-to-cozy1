// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/MortgageRefinanceRadarClient.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Calculator,
  Info,
} from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import {
  evaluateRadar,
  getRadarStatus,
  getRateHistory,
  runScenario,
  saveFinanceSnapshot,
  type RadarStatusAvailable,
  type RadarStatusDTO,
  type RadarStatusUnavailable,
  type RateHistoryDTO,
  type RefinanceScenarioResult,
  type RefinanceScenarioTerm,
} from './mortgageRefinanceRadarApi';
import { Button } from '@/components/ui/button';
import RouteStateCard from '@/components/system/RouteStateCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import { refinanceLoopTrust, trustDateLabel } from '@/lib/trust/trustPresets';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usd(value: number | null | undefined, opts?: { decimals?: number }): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: opts?.decimals ?? 0,
  }).format(value);
}

function pct(value: number | null | undefined, decimals = 3): string {
  if (value == null) return '—';
  return `${value.toFixed(decimals)}%`;
}

function months(value: number | null | undefined): string {
  if (value == null) return '—';
  const yrs = Math.floor(value / 12);
  const mos = value % 12;
  if (yrs === 0) return `${mos}mo`;
  if (mos === 0) return `${yrs}yr`;
  return `${yrs}yr ${mos}mo`;
}

const TERM_LABELS: Record<RefinanceScenarioTerm, string> = {
  THIRTY_YEAR: '30-Year Fixed',
  TWENTY_YEAR: '20-Year Fixed',
  FIFTEEN_YEAR: '15-Year Fixed',
};

const TERM_OPTIONS: RefinanceScenarioTerm[] = ['THIRTY_YEAR', 'TWENTY_YEAR', 'FIFTEEN_YEAR'];

// ─── Badge Components ─────────────────────────────────────────────────────────

function RadarStateBadge({ state }: { state: 'OPEN' | 'CLOSED' }) {
  if (state === 'OPEN') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2.5 py-1 text-xs font-semibold text-emerald-700 backdrop-blur dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300">
        Opportunity Open
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200/70 bg-slate-50/85 px-2.5 py-1 text-xs font-semibold text-slate-600 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
      No Opportunity
    </span>
  );
}

function ConfidenceBadge({ level }: { level: 'WEAK' | 'GOOD' | 'STRONG' | null }) {
  if (!level) return null;
  const map = {
    STRONG: 'border-emerald-200/70 bg-emerald-50/85 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300',
    GOOD: 'border-blue-200/70 bg-blue-50/85 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-blue-300',
    WEAK: 'border-amber-200/70 bg-amber-50/85 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300',
  };
  const labels = { STRONG: 'Strong fit', GOOD: 'Good fit', WEAK: 'Marginal fit' };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur ${map[level]}`}
    >
      {labels[level]}
    </span>
  );
}

function TrendIcon({ trend }: { trend: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN' }) {
  if (trend === 'RISING') return <TrendingUp className="h-4 w-4 text-red-500" />;
  if (trend === 'FALLING') return <TrendingDown className="h-4 w-4 text-emerald-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}

// ─── Card Shells ──────────────────────────────────────────────────────────────

function GlassCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-blue-50/40 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38 ${className}`}
    >
      {children}
    </div>
  );
}

function InnerCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-white/70 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Sub-Sections ─────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: 'green' | 'red' | 'amber' | 'blue';
}) {
  const valueColor =
    highlight === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : highlight === 'red'
        ? 'text-red-600 dark:text-red-400'
        : highlight === 'amber'
          ? 'text-amber-600 dark:text-amber-400'
          : highlight === 'blue'
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-slate-900 dark:text-slate-100';

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

// ─── Radar Status Hero ────────────────────────────────────────────────────────

function RadarStatusHero({ data }: { data: RadarStatusAvailable }) {
  const isOpen = data.radarState === 'OPEN';

  return (
    <GlassCard>
      <div className="p-5 sm:p-6">
        {/* Header row */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <RadarStateBadge state={data.radarState} />
            {isOpen && <ConfidenceBadge level={data.confidenceLevel} />}
          </div>
          {data.lastEvaluatedAt && (
            <p className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Clock className="h-3 w-3" />
              {new Date(data.lastEvaluatedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Summary */}
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {data.radarSummary}
        </p>

        {/* KPI grid — only when opportunity is open */}
        {isOpen && (
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
            <KpiTile
              label="Rate Gap"
              value={pct(data.rateGapPct, 2)}
              sub={`${pct(data.currentRatePct, 3)} → ${pct(data.marketRatePct, 3)}`}
              highlight="blue"
            />
            <KpiTile
              label="Monthly Savings"
              value={usd(data.monthlySavings)}
              highlight="green"
            />
            <KpiTile
              label="Break-Even"
              value={months(data.breakEvenMonths)}
              sub="to recover closing costs"
            />
            <KpiTile
              label="Lifetime Savings"
              value={usd(data.lifetimeSavings)}
              highlight="green"
            />
          </div>
        )}

        {/* Not-qualified reasons when CLOSED */}
        {!isOpen && data.notQualifiedReasons.length > 0 && (
          <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Why not yet
            </p>
            <ul className="space-y-1">
              {data.notQualifiedReasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Loan context */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-slate-200/70 pt-4 text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
          <span>Balance: {usd(data.loanBalance)}</span>
          <span>Remaining: {months(data.remainingTermMonths)}</span>
          <span>Closing cost est.: {usd(data.closingCostAssumptionUsd)}</span>
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Rate Trend Card ──────────────────────────────────────────────────────────

function RateTrendCard({ data }: { data: RadarStatusAvailable }) {
  const trend = data.trendSummary;

  return (
    <GlassCard>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Market Rate Snapshot
          </h3>
          <TrendIcon trend={trend.trend30yr} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiTile label="30-Year Fixed" value={trend.current30yr != null ? pct(trend.current30yr, 3) : '—'} />
          <KpiTile label="15-Year Fixed" value={trend.current15yr != null ? pct(trend.current15yr, 3) : '—'} />
          {trend.prior30yr != null && (
            <KpiTile
              label={`${trend.deltaWeeks}wk Prior`}
              value={pct(trend.prior30yr, 3)}
            />
          )}
        </div>
        <p className="mt-3 border-t border-slate-200/70 pt-3 text-xs text-slate-600 dark:border-slate-700/70 dark:text-slate-300">
          {trend.trendLabel}
        </p>
      </div>
    </GlassCard>
  );
}

// ─── Missed Opportunity Card ──────────────────────────────────────────────────

function MissedOpportunityCard({ data }: { data: RadarStatusAvailable }) {
  const missed = data.missedOpportunitySummary;
  if (!missed?.hasMissedOpportunity) return null;

  return (
    <GlassCard>
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-amber-500 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Missed Window Insight
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {missed.summary}
        </p>
        {missed.bestHistoricalRate30yr != null && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-slate-200/70 pt-3 text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
            <span>Best rate: {pct(missed.bestHistoricalRate30yr, 3)}</span>
            {missed.bestHistoricalDate && (
              <span>When: {new Date(missed.bestHistoricalDate).toLocaleDateString()}</span>
            )}
            {missed.bestMonthlySavingsAtPeak != null && (
              <span>Peak savings: {usd(missed.bestMonthlySavingsAtPeak)}/mo</span>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Scenario Calculator ──────────────────────────────────────────────────────

function ScenarioCalculator({
  propertyId,
  contextData,
}: {
  propertyId: string;
  contextData: RadarStatusAvailable;
}) {
  const [targetRate, setTargetRate] = useState('');
  const [targetTerm, setTargetTerm] = useState<RefinanceScenarioTerm>('THIRTY_YEAR');
  const [closingCost, setClosingCost] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RefinanceScenarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);

  async function handleRun() {
    const rate = parseFloat(targetRate);
    if (!targetRate || isNaN(rate) || rate <= 0 || rate > 30) {
      setError('Enter a valid rate between 0.1% and 30%.');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const closingCostAmount = closingCost ? parseFloat(closingCost) : undefined;
      const scenario = await runScenario(propertyId, {
        targetRate: rate,
        targetTerm,
        closingCostAmount: closingCostAmount && !isNaN(closingCostAmount) ? closingCostAmount : undefined,
      });
      setResult(scenario);
      setShowResult(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scenario calculation failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <GlassCard>
      <div className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-blue-500 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Scenario Calculator
          </h3>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Run a custom refinance scenario against your current mortgage.
        </p>

        {/* Input rows */}
        <div className="space-y-3">
          {/* Target rate */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Target Rate (%)
            </label>
            <input
              type="number"
              min="0.1"
              max="30"
              step="0.125"
              value={targetRate}
              onChange={(e) => setTargetRate(e.target.value)}
              placeholder={contextData.marketRatePct.toFixed(3)}
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none ring-0 transition focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
            />
          </div>

          {/* Term */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Loan Term
            </label>
            <div className="flex gap-2 flex-wrap">
              {TERM_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTargetTerm(t)}
                  className={`inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-medium transition-all ${
                    targetTerm === t
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-200/80 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300 dark:hover:bg-slate-900/80'
                  }`}
                >
                  {TERM_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Optional closing cost */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Closing Costs (optional, USD)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={closingCost}
              onChange={(e) => setClosingCost(e.target.value)}
              placeholder={`Default: 2.5% of balance (~${usd(contextData.loanBalance * 0.025)})`}
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none ring-0 transition focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running}
          className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-blue-300/70 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50 dark:border-blue-700/70 dark:bg-blue-700 dark:hover:bg-blue-600"
        >
          {running ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Calculating…
            </>
          ) : (
            'Run Scenario'
          )}
        </button>

        {/* Result */}
        {result && (
          <div className="mt-5 border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
            <button
              onClick={() => setShowResult((p) => !p)}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {showResult ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Scenario Result — {TERM_LABELS[result.targetTerm]} @ {pct(result.targetRatePct, 3)}
            </button>

            {showResult && (
              <InnerCard className="p-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <KpiTile
                    label="Monthly Savings"
                    value={usd(result.monthlySavings)}
                    sub={`${usd(result.currentMonthlyPayment)} → ${usd(result.newMonthlyPayment)}`}
                    highlight={result.monthlySavings > 0 ? 'green' : result.monthlySavings < 0 ? 'red' : undefined}
                  />
                  <KpiTile
                    label="Break-Even"
                    value={months(result.breakEvenMonths)}
                    sub="to recover closing costs"
                  />
                  <KpiTile
                    label="Lifetime Savings"
                    value={usd(result.lifetimeSavings)}
                    highlight={result.lifetimeSavings > 0 ? 'green' : 'red'}
                  />
                  <KpiTile
                    label="Closing Costs"
                    value={usd(result.closingCostUsd)}
                    sub={`${(result.assumptions.closingCostPctUsed * 100).toFixed(1)}% of balance`}
                  />
                  <KpiTile
                    label="Payoff Change"
                    value={
                      result.payoffDeltaMonths === 0
                        ? 'Same'
                        : result.payoffDeltaMonths < 0
                          ? `${months(Math.abs(result.payoffDeltaMonths))} sooner`
                          : `${months(result.payoffDeltaMonths)} later`
                    }
                    highlight={result.payoffDeltaMonths < 0 ? 'green' : undefined}
                  />
                  <KpiTile
                    label="Interest Saved"
                    value={usd(result.totalInterestRemainingCurrent - result.totalInterestNewLoan)}
                  />
                </div>

                {result.disclaimer && (
                  <p className="mt-4 border-t border-slate-200/70 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
                    {result.disclaimer}
                  </p>
                )}
              </InnerCard>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Rate Trend (rates endpoint) ──────────────────────────────────────────────

function RateHistoryCard({ rateData }: { rateData: RateHistoryDTO }) {
  const [expanded, setExpanded] = useState(false);
  const snapshots = rateData.snapshots.slice(0, expanded ? 12 : 4);

  return (
    <GlassCard>
      <div className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Rate History
        </h3>
        <div className="space-y-2">
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm odd:bg-white/40 even:bg-transparent dark:odd:bg-slate-900/30"
            >
              <span className="text-slate-500 dark:text-slate-400 text-xs">
                {new Date(snap.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <div className="flex gap-4">
                <span className="text-xs">
                  <span className="text-slate-400">30yr: </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{pct(snap.rate30yr, 3)}</span>
                </span>
                <span className="text-xs">
                  <span className="text-slate-400">15yr: </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{pct(snap.rate15yr, 3)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
        {rateData.snapshots.length > 4 && (
          <button
            onClick={() => setExpanded((p) => !p)}
            className="mt-3 inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Show all {rateData.snapshots.length} snapshots
              </>
            )}
          </button>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Mortgage Setup Form ──────────────────────────────────────────────────────

const TERM_MONTH_OPTIONS: { label: string; value: number }[] = [
  { label: '5 years', value: 60 },
  { label: '10 years', value: 120 },
  { label: '15 years', value: 180 },
  { label: '20 years', value: 240 },
  { label: '25 years', value: 300 },
  { label: '30 years', value: 360 },
];

function MortgageSetupForm({
  propertyId,
  onSaved,
}: {
  propertyId: string;
  onSaved: () => Promise<void>;
}) {
  const [balance, setBalance] = useState('');
  const [ratePct, setRatePct] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [customTerm, setCustomTerm] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPreset = TERM_MONTH_OPTIONS.find((o) => String(o.value) === termMonths);

  function resolvedTermMonths(): number | null {
    if (termMonths === 'custom') {
      const v = parseInt(customTerm, 10);
      return isNaN(v) ? null : v;
    }
    const v = parseInt(termMonths, 10);
    return isNaN(v) ? null : v;
  }

  async function handleSave() {
    const balanceVal = parseFloat(balance);
    const rateVal = parseFloat(ratePct);
    const termVal = resolvedTermMonths();
    const paymentVal = monthlyPayment ? parseFloat(monthlyPayment) : undefined;

    if (!balance || isNaN(balanceVal) || balanceVal <= 0) {
      setError('Enter a valid loan balance.');
      return;
    }
    if (!ratePct || isNaN(rateVal) || rateVal <= 0 || rateVal > 30) {
      setError('Enter a valid interest rate between 0.1% and 30%.');
      return;
    }
    if (!termVal || termVal < 1 || termVal > 480) {
      setError('Enter a valid remaining term (1–480 months).');
      return;
    }
    if (paymentVal !== undefined && (isNaN(paymentVal) || paymentVal < 0)) {
      setError('Enter a valid monthly payment or leave it blank.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveFinanceSnapshot(propertyId, {
        mortgageBalance: balanceVal,
        interestRate: rateVal / 100, // convert % to decimal
        remainingTermMonths: termVal,
        ...(paymentVal !== undefined ? { monthlyPayment: paymentVal } : {}),
      });
      await onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save mortgage details.');
      setSaving(false);
    }
  }

  return (
    <GlassCard>
      <div className="p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-blue-500 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Set up your mortgage
          </h3>
        </div>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
          Enter your current mortgage details to enable the refinance radar.
        </p>

        <div className="space-y-4">
          {/* Loan Balance */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Current Loan Balance ($)
            </label>
            <input
              type="number"
              min="1"
              step="1000"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="e.g. 320000"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
            />
          </div>

          {/* Interest Rate */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Current Interest Rate (%)
            </label>
            <input
              type="number"
              min="0.1"
              max="30"
              step="0.125"
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              placeholder="e.g. 6.625"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
            />
          </div>

          {/* Remaining Term */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Remaining Term
            </label>
            <div className="flex flex-wrap gap-2">
              {TERM_MONTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setTermMonths(String(opt.value)); setCustomTerm(''); }}
                  className={`inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-medium transition-all ${
                    termMonths === String(opt.value)
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-200/80 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300 dark:hover:bg-slate-900/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTermMonths('custom')}
                className={`inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-medium transition-all ${
                  termMonths === 'custom'
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-200/80 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300 dark:hover:bg-slate-900/80'
                }`}
              >
                Custom
              </button>
            </div>
            {termMonths === 'custom' && (
              <input
                type="number"
                min="1"
                max="480"
                step="1"
                value={customTerm}
                onChange={(e) => setCustomTerm(e.target.value)}
                placeholder="Months remaining (e.g. 278)"
                className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
              />
            )}
            {selectedPreset && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                = {selectedPreset.value} months
              </p>
            )}
          </div>

          {/* Monthly Payment (optional) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Monthly Payment (optional, $)
            </label>
            <input
              type="number"
              min="0"
              step="10"
              value={monthlyPayment}
              onChange={(e) => setMonthlyPayment(e.target.value)}
              placeholder="Leave blank to calculate automatically"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-blue-300/70 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50 dark:border-blue-700/70 dark:bg-blue-700 dark:hover:bg-blue-600"
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving & analyzing…
            </>
          ) : (
            'Save & Enable Radar'
          )}
        </button>
      </div>
    </GlassCard>
  );
}

// ─── Unavailable State ────────────────────────────────────────────────────────

function UnavailableCard({ reason }: { reason: string }) {
  const messages: Record<string, { title: string; body: string }> = {
    MISSING_MORTGAGE_DATA: {
      title: 'Mortgage data not set up',
      body: 'Add your mortgage details in the property financial overview to enable the refinance radar.',
    },
    NO_RATE_DATA: {
      title: 'No market rate data available',
      body: 'Market rate snapshots have not been ingested yet. Check back soon.',
    },
    PROPERTY_NOT_FOUND: {
      title: 'Property not found',
      body: 'We could not locate this property. Please go back and try again.',
    },
  };
  const { title, body } = messages[reason] ?? {
    title: 'Radar unavailable',
    body: 'We are unable to evaluate your refinance opportunity at this time.',
  };

  return (
    <GlassCard>
      <div className="p-8 text-center">
        <Info className="mx-auto mb-4 h-10 w-10 text-slate-300 dark:text-slate-500" />
        <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
      </div>
    </GlassCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MortgageRefinanceRadarClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [data, setData] = useState<RadarStatusDTO | null>(null);
  const [rateData, setRateData] = useState<RateHistoryDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reqRef = useRef(0);

  async function load() {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    setData(null);
    setRateData(null);
    try {
      const reqId = ++reqRef.current;
      const [status, rates] = await Promise.all([
        getRadarStatus(propertyId),
        getRateHistory(propertyId, 12).catch(() => null),
      ]);
      if (reqId !== reqRef.current) return;
      setData(status);
      setRateData(rates);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load radar data');
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluate() {
    if (!propertyId) return;
    setEvaluating(true);
    setError(null);
    try {
      const reqId = ++reqRef.current;
      const status = await evaluateRadar(propertyId);
      if (reqId !== reqRef.current) return;
      setData(status);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const available = data?.available === true ? (data as RadarStatusAvailable) : null;
  const trust = refinanceLoopTrust({
    confidenceLabel: available?.confidenceLevel
      ? `${available.confidenceLevel.toLowerCase()} fit from current loan context`
      : 'Model fit pending evaluation',
    freshnessLabel: trustDateLabel(available?.lastEvaluatedAt, 'Evaluate now to refresh'),
    sourceLabel: 'Mortgage profile + market rate snapshots + CtC refinance model',
  });

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home Tool"
      title="Mortgage Refinance Radar"
      subtitle="Monitor rates and know when refinancing is likely worth the effort."
      trust={trust}
      priorityAction={!loading && available ? (
        available.radarState === 'OPEN' ? {
          title: 'A refinance window is open — current rates suggest potential savings',
          description: 'Rate movement has opened a gap worth exploring. Confirm with lender outreach before conditions change.',
          impactLabel: available.confidenceLevel ? `${available.confidenceLevel.toLowerCase()} fit` : 'Opportunity detected',
          confidenceLabel: available.confidenceLevel ? `${available.confidenceLevel.toLowerCase()} confidence` : 'Medium confidence',
          primaryAction: (
            <Button type="button" className="w-full sm:w-auto">
              Get refinance quotes
            </Button>
          ),
          supportingAction: (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleEvaluate}
              disabled={evaluating}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${evaluating ? 'animate-spin' : ''}`} />
              {evaluating ? 'Evaluating…' : 'Re-evaluate radar'}
            </Button>
          ),
        } : {
          title: 'No refinance opportunity detected at current rates',
          description: 'The model does not see a compelling rate gap right now. Re-evaluate when market rates shift to get an updated read.',
          impactLabel: 'Window currently closed',
          confidenceLabel: available.confidenceLevel ? `${available.confidenceLevel.toLowerCase()} confidence` : 'Medium confidence',
          primaryAction: (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleEvaluate}
              disabled={evaluating}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${evaluating ? 'animate-spin' : ''}`} />
              {evaluating ? 'Evaluating…' : 'Re-evaluate radar'}
            </Button>
          ),
        }
      ) : undefined}
      rail={<HomeToolsRail propertyId={propertyId} context="mortgage-refinance-radar" currentToolId="mortgage-refinance-radar" />}
    >

      {/* Loading */}
      {loading && !data && (
        <RouteStateCard
          state="loading"
          title="Loading refinance radar"
          description="Gathering mortgage profile and market-rate signals."
        />
      )}

      {/* Error */}
      {error && (
        <RouteStateCard
          state="error"
          title="Radar check failed"
          description={error}
          action={<Button onClick={() => load()}>Try again</Button>}
        />
      )}

      {/* Unavailable */}
      {data && !data.available && !loading && (
        (data as RadarStatusUnavailable).reason === 'MISSING_MORTGAGE_DATA'
          ? <MortgageSetupForm propertyId={propertyId} onSaved={handleEvaluate} />
          : <UnavailableCard reason={(data as RadarStatusUnavailable).reason} />
      )}

      {/* Main content */}
      {available && !loading && (
        <>
          {/* 1. Radar status hero */}
          <RadarStatusHero data={available} />

          {/* 2. Rate trend (from status) */}
          <RateTrendCard data={available} />

          {/* 3. Missed opportunity */}
          <MissedOpportunityCard data={available} />

          {/* 4. Scenario calculator (only when mortgage data is present) */}
          <ScenarioCalculator propertyId={propertyId} contextData={available} />

          {/* 5. Rate history snapshots */}
          {rateData && rateData.snapshots.length > 0 && (
            <RateHistoryCard rateData={rateData} />
          )}

          {/* 6. Disclaimer */}
          {available.disclaimer && (
            <p className="px-1 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
              {available.disclaimer}
            </p>
          )}
        </>
      )}
    </ToolWorkspaceTemplate>
  );
}
