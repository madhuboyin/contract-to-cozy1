'use client';

import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ActionLink } from './blocks/context';
import type { AskBlockRenderer } from './blocks/types';

// Property Brief preview (Ask): the exact recipient snapshot as one fact sheet instead of a stack of generic cards.
// The server payload is unchanged -- everything here is read from the existing SUMMARY / GROUPED_LIST / BOUNDARY blocks.
// Source, as-of date and verification stay on every fact, behind a native "Source details" disclosure.

export const PROPERTY_BRIEF_PREVIEW_IDS = {
  summary: 'property-brief-preview-summary',
  sections: 'property-brief-preview-sections',
  shares: 'property-brief-preview-shares',
  boundary: 'property-brief-preview-boundary',
} as const;

const REFRESH_ACTION_ID = 'property-brief-republish';
const TRUST_LABEL = 'Homeowner-assembled — not an inspection or disclosure';
const GAP_SECTION_TITLE = 'Known gaps and unknowns';
const HISTORY_SECTION_TITLE = 'Verified property history';
// A fact's key prefix (`location.city`, `systems.heatingType`) says which semantic group it belongs to.
const FACT_GROUPS: Record<string, string> = { location: 'Location', core: 'Property profile', structure: 'Structure', systems: 'Systems' };

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = GroupedList['sections'][number]['items'][number];
type Summary = Extract<AskPresentationBlock, { type: 'SUMMARY' }>;

// "City: Plainsboro Township" -> label + value. A row without a label ("Recorded item") keeps its whole title as the value.
function splitFact(item: Item): { label: string; value: string } {
  const at = item.title.indexOf(': ');
  return at > 0 ? { label: item.title.slice(0, at), value: item.title.slice(at + 2) } : { label: item.title, value: item.description ?? '' };
}

const isUnrecorded = (item: Item) => item.meta.some((entry) => /unknown or not recorded/i.test(entry));
const isEmptyRow = (item: Item) => item.status === 'EMPTY';
// "Included" says nothing the row's presence does not; only exceptional states earn a badge.
const exceptionalStatus = (item: Item) => (item.status && !/^(included|active|empty)$/i.test(item.status) ? item.status : null);

interface Group { id: string; title: string; items: Item[]; gaps: boolean }

function buildGroups(block: GroupedList): Group[] {
  const groups: Group[] = [];
  for (const section of block.sections) {
    const gaps = section.title === GAP_SECTION_TITLE;
    const items = section.items.filter((item) => !isEmptyRow(item));
    const buckets = new Map<string, Item[]>();
    for (const item of items) {
      const prefix = item.id.split('.')[0];
      const title = !gaps && section.title !== HISTORY_SECTION_TITLE && FACT_GROUPS[prefix] ? FACT_GROUPS[prefix] : section.title;
      buckets.set(title, [...(buckets.get(title) ?? []), item]);
    }
    if (buckets.size === 0) groups.push({ id: section.id, title: section.title, items: [], gaps });
    for (const [title, bucket] of buckets) groups.push({ id: `${section.id}:${title}`, title, items: bucket, gaps });
  }
  return groups;
}

function SourceDetails({ items }: { items: Item[] }) {
  const withMeta = items.filter((item) => item.meta.length > 0);
  if (withMeta.length === 0) return null;
  return (
    <details className="group mt-2 text-xs text-slate-500">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md font-medium text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />Source details
      </summary>
      <ul className="mt-1 space-y-1 border-l border-slate-200 pl-3">
        {withMeta.map((item) => <li key={item.id}><span className="font-medium text-slate-700">{splitFact(item).label}</span> {'—'} {item.meta.join(' · ')}</li>)}
      </ul>
    </details>
  );
}

