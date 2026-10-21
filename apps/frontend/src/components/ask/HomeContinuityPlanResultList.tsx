'use client';

import { type ReactNode, useState } from 'react';
import { AlertTriangle, ChevronDown, ClipboardList, Info, MoreHorizontal, ShieldCheck, StickyNote, Users, Wrench, Zap } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { cn } from '@/lib/utils';
import { ActionLink } from './blocks/context';
import type { AskBlockRenderer } from './blocks/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type Section = Block['sections'][number];
type OnAction = Parameters<AskBlockRenderer<'GROUPED_LIST'>>[0]['onItemAction'];

// Home Continuity Plan contents (FRD v1.392): an empty plan opens as a guided starter (the four things that matter first) with the full
// section structure behind a disclosure; once the plan holds anything, sections are compact rows with Add entry on the row itself and the
// less common management actions in an overflow menu. Each section has its own icon; the contacts section is the only one that is not a
// section the homeowner adds entries to, so it never offers Add entry.

const SECTION_ICON: Record<string, typeof ShieldCheck> = {
  EMERGENCY: AlertTriangle, CRITICAL_INFO: Info, CONTRACTORS: Wrench, MAINTENANCE_KNOWLEDGE: Wrench, UTILITIES: Zap, INSURANCE: ShieldCheck, HOUSE_RULES: ClipboardList, GENERAL_NOTES: StickyNote,
};
const STARTER_ORDER = ['EMERGENCY', 'UTILITIES', 'CONTRACTORS'] as const;
const STARTER_BLURB: Record<string, string> = {
  EMERGENCY: 'What someone must know first: shutoffs, who to call, where things are.',
  UTILITIES: 'Providers, account holders and shutoff locations.',
  CONTRACTORS: 'The people you trust for repairs, with how to reach them.',
};

const sectionType = (section: Section): string | null => section.items.find((item) => item.entityType === 'HOME_DIGITAL_WILL_SECTION')?.meta.find((value) => value.startsWith('type:'))?.slice(5) ?? null;

