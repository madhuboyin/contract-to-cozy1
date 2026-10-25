'use client';

import { useId } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FileCheck2,
  FileText,
  History,
  Home,
  Info,
  Layers,
  Link2,
  LockKeyhole,
  MapPin,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ActionLink } from './blocks/context';
import type { AskBlockRenderer } from './blocks/types';

// Property Brief preview & saved-briefs dashboard (Ask Cozy):
// The server payload is unchanged -- everything here is read from the existing SUMMARY / GROUPED_LIST / BOUNDARY blocks.
// Source, as-of date and verification stay on every fact, behind a native "Source details" disclosure.

export const PROPERTY_BRIEF_PREVIEW_IDS = {
  summary: 'property-brief-preview-summary',
  sections: 'property-brief-preview-sections',
  shares: 'property-brief-preview-shares',
  boundary: 'property-brief-preview-boundary',
  listSummary: 'property-briefs-summary',
  listItems: 'property-briefs-items',
  listBoundary: 'property-briefs-boundary',
} as const;

const REFRESH_ACTION_ID = 'property-brief-republish';
const TRUST_LABEL = 'Homeowner-assembled — not an inspection or disclosure';
const GAP_SECTION_TITLE = 'Known gaps and unknowns';
const HISTORY_SECTION_TITLE = 'Verified property history';
// A fact's key prefix (`location.city`, `systems.heatingType`) says which semantic group it belongs to.
const FACT_GROUPS: Record<string, string> = {
  location: 'Location',
  core: 'Property profile',
  structure: 'Structure',
  systems: 'Systems',
};

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = GroupedList['sections'][number]['items'][number];
type Summary = Extract<AskPresentationBlock, { type: 'SUMMARY' }>;

// "City: Plainsboro Township" -> label + value. A row without a label ("Recorded item") keeps its whole title as the value.
function splitFact(item: Item): { label: string; value: string } {
  const at = item.title.indexOf(': ');
  return at > 0
    ? { label: item.title.slice(0, at), value: item.title.slice(at + 2) }
    : { label: item.title, value: item.description ?? '' };
}

const isUnrecorded = (item: Item) => item.meta.some((entry) => /unknown or not recorded/i.test(entry));
const isEmptyRow = (item: Item) => item.status === 'EMPTY';
// "Included" says nothing the row's presence does not; only exceptional states earn a badge.
const exceptionalStatus = (item: Item) =>
  item.status && !/^(included|active|empty)$/i.test(item.status) ? item.status : null;

interface Group {
  id: string;
  title: string;
  items: Item[];
  gaps: boolean;
}

function buildGroups(block: GroupedList): Group[] {
  const groups: Group[] = [];
  for (const section of block.sections) {
    const gaps = section.title === GAP_SECTION_TITLE;
    const items = section.items.filter((item) => !isEmptyRow(item));
    const buckets = new Map<string, Item[]>();
    for (const item of items) {
      const prefix = item.id.split('.')[0];
      const title =
        !gaps && section.title !== HISTORY_SECTION_TITLE && FACT_GROUPS[prefix]
          ? FACT_GROUPS[prefix]
          : section.title;
      buckets.set(title, [...(buckets.get(title) ?? []), item]);
    }
    if (buckets.size === 0) groups.push({ id: section.id, title: section.title, items: [], gaps });
    for (const [title, bucket] of buckets) groups.push({ id: `${section.id}:${title}`, title, items: bucket, gaps });
  }
  return groups;
}

function groupIcon(title: string, gaps: boolean) {
  if (gaps) return AlertTriangle;
  if (/location/i.test(title)) return MapPin;
  if (/profile/i.test(title)) return Home;
  if (/structure/i.test(title)) return Layers;
  if (/system/i.test(title)) return Wrench;
  if (/history/i.test(title)) return History;
  return FileText;
}

