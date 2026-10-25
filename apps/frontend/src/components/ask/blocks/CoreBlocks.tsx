import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, DollarSign, Home, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { workflowProgressStatusLabel } from '@/features/ask/presentationCompatibility';
import { timelinePoint } from '@/features/ask/displayPatterns';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ActionLink, AskContextLink } from './context';
import { SEASONAL_ABOUT_BLOCK_IDS, SEASONAL_NEXT_STEPS_BLOCK_IDS, SeasonalAboutCard, SeasonalIntroCard, isSeasonalIntroBlockId, SeasonalNextSteps } from '../SeasonalAnswerCards';
import { useCalmAnswer, useCalmChrome, useCalmReceiptContinuation } from './calmContext';
import type { AskBlockRenderer } from './types';
import { ItemActionButtons } from '../patterns/PatternParts';
import { SummaryBullets } from './SummaryBullets';
import { PLANT_ADVISOR_ANSWER_WIDTH_CLASS } from '../plantAdvisorLayout';

function AnswerChips({ chips }: { chips: NonNullable<Extract<AskPresentationBlock, { type: 'SUMMARY' }>['chips']> }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="At a glance">
      {chips.map((chip) => <li key={chip.label} data-ask-answer-chip={chip.tone.toLowerCase()} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums', ANSWER_CHIP_TONES[chip.tone])}>{chip.label}</li>)}
    </ul>
  );
}

// IW-CALM-001/002 (FRD v1.111): the answer as a headline, one supporting line and chips, with no frame or tint. A producer that
// declares `headline`/`supportLine` gets the compact form; any other summary keeps its title as the headline and its body as
// ordinary text (it may be the whole answer, so it is never muted). A caution or critical tone keeps a thin colored rule.
const CALM_TONE_RULE = { CAUTION: 'border-l-2 border-amber-300 pl-3', CRITICAL: 'border-l-2 border-red-300 pl-3', POSITIVE: '', DEFAULT: '' } as const;

function CalmSummary({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  // IW-CONV-002: one primary action per turn. A domain that adopted the headline anatomy carries its actions on its list, so the
  // summary adds none; any other summary keeps only its first.
  const adopted = useCalmAnswer();
  const actions = adopted && !block.bullets ? [] : block.actions.slice(0, 1);
  const declared = Boolean(block.headline?.trim() || block.supportLine?.trim() || block.bullets?.length);
  const headline = block.headline?.trim() || block.title;
  const supportLine = declared ? block.supportLine?.trim() || null : block.body;
  return (
    <section data-calm-summary="" className={cn('max-w-[800px]', CALM_TONE_RULE[block.tone])}>
      <h3 className="font-display text-[22px] font-medium leading-snug tracking-[-0.01em] text-slate-950 sm:text-[26px]">{headline}</h3>
      {supportLine && <p className={cn('mt-1 whitespace-pre-wrap text-sm leading-6', declared ? 'text-slate-500' : 'text-slate-700')}>{supportLine}</p>}
      {block.bullets && <SummaryBullets bullets={block.bullets} />}
      {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
      {actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-sm">{actions.map((action) => <ActionLink key={action.id} action={{ ...action, style: 'SECONDARY' }} />)}</div>}
    </section>
  );
}

function StatusBoardSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isEmpty = block.title === 'Nothing is on the Status Board yet';
  const countMatches = /(\d+)\s+need\s+action,\s*(\d+)\s+to\s+monitor,\s*(\d+)\s+in\s+good\s+shape/i.exec(block.title);
  const actionCount = countMatches ? Number(countMatches[1]) : 0;
  const monitorCount = countMatches ? Number(countMatches[2]) : 0;
  const goodCount = countMatches ? Number(countMatches[3]) : 0;
  const firstSentenceMatch = /^([^.]+\.)\s*(.*)$/.exec(block.body);
  const primaryLead = firstSentenceMatch ? firstSentenceMatch[1] : block.body;
  const secondaryDetail = firstSentenceMatch ? firstSentenceMatch[2] : '';

  return (
    <section
      data-status-board-summary=""
      className={cn(
        'relative w-full rounded-2xl border px-4 py-3.5 shadow-2xs sm:px-5',
        block.tone === 'CAUTION'
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-teal-50/40'
          : 'border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-teal-50/40',
      )}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <Sparkles aria-hidden="true" className="h-3 w-3 text-teal-300" />
              Home Status Board
            </span>
            {!isEmpty && countMatches && (
              <div aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
                {actionCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    {actionCount} Action
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {monitorCount} Monitor
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {goodCount} Good
                </span>
              </div>
            )}
          </div>
          <h3 className="mt-1.5 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-700">
            {primaryLead}
            {secondaryDetail && <span className="sr-only"> {secondaryDetail}</span>}
          </p>
        </div>
        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BudgetForecastSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isBlocked = block.tone === 'CAUTION';
  return (
    <section
      data-budget-forecast-summary=""
      className={cn(
        'relative w-full rounded-2xl border px-4 py-3.5 shadow-2xs sm:px-5',
        isBlocked
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-amber-50/30'
          : 'border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-teal-50/40',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <Sparkles aria-hidden="true" className="h-3 w-3 text-teal-300" />
              Budget Planner
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">{block.body}</p>
        </div>
        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SellHoldRentSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isWhatIf = block.id === 'sell-hold-rent-what-if-summary';
  return (
    <section
      data-sell-hold-rent-summary=""
      className={cn(
        'relative w-full rounded-2xl border px-4 py-3.5 shadow-2xs sm:px-5',
        block.tone === 'CAUTION'
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-teal-50/30'
          : 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/40',
      )}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <Sparkles aria-hidden="true" className="h-3 w-3 text-teal-300" />
              {isWhatIf ? 'What-If Scenario Analysis' : 'Sell · Hold · Rent Decision'}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-5 text-slate-700">{block.body}</p>
          {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
        </div>
        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mt-1">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BreakEvenSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isWhatIf = /^what if:/i.test(block.title);
  const isCaution = block.tone === 'CAUTION';
  const yearMatch = /year\s+(\d+)\s+of\s+(\d+)/i.exec(block.title);
  const targetYear = yearMatch ? Number(yearMatch[1]) : null;
  const horizonYears = yearMatch ? Number(yearMatch[2]) : null;
  const progressPct = targetYear && horizonYears ? Math.min(100, Math.max(8, Math.round((targetYear / horizonYears) * 100))) : null;

  return (
    <section
      data-break-even-summary=""
      className={cn(
        'relative w-full rounded-2xl border px-4 py-3 shadow-2xs sm:px-5',
        isCaution
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-rose-50/30'
          : 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/40',
      )}
    >
      <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <Sparkles aria-hidden="true" className="h-3 w-3 text-teal-300" />
              {isWhatIf ? 'Break-Even What-If Simulation' : 'Break-Even Ownership Analysis'}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                isCaution
                  ? 'border-amber-300/80 bg-amber-100/80 text-amber-900'
                  : 'border-emerald-300/80 bg-emerald-100/80 text-emerald-900',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', isCaution ? 'bg-amber-600' : 'bg-emerald-600')} />
              {isCaution ? 'Beyond Horizon' : 'Crossover Projected'}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700 sm:text-sm">{block.body}</p>
          {progressPct !== null && (
            <div aria-hidden="true" className="mt-2 max-w-sm rounded-xl border border-emerald-200/70 bg-white/80 px-3 py-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <span>Year 1</span>
                <span className="font-bold text-emerald-800">Break-Even Crossover · Year {targetYear}</span>
                <span>Year {horizonYears}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
          {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
        </div>
        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mt-1">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BreakEvenNextActionCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  return (
    <section
      data-break-even-next-action=""
      className="w-full rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/70 via-white to-emerald-50/40 px-4 py-3 shadow-2xs sm:px-5"
    >
      <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-teal-800">
            <ArrowRight aria-hidden="true" className="h-3 w-3 text-teal-600" />
            Recommended Next Step
          </span>
          <h3 className="mt-0.5 text-sm font-bold text-slate-950">{block.title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">{block.body}</p>
        </div>
        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const OWNERSHIP_COST_SUMMARY_IDS: ReadonlySet<string> = new Set([
  'ownership-costs-summary',
  'ownership-cost-changes-summary',
  'ownership-cost-forecast-summary',
  'ownership-cost-buffer-summary',
  'ownership-costs-unavailable',
]);

function OwnershipCostsSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isCaution = block.tone === 'CAUTION';
  const viewLabel =
    block.id === 'ownership-cost-changes-summary'
      ? 'Observed Period Comparison'
      : block.id === 'ownership-cost-forecast-summary'
        ? 'Forward Cost Range'
        : block.id === 'ownership-cost-buffer-summary'
          ? 'Variability & Buffer Plan'
          : block.id === 'ownership-costs-unavailable'
            ? 'Context Required'
            : /cash outflow/i.test(block.body) || /cash outflow/i.test(block.title)
              ? 'Cash Outflow Lens'
              : 'Operating Expense Lens';

  const annualMatch = /(\$[0-9,]+)\s+per\s+year/i.exec(block.body);
  const confirmedMatch = /(\$[0-9,]+)\s+is\s+supported\s+by\s+confirmed\s+or\s+observed\s+records/i.exec(block.body);
  const estimatedMatch = /and\s+(\$[0-9,]+)\s+is\s+estimated/i.exec(block.body);
  const missingMatch = /(\d+)\s+included\s+categor(?:y|ies)\s+(?:is|are)\s+still\s+missing/i.exec(block.body);
  const rangeMatch = /planning\s+range\s+is\s+(\$[0-9,]+)\s+to\s+(\$[0-9,]+)/i.exec(block.body);
  const baseRangeMatch = /around\s+(\$[0-9,]+)/i.exec(block.title);

  const annualVal = annualMatch ? parseMetricDollar(annualMatch[1]) : null;
  const confirmedVal = confirmedMatch ? parseMetricDollar(confirmedMatch[1]) : null;
  const estimatedVal = estimatedMatch ? parseMetricDollar(estimatedMatch[1]) : null;
  const totalKnown = (confirmedVal ?? 0) + (estimatedVal ?? 0);
  const confirmedPct = totalKnown > 0 ? Math.min(100, Math.max(0, Math.round(((confirmedVal ?? 0) / totalKnown) * 100))) : null;
  const estimatedPct = confirmedPct !== null ? 100 - confirmedPct : null;

  return (
    <section
      data-ownership-costs-summary={block.id}
      className={cn(
        'relative w-full rounded-2xl border px-4 py-3 shadow-2xs sm:px-5',
        isCaution
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/85 via-white to-teal-50/30'
          : 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/75 via-white to-teal-50/40',
      )}
    >
      <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <DollarSign aria-hidden="true" className="h-3 w-3 text-teal-300" />
              Ownership Cost Intelligence
            </span>
            <span
              aria-hidden="true"
              className="inline-flex items-center rounded-full border border-teal-200/90 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-800"
            >
              {viewLabel}
            </span>
            {block.id === 'ownership-costs-summary' && (
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  isCaution
                    ? 'border-amber-300/80 bg-amber-100/80 text-amber-900'
                    : 'border-emerald-300/80 bg-emerald-100/80 text-emerald-900',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', isCaution ? 'bg-amber-600' : 'bg-emerald-600')} />
                {missingMatch ? `${missingMatch[1]} Missing` : isCaution ? 'Partial Coverage' : 'Coverage Complete'}
              </span>
            )}
          </div>

          <h3 className="mt-1 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700 sm:text-sm">{block.body}</p>

          {annualMatch && confirmedMatch && estimatedMatch && (
            <div aria-hidden="true" className="mt-2.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Annual Total</span>
                  <span className="mt-0.5 block text-xs font-extrabold tabular-nums text-slate-950 sm:text-sm">{annualMatch[1]}/yr</span>
                </div>
                <div>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    Confirmed / Observed
                  </span>
                  <span className="mt-0.5 block text-xs font-extrabold tabular-nums text-emerald-900 sm:text-sm">
                    {confirmedMatch[1]}
                    {confirmedPct !== null && <span className="ml-1 text-[11px] font-semibold text-emerald-700">({confirmedPct}%)</span>}
                  </span>
                </div>
                <div>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Estimated
                  </span>
                  <span className="mt-0.5 block text-xs font-extrabold tabular-nums text-amber-900 sm:text-sm">
                    {estimatedMatch[1]}
                    {estimatedPct !== null && <span className="ml-1 text-[11px] font-semibold text-amber-700">({estimatedPct}%)</span>}
                  </span>
                </div>
              </div>
              {confirmedPct !== null && annualVal && annualVal > 0 && (
                <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="bg-emerald-600 transition-all" style={{ width: `${confirmedPct}%` }} />
                  <div className="bg-amber-400 transition-all" style={{ width: `${estimatedPct ?? 0}%` }} />
                </div>
              )}
            </div>
          )}

          {block.id === 'ownership-cost-forecast-summary' && rangeMatch && (
            <div aria-hidden="true" className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Low</span>
                <span className="font-bold tabular-nums text-slate-900">{rangeMatch[1]}</span>
              </span>
              {baseRangeMatch && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Base</span>
                    <span className="font-extrabold tabular-nums text-teal-950">{baseRangeMatch[1]}</span>
                  </span>
                </>
              )}
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">High</span>
                <span className="font-bold tabular-nums text-slate-900">{rangeMatch[2]}</span>
              </span>
            </div>
          )}

          {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
        </div>

        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mt-0.5">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OwnershipCostRefreshCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  return (
    <section
      data-ownership-cost-refresh=""
      className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/75 px-4 py-2.5 shadow-2xs sm:px-5"
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-xs font-bold text-slate-900 sm:text-sm">{block.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Data Freshness</span>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">{block.body}</p>
        </div>
        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ServicePriceRadarSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isCaution = block.tone === 'CAUTION';
  const isPositive = block.tone === 'POSITIVE';
  return (
    <section
      data-service-price-radar-summary={block.id}
      className={cn(
        'relative w-full rounded-2xl border px-4 py-3 shadow-2xs sm:px-5',
        isCaution
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/85 via-white to-teal-50/30'
          : isPositive
            ? 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/75 via-white to-teal-50/40'
            : 'border-slate-200/90 bg-gradient-to-r from-slate-50/80 via-white to-teal-50/30',
      )}
    >
      <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <DollarSign aria-hidden="true" className="h-3 w-3 text-teal-300" />
              Service Price Radar
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                isCaution
                  ? 'border-amber-300/80 bg-amber-100/80 text-amber-900'
                  : isPositive
                    ? 'border-emerald-300/80 bg-emerald-100/80 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', isCaution ? 'bg-amber-600' : isPositive ? 'bg-emerald-600' : 'bg-slate-400')} />
              {isCaution ? 'Above Expected Range' : isPositive ? 'Within Expected Range' : 'Quote Benchmark'}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700 sm:text-sm">{block.body}</p>
          {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
        </div>
        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mt-0.5">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const COVERAGE_SUMMARY_IDS: ReadonlySet<string> = new Set([
  'coverage-summary',
  'coverage-comparison-summary',
  'coverage-comparison-baseline-required',
  'coverage-comparison-not-started',
]);

function CoverageSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isCaution = block.tone === 'CAUTION';
  const isPositive = block.tone === 'POSITIVE';
  const isGapAudit = block.id === 'coverage-summary';
  const countsMatch = /(\d+)\s+confirmed\s+missing\s+or\s+expired,\s*(\d+)\s+unclear,\s+and\s+(\d+)\s+missing\s+supporting\s+evidence/i.exec(block.body);
  const confirmedGaps = countsMatch ? Number(countsMatch[1]) : null;
  const unclearCount = countsMatch ? Number(countsMatch[2]) : null;
  const missingEvidence = countsMatch ? Number(countsMatch[3]) : null;
  const totalFlagged = (confirmedGaps ?? 0) + (unclearCount ?? 0) + (missingEvidence ?? 0);
  const confirmedPct = totalFlagged > 0 ? Math.round(((confirmedGaps ?? 0) / totalFlagged) * 100) : 0;
  const unclearPct = totalFlagged > 0 ? Math.round(((unclearCount ?? 0) / totalFlagged) * 100) : 0;
  const evidencePct = totalFlagged > 0 ? Math.max(0, 100 - confirmedPct - unclearPct) : 0;

  return (
    <section
      data-coverage-summary={block.id}
      className={cn(
        'relative w-full rounded-2xl border px-4 py-3 shadow-2xs sm:px-5',
        isCaution
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/85 via-white to-teal-50/30'
          : isPositive
            ? 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/75 via-white to-teal-50/40'
            : 'border-slate-200/90 bg-gradient-to-r from-slate-50/85 via-white to-teal-50/30',
      )}
    >
      <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              {isCaution ? (
                <AlertTriangle aria-hidden="true" className="h-3 w-3 text-amber-300" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="h-3 w-3 text-teal-300" />
              )}
              Coverage Intelligence
            </span>
            <span
              aria-hidden="true"
              className="inline-flex items-center rounded-full border border-teal-200/90 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-800"
            >
              {isGapAudit ? 'Gap & Evidence Audit' : 'Policy Comparison'}
            </span>
            {isGapAudit && (
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  (confirmedGaps ?? 0) > 0
                    ? 'border-rose-300/80 bg-rose-100/80 text-rose-900'
                    : isCaution
                      ? 'border-amber-300/80 bg-amber-100/80 text-amber-900'
                      : isPositive
                        ? 'border-emerald-300/80 bg-emerald-100/80 text-emerald-900'
                        : 'border-sky-300/80 bg-sky-100/80 text-sky-900',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    (confirmedGaps ?? 0) > 0
                      ? 'bg-rose-600'
                      : isCaution
                        ? 'bg-amber-600'
                        : isPositive
                          ? 'bg-emerald-600'
                          : 'bg-sky-600',
                  )}
                />
                {(confirmedGaps ?? 0) > 0
                  ? `${confirmedGaps} Confirmed Gap${confirmedGaps === 1 ? '' : 's'}`
                  : (unclearCount ?? 0) > 0
                    ? `${unclearCount} Unclear`
                    : (missingEvidence ?? 0) > 0
                      ? `${missingEvidence} Missing Evidence`
                      : 'No Gaps Surfaced'}
              </span>
            )}
          </div>

          <h3 className="mt-1 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700 sm:text-sm">{block.body}</p>

          {countsMatch && confirmedGaps !== null && unclearCount !== null && missingEvidence !== null && (
            <div aria-hidden="true" className="mt-2.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                    Confirmed Gaps
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                    <span className="text-xs font-extrabold tabular-nums text-rose-950 sm:text-sm">{confirmedGaps}</span>
                    <span className="text-[11px] font-medium text-slate-500">missing / expired</span>
                  </div>
                </div>
                <div>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Coverage Unclear
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                    <span className="text-xs font-extrabold tabular-nums text-amber-950 sm:text-sm">{unclearCount}</span>
                    <span className="text-[11px] font-medium text-slate-500">needs check</span>
                  </div>
                </div>
                <div>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
                    Evidence Missing
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                    <span className="text-xs font-extrabold tabular-nums text-sky-950 sm:text-sm">{missingEvidence}</span>
                    <span className="text-[11px] font-medium text-slate-500">no document</span>
                  </div>
                </div>
              </div>
              {totalFlagged > 0 && (
                <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  {confirmedPct > 0 && <div className="bg-rose-500 transition-all" style={{ width: `${confirmedPct}%` }} />}
                  {unclearPct > 0 && <div className="bg-amber-400 transition-all" style={{ width: `${unclearPct}%` }} />}
                  {evidencePct > 0 && <div className="bg-sky-500 transition-all" style={{ width: `${evidencePct}%` }} />}
                </div>
              )}
            </div>
          )}

          {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
        </div>

        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mt-0.5">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const PLANT_ADVISOR_SUMMARY_IDS: ReadonlySet<string> = new Set([
  'plant-care-summary',
  'plant-recommendation-summary',
]);

function PlantAdvisorSummaryCard({ block }: { block: Extract<AskPresentationBlock, { type: 'SUMMARY' }> }) {
  const isCaution = block.tone === 'CAUTION';
  const isPositive = block.tone === 'POSITIVE';
  const isCareSummary = block.id === 'plant-care-summary';

  const urgentMatch = /(\d+)\s+plant\s+care\s+changes?\s+to\s+make\s+now\s+or\s+soon/i.exec(block.title);
  const urgentCount = urgentMatch ? Number(urgentMatch[1]) : null;
  const trackingMatch = /Tracking\s+(\d+)\s+plants?(?:\s+and\s+(\d+)\s+garden\s+zones?)?/i.exec(block.body);
  const trackedPlants = trackingMatch ? Number(trackingMatch[1]) : null;
  const trackedZones = trackingMatch && trackingMatch[2] ? Number(trackingMatch[2]) : 0;
  const hardinessMatch = /USDA\s+hardiness\s+zone\s+([0-9a-z]+)/i.exec(block.body);
  const hardinessZone = hardinessMatch ? hardinessMatch[1] : null;
  const recommendedMatch = /(\d+)\s+plants?\s+recommended\s+for\s+(.+)/i.exec(block.title);
  const recommendedCount = recommendedMatch ? Number(recommendedMatch[1]) : null;
  const recommendedRoom = recommendedMatch ? recommendedMatch[2].trim() : null;
  const isUntracked = isCareSummary && /no\s+plants\s+or\s+garden\s+zones\s+tracked/i.test(block.title);

  return (
    <section
      data-plant-advisor-summary={block.id}
      className={cn(
        PLANT_ADVISOR_ANSWER_WIDTH_CLASS,
        'relative rounded-2xl border px-4 py-3 shadow-2xs sm:px-5',
        isCaution
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/85 via-white to-emerald-50/35'
          : isPositive
            ? 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/40'
            : 'border-emerald-200/75 bg-gradient-to-r from-emerald-50/60 via-white to-teal-50/30',
      )}
    >
      <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              {isCaution ? (
                <AlertTriangle aria-hidden="true" className="h-3 w-3 text-amber-300" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="h-3 w-3 text-emerald-300" />
              )}
              Plant Advisor
            </span>
            <span
              aria-hidden="true"
              className="inline-flex items-center rounded-full border border-emerald-200/90 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800"
            >
              {isCareSummary ? 'Weather-Aware Care' : 'Room Fit Recommendations'}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                (urgentCount ?? 0) > 0 || isCaution
                  ? 'border-amber-300/80 bg-amber-100/80 text-amber-900'
                  : isUntracked
                    ? 'border-teal-200/90 bg-teal-50/90 text-teal-900'
                    : 'border-emerald-300/80 bg-emerald-100/80 text-emerald-900',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  (urgentCount ?? 0) > 0 || isCaution
                    ? 'bg-amber-600'
                    : isUntracked
                      ? 'bg-teal-600'
                      : 'bg-emerald-600',
                )}
              />
              {(urgentCount ?? 0) > 0
                ? `${urgentCount} Urgent Change${urgentCount === 1 ? '' : 's'}`
                : recommendedCount !== null
                  ? `${recommendedCount} Room Match${recommendedCount === 1 ? '' : 'es'}`
                  : isUntracked
                    ? 'Ready to Track'
                    : isCaution
                      ? 'Check Conditions'
                      : 'Routine Cadence'}
            </span>
          </div>

          <h3 className="mt-1 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700 sm:text-sm">{block.body}</p>

          {isCareSummary && trackedPlants !== null && (
            <div aria-hidden="true" className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Tracked Flora</span>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                  <span className="text-xs font-extrabold tabular-nums text-slate-950 sm:text-sm">{trackedPlants}</span>
                  <span className="text-[11px] font-medium text-slate-500">
                    plant{trackedPlants === 1 ? '' : 's'}
                    {trackedZones > 0 ? ` · ${trackedZones} zone${trackedZones === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Climate Zone</span>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                  <span className="text-xs font-extrabold tabular-nums text-emerald-900 sm:text-sm">
                    {hardinessZone ? `USDA ${hardinessZone}` : 'Local forecast'}
                  </span>
                </div>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Care Posture</span>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                  <span
                    className={cn(
                      'text-xs font-extrabold tabular-nums sm:text-sm',
                      (urgentCount ?? 0) > 0 ? 'text-amber-900' : 'text-teal-900',
                    )}
                  >
                    {(urgentCount ?? 0) > 0 ? `${urgentCount} due now/soon` : 'On schedule'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {!isCareSummary && recommendedCount !== null && recommendedRoom && (
            <div aria-hidden="true" className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-0.5 text-xs font-bold text-emerald-900">
                Room: {recommendedRoom}
              </span>
              <span className="inline-flex items-center rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                {recommendedCount} ranked candidate{recommendedCount === 1 ? '' : 's'}
              </span>
            </div>
          )}

          {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
        </div>

        {block.actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mt-0.5">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export const SummaryBlock: AskBlockRenderer<'SUMMARY'> = ({ block }) => {
  const calm = useCalmChrome();
  // The seasonal plan's intro and next steps are their own cards in both shells (see SeasonalAnswerCards).
  if (isSeasonalIntroBlockId(block.id)) return <SeasonalIntroCard block={block} />;
  if (SEASONAL_NEXT_STEPS_BLOCK_IDS.has(block.id)) return <SeasonalNextSteps block={block} />;
  if (block.id === 'status-board-summary') return <StatusBoardSummaryCard block={block} />;
  if (block.id === 'budget-forecast-summary') return <BudgetForecastSummaryCard block={block} />;
  if (block.id === 'sell-hold-rent-summary' || block.id === 'sell-hold-rent-what-if-summary') return <SellHoldRentSummaryCard block={block} />;
  if (block.id === 'break-even-summary') return <BreakEvenSummaryCard block={block} />;
  if (block.id === 'break-even-next-action') return <BreakEvenNextActionCard block={block} />;
  if (OWNERSHIP_COST_SUMMARY_IDS.has(block.id)) return <OwnershipCostsSummaryCard block={block} />;
  if (block.id === 'ownership-cost-refresh') return <OwnershipCostRefreshCard block={block} />;
  if (block.id === 'service-price-radar-summary') return <ServicePriceRadarSummaryCard block={block} />;
  if (COVERAGE_SUMMARY_IDS.has(block.id)) return <CoverageSummaryCard block={block} />;
  if (PLANT_ADVISOR_SUMMARY_IDS.has(block.id)) return <PlantAdvisorSummaryCard block={block} />;
  if (calm) return <CalmSummary block={block} />;
  return (
    <section className={cn(
      'rounded-2xl border p-4',
      block.tone === 'CAUTION' && 'border-amber-200 bg-amber-50/70',
      block.tone === 'CRITICAL' && 'border-red-200 bg-red-50/70',
      block.tone === 'POSITIVE' && 'border-emerald-200 bg-emerald-50/70',
      block.tone === 'DEFAULT' && 'border-slate-200 bg-white',
    )}>
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {(block.supportLine || !block.bullets) && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{block.supportLine || block.body}</p>}
      {block.bullets && <SummaryBullets bullets={block.bullets} />}
      {/* IW-PRES-013: answer-first number chips, taken by the server from the same records as the result. */}
      {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
      {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
};

const ANSWER_CHIP_TONES = {
  DEFAULT: 'bg-slate-100 text-slate-700',
  POSITIVE: 'bg-emerald-100 text-emerald-800',
  CAUTION: 'bg-amber-100 text-amber-900',
  CRITICAL: 'bg-red-100 text-red-800',
} as const;

// Ask Cozy Stage 3, Phase 5 (implementation plan §11; FRD §28). The one new
// block type this phase adds -- structurally identical to SUMMARY plus a
// "Cozy noticed this" badge naming triggerSource, so a proactively-created
// turn is visually distinguishable from an ordinary homeowner-initiated
// one, not just conventionally recognizable by reasonCode.
export const ProactiveInsightBlock: AskBlockRenderer<'PROACTIVE_INSIGHT'> = ({ block }) => (
  <section className={cn(
    'rounded-2xl border p-4',
    block.tone === 'CAUTION' && 'border-amber-200 bg-amber-50/70',
    block.tone === 'CRITICAL' && 'border-red-200 bg-red-50/70',
    block.tone === 'POSITIVE' && 'border-emerald-200 bg-emerald-50/70',
    block.tone === 'DEFAULT' && 'border-violet-200 bg-violet-50/70',
  )}>
    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800">
      <Sparkles className="h-3.5 w-3.5" />
      <span>Cozy noticed this</span>
    </div>
    <h3 className="mt-1 font-semibold text-slate-950">{block.title}</h3>
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{block.body}</p>
    {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
  </section>
);

// IW-CALM-005 (FRD v1.111): an informational limit is a muted footnote, not a warning card. Cautions and emergencies keep
// their warning treatment because the homeowner may need to act on them.
export const BoundaryBlock: AskBlockRenderer<'BOUNDARY'> = ({ block }) => {
  const calm = useCalmChrome();
  if (SEASONAL_ABOUT_BLOCK_IDS.has(block.id) && block.severity === 'INFO') return <SeasonalAboutCard block={block} />;
  if (calm && block.severity === 'INFO' && block.suggestions.length === 0 && !block.actions?.length) {
    return <p data-calm-footnote="" className="text-xs leading-5 text-slate-500"><span className="font-medium text-slate-600">{block.title}.</span> {block.body}</p>;
  }
  return <WarningBoundary block={block} />;
};

const WarningBoundary = ({ block }: { block: Extract<AskPresentationBlock, { type: 'BOUNDARY' }> }) => (
  <section className={cn('rounded-2xl border p-4', block.severity === 'EMERGENCY' ? 'border-red-300 bg-red-50 text-red-950' : 'border-amber-200 bg-amber-50/70 text-slate-900')}>
    <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h3 className="font-semibold">{block.title}</h3><p className="mt-2 text-sm leading-6">{block.body}</p></div></div>
    {block.suggestions.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-9 text-sm">{block.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>}
    {block.actions?.length ? <div className="mt-4 flex flex-wrap gap-2 pl-8">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div> : null}
  </section>
);

// ACUI-005 (FRD v1.117): a calm receipt says what happened in the past tense, lists what changed, and offers one continuation. Only a
// completed action is a "Receipt"; a pending, cancelled or expired one keeps its own plain status, never a success mark.
const RECEIPT_RULE = { PENDING: 'border-amber-300', CANCELLED: 'border-slate-300', EXPIRED: 'border-amber-300', COMPLETED: 'border-teal-300' } as const;
const RECEIPT_STATUS_TEXT = { PENDING: 'In progress', CANCELLED: 'Cancelled', EXPIRED: 'Expired' } as const;
const receiptStatusText = (status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED') => (status === 'COMPLETED' ? null : RECEIPT_STATUS_TEXT[status]);

function CalmReceipt({ block }: { block: Extract<AskPresentationBlock, { type: 'WORKFLOW_PROGRESS' }> }) {
  const done = block.status === 'COMPLETED';
  const continuation = useCalmReceiptContinuation();
  // One continuation is the primary control; anything else the producer declared stays, quieter. A record link from the turn's output
  // artifact is offered only when the receipt has no action of its own.
  const declared = block.actions.map((action, index) => ({ ...action, style: index === 0 ? 'PRIMARY' as const : 'SECONDARY' as const }));
  const actions = declared.length > 0 ? declared : continuation ? [{ id: 'open-created-record', label: continuation.label, href: continuation.href, style: 'PRIMARY' as const }] : [];
  return (
    <section data-calm-receipt={block.status.toLowerCase()} aria-label={done ? 'Receipt' : undefined} className={cn('space-y-3 border-l-2 pl-3', RECEIPT_RULE[block.status])}>
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{done ? <><CheckCircle2 className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />Receipt</> : receiptStatusText(block.status)}</p>
        <h3 className="mt-1 text-[17px] font-medium leading-snug text-slate-900">{block.title}</h3>
        {block.description && <p className="mt-1 text-sm leading-5 text-slate-600">{block.description}</p>}
      </div>
      {block.details.length > 0 && <dl className="divide-y divide-slate-100 border-y border-slate-100">{block.details.map((detail) => <div key={detail.label} className="grid gap-1 py-2 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">{detail.label}</dt><dd className="font-medium text-slate-800">{detail.value}</dd></div>)}</dl>}
      {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
}

export const WorkflowProgressBlock: AskBlockRenderer<'WORKFLOW_PROGRESS'> = ({ block }) => {
  const calm = useCalmChrome();
  if (calm) return <CalmReceipt block={block} />;
  return (
  <section className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white"><CheckCircle2 className="h-5 w-5" /></span>
      <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{block.title}</h3><span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">{workflowProgressStatusLabel(block.title, block.status)}</span></div><p className="mt-1 text-sm leading-5 text-slate-700">{block.description}</p></div>
    </div>
    <dl className="mt-4 divide-y divide-teal-100 rounded-xl border border-teal-100 bg-white px-3">{block.details.map((detail) => <div key={detail.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">{detail.label}</dt><dd className="font-medium text-slate-800">{detail.value}</dd></div>)}</dl>
    {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
  </section>
  );
};

const parseMetricDollar = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

function BreakEvenMetricsCard({ block }: { block: Extract<AskPresentationBlock, { type: 'METRIC_ROW' }> }) {
  const costsMetric = block.metrics.find((m) => /^costs,/i.test(m.label));
  const appreciationMetric = block.metrics.find((m) => /^appreciation,/i.test(m.label));
  const costsVal = Math.max(0, parseMetricDollar(costsMetric?.value) ?? 0);
  const appreciationVal = Math.max(0, parseMetricDollar(appreciationMetric?.value) ?? 0);
  const totalCompare = costsVal + appreciationVal;
  const appreciationPct = totalCompare > 0 ? Math.round((appreciationVal / totalCompare) * 100) : 50;
  const costsPct = totalCompare > 0 ? 100 - appreciationPct : 50;

  return (
    <section
      data-break-even-metrics=""
      className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-2.5 sm:px-5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">{block.title}</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Financial Snapshot</span>
        </div>
        {block.description && <p className="text-xs text-slate-500">{block.description}</p>}
      </div>

      <div className="p-3 sm:px-4 sm:py-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {block.metrics.map((metric, idx) => {
            const Icon =
              idx === 0
                ? Calendar
                : idx === 1
                  ? metric.tone === 'POSITIVE'
                    ? TrendingUp
                    : TrendingDown
                  : idx === 2
                    ? Home
                    : idx === 3
                      ? DollarSign
                      : idx === 4
                        ? TrendingDown
                        : TrendingUp;

            return (
              <div
                key={metric.label}
                className={cn(
                  'relative flex flex-col justify-start rounded-xl border px-3 py-2 transition-all',
                  metric.tone === 'POSITIVE'
                    ? 'border-emerald-200/90 bg-gradient-to-b from-emerald-50/60 to-white'
                    : metric.tone === 'CAUTION'
                      ? 'border-amber-200/90 bg-gradient-to-b from-amber-50/60 to-white'
                      : metric.tone === 'CRITICAL'
                        ? 'border-red-200 bg-red-50'
                        : 'border-slate-200/80 bg-slate-50/70',
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <dt className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">{metric.label}</dt>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
                      metric.tone === 'POSITIVE'
                        ? 'bg-emerald-100 text-emerald-700'
                        : metric.tone === 'CAUTION'
                          ? 'bg-amber-100 text-amber-700'
                          : idx === 5
                            ? 'bg-teal-100/80 text-teal-700'
                            : idx === 4
                              ? 'bg-rose-100/70 text-rose-700'
                              : 'bg-white text-slate-600 ring-1 ring-slate-200/80',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <dd
                    className={cn(
                      'text-base font-bold tabular-nums tracking-tight sm:text-lg',
                      metric.tone === 'POSITIVE'
                        ? 'text-emerald-950'
                        : metric.tone === 'CAUTION'
                          ? 'text-amber-950'
                          : 'text-slate-950',
                    )}
                  >
                    {metric.value}
                  </dd>
                  {metric.detail && (
                    <span className="text-[11px] font-medium text-slate-500">({metric.detail})</span>
                  )}
                </div>
              </div>
            );
          })}
        </dl>

        {totalCompare > 0 && costsMetric && appreciationMetric && (
          <div aria-hidden="true" className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {appreciationMetric.label}: <strong className="font-bold">{appreciationMetric.value}</strong> ({appreciationPct}%)
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-900">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {costsMetric.label}: <strong className="font-bold">{costsMetric.value}</strong> ({costsPct}%)
              </span>
            </div>
            <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div style={{ width: `${appreciationPct}%` }} className="h-full bg-emerald-500" />
              <div style={{ width: `${costsPct}%` }} className="h-full bg-amber-500" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export const MetricRowBlock: AskBlockRenderer<'METRIC_ROW'> = ({ block }) => {
  if (block.id === 'break-even-metrics') return <BreakEvenMetricsCard block={block} />;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{block.metrics.map((metric) => <div key={metric.label} className={cn('rounded-xl border p-3', metric.tone === 'POSITIVE' ? 'border-emerald-200 bg-emerald-50' : metric.tone === 'CAUTION' ? 'border-amber-200 bg-amber-50' : metric.tone === 'CRITICAL' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50')}><dt className="text-xs text-slate-500">{metric.label}</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{metric.value}</dd>{metric.detail && <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>}</div>)}</dl>
    </section>
  );
};

// The vertical timeline list: the fallback when a track cannot be drawn, and the List choice beside the track.
// Dates read as recorded (FRD v1.77): "Feb 2024" for a month, never an invented day; an unreadable date shows as sent.
export const TimelineBlock: AskBlockRenderer<'TIMELINE'> = ({ block, onItemAction, itemActionsDisabled }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
    <TimelineList block={block} onItemAction={onItemAction} itemActionsDisabled={itemActionsDisabled} />
  </section>
);

// FRD v1.90: `onOpenDetail` lets a domain that keeps a live record detail under its timeline (the capital windows) open it
// from the list too; the row's button is marked like the other detail triggers so focus returns to it.
export function TimelineList({ block, onOpenDetail, openDetailId, onItemAction, itemActionsDisabled, selectedIds, onToggleSelected }: {
  block: Extract<AskPresentationBlock, { type: 'TIMELINE' }>;
  onOpenDetail?: (itemId: string) => void;
  openDetailId?: string | null;
  onItemAction?: Parameters<typeof ItemActionButtons>[0]['onItemAction'];
  itemActionsDisabled?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelected?: (itemId: string) => void;
}) {
  return (
    <ol className="mt-4 border-l-2 border-teal-200 pl-4" data-timeline-list>
      {block.items.map((item) => {
        const dateLabel = timelinePoint(item.id, item.date, item.datePrecision)?.label ?? item.date;
        const facts = [item.category?.label, ...(item.meta ?? [])].filter(Boolean);
        return (
          <li key={item.id} className="relative pb-4 before:absolute before:-left-[1.34rem] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-teal-700">
            <div className="flex flex-wrap items-center gap-2">
              {onToggleSelected && <input type="checkbox" checked={selectedIds?.has(item.id) ?? false} onChange={() => onToggleSelected(item.id)} aria-label={`Select ${item.label} for export`} className="h-4 w-4 rounded border-slate-300 text-teal-700" />}
              {item.href && !onOpenDetail ? <AskContextLink href={item.href} className="font-semibold text-slate-900 hover:text-teal-700">{item.label}</AskContextLink> : <span className="font-semibold text-slate-900">{item.label}</span>}
              {dateLabel && <span className="text-xs text-slate-500">{dateLabel}</span>}
              {item.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.status}</span>}
            </div>
            {facts.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>}
            {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
            {(onOpenDetail || (onItemAction && (item.actions?.length ?? 0) > 0)) && <div className="mt-2 flex flex-wrap items-center gap-2" data-timeline-row-actions={item.id}>
              {onOpenDetail && <button type="button" data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={openDetailId === item.id} onClick={() => onOpenDetail(item.id)}
                className="min-h-9 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-slate-50">View details<span className="sr-only"> {item.label}</span></button>}
              {onItemAction && <ItemActionButtons item={item} actions={item.actions} onItemAction={onItemAction} disabled={itemActionsDisabled ?? false} />}
            </div>}
          </li>
        );
      })}
    </ol>
  );
}

export const AssumptionsBlock: AskBlockRenderer<'ASSUMPTIONS'> = ({ block, onOpenContext }) => onOpenContext ? null : (
  <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title}</summary>
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
  </details>
);

type StateBlockType = Extract<AskPresentationBlock, { type: 'LIMITATION' | 'EMPTY_STATE' | 'ERROR_STATE' }>;

const CALM_STATE_RULE = { ERROR_STATE: 'border-red-300', LIMITATION: 'border-amber-300', EMPTY_STATE: 'border-slate-300' } as const;

// A state body written as separate lines (one note each) reads as a bulleted list; a single line stays a paragraph.
function StateBody({ body, className }: { body: string; className: string }) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return <p className={className}>{body}</p>;
  return <ul className={cn(className, 'list-disc space-y-1 pl-5')}>{lines.map((line) => <li key={line}>{line}</li>)}</ul>;
}

function StateBlock({ block }: { block: StateBlockType }) {
  const actions = 'actions' in block ? block.actions : [];
  // IW-CALM-002/004/005 (FRD v1.111): a state is plain text with a thin colored rule, not a tinted card. Its actions stay.
  const calm = useCalmChrome();
  if (calm) {
    return (
      // An error is announced to assistive technology when it appears; an empty state or limitation is read in place.
      <section data-calm-state={block.type.toLowerCase()} role={block.type === 'ERROR_STATE' ? 'alert' : undefined} className={cn('border-l-2 pl-3', CALM_STATE_RULE[block.type])}>
        <h3 className="text-base font-medium text-slate-900">{block.title}</h3>
        <StateBody body={block.body} className="mt-1 text-sm leading-6 text-slate-600" />
        {actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </section>
    );
  }
  return (
    <section role={block.type === 'ERROR_STATE' ? 'alert' : undefined} className={cn('rounded-2xl border p-4', block.type === 'ERROR_STATE' ? 'border-red-200 bg-red-50' : block.type === 'LIMITATION' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      <StateBody body={block.body} className="mt-2 text-sm leading-6 text-slate-700" />
      {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
}

export const LimitationBlock: AskBlockRenderer<'LIMITATION'> = ({ block }) => {
  if (block.id === 'status-board-limits' || block.id === 'budget-forecast-assumed-age') {
    return (
      <section
        data-status-board-limits={block.id === 'status-board-limits' ? '' : undefined}
        data-budget-assumed-age={block.id === 'budget-forecast-assumed-age' ? '' : undefined}
        className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950"
      >
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <span className="font-bold text-amber-950">{block.title}: </span>
          <span className="font-medium text-amber-900">{block.body}</span>
        </div>
      </section>
    );
  }
  if (block.id === 'sell-hold-rent-keep-in-mind' || block.id === 'break-even-limitations') {
    return (
      <section
        data-sell-hold-rent-keep-in-mind={block.id === 'sell-hold-rent-keep-in-mind' ? '' : undefined}
        data-break-even-limitations={block.id === 'break-even-limitations' ? '' : undefined}
        className="flex w-full items-start gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-950"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-amber-950">{block.title}</h3>
          <StateBody body={block.body} className="mt-0.5 leading-5 text-amber-900" />
        </div>
      </section>
    );
  }
  return <StateBlock block={block} />;
};
export const EmptyStateBlock: AskBlockRenderer<'EMPTY_STATE'> = ({ block }) => <StateBlock block={block} />;
export const ErrorStateBlock: AskBlockRenderer<'ERROR_STATE'> = ({ block }) => <StateBlock block={block} />;

// IW-PRES-012 "Honest fallback": reached only for a `block.type` the
// running client build doesn't recognize (a schema-version skew from the
// server, not a compile-time-possible AskPresentationBlock member -- see
// the registry's runtime lookup in ./registry.tsx). Never renders the raw
// payload and never silently drops the block.
export function UnsupportedBlock({ block }: { block: { type?: string; title?: string } }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
      <h3 className="font-semibold text-slate-950">{block.title ?? 'Response unavailable'}</h3>
      <p className="mt-2 text-sm text-slate-700">This response section uses an unsupported format ({block.type ?? 'unknown'}). Refresh Ask or ask the question again.</p>
    </section>
  );
}
