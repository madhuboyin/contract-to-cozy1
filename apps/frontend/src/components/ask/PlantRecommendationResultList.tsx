'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Droplets, Leaf, MapPin, PawPrint, Sparkles } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { cn } from '@/lib/utils';
import { ActionLink } from './blocks/context';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemActionHandler = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

const toneClass = {
  DEFAULT: 'border-slate-200 bg-slate-50 text-slate-700',
  POSITIVE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  CAUTION: 'border-amber-200 bg-amber-50 text-amber-900',
  CRITICAL: 'border-rose-200 bg-rose-50 text-rose-800',
};

const GENERIC_NEAR_FIT_WARNING = 'Works, but not ideal under current room inputs.';

function normalizedRecommendationDetail(item: Item) {
  const warnings = (item.warnings ?? []).filter((warning) => warning !== GENERIC_NEAR_FIT_WARNING || item.warnings?.length === 1);
  if (item.guidance?.length) return { guidance: item.guidance, detail: item.detail, warnings };

  // Stored Ask executions retain the presentation payload that was originally
  // delivered. Upgrade the former newline-delimited Plant Advisor detail at
  // render time so existing conversations receive the current hierarchy too.
  const guidance: NonNullable<Item['guidance']> = [];
  const remaining: string[] = [];
  for (const line of item.detail?.split('\n').map((value) => value.trim()).filter(Boolean) ?? []) {
    if (line.startsWith('Care:')) guidance.push({ label: 'Care', value: line.slice('Care:'.length).trim(), kind: 'CARE' });
    else if (line.startsWith('Placement:')) guidance.push({ label: 'Best placement', value: line.slice('Placement:'.length).trim(), kind: 'PLACEMENT' });
    // The legacy first line is recommendation rationale already represented by
    // visible highlights and warnings. Do not repeat it inside expanded detail.
    else if (!item.highlights?.length && !warnings.length) remaining.push(line);
  }
  return { guidance, detail: remaining.join('\n') || null, warnings };
}

