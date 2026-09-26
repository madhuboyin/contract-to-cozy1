'use client';

import { useState, type ReactNode, type Ref } from 'react';
import { ArrowRight, BookOpen, ExternalLink, FileCheck2, Link2 } from 'lucide-react';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { useCalmChrome } from './blocks/calmContext';

// IW-PRES-010 ("progressive density" -- "show the decision-driving attributes first, with expandable detail for
// secondary data, evidence, assumptions, and provenance"): evidence/output-artifact/related-record lists
// previously rendered every item unconditionally -- unlike GROUPED_LIST, which already compacts at 5+ items, a
// response with 50 evidence items rendered all 50 inline. Same PREVIEW_COUNT convention GROUPED_LIST's own
// density resolver uses. Keyed by block id (not a single count) because ResponseContextContent loops over
// potentially several blocks of the same type in one component instance.
const EVIDENCE_PREVIEW_COUNT = 5;
function useProgressiveReveal() {
  const [visible, setVisible] = useState<Record<string, number>>({});
  const countFor = (blockId: string) => visible[blockId] ?? EVIDENCE_PREVIEW_COUNT;
  const showMore = (blockId: string, total: number) => setVisible((current) => ({ ...current, [blockId]: Math.min(total, countFor(blockId) + EVIDENCE_PREVIEW_COUNT) }));
  return { countFor, showMore };
}

type EvidenceBlock = Extract<AskPresentationBlock, { type: 'EVIDENCE' }>;
type AssumptionsBlock = Extract<AskPresentationBlock, { type: 'ASSUMPTIONS' }>;
type LimitationBlock = Extract<AskPresentationBlock, { type: 'LIMITATION' }>;
type OutputArtifactsBlock = Extract<AskPresentationBlock, { type: 'OUTPUT_ARTIFACTS' }>;
type RelatedRecordsBlock = Extract<AskPresentationBlock, { type: 'RELATED_RECORDS' }>;

export type ResponseContextCounts = { sources: number; claims: number; assumptions: number; limitations: number; outputs: number; relationships: number };

export function responseContextCounts(execution: Pick<AskExecutionResponse, 'blocks'>): ResponseContextCounts {
  return execution.blocks.reduce<ResponseContextCounts>((counts, block) => {
    if (block.type === 'EVIDENCE') {
      counts.sources += block.items.length;
      counts.claims += block.items.filter((item) => item.claim).length;
    }
    if (block.type === 'ASSUMPTIONS') counts.assumptions += block.items.length;
    if (block.type === 'LIMITATION' && block.body.trim()) counts.limitations += 1;
    if (block.type === 'OUTPUT_ARTIFACTS') counts.outputs += block.items.length;
    if (block.type === 'RELATED_RECORDS') counts.relationships += block.relationships.length;
    return counts;
  }, { sources: 0, claims: 0, assumptions: 0, limitations: 0, outputs: 0, relationships: 0 });
}

export function hasResponseContext(execution: Pick<AskExecutionResponse, 'blocks'>): boolean {
  const counts = responseContextCounts(execution);
  return counts.sources + counts.assumptions + counts.limitations + counts.outputs + counts.relationships > 0;
}

function observedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function outputArtifactKind(item: OutputArtifactsBlock['items'][number]): string {
  return item.artifactType === 'PROPERTY_MAINTENANCE_TASK' ? 'Maintenance task' : 'Quote comparison workspace';
}

function outputArtifactRelationship(item: OutputArtifactsBlock['items'][number]): string {
  return item.relationship === 'REUSED' ? 'Existing record reused' : 'Created';
}

function outputArtifactLifecycle(item: OutputArtifactsBlock['items'][number]): string {
  const date = observedDate(item.createdAt) ?? 'date unavailable';
  return item.relationship === 'REUSED' ? `Existing record reused · Originally created ${date}` : `Created ${date}`;
}

