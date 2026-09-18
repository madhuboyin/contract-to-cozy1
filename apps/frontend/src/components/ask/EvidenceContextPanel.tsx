'use client';

import type { Ref } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

type EvidenceBlock = Extract<AskPresentationBlock, { type: 'EVIDENCE' }>;
type AssumptionsBlock = Extract<AskPresentationBlock, { type: 'ASSUMPTIONS' }>;
type LimitationBlock = Extract<AskPresentationBlock, { type: 'LIMITATION' }>;

export type ResponseContextCounts = { sources: number; assumptions: number; limitations: number };

export function responseContextCounts(execution: Pick<AskExecutionResponse, 'blocks'>): ResponseContextCounts {
  return execution.blocks.reduce<ResponseContextCounts>((counts, block) => {
    if (block.type === 'EVIDENCE') counts.sources += block.items.length;
    if (block.type === 'ASSUMPTIONS') counts.assumptions += block.items.length;
    if (block.type === 'LIMITATION' && block.body.trim()) counts.limitations += 1;
    return counts;
  }, { sources: 0, assumptions: 0, limitations: 0 });
}

export function hasResponseContext(execution: Pick<AskExecutionResponse, 'blocks'>): boolean {
  const counts = responseContextCounts(execution);
  return counts.sources + counts.assumptions + counts.limitations > 0;
}

function observedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export function InlineEvidenceBlock({ block }: { block: EvidenceBlock }) {
  return <details className="rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title} ({block.items.length})</summary>
    <ul className="mt-3 space-y-2 text-xs text-slate-600">{block.items.map((item, index) => <li key={`${item.label}-${index}`}>{item.label}{item.source ? ` · ${item.source}` : ''}{observedDate(item.observedAt) ? ` · ${observedDate(item.observedAt)}` : ''}</li>)}</ul>
  </details>;
}

function countSummary(counts: ResponseContextCounts): string {
  return [
    counts.sources ? `${counts.sources} ${counts.sources === 1 ? 'source' : 'sources'}` : '',
    counts.assumptions ? `${counts.assumptions} ${counts.assumptions === 1 ? 'assumption' : 'assumptions'}` : '',
    counts.limitations ? `${counts.limitations} ${counts.limitations === 1 ? 'limitation' : 'limitations'}` : '',
  ].filter(Boolean).join(' · ');
}

export function ResponseContextSummary({ execution, open, onOpen }: { execution: AskExecutionResponse; open: boolean; onOpen: (trigger: HTMLButtonElement) => void }) {
  const counts = responseContextCounts(execution);
  const evidenceOnly = counts.sources > 0 && counts.assumptions === 0 && counts.limitations === 0;

  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3" aria-label="Response sources and context">
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-teal-700 shadow-sm"><BookOpen className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{evidenceOnly ? 'Sources for this response' : 'Sources and response context'}</h3><p className="text-xs text-slate-500">{countSummary(counts)} attached to this response</p></div>
    </div>
    <button type="button" aria-expanded={open} aria-controls="ask-response-context" onClick={(event) => onOpen(event.currentTarget)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50">
      {open ? 'Context open' : evidenceOnly ? 'View sources' : 'View sources and context'}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  </section>;
}

export function ResponseContextContent({ execution, headingRef, onClose }: { execution: AskExecutionResponse; headingRef?: Ref<HTMLHeadingElement>; onClose: () => void }) {
  const evidenceBlocks = execution.blocks.filter((block): block is EvidenceBlock => block.type === 'EVIDENCE' && block.items.length > 0);
  const assumptionBlocks = execution.blocks.filter((block): block is AssumptionsBlock => block.type === 'ASSUMPTIONS' && block.items.length > 0);
  const limitationBlocks = execution.blocks.filter((block): block is LimitationBlock => block.type === 'LIMITATION' && Boolean(block.body.trim()));
  const counts = responseContextCounts(execution);

  return <div id="ask-response-context" className="flex h-full min-h-0 flex-col">
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">Response context</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-lg font-semibold text-slate-950 focus:outline-none">Sources and context</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{countSummary(counts)} for this response{execution.property ? ` about ${execution.property.label}` : ''}.</p>
      </div>
      <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">This context belongs to the response “{execution.question}”. Limitations remain visible in the conversation so important cautions are not hidden behind this panel.</p>
      <div className="mt-4 space-y-5">{evidenceBlocks.map((block) => <section key={block.id} aria-labelledby={`evidence-group-${block.id}`}>
        <h3 id={`evidence-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <ol className="mt-2 space-y-2">{block.items.map((item, index) => {
          const date = observedDate(item.observedAt);
          return <li key={`${item.label}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium leading-5 text-slate-900">{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.source || 'Source name not provided'}{date && ` · Observed ${date}`}</p>
          </li>;
        })}</ol>
      </section>)}
      {assumptionBlocks.map((block) => <section key={block.id} aria-labelledby={`assumption-group-${block.id}`}>
        <h3 id={`assumption-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <ul className="mt-2 space-y-2">{block.items.map((item, index) => <li key={`${item}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-5 text-slate-700">{item}</li>)}</ul>
      </section>)}
      {limitationBlocks.map((block) => <section key={block.id} aria-labelledby={`limitation-group-${block.id}`} className={block.severity === 'CAUTION' ? 'rounded-xl border border-amber-200 bg-amber-50 p-3' : 'rounded-xl border border-slate-200 bg-slate-50 p-3'}>
        <h3 id={`limitation-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-700">{block.body}</p>
      </section>)}</div>
    </div>
  </div>;
}
