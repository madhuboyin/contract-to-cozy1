// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/MortgageRefinanceRadarClient.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Calculator,
  Info,
  ShieldCheck,
  AlertTriangle,
  Bell,
  Mail,
  Smartphone,
  Download,
} from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import { PropertyContextStatusNotice } from '@/components/property-context/PropertyContextStatusNotice';
import {
  evaluateRadar,
  ensureRefinancePushSubscription,
  exportScenarioMarkdown,
  getRefinanceAlertPreference,
  getFinancingMortgageProfile,
  getRadarStatus,
  getRateHistory,
  runScenario,
  recordRefinanceFeedback,
  saveFinancingProfile,
  updateRefinanceAlertPreference,
  type RefinanceAlertPreferenceDTO,
  type RadarStatusAvailable,
  type RadarStatusDTO,
  type RadarStatusUnavailable,
  type RateHistoryDTO,
  type RefinanceScenarioResult,
  type RefinanceScenarioTerm,
  type RefinanceObjective,
} from './mortgageRefinanceRadarApi';
import type { PropertyFinancingProfile } from '@/types';
import { Button } from '@/components/ui/button';
import RouteStateCard from '@/components/system/RouteStateCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import { refinanceLoopTrust, trustDateLabel } from '@/lib/trust/trustPresets';
import { track } from '@/lib/analytics/events';
import { MortgageRateHistoryChart } from './MortgageRateHistoryChart';
import { LoanEstimateComparisonCard } from './LoanEstimateComparisonCard';

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

function freshnessDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime())
    ? 'Not recorded'
    : parsed.toLocaleDateString();
}

const TERM_LABELS: Record<RefinanceScenarioTerm, string> = {
  THIRTY_YEAR: '30-Year Fixed',
  TWENTY_YEAR: '20-Year Fixed',
  FIFTEEN_YEAR: '15-Year Fixed',
};

const TERM_OPTIONS: RefinanceScenarioTerm[] = ['THIRTY_YEAR', 'TWENTY_YEAR', 'FIFTEEN_YEAR'];
const OBJECTIVE_OPTIONS: Array<{
  value: RefinanceObjective;
  label: string;
  description: string;
}> = [
  {
    value: 'BALANCED',
    label: 'Balanced',
    description: 'Avoid a higher payment, then favor lifetime savings.',
  },
  {
    value: 'LOWER_PAYMENT',
    label: 'Lower payment',
    description: 'Prioritize the largest modeled monthly reduction.',
  },
  {
    value: 'FASTER_PAYOFF',
    label: 'Faster payoff',
    description: 'Prioritize the shortest modeled repayment term.',
  },
  {
    value: 'LOWER_TOTAL_COST',
    label: 'Lower total cost',
    description: 'Prioritize the greatest modeled lifetime savings.',
  },
];

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
      <p className="text-xs font-medium tracking-normal text-slate-500 dark:text-slate-400">
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
        <p className="mb-3 text-[11px] font-semibold tracking-normal text-slate-500 dark:text-slate-400">
          Refinance Decision
        </p>

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
      </div>
    </GlassCard>
  );
}