export function InlineEvidenceBlock({ block }: { block: EvidenceBlock }) {
  const [visible, setVisible] = useState(EVIDENCE_PREVIEW_COUNT);
  return <details className="rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title} ({block.items.length})</summary>
    <ul className="mt-3 space-y-2 text-xs text-slate-600">{block.items.slice(0, visible).map((item, index) => <li key={`${item.label}-${index}`}>{item.claim && <span className="block font-medium text-slate-700">Supports: {item.claim.text}</span>}{item.label}{item.source ? ` · ${item.source}` : ''}{observedDate(item.observedAt) ? ` · ${observedDate(item.observedAt)}` : ''}</li>)}</ul>
    {visible < block.items.length && <button type="button" className="mt-3 min-h-8 text-xs font-semibold text-teal-800" onClick={() => setVisible((current) => Math.min(block.items.length, current + EVIDENCE_PREVIEW_COUNT))}>Show more ({visible} of {block.items.length} shown)</button>}
  </details>;
}

export function InlineOutputArtifactsBlock({ block, renderNavigation }: { block: OutputArtifactsBlock; renderNavigation: (item: OutputArtifactsBlock['items'][number]['navigation']) => ReactNode }) {
  const [visible, setVisible] = useState(EVIDENCE_PREVIEW_COUNT);
  return <details className="rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title} ({block.items.length})</summary>
    <ul className="mt-3 space-y-2">{block.items.slice(0, visible).map((item) => <li key={`${item.artifactType}-${item.artifactId}`} className="rounded-xl border border-slate-100 p-3">
      <p className="text-sm font-medium text-slate-900">{item.label}</p>
      <p className="mt-1 text-xs text-slate-500">{outputArtifactKind(item)} · {item.status.toLowerCase().replace(/_/g, ' ')} · {outputArtifactRelationship(item)}</p>
      {item.navigation && <div className="mt-2">{renderNavigation(item.navigation)}</div>}
    </li>)}</ul>
    {visible < block.items.length && <button type="button" className="mt-3 min-h-8 text-xs font-semibold text-teal-800" onClick={() => setVisible((current) => Math.min(block.items.length, current + EVIDENCE_PREVIEW_COUNT))}>Show more ({visible} of {block.items.length} shown)</button>}
  </details>;
}

export function InlineRelatedRecordsBlock({ block, renderNavigation }: { block: RelatedRecordsBlock; renderNavigation: (navigation: RelatedRecordsBlock['relationships'][number]['navigation']) => ReactNode }) {
  const [visible, setVisible] = useState(EVIDENCE_PREVIEW_COUNT);
  return <details className="rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{block.title} ({block.relationships.length})</summary>
    <ul className="mt-3 space-y-2">{block.relationships.slice(0, visible).map((relationship) => <li key={`${relationship.relationshipType}-${relationship.source.recordId}-${relationship.target.recordId}`} className="rounded-xl border border-slate-100 p-3">
      <p className="text-sm font-medium text-slate-900">{relationship.source.label}</p>
      <p className="my-1 text-xs font-semibold text-teal-700">Evidence for</p>
      <p className="text-sm text-slate-700">{relationship.target.label}</p>
      {relationship.navigation && <div className="mt-2">{renderNavigation(relationship.navigation)}</div>}
    </li>)}</ul>
    {visible < block.relationships.length && <button type="button" className="mt-3 min-h-8 text-xs font-semibold text-teal-800" onClick={() => setVisible((current) => Math.min(block.relationships.length, current + EVIDENCE_PREVIEW_COUNT))}>Show more ({visible} of {block.relationships.length} shown)</button>}
  </details>;
}