function SourceDetails({ items }: { items: Item[] }) {
  const withMeta = items.filter((item) => item.meta.length > 0);
  if (withMeta.length === 0) return null;
  return (
    <details className="group mt-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-500">
      <summary className="inline-flex min-h-7 cursor-pointer list-none items-center gap-1.5 rounded-md font-semibold text-slate-600 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        Source details ({withMeta.length})
      </summary>
      <ul className="mt-2 space-y-1.5 border-l-2 border-teal-200 pl-3">
        {withMeta.map((item) => (
          <li key={item.id} className="leading-5">
            <span className="font-semibold text-slate-700">{splitFact(item).label}</span> {'—'} {item.meta.join(' · ')}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FactGroup({ group, anchorId }: { group: Group; anchorId: string }) {
  const Icon = groupIcon(group.title, group.gaps);
  return (
    <section
      id={anchorId}
      aria-label={group.title}
      className={cn(
        'scroll-mt-20 overflow-hidden rounded-2xl border shadow-2xs transition-all',
        group.gaps ? 'border-amber-200/90 bg-gradient-to-b from-amber-50/60 to-white' : 'border-slate-200/90 bg-white',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between border-b px-4 py-2.5 sm:px-5',
          group.gaps ? 'border-amber-100 bg-amber-50/80' : 'border-slate-100 bg-slate-50/70',
        )}
      >
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          <span
            aria-hidden="true"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-lg',
              group.gaps ? 'bg-amber-100 text-amber-800' : 'bg-white text-teal-700 ring-1 ring-slate-200/80',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span>{group.title}</span>
        </h4>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums',
            group.gaps ? 'bg-amber-100 text-amber-900' : 'bg-white text-slate-700 ring-1 ring-slate-200/80',
          )}
        >
          {group.items.length}
        </span>
      </div>

      <div className="p-4 sm:px-5">
        {group.items.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
            Nothing eligible was included in this section.
          </p>
        ) : (
          <dl className="divide-y divide-slate-100 text-sm">
            {group.items.map((item) => {
              const { label, value } = splitFact(item);
              const badge = exceptionalStatus(item);
              const verified = item.meta.some((entry) => /^verified|evidence verified|homeowner confirmed$/i.test(entry));
              return (
                <div
                  key={item.id}
                  className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-4"
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-2 font-semibold',
                      group.gaps || isUnrecorded(item) ? 'italic text-slate-500' : 'text-slate-900',
                    )}
                  >
                    <span>{value || 'Not recorded'}</span>
                    <div className="flex flex-wrap items-center gap-1.5 not-italic">
                      {verified && !group.gaps && (
                        <span
                          aria-hidden="true"
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200/70"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Verified
                        </span>
                      )}
                      {badge && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                          <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                          {badge}
                        </span>
                      )}
                    </div>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        <SourceDetails items={group.items} />
      </div>
    </section>
  );
}

// One canonical appearance: no Auto/List/Cards, because this is the exact recipient preview.
export const PropertyBriefFactSheet: AskBlockRenderer<'GROUPED_LIST'> = ({ block }) => {
  const scope = useId();
  const groups = buildGroups(block);
  const anchor = (index: number) => `${scope}-group-${index}`;
  return (
    <div data-property-brief-fact-sheet="" className="max-w-[860px] space-y-3.5">
      {groups.length >= 4 && (
        <nav
          aria-label="Brief sections"
          className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2"
        >
          <span aria-hidden="true" className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Jump to
          </span>
          {groups.map((group, index) => (
            <button
              key={group.id}
              type="button"
              onClick={() =>
                document.getElementById(anchor(index))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              }
              className="min-h-8 rounded-full border border-slate-200/90 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-teal-300 hover:bg-teal-50/40 hover:text-teal-800"
            >
              {group.title}
            </button>
          ))}
        </nav>
      )}
      {groups.map((group, index) => (
        <FactGroup key={group.id} group={group} anchorId={anchor(index)} />
      ))}
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
  const snapshot =
    meta &&
    new Date(meta.snapshotAsOf).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const counts =
    meta &&
    [
      plural(meta.counts.facts, 'fact'),
      plural(meta.counts.history, 'history record'),
      plural(meta.counts.gaps, 'known gap'),
      ...(meta.counts.otherRecords > 0 ? [plural(meta.counts.otherRecords, 'other record')] : []),
    ].join(' \u00b7 ');

  return (
    <header
      data-property-brief-header=""
      className={cn(
        'max-w-[860px] space-y-3.5 overflow-hidden rounded-2xl border p-4 shadow-2xs sm:p-5',
        stale
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/80 via-white to-teal-50/30'
          : 'border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-teal-50/40',
      )}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <FileCheck2 aria-hidden="true" className="h-3 w-3 text-teal-300" />
              Frozen Recipient Dossier
            </span>
            <p className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
              <Info className="h-3 w-3 text-slate-400" aria-hidden="true" />
              {TRUST_LABEL}
            </p>
          </div>
          <h3 className="mt-2 font-serif text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{block.title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {meta ? `${meta.purposeLabel} \u00b7 Snapshot ${snapshot}` : block.body}
          </p>
        </div>

        {rest.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {rest.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>

      {stale && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/90 bg-amber-50/90 p-3.5"
        >
          <p className="flex items-start gap-2.5 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              <strong>Home records changed.</strong> Recipients still see this snapshot
              {meta && meta.changedSections.length > 0 ? ` (changed: ${meta.changedSections.join(', ')})` : ''} until
              you refresh it.
            </span>
          </p>
          {refresh && <ActionLink action={{ ...refresh, style: 'PRIMARY' }} />}
        </div>
      )}

      {meta && (
        <div className="space-y-2.5 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
            <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Property Facts</span>
              <span className="mt-0.5 block text-base font-bold tabular-nums text-slate-900">{meta.counts.facts}</span>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified History</span>
              <span className="mt-0.5 block text-base font-bold tabular-nums text-teal-800">{meta.counts.history}</span>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 px-3 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">Known Gaps</span>
              <span className="mt-0.5 block text-base font-bold tabular-nums text-amber-950">{meta.counts.gaps}</span>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Other Records</span>
              <span className="mt-0.5 block text-base font-bold tabular-nums text-slate-900">
                {meta.counts.otherRecords}
              </span>
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-700">{counts}</p>
          {meta.excludedSections.length > 0 && (
            <p className="text-xs text-slate-500">Excludes {meta.excludedSections.join(', ').toLowerCase()}.</p>
          )}
        </div>
      )}
    </header>
  );
}

export function PropertyBriefsSummaryCard({ block }: { block: Summary }) {
  const isCaution = block.tone === 'CAUTION';
  const isEmpty = block.title === 'No property briefs yet';
  return (
    <section
      data-property-briefs-summary=""
      className={cn(
        'max-w-[860px] overflow-hidden rounded-2xl border p-4 shadow-2xs sm:px-5 sm:py-4',
        isCaution
          ? 'border-amber-200/90 bg-gradient-to-r from-amber-50/80 via-white to-teal-50/30'
          : 'border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-teal-50/40',
      )}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100">
              <Sparkles aria-hidden="true" className="h-3 w-3 text-teal-300" />
              Property Brief Dossiers
            </span>
            {!isEmpty && (
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
                {isCaution ? 'Refresh Needed' : 'Snapshots Current'}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-base font-bold tracking-tight text-slate-950 sm:text-lg">{block.title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-700">{block.body}</p>
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

export const PropertyBriefsListBlock: AskBlockRenderer<'GROUPED_LIST'> = ({
  block,
  onItemAction,
  itemActionsDisabled,
}) => {
  return (
    <section
      data-property-briefs-list=""
      aria-label={block.title}
      className="max-w-[860px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-4 py-3.5 sm:px-5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Governed Share History</span>
        <h3 className="text-base font-bold tracking-tight text-slate-950">{block.title}</h3>
        {block.description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{block.description}</p>}
      </div>

      <div className="divide-y divide-slate-100">
        {block.sections.map((section) => {
          const isLiveSection = section.id === 'property-briefs-live';
          return (
            <div key={section.id} className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-2 w-2 rounded-full',
                      isLiveSection ? 'bg-emerald-500 ring-4 ring-emerald-500/15' : 'bg-slate-400',
                    )}
                  />
                  {section.title}
                </h4>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-slate-700">
                  {section.count}
                </span>
              </div>

              <ul className="grid grid-cols-1 gap-3">
                {section.items.map((item) => {
                  const isStale = item.meta.some((m) => /not refreshed in/i.test(m));
                  const statusText = item.status?.replace(/_/g, ' ');
                  return (
                    <li
                      key={item.id}
                      data-ask-task-id={item.id}
                      className={cn(
                        'flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-all sm:flex-row sm:items-center',
                        isStale
                          ? 'border-amber-300/90 bg-gradient-to-r from-amber-50/50 via-white to-white'
                          : isLiveSection
                            ? 'border-emerald-200/90 bg-gradient-to-r from-emerald-50/40 via-white to-white shadow-2xs'
                            : 'border-slate-200/80 bg-slate-50/60',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                              isLiveSection
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-white text-slate-600 ring-1 ring-slate-200/80',
                            )}
                          >
                            <FileCheck2 className="h-4 w-4" />
                          </span>
                          <p className="font-bold text-slate-950">{item.title}</p>
                          {statusText && (
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                isLiveSection
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-white text-slate-600 ring-1 ring-slate-200/80',
                              )}
                            >
                              {statusText}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1.5 text-xs font-medium text-slate-600">{item.description}</p>
                        )}
                        {item.meta.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.meta.map((entry) => {
                              const staleChip = /not refreshed in/i.test(entry);
                              const liveChip = /live link/i.test(entry);
                              const openedChip = /opened/i.test(entry);
                              return (
                                <span
                                  key={entry}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                                    staleChip
                                      ? 'border border-amber-300 bg-amber-100/80 font-semibold text-amber-900'
                                      : liveChip
                                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                                        : openedChip
                                          ? 'border border-teal-200 bg-teal-50/70 text-teal-900'
                                          : 'border border-slate-200/80 bg-white text-slate-600',
                                  )}
                                >
                                  {staleChip && <Clock className="h-3 w-3 text-amber-700" aria-hidden="true" />}
                                  {liveChip && <Link2 className="h-3 w-3 text-emerald-700" aria-hidden="true" />}
                                  {openedChip && <Eye className="h-3 w-3 text-teal-700" aria-hidden="true" />}
                                  {entry}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {(item.actions ?? []).length > 0 && (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {(item.actions ?? []).map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              disabled={itemActionsDisabled}
                              onClick={() =>
                                onItemAction(
                                  action.entityType ?? item.entityType,
                                  action.entityId ?? item.id,
                                  action.message,
                                  action.operationId,
                                  action.interactionType,
                                )
                              }
                              className={cn(
                                'min-h-8 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
                                action.style === 'PRIMARY'
                                  ? 'bg-teal-700 text-white shadow-2xs hover:bg-teal-800'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                              )}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export const PropertyBriefSharePanel: AskBlockRenderer<'GROUPED_LIST'> = ({
  block,
  onItemAction,
  itemActionsDisabled,
}) => {
  const items = block.sections.flatMap((section) => section.items);
  return (
    <section
      data-property-brief-shares=""
      aria-label={block.title}
      className="max-w-[860px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
    >
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-5">
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-teal-700 ring-1 ring-slate-200/80"
          >
            <Link2 className="h-3.5 w-3.5" />
          </span>
          {block.title}
        </h4>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700 ring-1 ring-slate-200/80">
          {items.length}
        </span>
      </div>

      <div className="p-4 sm:px-5">
        <ul className="space-y-2.5 text-sm">
          {items.map((item) => {
            const isLive = item.status === 'ACTIVE';
            return (
              <li
                key={item.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3',
                  isLive ? 'border-emerald-200/80 bg-emerald-50/30' : 'border-slate-200/80 bg-slate-50/60',
                )}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('h-2 w-2 rounded-full', isLive ? 'bg-emerald-500' : 'bg-slate-400')}
                    />
                    <p className="font-bold text-slate-900">
                      {item.title}
                      {exceptionalStatus(item) && item.status !== 'ACTIVE' && (
                        <span className="ml-2 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                          {item.status}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {[item.description, ...item.meta].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {(item.actions ?? []).length > 0 && (
                  <div className="flex gap-2">
                    {(item.actions ?? []).map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        disabled={itemActionsDisabled}
                        onClick={() =>
                          onItemAction(
                            action.entityType ?? item.entityType,
                            action.entityId ?? item.id,
                            action.message,
                            action.operationId,
                            action.interactionType,
                          )
                        }
                        className={cn(
                          'min-h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors disabled:opacity-50',
                          action.style === 'QUIET'
                            ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">{block.description}</p>
      </div>
    </section>
  );
};

// Four scannable points up front; the full limitation statement stays one disclosure away, word for word.
const LIMITATION_POINTS = [
  'Not an inspection, appraisal, certification, title report or professional opinion.',
  'Includes only the records selected for this brief.',
  'May contain unknown or incomplete information.',
  'Does not replace independent professional review.',
];

export function PropertyBriefLimitation({ block }: { block: Extract<AskPresentationBlock, { type: 'BOUNDARY' }> }) {
  return (
    <aside
      data-property-brief-limitation=""
      aria-label={block.title}
      className="max-w-[860px] rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-2xs sm:px-5"
    >
      <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <ShieldAlert className="h-4 w-4 text-teal-700" aria-hidden="true" />
        {block.title}
      </h4>
      <ul className="mt-2.5 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700 marker:text-teal-500 sm:text-sm">
        {LIMITATION_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <details className="group mt-2.5 text-xs text-slate-500">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 font-semibold text-slate-600 hover:text-teal-800 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
          Read the full statement
        </summary>
        <p className="mt-1 max-w-prose leading-5">{block.body}</p>
      </details>
    </aside>
  );
}