function KeyMetricsCard({ data }: { data: RadarStatusAvailable }) {
  const isOpen = data.radarState === 'OPEN';
  const decisionFactors = data.topDecisionFactors?.length
    ? data.topDecisionFactors
    : data.notQualifiedReasons.slice(0, 3);

  return (
    <GlassCard>
      <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Key Metrics</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Current mortgage vs market rates</span>
        </div>

        {isOpen ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <KpiTile
                label="Rate Gap"
                value={pct(data.rateGapPct, 2)}
                sub={`${pct(data.currentRatePct, 3)} -> ${pct(data.marketRatePct, 3)}`}
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
            {decisionFactors.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-normal text-slate-500 dark:text-slate-400">
                  Why this window is open
                </p>
                <ul className="space-y-1">
                  {decisionFactors.map((factor, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No compelling savings signal yet under current market conditions.
            </p>
            {decisionFactors.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-normal text-slate-500 dark:text-slate-400">
                  Top decision factors
                </p>
                <ul className="space-y-1">
                  {decisionFactors.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-blue-200/70 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
            Personalized monitoring threshold
          </p>
          <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
            {data.triggerRateExplanation ??
              (data.triggerRatePct != null
                ? `Approximate 30-year benchmark trigger: ${pct(data.triggerRatePct, 2)} or lower.`
                : 'A rate-only trigger is not available under the current mortgage assumptions.')}
          </p>
          <p className="mt-1 text-[11px] text-blue-700/80 dark:text-blue-400">
            Modeled market context, not a lender quote or approval.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-slate-200/70 pt-4 text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
          <span>Balance: {usd(data.loanBalance)}</span>
          <span>Remaining: {months(data.remainingTermMonths)}</span>
          <span>Closing cost est.: {usd(data.closingCostAssumptionUsd)}</span>
        </div>
      </div>
    </GlassCard>
  );
}

function EligibilityContextCard({
  data,
  propertyId,
}: {
  data: RadarStatusAvailable;
  propertyId: string;
}) {
  const context = data.eligibilityContext;
  if (!context) return null;
  const valueSourceLabel = {
    APPRAISED_VALUE: 'Recorded appraisal',
    PURCHASE_PRICE_FALLBACK: 'Purchase-price fallback',
    UNKNOWN: 'Value not recorded',
  }[context.valueSource];
  const leverageLabel = {
    LOWER_LEVERAGE: 'At or below 80% combined LTV',
    HIGHER_LEVERAGE: 'Above 80% combined LTV',
    VERY_HIGH_LEVERAGE: 'Above 95% combined LTV',
    UNKNOWN: 'Combined LTV unavailable',
  }[context.leverageBand];
  const needsValue =
    context.followUpActions.includes('UPDATE_PROPERTY_VALUE');
  const needsFinancing =
    context.followUpActions.includes('CONFIRM_SECOND_LIEN_BALANCE') ||
    context.followUpActions.includes('REVIEW_MORTGAGE_INSURANCE') ||
    context.followUpActions.includes('CONFIRM_LOAN_PROGRAM');

  return (
    <GlassCard>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Equity and loan context
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Planning context only—not a lender qualification or appraisal.
            </p>
          </div>
          <span className="rounded-full border border-slate-200/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            {context.valueConfidence.toLowerCase()} value confidence
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Property value"
            value={usd(context.estimatedPropertyValueUsd)}
            sub={`${valueSourceLabel}${context.propertyValueAsOf ? ` · ${freshnessDate(context.propertyValueAsOf)}` : ''}`}
          />
          <KpiTile
            label="First-lien LTV"
            value={context.firstLienLtvPct == null ? '—' : pct(context.firstLienLtvPct, 1)}
            sub="mortgage ÷ value"
          />
          <KpiTile
            label="Combined LTV"
            value={context.combinedLtvPct == null ? '—' : pct(context.combinedLtvPct, 1)}
            sub={leverageLabel}
            highlight={
              context.leverageBand === 'VERY_HIGH_LEVERAGE'
                ? 'red'
                : context.leverageBand === 'LOWER_LEVERAGE'
                  ? 'green'
                  : undefined
            }
          />
          <KpiTile
            label="Estimated equity"
            value={usd(context.estimatedEquityUsd)}
            sub={context.combinedLtvPct == null ? 'Needs complete lien data' : 'value minus recorded liens'}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Second mortgage: {context.hasSecondMortgage
              ? context.secondMortgageBalanceUsd == null
                ? 'balance needed'
                : usd(context.secondMortgageBalanceUsd)
              : 'none recorded'}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Mortgage insurance: {context.hasMortgageInsurance ? 'recorded' : 'not recorded'}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Loan: {context.loanType.replace(/_/g, ' ')}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Occupancy: {context.occupancyStatus.replace(/_/g, ' ')}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Property: {context.propertyType.replace(/_/g, ' ')} · {context.propertyState}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Conforming context: {context.conformingContext.replace(/_/g, ' ').toLowerCase()}
          </span>
        </div>

        {context.warnings.length > 0 && (
          <ul className="mt-4 space-y-2">
            {context.warnings.map((warning) => (
              <li
                key={warning}
                className="flex gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        )}

        {context.programPathways.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Program pathways to discuss
              </h4>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Planning ranges—not approval
              </span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {context.programPathways.map((pathway) => (
                <article
                  key={pathway.program}
                  className="rounded-xl border border-indigo-200/70 bg-indigo-50/45 p-3 dark:border-indigo-900/70 dark:bg-indigo-950/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-xs font-semibold text-indigo-950 dark:text-indigo-200">
                      {pathway.title}
                    </h5>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                      {pathway.relevance.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {pathway.summary}
                  </p>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-indigo-700 dark:text-indigo-300">
                      Requirements and cautions
                    </summary>
                    <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">
                      Confirm:
                    </p>
                    <ul className="mt-1 space-y-1 text-slate-600 dark:text-slate-400">
                      {pathway.requirementsToConfirm.map((requirement) => (
                        <li key={requirement}>• {requirement}</li>
                      ))}
                    </ul>
                    <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">
                      Cautions:
                    </p>
                    <ul className="mt-1 space-y-1 text-amber-800 dark:text-amber-300">
                      {pathway.cautions.map((caution) => (
                        <li key={caution}>• {caution}</li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
            </div>
          </div>
        )}

        {(needsValue || needsFinancing) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {needsValue && (
              <Link
                href={`/dashboard/properties/${propertyId}/edit`}
                className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Update property value
              </Link>
            )}
            {needsFinancing && (
              <Link
                href={`/dashboard/properties/${propertyId}/tools/financing/profile`}
                className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Review mortgage details
              </Link>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function FreshnessBadge({
  state,
}: {
  state: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN' | undefined;
}) {
  const styles = {
    CURRENT: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    AGING: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    STALE: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
    UNKNOWN: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
  } as const;
  const resolved = state ?? 'UNKNOWN';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[resolved]}`}>
      {resolved.toLowerCase()}
    </span>
  );
}

function DataFreshnessCard({
  data,
  propertyId,
}: {
  data: RadarStatusAvailable;
  propertyId: string;
}) {
  const isReady = data.alertReadiness === 'READY';
  const warnings = data.freshnessWarnings ?? [];

  return (
    <GlassCard>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Data freshness
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Fresh inputs are required before future alerts can leave the product.
            </p>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${
            isReady
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-amber-700 dark:text-amber-300'
          }`}>
            {isReady
              ? <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            {isReady ? 'Alert inputs ready' : 'Alert review needed'}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Mortgage balance
              </p>
              <FreshnessBadge state={data.mortgageDataFreshness} />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              As of {freshnessDate(data.mortgageDataAsOf)}
            </p>
            {data.mortgageDataAgeDays != null && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {data.mortgageDataAgeDays} days old
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Market benchmark
              </p>
              <FreshnessBadge state={data.marketDataFreshness} />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              As of {freshnessDate(data.marketDataAsOf)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {data.marketDataSource ?? 'Source unavailable'}
              {data.marketDataAgeDays != null ? ` · ${data.marketDataAgeDays} days old` : ''}
            </p>
          </div>
        </div>

        {warnings.length > 0 && (
          <ul className="space-y-1.5" aria-label="Freshness warnings">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {warning}
              </li>
            ))}
          </ul>
        )}

        {data.alertReadiness === 'REVIEW_MORTGAGE_DATA' && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/properties/${propertyId}/tools/financing/profile`}>
              Confirm mortgage balance
            </Link>
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

function AlertPreferencesCard({
  propertyId,
  alertReadiness,
}: {
  propertyId: string;
  alertReadiness: RadarStatusAvailable['alertReadiness'];
}) {
  const [preference, setPreference] =
    useState<RefinanceAlertPreferenceDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getRefinanceAlertPreference(propertyId)
      .then((result) => {
        if (active) setPreference(result);
      })
      .catch(() => {
        if (active) setMessage('Alert preferences could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [propertyId]);

  async function save() {
    if (!preference) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await updateRefinanceAlertPreference(propertyId, {
        emailEnabled: preference.emailEnabled,
        pushEnabled: preference.pushEnabled,
        cadence:
          preference.emailEnabled || preference.pushEnabled
            ? preference.cadence
            : 'MUTED',
        sensitivity: preference.sensitivity,
        quietStart: preference.quietStart,
        quietEnd: preference.quietEnd,
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || preference.timezone,
      });
      setPreference(saved);
      setMessage(
        saved.externalDeliveryEnabled || saved.pushDeliveryEnabled
          ? 'Preferences saved. Eligible external alerts are active.'
          : 'Preferences saved. External delivery remains disabled during the pilot.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to save alert preferences.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePush(enabled: boolean) {
    if (!preference) return;
    if (!enabled) {
      setPreference({
        ...preference,
        pushEnabled: false,
        cadence: preference.emailEnabled ? preference.cadence : 'MUTED',
      });
      return;
    }
    if (!preference.pushPublicKey) {
      setMessage('Push alerts are not configured yet.');
      return;
    }
    setSubscribing(true);
    setMessage(null);
    try {
      await ensureRefinancePushSubscription(
        propertyId,
        preference.pushPublicKey,
      );
      setPreference({
        ...preference,
        pushEnabled: true,
        hasActivePushSubscription: true,
        cadence:
          preference.cadence === 'MUTED' ? 'IMMEDIATE' : preference.cadence,
      });
      setMessage(
        'Browser permission granted. Save preferences to opt in to refinance push alerts.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to enable push notifications.',
      );
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <GlassCard>
      <div
        id="refinance-alert-preferences"
        className="scroll-mt-24 space-y-4 p-5 sm:p-6"
      >
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Bell className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Refinance alert preferences
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {preference?.externalDeliveryEnabled ||
            preference?.pushDeliveryEnabled
              ? 'Home monitoring stays on. Email and push are explicit opt-in and follow your cadence and quiet hours.'
              : 'Home monitoring stays on. External channels require explicit opt-in and activate only after their delivery rollout is approved.'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-start gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <input type="checkbox" checked disabled className="mt-1" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Bell className="h-3.5 w-3.5" aria-hidden="true" /> Home
              </span>
              <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
                Always available in your action feed.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
            <input
              type="checkbox"
              className="mt-1"
              checked={preference?.emailEnabled ?? false}
              disabled={!preference}
              onChange={(event) => setPreference((current) => current && ({
                ...current,
                emailEnabled: event.target.checked,
                cadence: event.target.checked
                  ? current.cadence === 'MUTED' ? 'IMMEDIATE' : current.cadence
                  : 'MUTED',
              }))}
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email
              </span>
              <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
                Opt in now; delivery is not active yet.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
            <input
              type="checkbox"
              className="mt-1"
              checked={preference?.pushEnabled ?? false}
              disabled={
                !preference ||
                !preference.pushAvailable ||
                subscribing
              }
              onChange={(event) => void togglePush(event.target.checked)}
              aria-label="Push refinance alerts"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Push
              </span>
              <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
                {!preference?.pushAvailable
                  ? 'Available after Web Push keys are configured.'
                  : subscribing
                    ? 'Waiting for browser permission…'
                    : preference.pushDeliveryEnabled
                      ? 'Receive qualified refinance alerts on this device.'
                      : 'Opt in now; delivery activates with the push rollout.'}
              </span>
            </span>
          </label>
        </div>

        {preference && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Opportunity sensitivity
              <select
                value={preference.sensitivity}
                onChange={(event) => setPreference({
                  ...preference,
                  sensitivity: event.target.value as RefinanceAlertPreferenceDTO['sensitivity'],
                })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="CONSERVATIVE">Conservative — strong confidence only</option>
                <option value="BALANCED">Balanced — good or strong confidence</option>
                <option value="EARLY">Early signal — include weak confidence</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              External alert cadence
              <select
                value={preference.cadence}
                disabled={!preference.emailEnabled && !preference.pushEnabled}
                onChange={(event) => setPreference({
                  ...preference,
                  cadence: event.target.value as RefinanceAlertPreferenceDTO['cadence'],
                })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="IMMEDIATE">When a qualified window opens</option>
                <option value="DAILY_DIGEST">Daily digest</option>
                <option value="WEEKLY_BRIEF">Weekly brief</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Quiet hours start
              <input
                type="time"
                value={preference.quietStart ?? '21:00'}
                disabled={!preference.emailEnabled && !preference.pushEnabled}
                onChange={(event) => setPreference({ ...preference, quietStart: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Quiet hours end
              <input
                type="time"
                value={preference.quietEnd ?? '07:00'}
                disabled={!preference.emailEnabled && !preference.pushEnabled}
                onChange={(event) => setPreference({ ...preference, quietEnd: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
        )}

        {alertReadiness !== 'READY' && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Alerts will remain suppressed until mortgage and market inputs are current.
          </p>
        )}
        {message && (
          <p className="text-xs text-slate-600 dark:text-slate-300" role="status">
            {message}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!preference || saving}
        >
          {saving ? 'Saving…' : 'Save alert preferences'}
        </Button>
      </div>
    </GlassCard>
  );
}

function RefinanceFeedbackCard({
  propertyId,
  context,
}: {
  propertyId: string;
  context: 'RADAR' | 'OPPORTUNITY' | 'SCENARIO';
}) {
  const [recorded, setRecorded] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(
    feedback: 'HELPFUL' | 'NOT_NOW' | 'NOT_RELEVANT',
  ) {
    setSending(true);
    try {
      await recordRefinanceFeedback(propertyId, { feedback, context });
      setRecorded(feedback);
      track('action_completed', {
        tool: 'mortgage-refinance-radar',
        actionType: `feedback_${feedback.toLowerCase()}`,
        propertyId,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Was this refinance guidance useful?
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Your response improves opportunity thresholds and alert quality.
          </p>
        </div>
        {recorded ? (
          <p role="status" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Feedback recorded. Thank you.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[
              ['HELPFUL', 'Helpful'],
              ['NOT_NOW', 'Not now'],
              ['NOT_RELEVANT', 'Not relevant'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={sending}
                onClick={() => submit(value as 'HELPFUL' | 'NOT_NOW' | 'NOT_RELEVANT')}
                className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
  const [objective, setObjective] = useState<RefinanceObjective>('BALANCED');
  const [closingCost, setClosingCost] = useState('');
  const [discountPoints, setDiscountPoints] = useState('');
  const [additionalFees, setAdditionalFees] = useState('');
  const [lenderCredits, setLenderCredits] = useState('');
  const [escrowFunding, setEscrowFunding] = useState('');
  const [prepaymentPenalty, setPrepaymentPenalty] = useState('');
  const [extraPrincipal, setExtraPrincipal] = useState('');
  const [recastPrincipal, setRecastPrincipal] = useState('');
  const [cashOut, setCashOut] = useState('');
  const [creditBand, setCreditBand] = useState<
    'EXCELLENT' | 'GOOD' | 'FAIR' | 'LIMITED' | 'UNKNOWN'
  >('UNKNOWN');
  const [showCostDetails, setShowCostDetails] = useState(false);
  const [saveComparison, setSaveComparison] = useState(false);
  const [lastRunSaved, setLastRunSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<RefinanceScenarioResult | null>(null);
  const [lastScenarioInput, setLastScenarioInput] = useState<
    Parameters<typeof runScenario>[1] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);

  async function handleRun() {
    const rate = parseFloat(targetRate);
    if (!targetRate || isNaN(rate) || rate <= 0 || rate > 30) {
      setError('Enter a valid rate between 0.1% and 30%.');
      return;
    }
    const optionalNumber = (
      value: string,
      label: string,
      maximum: number,
    ): number | undefined => {
      if (!value.trim()) return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
        throw new Error(`${label} must be between 0 and ${maximum.toLocaleString()}.`);
      }
      return parsed;
    };
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const closingCostAmount = optionalNumber(closingCost, 'Base closing costs', 500_000);
      const discountPointsValue = optionalNumber(discountPoints, 'Discount points', 5);
      const additionalFeesAmount = optionalNumber(additionalFees, 'Additional fees', 500_000);
      const lenderCreditsAmount = optionalNumber(lenderCredits, 'Lender credits', 500_000);
      const escrowFundingAmount = optionalNumber(escrowFunding, 'Escrow funding', 500_000);
      const prepaymentPenaltyAmount = optionalNumber(prepaymentPenalty, 'Prepayment penalty', 500_000);
      const extraPrincipalAmount = optionalNumber(extraPrincipal, 'Extra principal', 5_000_000);
      const recastPrincipalAmount = optionalNumber(recastPrincipal, 'Recast principal', 5_000_000);
      const cashOutAmount = optionalNumber(cashOut, 'Cash-out amount', 5_000_000);
      const scenarioInput: Parameters<typeof runScenario>[1] = {
        targetRate: rate,
        targetTerm,
        closingCostAmount: closingCostAmount && closingCostAmount > 0
          ? closingCostAmount
          : undefined,
        discountPoints: discountPointsValue,
        additionalFeesAmount,
        lenderCreditsAmount,
        escrowFundingAmount,
        prepaymentPenaltyAmount,
        extraPrincipalAmount,
        recastPrincipalAmount,
        cashOutAmount,
        borrowerCreditBand: creditBand,
        objective,
        saveScenario: saveComparison,
      };
      const scenario = await runScenario(propertyId, scenarioInput);
      setResult(scenario);
      setLastScenarioInput(scenarioInput);
      setLastRunSaved(saveComparison);
      setShowResult(true);
      track('action_completed', { tool: 'mortgage-refinance-radar', actionType: 'run_scenario', propertyId });
      if (scenario.monthlySavings > 0) {
        track('savings_projected', {
          tool: 'mortgage-refinance-radar',
          amountUsd: scenario.monthlySavings,
          propertyId,
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scenario calculation failed.');
    } finally {
      setRunning(false);
    }
  }

  async function handleExportMarkdown() {
    if (!lastScenarioInput) return;
    setExporting(true);
    setError(null);
    try {
      const exported = await exportScenarioMarkdown(propertyId, lastScenarioInput);
      const url = URL.createObjectURL(
        new Blob([exported.markdown], { type: 'text/markdown;charset=utf-8' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      track('action_completed', {
        tool: 'mortgage-refinance-radar',
        actionType: 'export_markdown',
        propertyId,
      });
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'Unable to export the Markdown summary.',
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <GlassCard>
      <div className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-blue-500 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Scenario Planner
          </h3>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Run a custom refinance scenario against your current mortgage terms.
        </p>

        {/* Input rows */}
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              What matters most?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {OBJECTIVE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setObjective(option.value)}
                  aria-pressed={objective === option.value}
                  className={`rounded-xl border p-3 text-left transition ${
                    objective === option.value
                      ? 'border-blue-400 bg-blue-50/80 dark:border-blue-600 dark:bg-blue-950/35'
                      : 'border-slate-200/80 bg-white/70 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/50'
                  }`}
                >
                  <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

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
              inputMode="decimal"
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
                  type="button"
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
              inputMode="decimal"
              value={closingCost}
              onChange={(e) => setClosingCost(e.target.value)}
              placeholder={`Default: 2.5% of balance (~${usd(contextData.loanBalance * 0.025)})`}
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none ring-0 transition focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCostDetails((value) => !value)}
            aria-expanded={showCostDetails}
            className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
          >
            {showCostDetails ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {showCostDetails ? 'Hide' : 'Refine'} cost assumptions
          </button>

          {showCostDetails && (
            <div className="grid gap-3 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 sm:grid-cols-3 dark:border-slate-700/70 dark:bg-slate-900/45">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Discount points
                </label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.125"
                  inputMode="decimal"
                  value={discountPoints}
                  onChange={(e) => setDiscountPoints(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500">1 point = 1% of balance</p>
              </div>
              {[
                ['Escrow funding', escrowFunding, setEscrowFunding, 'Initial taxes and insurance'],
                ['Prepayment penalty', prepaymentPenalty, setPrepaymentPenalty, 'Only if your current loan requires it'],
                ['Extra principal', extraPrincipal, setExtraPrincipal, 'Compare keeping the current loan'],
                ['Recast principal', recastPrincipal, setRecastPrincipal, 'Compare a servicer-approved recast'],
                ['Cash-out amount', cashOut, setCashOut, 'Compare increased refinance principal'],
              ].map(([label, value, setter, placeholder]) => (
                <div key={label as string}>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {label as string} (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    inputMode="decimal"
                    value={value as string}
                    onChange={(event) =>
                      (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)
                    }
                    placeholder={placeholder as string}
                    className="w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Broad credit band
                </label>
                <select
                  value={creditBand}
                  onChange={(event) => setCreditBand(event.target.value as typeof creditBand)}
                  className="w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="UNKNOWN">Prefer not to say / unknown</option>
                  <option value="EXCELLENT">Excellent</option>
                  <option value="GOOD">Good</option>
                  <option value="FAIR">Fair</option>
                  <option value="LIMITED">Limited history</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Planning context only; this does not imply lender approval.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Other fees (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  inputMode="decimal"
                  value={additionalFees}
                  onChange={(e) => setAdditionalFees(e.target.value)}
                  placeholder="Appraisal, title, taxes"
                  className="w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Lender credits (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  inputMode="decimal"
                  value={lenderCredits}
                  onChange={(e) => setLenderCredits(e.target.value)}
                  placeholder="Reduces cash due"
                  className="w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 sm:col-span-3 dark:text-slate-400">
                These values model cost impact only. A lender&apos;s official Loan Estimate determines which charges affect disclosed APR.
              </p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
        )}

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200/70 bg-white/60 p-3 dark:border-slate-700/70 dark:bg-slate-900/45">
          <input
            type="checkbox"
            checked={saveComparison}
            onChange={(event) => setSaveComparison(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          <span>
            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Save this comparison
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Keep the selected scenario, objective, assumptions, and term comparison for later review.
            </span>
          </span>
        </label>

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
            {lastRunSaved && (
              <span
                role="status"
                className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                Comparison saved
              </span>
            )}
            <button
              type="button"
              onClick={handleExportMarkdown}
              disabled={exporting || !lastScenarioInput}
              className="ml-2 inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export Markdown'}
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
                    label="Cash to Close"
                    value={usd(result.cashToCloseUsd)}
                    sub="entered net costs"
                  />
                  <KpiTile
                    label="Modeled APR"
                    value={pct(result.estimatedAprPct, 3)}
                    sub={`${pct(result.targetRatePct, 3)} note rate`}
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

                <div className="mt-4 rounded-xl border border-violet-200/80 bg-violet-50/60 p-3 dark:border-violet-900/70 dark:bg-violet-950/25">
                  <p className="text-xs font-semibold text-violet-900 dark:text-violet-200">
                    Refinance and non-refinance alternatives
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-[650px] w-full text-left text-xs" aria-label="Mortgage decision alternatives">
                      <thead className="text-violet-800/80 dark:text-violet-300/80">
                        <tr>
                          <th className="pb-2">Option</th>
                          <th className="pb-2">Payment</th>
                          <th className="pb-2">Upfront cash</th>
                          <th className="pb-2">Payoff</th>
                          <th className="pb-2">Est. interest</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-violet-200/60">
                        {result.decisionAlternatives.map((alternative) => (
                          <tr key={alternative.kind}>
                            <th className="py-2 pr-3 font-semibold">{alternative.label}</th>
                            <td className="py-2 pr-3">{usd(alternative.monthlyPaymentUsd)}</td>
                            <td className="py-2 pr-3">{usd(alternative.upfrontCashUsd)}</td>
                            <td className="py-2 pr-3">{months(alternative.payoffMonths)}</td>
                            <td className="py-2">{usd(alternative.estimatedTotalInterestUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="mt-2 space-y-1 text-[11px] text-violet-800 dark:text-violet-300">
                    {result.decisionAlternatives.map((alternative) => (
                      <li key={`${alternative.kind}-guidance`}>• {alternative.guidance}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 dark:border-blue-900/70 dark:bg-blue-950/30">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                    Objective-aware comparison: {TERM_LABELS[result.recommendedTerm]}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-blue-800 dark:text-blue-300">
                    {result.recommendationExplanation}
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table
                      className="min-w-[680px] w-full text-left text-xs"
                      aria-label="Refinance term comparison"
                    >
                      <thead className="text-blue-800/80 dark:text-blue-300/80">
                        <tr>
                          <th className="pb-2 font-medium">Term</th>
                          <th className="pb-2 font-medium">Payment</th>
                          <th className="pb-2 font-medium">Monthly change</th>
                          <th className="pb-2 font-medium">Break-even</th>
                          <th className="pb-2 font-medium">Lifetime savings</th>
                          <th className="pb-2 font-medium">Payoff change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-200/60 text-slate-700 dark:divide-blue-900/50 dark:text-slate-300">
                        {result.alternatives.map((alternative) => (
                          <tr key={alternative.targetTerm}>
                            <th className="py-2 pr-3 font-semibold">
                              {TERM_LABELS[alternative.targetTerm]}
                              {alternative.isRecommended && (
                                <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">
                                  Best fit
                                </span>
                              )}
                            </th>
                            <td className="py-2 pr-3">{usd(alternative.newMonthlyPayment)}</td>
                            <td className="py-2 pr-3">
                              {alternative.monthlySavings >= 0 ? '−' : '+'}
                              {usd(Math.abs(alternative.monthlySavings))}
                            </td>
                            <td className="py-2 pr-3">{months(alternative.breakEvenMonths)}</td>
                            <td className="py-2 pr-3">{usd(alternative.lifetimeSavings)}</td>
                            <td className="py-2">
                              {alternative.payoffDeltaMonths === 0
                                ? 'Same'
                                : alternative.payoffDeltaMonths < 0
                                  ? `${months(Math.abs(alternative.payoffDeltaMonths))} sooner`
                                  : `${months(alternative.payoffDeltaMonths)} later`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
                    {result.alternatives
                      .find((alternative) => alternative.isRecommended)
                      ?.tradeoffs.map((tradeoff) => (
                        <li key={tradeoff}>• {tradeoff}</li>
                      ))}
                  </ul>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200/70 bg-white/60 p-3 text-xs dark:border-slate-700/70 dark:bg-slate-950/30">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    Cost and payoff assumptions
                  </p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-slate-600 sm:grid-cols-2 dark:text-slate-400">
                    <div className="flex justify-between gap-3">
                      <dt>Base closing costs</dt>
                      <dd>{usd(result.costBreakdown.baseClosingCostsUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Points ({result.costBreakdown.discountPoints.toFixed(3)})</dt>
                      <dd>{usd(result.costBreakdown.discountPointsUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Other entered fees</dt>
                      <dd>{usd(result.costBreakdown.additionalFeesUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Initial escrow funding</dt>
                      <dd>{usd(result.costBreakdown.escrowFundingUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Prepayment constraint</dt>
                      <dd>{usd(result.costBreakdown.prepaymentPenaltyUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Lender credits</dt>
                      <dd>−{usd(result.costBreakdown.lenderCreditsUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 font-medium text-slate-800 dark:text-slate-200">
                      <dt>Net modeled costs</dt>
                      <dd>{usd(result.costBreakdown.netClosingCostsUsd)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Estimated payoff</dt>
                      <dd>
                        {freshnessDate(result.currentEstimatedPayoffDate)} →{' '}
                        {freshnessDate(result.newEstimatedPayoffDate)}
                      </dd>
                    </div>
                  </dl>
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

// ─── Mortgage Setup Form ──────────────────────────────────────────────────────

const TERM_MONTH_OPTIONS: { label: string; value: number }[] = [
  { label: '5 years', value: 60 },
  { label: '10 years', value: 120 },
  { label: '15 years', value: 180 },
  { label: '20 years', value: 240 },
  { label: '25 years', value: 300 },
  { label: '30 years', value: 360 },
];

function initialTermSelection(profile: PropertyFinancingProfile | null): {
  preset: string;
  custom: string;
} {
  const value = profile?.remainingTermMonths;
  if (value == null) return { preset: '', custom: '' };
  return TERM_MONTH_OPTIONS.some((option) => option.value === value)
    ? { preset: String(value), custom: '' }
    : { preset: 'custom', custom: String(value) };
}

function MortgageSetupForm({
  propertyId,
  initial,
  onSaved,
}: {
  propertyId: string;
  initial: PropertyFinancingProfile | null;
  onSaved: () => Promise<void>;
}) {
  const initialTerm = initialTermSelection(initial);
  const [balance, setBalance] = useState(
    initial?.currentMortgageBalanceCents != null
      ? String(initial.currentMortgageBalanceCents / 100)
      : '',
  );
  const [ratePct, setRatePct] = useState(
    initial?.interestRateBps != null ? String(initial.interestRateBps / 100) : '',
  );
  const [termMonths, setTermMonths] = useState(initialTerm.preset);
  const [customTerm, setCustomTerm] = useState(initialTerm.custom);
  const [monthlyPayment, setMonthlyPayment] = useState(
    initial?.monthlyPaymentCents != null ? String(initial.monthlyPaymentCents / 100) : '',
  );
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
      await saveFinancingProfile(propertyId, {
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
          {initial
            ? 'We pulled the mortgage details already saved in Financing. Complete any missing fields to enable the refinance radar.'
            : 'Enter your current mortgage details to enable the refinance radar.'}
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
              inputMode="decimal"
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
              inputMode="decimal"
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
                inputMode="numeric"
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
              inputMode="decimal"
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
    NO_MORTGAGE: {
      title: 'No mortgage recorded',
      body: 'Refinance monitoring is paused. Add a mortgage in Financing if this changes.',
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
  const [mortgageProfile, setMortgageProfile] = useState<PropertyFinancingProfile | null>(null);
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
      const [initialStatus, rates, profile] = await Promise.all([
        getRadarStatus(propertyId),
        getRateHistory(propertyId, 52).catch(() => null),
        getFinancingMortgageProfile(propertyId).catch(() => null),
      ]);
      if (reqId !== reqRef.current) return;

      const hasCompleteCanonicalMortgage = Boolean(
        profile &&
        profile.currentMortgageBalanceCents != null &&
        profile.interestRateBps != null &&
        profile.remainingTermMonths != null,
      );
      const status =
        initialStatus &&
        !initialStatus.available &&
        (initialStatus as RadarStatusUnavailable).reason === 'MISSING_MORTGAGE_DATA' &&
        hasCompleteCanonicalMortgage
          ? await evaluateRadar(propertyId).catch(() => initialStatus)
          : initialStatus;
      if (reqId !== reqRef.current) return;

      setData(status);
      setRateData(rates);
      setMortgageProfile(profile);
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
      track('action_completed', { tool: 'mortgage-refinance-radar', actionType: 'evaluate', propertyId });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  }

  useEffect(() => {
    load();
    if (propertyId) {
      track('workflow_started', { tool: 'mortgage-refinance-radar', propertyId, entryPoint: 'direct' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const available = data?.available === true ? (data as RadarStatusAvailable) : null;
  const trust = refinanceLoopTrust({
    confidenceLabel: available?.confidenceLevel
      ? `${available.confidenceLevel.toLowerCase()} fit from current loan context`
      : 'Model fit pending evaluation',
    freshnessLabel: available?.alertReadiness === 'READY'
      ? trustDateLabel(available.lastEvaluatedAt, 'Evaluate now to refresh')
      : available?.freshnessWarnings?.[0] ??
        trustDateLabel(available?.lastEvaluatedAt, 'Evaluate now to refresh'),
    sourceLabel: 'Mortgage profile + market rate snapshots + refinance analysis',
  });

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Mortgage Refinance Radar"
      subtitle="Monitor rates and know when refinancing is likely worth the effort."
      trust={trust}
      introAction={
        <HomeToolsRail
          propertyId={propertyId}
          context="mortgage-refinance-radar"
          currentToolId="mortgage-refinance-radar"
          showDesktop={false}
        />
      }
      priorityAction={!loading && available ? (
        available.radarState === 'OPEN' ? {
          title: 'A refinance window is open; current rates suggest potential savings.',
          description: 'Recent rate movement created a meaningful gap. Compare lender quotes before conditions shift.',
          impactLabel: available.confidenceLevel ? `${available.confidenceLevel.toLowerCase()} fit` : 'Opportunity detected',
          confidenceLabel: available.confidenceLevel ? `${available.confidenceLevel.toLowerCase()} confidence` : 'Medium confidence',
          primaryAction: (
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => {
                const el = document.getElementById('refinance-steps-to-act');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              View steps to act
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
          title: 'No refinance opportunity detected at current rates.',
          description: 'The current analysis does not see a compelling rate gap right now. Re-evaluate when rates shift for an updated read.',
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
    >

      <PropertyContextStatusNotice context={data?.propertyContext} title="Refinance context" />

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
          ? (
            <div className="space-y-4">
              <MortgageSetupForm
                propertyId={propertyId}
                initial={mortgageProfile}
                onSaved={handleEvaluate}
              />
              {rateData && rateData.snapshots.length > 0 && (
                <MortgageRateHistoryChart
                  rateData={rateData}
                  currentMortgageRatePct={
                    mortgageProfile?.interestRateBps == null
                      ? null
                      : mortgageProfile.interestRateBps / 100
                  }
                />
              )}
            </div>
          )
          : <UnavailableCard reason={(data as RadarStatusUnavailable).reason} />
      )}

      {/* Main content */}
      {available && !loading && (
        <>
          <HomeToolHeader
            toolId="mortgage-refinance-radar"
            propertyId={propertyId}
            context="mortgage-refinance-radar"
            currentToolId="mortgage-refinance-radar"
          />

          {/* 1. Refinance decision */}
          <RadarStatusHero data={available} />

          {/* 2. Key metrics */}
          <KeyMetricsCard data={available} />

          {/* 3. Data freshness and monitoring readiness */}
          {available.alertReadiness && (
            <DataFreshnessCard data={available} propertyId={propertyId} />
          )}

          {/* 4. Equity, lien, and mortgage-insurance context */}
          <EligibilityContextCard data={available} propertyId={propertyId} />

          {/* 5. Alert preferences */}
          <AlertPreferencesCard
            propertyId={propertyId}
            alertReadiness={available.alertReadiness}
          />

          {/* 6. Scenario planner */}
          <ScenarioCalculator propertyId={propertyId} contextData={available} />

          {/* 7. Official lender disclosure comparison */}
          <LoanEstimateComparisonCard propertyId={propertyId} />

          <RefinanceFeedbackCard
            propertyId={propertyId}
            context={available.radarState === 'OPEN' ? 'OPPORTUNITY' : 'RADAR'}
          />

          {/* 3b. Steps to act — shown when opportunity is open */}
          {available.radarState === 'OPEN' && (
            <div id="refinance-steps-to-act"><GlassCard>
              <div className="p-5 sm:p-6 space-y-4">
                <p className="text-[11px] font-semibold tracking-normal text-slate-500 dark:text-slate-400">
                  Steps to act today
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  A refinance window doesn't stay open forever. Here's what you can do right now — no lender or partner needed.
                </p>
                <ol className="space-y-3">
                  {[
                    { n: 1, title: 'Check your current loan terms', body: 'Find your most recent mortgage statement. Note your current rate, remaining balance, and monthly payment.' },
                    { n: 2, title: 'Run scenarios above', body: 'Use the scenario planner to compare 15-, 20-, and 30-year options. Find the term where monthly savings exceed closing costs within your target break-even window.' },
                    { n: 3, title: 'Pull your credit score', body: 'Lenders price rate offers on your score. Check a free source (Credit Karma, your bank app) so you know where you stand before requesting quotes.' },
                    { n: 4, title: 'Gather documents in advance', body: 'Most lenders will ask for 2 years of tax returns, 2 recent pay stubs, and 2–3 months of bank statements. Having these ready shortens approval timelines.' },
                    { n: 5, title: 'Request quotes from 3+ lenders', body: 'Rate-shopping within a 14–45 day window counts as one hard inquiry on your credit. Compare APR — not just rate — to account for fees.' },
                  ].map(({ n, title, body }) => (
                    <li key={n} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                        {n}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </GlassCard></div>
          )}

          {/* 4. Market context */}
          <section aria-label="Market Context" className="space-y-4">
            <div className="px-1">
              <p className="text-[11px] font-semibold tracking-normal text-slate-500 dark:text-slate-400">
                Market Context
              </p>
            </div>

            <RateTrendCard data={available} />

            <MissedOpportunityCard data={available} />

            {rateData && rateData.snapshots.length > 0 && (
              <MortgageRateHistoryChart
                rateData={rateData}
                currentMortgageRatePct={available.currentRatePct}
              />
            )}
          </section>

          {/* 5. Disclaimer */}
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