/** The newest evidence date in the response, as "Sep 18, 2026"; null when no source carries a readable date. */
export function latestEvidenceDate(execution: Pick<AskExecutionResponse, 'blocks'>): string | null {
  let latest = 0;
  for (const block of execution.blocks) {
    if (block.type !== 'EVIDENCE') continue;
    for (const item of block.items) {
      const time = item.observedAt ? new Date(item.observedAt).getTime() : NaN;
      if (!Number.isNaN(time) && time > latest) latest = time;
    }
  }
  return latest ? new Date(latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
}

/** ACUI-003: the calm trust line in plain words, from the same blocks as the panel it opens. Never claims more than the blocks hold. */
export function trustLineText(execution: Pick<AskExecutionResponse, 'blocks'>): string {
  const counts = responseContextCounts(execution);
  const parts: string[] = [];
  if (counts.sources > 0) {
    const latest = latestEvidenceDate(execution);
    parts.push(`Based on ${counts.sources} ${counts.sources === 1 ? 'source' : 'sources'}${latest ? `, latest ${latest}` : ''}`);
  }
  if (counts.assumptions > 0) parts.push(`${counts.assumptions} ${counts.assumptions === 1 ? 'assumption' : 'assumptions'}`);
  if (counts.limitations > 0) parts.push(`${counts.limitations} ${counts.limitations === 1 ? 'limitation' : 'limitations'}`);
  if (parts.length === 0) parts.push('Response context');
  return parts.join(' · ');
}

function countSummary(counts: ResponseContextCounts): string {
  return [
    counts.sources ? `${counts.sources} ${counts.sources === 1 ? 'source' : 'sources'}` : '',
    counts.claims ? `${counts.claims} mapped ${counts.claims === 1 ? 'claim' : 'claims'}` : '',
    counts.assumptions ? `${counts.assumptions} ${counts.assumptions === 1 ? 'assumption' : 'assumptions'}` : '',
    counts.limitations ? `${counts.limitations} ${counts.limitations === 1 ? 'limitation' : 'limitations'}` : '',
    counts.outputs ? `${counts.outputs} output ${counts.outputs === 1 ? 'record' : 'records'}` : '',
    counts.relationships ? `${counts.relationships} record ${counts.relationships === 1 ? 'relationship' : 'relationships'}` : '',
  ].filter(Boolean).join(' · ');
}

export function ResponseContextSummary({ execution, open, onOpen }: { execution: AskExecutionResponse; open: boolean; onOpen: (trigger: HTMLButtonElement) => void }) {
  const counts = responseContextCounts(execution);
  const evidenceOnly = counts.sources > 0 && counts.assumptions === 0 && counts.limitations === 0 && counts.outputs === 0 && counts.relationships === 0;
  const hasSources = counts.sources > 0;
  const calm = useCalmChrome();
  // IW-CONV-009 (FRD v1.112): sources are one quiet chip that opens the same panel, not a boxed card with its own heading and button.
  if (calm) {
    return <button type="button" aria-expanded={open} aria-controls="ask-response-context" onClick={(event) => onOpen(event.currentTarget)} data-calm-sources="" aria-label={evidenceOnly ? 'View sources' : hasSources ? 'View sources and context' : 'View response context'}
      className="inline-flex min-h-9 w-fit max-w-full items-center gap-1.5 rounded-lg px-1 py-1.5 text-left text-[13px] leading-5 text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline">
      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{open ? 'Context open' : trustLineText(execution)}
    </button>;
  }

  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3" aria-label="Response sources and context">
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-teal-700 shadow-sm"><BookOpen className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{evidenceOnly ? 'Sources for this response' : hasSources ? 'Sources and response context' : 'Response context'}</h3><p className="text-xs text-slate-500">{countSummary(counts)} attached to this response</p></div>
    </div>
    <button type="button" aria-expanded={open} aria-controls="ask-response-context" onClick={(event) => onOpen(event.currentTarget)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50">
      {open ? 'Context open' : evidenceOnly ? 'View sources' : hasSources ? 'View sources and context' : 'View response context'}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  </section>;
}

export function ResponseContextContent({ execution, headingRef, onClose, renderNavigation, showCloseButton = true }: {
  // The mobile sheet supplies its own labelled X; rendering this text button as well stacked two close controls on top of each other.
  showCloseButton?: boolean; execution: AskExecutionResponse; headingRef?: Ref<HTMLHeadingElement>; onClose: () => void; renderNavigation: (navigation: { label: string; href: string } | null) => ReactNode }) {
  const { countFor, showMore } = useProgressiveReveal();
  const evidenceBlocks = execution.blocks.filter((block): block is EvidenceBlock => block.type === 'EVIDENCE' && block.items.length > 0);
  const assumptionBlocks = execution.blocks.filter((block): block is AssumptionsBlock => block.type === 'ASSUMPTIONS' && block.items.length > 0);
  const limitationBlocks = execution.blocks.filter((block): block is LimitationBlock => block.type === 'LIMITATION' && Boolean(block.body.trim()));
  const outputBlocks = execution.blocks.filter((block): block is OutputArtifactsBlock => block.type === 'OUTPUT_ARTIFACTS' && block.items.length > 0);
  const relatedRecordBlocks = execution.blocks.filter((block): block is RelatedRecordsBlock => block.type === 'RELATED_RECORDS' && block.relationships.length > 0);
  const counts = responseContextCounts(execution);

  return <div id="ask-response-context" className="flex h-full min-h-0 flex-col">
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">Response context</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-lg font-semibold text-slate-950 focus:outline-none">Response context</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{countSummary(counts)} for this response{execution.property ? ` about ${execution.property.label}` : ''}.</p>
      </div>
      {showCloseButton && <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto py-4">
      <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">This context belongs to the response “{execution.question}”. Required status and limitations remain visible in the conversation so important information is not hidden behind this panel.</p>
      <div className="mt-4 space-y-5">{evidenceBlocks.map((block) => <section key={block.id} aria-labelledby={`evidence-group-${block.id}`}>
        <h3 id={`evidence-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <ol className="mt-2 space-y-2">{block.items.slice(0, countFor(block.id)).map((item, index) => {
          const date = observedDate(item.observedAt);
          return <li key={`${item.label}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
            {item.claim && <div className="mb-2 border-b border-slate-100 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">Supports this claim</p>
              <p className="mt-1 text-sm leading-5 text-slate-800">{item.claim.text}</p>
            </div>}
            <p className="text-sm font-medium leading-5 text-slate-900">{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.source || 'Source name not provided'}{date && ` · Observed ${date}`}</p>
          </li>;
        })}</ol>
        {countFor(block.id) < block.items.length && <button type="button" className="mt-2 min-h-8 text-xs font-semibold text-teal-800" onClick={() => showMore(block.id, block.items.length)}>Show more ({countFor(block.id)} of {block.items.length} shown)</button>}
      </section>)}
      {assumptionBlocks.map((block) => <section key={block.id} aria-labelledby={`assumption-group-${block.id}`}>
        <h3 id={`assumption-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <ul className="mt-2 space-y-2">{block.items.map((item, index) => <li key={`${item}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-5 text-slate-700">{item}</li>)}</ul>
      </section>)}
      {limitationBlocks.map((block) => <section key={block.id} aria-labelledby={`limitation-group-${block.id}`} className={block.severity === 'CAUTION' ? 'rounded-xl border border-amber-200 bg-amber-50 p-3' : 'rounded-xl border border-slate-200 bg-slate-50 p-3'}>
        <h3 id={`limitation-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-700">{block.body}</p>
      </section>)}
      {outputBlocks.map((block) => <section key={block.id} aria-labelledby={`output-group-${block.id}`}>
        <h3 id={`output-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <ul className="mt-2 space-y-2">{block.items.slice(0, countFor(block.id)).map((item) => <li key={`${item.artifactType}-${item.artifactId}`} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700"><FileCheck2 className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0"><p className="text-sm font-medium text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">{outputArtifactKind(item)} · {item.status.toLowerCase().replace(/_/g, ' ')} · {outputArtifactLifecycle(item)}</p></div></div>
          {item.navigation && <div className="mt-3">{renderNavigation(item.navigation)}</div>}
        </li>)}</ul>
        {countFor(block.id) < block.items.length && <button type="button" className="mt-2 min-h-8 text-xs font-semibold text-teal-800" onClick={() => showMore(block.id, block.items.length)}>Show more ({countFor(block.id)} of {block.items.length} shown)</button>}
      </section>)}
      {relatedRecordBlocks.map((block) => <section key={block.id} aria-labelledby={`related-group-${block.id}`}>
        <h3 id={`related-group-${block.id}`} className="text-sm font-semibold text-slate-900">{block.title}</h3>
        <ul className="mt-2 space-y-2">{block.relationships.slice(0, countFor(block.id)).map((relationship) => <li key={`${relationship.relationshipType}-${relationship.source.recordId}-${relationship.target.recordId}`} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700"><Link2 className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Document</p><p className="mt-1 text-sm font-medium text-slate-900">{relationship.source.label}</p>
            <div className="my-2 flex items-center gap-2 text-xs font-semibold text-teal-700"><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />Evidence for</div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Home timeline event</p><p className="mt-1 text-sm text-slate-800">{relationship.target.label}</p>
          </div></div>
          {relationship.navigation && <div className="mt-3">{renderNavigation(relationship.navigation)}</div>}
        </li>)}</ul>
        {countFor(block.id) < block.relationships.length && <button type="button" className="mt-2 min-h-8 text-xs font-semibold text-teal-800" onClick={() => showMore(block.id, block.relationships.length)}>Show more ({countFor(block.id)} of {block.relationships.length} shown)</button>}
      </section>)}</div>
    </div>
  </div>;
}
