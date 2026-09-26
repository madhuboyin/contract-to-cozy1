import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { workflowProgressStatusLabel } from '@/features/ask/presentationCompatibility';
import { timelinePoint } from '@/features/ask/displayPatterns';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ActionLink, AskContextLink } from './context';
import { useCalmAnswer, useCalmChrome, useCalmReceiptContinuation } from './calmContext';
import type { AskBlockRenderer } from './types';

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
  const actions = adopted ? [] : block.actions.slice(0, 1);
  const declared = Boolean(block.headline?.trim());
  const headline = block.headline?.trim() || block.title;
  const supportLine = declared ? block.supportLine?.trim() || null : block.body;
  return (
    <section data-calm-summary="" className={CALM_TONE_RULE[block.tone]}>
      <h3 className="font-display text-[22px] font-medium leading-snug tracking-[-0.01em] text-slate-950 sm:text-[26px]">{headline}</h3>
      {supportLine && <p className={cn('mt-1 whitespace-pre-wrap text-sm leading-6', declared ? 'text-slate-500' : 'text-slate-700')}>{supportLine}</p>}
      {block.chips && block.chips.length > 0 && <AnswerChips chips={block.chips} />}
      {actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-sm">{actions.map((action) => <ActionLink key={action.id} action={{ ...action, style: 'SECONDARY' }} />)}</div>}
    </section>
  );
}

export const SummaryBlock: AskBlockRenderer<'SUMMARY'> = ({ block }) => {
  const calm = useCalmChrome();
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
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{block.body}</p>
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

export const MetricRowBlock: AskBlockRenderer<'METRIC_ROW'> = ({ block }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{block.metrics.map((metric) => <div key={metric.label} className={cn('rounded-xl border p-3', metric.tone === 'POSITIVE' ? 'border-emerald-200 bg-emerald-50' : metric.tone === 'CAUTION' ? 'border-amber-200 bg-amber-50' : metric.tone === 'CRITICAL' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50')}><dt className="text-xs text-slate-500">{metric.label}</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{metric.value}</dd>{metric.detail && <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>}</div>)}</dl>
  </section>
);

// The vertical timeline list: the fallback when a track cannot be drawn, and the List choice beside the track.
// Dates read as recorded (FRD v1.77): "Feb 2024" for a month, never an invented day; an unreadable date shows as sent.
export const TimelineBlock: AskBlockRenderer<'TIMELINE'> = ({ block }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
    <TimelineList block={block} />
  </section>
);

// FRD v1.90: `onOpenDetail` lets a domain that keeps a live record detail under its timeline (the capital windows) open it
// from the list too; the row's button is marked like the other detail triggers so focus returns to it.
export function TimelineList({ block, onOpenDetail, openDetailId }: {
  block: Extract<AskPresentationBlock, { type: 'TIMELINE' }>;
  onOpenDetail?: (itemId: string) => void;
  openDetailId?: string | null;
}) {
  return (
    <ol className="mt-4 border-l-2 border-teal-200 pl-4" data-timeline-list>
      {block.items.map((item) => {
        const dateLabel = timelinePoint(item.id, item.date, item.datePrecision)?.label ?? item.date;
        const facts = [item.category?.label, ...(item.meta ?? [])].filter(Boolean);
        return (
          <li key={item.id} className="relative pb-4 before:absolute before:-left-[1.34rem] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-teal-700">
            <div className="flex flex-wrap items-center gap-2">
              {item.href ? <AskContextLink href={item.href} className="font-semibold text-slate-900 hover:text-teal-700">{item.label}</AskContextLink> : <span className="font-semibold text-slate-900">{item.label}</span>}
              {dateLabel && <span className="text-xs text-slate-500">{dateLabel}</span>}
              {item.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.status}</span>}
            </div>
            {facts.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>}
            {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
            {onOpenDetail && <button type="button" data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={openDetailId === item.id} onClick={() => onOpenDetail(item.id)}
              className="mt-1 min-h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-teal-800 hover:bg-slate-50">Details<span className="sr-only"> for {item.label}</span></button>}
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

function StateBlock({ block }: { block: StateBlockType }) {
  const actions = 'actions' in block ? block.actions : [];
  // IW-CALM-002/004/005 (FRD v1.111): a state is plain text with a thin colored rule, not a tinted card. Its actions stay.
  const calm = useCalmChrome();
  if (calm) {
    return (
      <section data-calm-state={block.type.toLowerCase()} className={cn('border-l-2 pl-3', CALM_STATE_RULE[block.type])}>
        <h3 className="text-base font-medium text-slate-900">{block.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{block.body}</p>
        {actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </section>
    );
  }
  return (
    <section className={cn('rounded-2xl border p-4', block.type === 'ERROR_STATE' ? 'border-red-200 bg-red-50' : block.type === 'LIMITATION' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">{block.body}</p>
      {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
}

export const LimitationBlock: AskBlockRenderer<'LIMITATION'> = ({ block }) => <StateBlock block={block} />;
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
