import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { workflowProgressStatusLabel } from '@/features/ask/presentationCompatibility';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ActionLink, AskContextLink } from './context';
import type { AskBlockRenderer } from './types';

export const SummaryBlock: AskBlockRenderer<'SUMMARY'> = ({ block }) => (
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
    {block.chips && block.chips.length > 0 && (
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="At a glance">
        {block.chips.map((chip) => <li key={chip.label} data-ask-answer-chip={chip.tone.toLowerCase()} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums', ANSWER_CHIP_TONES[chip.tone])}>{chip.label}</li>)}
      </ul>
    )}
    {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
  </section>
);

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

export const BoundaryBlock: AskBlockRenderer<'BOUNDARY'> = ({ block }) => (
  <section className={cn('rounded-2xl border p-4', block.severity === 'EMERGENCY' ? 'border-red-300 bg-red-50 text-red-950' : 'border-amber-200 bg-amber-50/70 text-slate-900')}>
    <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h3 className="font-semibold">{block.title}</h3><p className="mt-2 text-sm leading-6">{block.body}</p></div></div>
    {block.suggestions.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-9 text-sm">{block.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>}
    {block.actions?.length ? <div className="mt-4 flex flex-wrap gap-2 pl-8">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div> : null}
  </section>
);

export const WorkflowProgressBlock: AskBlockRenderer<'WORKFLOW_PROGRESS'> = ({ block }) => (
  <section className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white"><CheckCircle2 className="h-5 w-5" /></span>
      <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{block.title}</h3><span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">{workflowProgressStatusLabel(block.title, block.status)}</span></div><p className="mt-1 text-sm leading-5 text-slate-700">{block.description}</p></div>
    </div>
    <dl className="mt-4 divide-y divide-teal-100 rounded-xl border border-teal-100 bg-white px-3">{block.details.map((detail) => <div key={detail.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-slate-500">{detail.label}</dt><dd className="font-medium text-slate-800">{detail.value}</dd></div>)}</dl>
    {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
  </section>
);

export const MetricRowBlock: AskBlockRenderer<'METRIC_ROW'> = ({ block }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{block.metrics.map((metric) => <div key={metric.label} className={cn('rounded-xl border p-3', metric.tone === 'POSITIVE' ? 'border-emerald-200 bg-emerald-50' : metric.tone === 'CAUTION' ? 'border-amber-200 bg-amber-50' : metric.tone === 'CRITICAL' ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50')}><dt className="text-xs text-slate-500">{metric.label}</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{metric.value}</dd>{metric.detail && <p className="mt-1 text-xs text-slate-600">{metric.detail}</p>}</div>)}</dl>
  </section>
);

export const TimelineBlock: AskBlockRenderer<'TIMELINE'> = ({ block }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
    <ol className="mt-4 border-l-2 border-teal-200 pl-4">{block.items.map((item) => <li key={item.id} className="relative pb-4 before:absolute before:-left-[1.34rem] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-teal-700"><div className="flex flex-wrap items-center gap-2">{item.href ? <AskContextLink href={item.href} className="font-semibold text-slate-900 hover:text-teal-700">{item.label}</AskContextLink> : <span className="font-semibold text-slate-900">{item.label}</span>}{item.date && <span className="text-xs text-slate-500">{item.date}</span>}{item.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.status}</span>}</div>{item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}</li>)}</ol>
  </section>
);

export const AssumptionsBlock: AskBlockRenderer<'ASSUMPTIONS'> = ({ block, onOpenContext }) => onOpenContext ? null : (
  <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title}</summary>
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
  </details>
);

type StateBlockType = Extract<AskPresentationBlock, { type: 'LIMITATION' | 'EMPTY_STATE' | 'ERROR_STATE' }>;

function StateBlock({ block }: { block: StateBlockType }) {
  const actions = 'actions' in block ? block.actions : [];
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