function FactGroup({ group, anchorId }: { group: Group; anchorId: string }) {
  return (
    <section id={anchorId} aria-label={group.title} className={cn('scroll-mt-20 rounded-xl border p-3 sm:p-4', group.gaps ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white')}>
      <h4 className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
        <span>{group.title}</span><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', group.gaps ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600')}>{group.items.length}</span>
      </h4>
      {group.items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nothing eligible was included in this section.</p>
      ) : (
        <dl className="mt-2 divide-y divide-slate-100 text-sm">
          {group.items.map((item) => {
            const { label, value } = splitFact(item);
            const badge = exceptionalStatus(item);
            return (
              <div key={item.id} className="grid gap-0.5 py-1.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="text-slate-500">{label}</dt>
                <dd className={cn('flex flex-wrap items-center gap-2 font-medium', group.gaps || isUnrecorded(item) ? 'italic text-slate-500' : 'text-slate-900')}>
                  <span>{value || 'Not recorded'}</span>
                  {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold not-italic text-amber-900">{badge}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <SourceDetails items={group.items} />
    </section>
  );
}

// One canonical appearance: no Auto/List/Cards, because this is the exact recipient preview.
export const PropertyBriefFactSheet: AskBlockRenderer<'GROUPED_LIST'> = ({ block }) => {
  const scope = useId();
  const groups = buildGroups(block);
  const anchor = (index: number) => `${scope}-group-${index}`;
  return (
    <div data-property-brief-fact-sheet="" className="max-w-[860px] space-y-3">
      {groups.length >= 4 && (
        <nav aria-label="Brief sections" className="flex flex-wrap gap-1.5">
          {groups.map((group, index) => (
            <button key={group.id} type="button" onClick={() => document.getElementById(anchor(index))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
              className="min-h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">{group.title}</button>
          ))}
        </nav>
      )}
      {groups.map((group, index) => <FactGroup key={group.id} group={group} anchorId={anchor(index)} />)}
    </div>
  );
};

// A stale snapshot is a banner with the refresh next to it, not a sentence in the introduction.
export function PropertyBriefHeader({ block }: { block: Summary }) {
  const meta = block.propertyBrief;
  const stale = block.tone === 'CAUTION';
  const refresh = block.actions.find((action) => action.id === REFRESH_ACTION_ID);
  const rest = block.actions.filter((action) => action.id !== REFRESH_ACTION_ID);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const snapshot = meta && new Date(meta.snapshotAsOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const counts = meta && [plural(meta.counts.facts, 'fact'), plural(meta.counts.history, 'history record'), plural(meta.counts.gaps, 'known gap'), ...(meta.counts.otherRecords > 0 ? [plural(meta.counts.otherRecords, 'other record')] : [])].join(' \u00b7 ');
  return (
    <header data-property-brief-header="" className="max-w-[860px] space-y-3">
      <div>
        <h3 className="font-serif text-2xl font-semibold text-slate-950">{block.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{meta ? `${meta.purposeLabel} \u00b7 Snapshot ${snapshot}` : block.body}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><Info className="h-3.5 w-3.5" aria-hidden="true" />{TRUST_LABEL}</p>
      </div>
      {stale && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-start gap-2 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><strong>Home records changed.</strong> Recipients still see this snapshot{meta && meta.changedSections.length > 0 ? ` (changed: ${meta.changedSections.join(', ')})` : ''} until you refresh it.</span></p>
          {refresh && <ActionLink action={{ ...refresh, style: 'PRIMARY' }} />}
        </div>
      )}
      {meta && <p className="text-sm font-medium text-slate-700">{counts}</p>}
      {meta && meta.excludedSections.length > 0 && <p className="text-xs text-slate-500">Excludes {meta.excludedSections.join(', ').toLowerCase()}.</p>}
      {rest.length > 0 && <div className="flex flex-wrap gap-2">{rest.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </header>
  );
}

export const PropertyBriefSharePanel: AskBlockRenderer<'GROUPED_LIST'> = ({ block, onItemAction, itemActionsDisabled }) => {
  const items = block.sections.flatMap((section) => section.items);
  return (
    <section data-property-brief-shares="" aria-label={block.title} className="max-w-[860px] rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{block.title}</h4>
      <ul className="mt-2 divide-y divide-slate-100 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div>
              <p className="font-medium text-slate-900">{item.title}{exceptionalStatus(item) && item.status !== 'ACTIVE' && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.status}</span>}</p>
              <p className="text-xs text-slate-500">{[item.description, ...item.meta].filter(Boolean).join(' · ')}</p>
            </div>
            {(item.actions ?? []).length > 0 && (
              <div className="flex gap-2">
                {(item.actions ?? []).map((action) => (
                  <button key={action.id} type="button" disabled={itemActionsDisabled} onClick={() => onItemAction(action.entityType ?? item.entityType, action.entityId ?? item.id, action.message, action.operationId, action.interactionType)}
                    className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{action.label}</button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{block.description}</p>
    </section>
  );
};

// The limitation statement stays in full, as a subdued trust panel.
export function PropertyBriefLimitation({ block }: { block: Extract<AskPresentationBlock, { type: 'BOUNDARY' }> }) {
  return (
    <aside data-property-brief-limitation="" className="max-w-[860px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
      <p><strong className="font-semibold text-slate-700">{block.title}.</strong> {block.body}</p>
    </aside>
  );
}