function ActionMenu({ item, disabled, onAction, includePrimary = true }: {
  item: Item; disabled: boolean; onAction: OnAction; includePrimary?: boolean;
}) {
  const actions = item.actions ?? [];
  const primary = actions.find((action) => action.style === 'PRIMARY') ?? actions[0];
  // Without the primary button (Add entry lives on the row), the menu holds every action except Add entry itself.
  const secondary = actions.filter((action) => action !== primary);
  const run = (action: (typeof actions)[number]) => onAction(item.entityType, item.id, action.message, action.operationId, action.interactionType);
  return <div className="flex shrink-0 items-center gap-1.5">
    {includePrimary && primary && <button type="button" disabled={disabled} onClick={() => run(primary)} className="min-h-8 rounded-lg bg-teal-700 px-2.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{primary.label}</button>}
    {secondary.length > 0 && <details className="relative">
      <summary aria-label={`More actions for ${item.title}`} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><MoreHorizontal className="h-4 w-4" /></summary>
      <div className="absolute right-0 z-20 mt-1 min-w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
        {secondary.map((action) => <button key={action.id} type="button" disabled={disabled} onClick={() => run(action)} className={cn('block min-h-8 w-full rounded-lg px-2.5 text-left text-xs font-semibold hover:bg-slate-50 disabled:opacity-50', action.id.includes('DELETE') ? 'text-rose-700' : 'text-slate-700')}>{action.label}</button>)}
      </div>
    </details>}
  </div>;
}

export function HomeContinuityPlanResultList({ block, disabled, onAction }: { block: Block; disabled: boolean; onAction: OnAction }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const managerOf = (section: Section) => section.items.find((item) => item.entityType === 'HOME_DIGITAL_WILL_SECTION');
  const entriesOf = (section: Section) => section.items.filter((item) => item !== managerOf(section));
  const isDisabledSection = (section: Section) => /disabled/i.test(section.title) || managerOf(section)?.status === 'DISABLED';
  const addEntryAction = (section: Section) => managerOf(section)?.actions?.find((action) => action.id === 'ENTRY_CREATE');
  const totalEntries = block.sections.reduce((sum, section) => sum + (section.id === 'digital-will-contacts' ? 0 : entriesOf(section).length), 0);
  const hasContacts = block.sections.some((section) => section.id === 'digital-will-contacts' && section.items.length > 0);
  const starter = totalEntries === 0 && !hasContacts;

  const AddEntryButton = ({ section }: { section: Section }) => {
    const manager = managerOf(section);
    const action = addEntryAction(section);
    if (!manager || !action || isDisabledSection(section)) return null;
    return <button type="button" disabled={disabled} onClick={() => onAction(manager.entityType, manager.id, action.message, action.operationId, action.interactionType)}
      aria-label={`Add entry to ${section.title}`} className="min-h-8 shrink-0 rounded-lg border border-teal-200 bg-white px-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50">Add entry</button>;
  };

  const renderSection = (section: Section) => {
    const manager = managerOf(section);
    const entries = entriesOf(section);
    const isContactSection = section.id === 'digital-will-contacts';
    const open = Boolean(openSections[section.id]);
    const disabledSection = isDisabledSection(section);
    const label = section.title.replace(/ — Disabled$/i, '');
    const Icon = isContactSection ? Users : SECTION_ICON[sectionType(section) ?? ''] ?? ShieldCheck;
    const expandable = entries.length > 0 || Boolean(manager);
    return <div key={section.id} className={cn(disabledSection && 'bg-slate-50/60')}>
      <div className="flex items-center gap-2 pr-3">
        <button type="button" aria-expanded={open} aria-controls={`${section.id}-panel`} disabled={!expandable} onClick={() => setOpenSections((current) => ({ ...current, [section.id]: !open }))}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', isContactSection ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-800')}><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">{label}{disabledSection && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">Disabled</span>}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{entries.length === 0 ? 'No entries yet' : `${entries.length} ${isContactSection ? (entries.length === 1 ? 'contact' : 'contacts') : (entries.length === 1 ? 'entry' : 'entries')}`}</span>
          </span>
          {expandable && <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} aria-hidden="true" />}
        </button>
        {!isContactSection && <AddEntryButton section={section} />}
      </div>
      {open && <div id={`${section.id}-panel`} className="border-t border-slate-100 bg-slate-50/40 px-4 py-3">
        {manager && <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{manager.description || (disabledSection ? 'Enable or edit this section to add entries.' : 'Add or organize entries in this section.')}</p>
          <ActionMenu item={manager} disabled={disabled} onAction={onAction} includePrimary={disabledSection} />
        </div>}
        {entries.length > 0 && <ul className={cn('space-y-2', manager && 'mt-3')}>{entries.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{item.title}</p>{item.meta.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{item.meta.filter((value) => !value.startsWith('type:')).join(' · ')}</p>}</div>
          <ActionMenu item={item} disabled={disabled} onAction={onAction} />
        </li>)}</ul>}
      </div>}
    </div>;
  };

  const toolbar: ReactNode = <div className="flex flex-wrap gap-2" data-continuity-toolbar="">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>;
  const header = (title: string, hint: string) => <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div><h3 className="font-semibold text-slate-950">{title}</h3><p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p></div>
    {toolbar}
  </div>;

  if (starter) {
    const starters = STARTER_ORDER.flatMap((type) => block.sections.filter((section) => sectionType(section) === type && !isDisabledSection(section)));
    return <section data-home-continuity-plan="" data-continuity-starter="" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {header('Start your plan', 'Begin with the essentials. You can add the rest any time.')}
      <ul className="divide-y divide-slate-100">
        {starters.map((section) => {
          const Icon = SECTION_ICON[sectionType(section) ?? ''] ?? ShieldCheck;
          const type = sectionType(section) ?? '';
          return <li key={section.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-800"><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{section.title}</span><span className="mt-0.5 block text-xs text-slate-500">{STARTER_BLURB[type] ?? 'Add what someone would need to know.'}</span></span>
            <AddEntryButton section={section} />
          </li>;
        })}
        <li className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Users className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">Trusted contacts</span><span className="mt-0.5 block text-xs text-slate-500">Start with a primary contact in the checklist above.</span></span>
        </li>
      </ul>
      <details className="border-t border-slate-100">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">All plan sections ({block.sections.filter((section) => section.id !== 'digital-will-contacts').length})<ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" /></summary>
        <div className="divide-y divide-slate-100 border-t border-slate-100">{block.sections.filter((section) => section.id !== 'digital-will-contacts').map(renderSection)}</div>
      </details>
    </section>;
  }

  return <section data-home-continuity-plan="" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    {header('Plan contents', 'Add an entry on any section, or open one to review and manage it.')}
    <div className="divide-y divide-slate-100">{block.sections.map(renderSection)}</div>
  </section>;
}