function RecommendationCard({ item, disabled, onAction }: { item: Item; disabled?: boolean; onAction?: ItemActionHandler }) {
  const [expanded, setExpanded] = useState(false);
  const actions = item.actions ?? [];
  const track = actions.find((action) => action.id === 'plant-recommendation-add-home');
  const save = actions.find((action) => action.id === 'plant-recommendation-save');
  const dismiss = actions.find((action) => action.id === 'plant-recommendation-dismiss');
  const run = (action: NonNullable<Item['actions']>[number]) => onAction?.(action.entityType ?? item.entityType, action.entityId ?? item.id, action.message, action.operationId, action.interactionType);
  const status = item.status === 'SAVED' ? 'Saved for later' : item.status === 'DISMISSED' ? 'Not interested' : null;
  const detailsId = `plant-recommendation-${item.id}-details`;
  const normalized = normalizedRecommendationDetail(item);
  const hasDetails = Boolean(normalized.detail || normalized.guidance.length || normalized.warnings.length > 1);

  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" data-plant-recommendation={item.id}>
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700" aria-hidden="true"><Leaf className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="text-base font-semibold text-slate-950">{item.title}</h5>
          {item.badgeLabel && <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', toneClass[item.tone ?? 'DEFAULT'])}>{item.badgeLabel}</span>}
          {status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{status}</span>}
        </div>
        {item.condition && <p className="mt-0.5 text-xs italic text-slate-500">{item.condition}</p>}
        {item.description && <p className="mt-2 text-sm leading-5 text-slate-700">{item.description}</p>}
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      {item.meta.map((value) => <span key={value} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{value}</span>)}
      {(item.attributes ?? []).map((attribute) => <span key={attribute.label} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold', toneClass[attribute.tone ?? 'DEFAULT'])}>
        {attribute.label === 'Pet safety' && <PawPrint className="h-3 w-3" aria-hidden="true" />}{attribute.value}
      </span>)}
    </div>

    {(item.highlights?.length ?? 0) > 0 && <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2" aria-label="Why this plant fits">
      {item.highlights!.map((highlight) => <li key={highlight} className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" /><span>{highlight}</span></li>)}
    </ul>}
    {normalized.warnings.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-950">
      <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><div><p className="font-semibold">Consider before choosing</p><p className="mt-0.5 leading-5">{normalized.warnings[0]}</p></div></div>
      {expanded && normalized.warnings.slice(1).map((warning) => <p key={warning} className="ml-6 mt-1 leading-5">{warning}</p>)}
    </div>}

    {expanded && <div id={detailsId} className="mt-4 border-t border-slate-100 pt-4">
      {normalized.guidance.length > 0 && <section aria-label="Care and placement">
        <h6 className="text-sm font-semibold text-slate-900">Care &amp; placement</h6>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {normalized.guidance.map((guidance) => {
            const Icon = guidance.kind === 'PLACEMENT' ? MapPin : guidance.kind === 'CARE' ? Droplets : Leaf;
            return <div key={`${guidance.label}-${guidance.value}`} className="flex gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-teal-700 shadow-sm" aria-hidden="true"><Icon className="h-4 w-4" /></span>
              <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-teal-800">{guidance.label}</p><p className="mt-1 text-sm leading-5 text-slate-700">{guidance.value}</p></div>
            </div>;
          })}
        </div>
      </section>}
      {normalized.detail && <div className={cn('whitespace-pre-line text-sm leading-6 text-slate-700', normalized.guidance.length ? 'mt-3' : '')}>{normalized.detail}</div>}
    </div>}
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
      {track && <button type="button" disabled={disabled || !onAction} onClick={() => run(track)} className="min-h-10 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{track.label}</button>}
      {save && <button type="button" disabled={disabled || !onAction} onClick={() => run(save)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">{save.label}</button>}
      {hasDetails && <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">{expanded ? 'Hide details' : 'View details'}{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>}
      {dismiss && <details className="relative ml-auto"><summary className="flex min-h-10 cursor-pointer list-none items-center rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">More<span className="sr-only"> actions for {item.title}</span></summary><div className="absolute right-0 z-10 mt-1 min-w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"><button type="button" disabled={disabled || !onAction} onClick={() => run(dismiss)} className="block min-h-9 w-full rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{dismiss.label}</button></div></details>}
    </div>
  </article>;
}

export function PlantRecommendationResultList({ block, disabled, onAction }: { block: Block; disabled?: boolean; onAction?: ItemActionHandler }) {
  const [showAllBest, setShowAllBest] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const best = block.sections.find((section) => section.id === 'best-matches');
  const alternatives = block.sections.find((section) => section.id === 'other-possibilities');
  const bestVisible = best ? (showAllBest ? best.items : best.items.slice(0, best.initialVisibleCount ?? 3)) : [];
  const changeAction = block.actions.find((action) => action.interactionType === 'START_WORKFLOW');

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50 shadow-sm" data-plant-recommendations="">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Leaf className="h-4 w-4" aria-hidden="true" /></span><h3 className="text-base font-semibold text-slate-950">{block.title}</h3></div>
        {block.description && <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-600">{block.description}</p>}
      </div>
      {changeAction && <ActionLink action={changeAction} />}
    </header>

    {best && <section className="px-4 py-4 sm:px-5" aria-labelledby={`${block.id}-best`}>
      <div className="mb-3 flex items-center justify-between gap-3"><div><h4 id={`${block.id}-best`} className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{best.title}</h4>{best.caption && <p className="mt-1 text-xs text-slate-500">{best.caption}</p>}</div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{best.count}</span></div>
      <div className="space-y-3">{bestVisible.map((item) => <RecommendationCard key={item.id} item={item} disabled={disabled} onAction={onAction} />)}</div>
      {best.items.length > (best.initialVisibleCount ?? 3) && <button type="button" onClick={() => setShowAllBest((value) => !value)} className="mt-3 min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-slate-50">{showAllBest ? 'Show fewer' : `Show ${best.items.length - (best.initialVisibleCount ?? 3)} more matches`}</button>}
    </section>}

    {alternatives && <section className="border-t border-slate-200 px-4 py-4 sm:px-5" aria-labelledby={`${block.id}-alternatives`}>
      <button type="button" aria-expanded={showAlternatives} onClick={() => setShowAlternatives((value) => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-left">
        <span><span id={`${block.id}-alternatives`} className="block text-sm font-semibold text-slate-900">{alternatives.title} · {alternatives.count}</span>{alternatives.caption && <span className="mt-0.5 block text-xs text-slate-500">{alternatives.caption}</span>}</span>{showAlternatives ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {showAlternatives && <div className="mt-3 space-y-3">{alternatives.items.map((item) => <RecommendationCard key={item.id} item={item} disabled={disabled} onAction={onAction} />)}</div>}
    </section>}
  </section>;
}
