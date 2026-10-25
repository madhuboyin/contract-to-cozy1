'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Flame,
  HelpCircle,
  MapPin,
  Pin,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskCollectionDescriptor, AskGroupedListItem, AskPresentationBlock } from '@/features/ask/types';
import type { ItemActionHandler } from './PatternParts';
import { CollectionStatusNote } from './CollectionStatusNote';

type GroupedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Section = GroupedListBlock['sections'][number];

const tabLabel = (title: string) =>
  title === 'In good shape' ? 'Good' : title === 'Missing information' ? 'Missing info' : title;

function itemSummary(item: AskGroupedListItem): string | null {
  return [item.timingLabel, item.description].filter(Boolean).join(' · ') || null;
}

const UPPER_CODE_RE = /^[A-Z0-9]+_[A-Z0-9_]+$/;
const ACRONYMS = new Set(['HVAC', 'AC', 'GFCI', 'CO', 'UV', 'LED', 'EV', 'TV']);

function formatHumanTitle(rawTitle: string): { display: string; changed: boolean } {
  if (!UPPER_CODE_RE.test(rawTitle.trim())) {
    return { display: rawTitle, changed: false };
  }
  const words = rawTitle
    .trim()
    .split('_')
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word.toUpperCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()));
  return { display: words.join(' '), changed: true };
}

type ParsedItemMeta = {
  recommendation: string | null;
  category: string | null;
  ageLabel: string | null;
  warrantyStatus: string | null;
  maintenanceLabel: string | null;
  roomName: string | null;
  isPinned: boolean;
  lifespanPercent: number | null;
  expectedLifeYears: number | null;
  isPastLife: boolean;
};

const KNOWN_RECOMMENDATIONS = new Set(['replace soon', 'repair', 'ok', 'monitor', 'replace']);
const KNOWN_CATEGORIES = new Set([
  'appliance',
  'systems',
  'safety',
  'structure',
  'furniture',
  'electronics',
  'other',
  'hvac',
  'plumbing',
  'electrical',
  'roof exterior',
]);

function parseItemDetails(item: AskGroupedListItem): ParsedItemMeta {
  let recommendation: string | null = null;
  let category: string | null = null;
  let ageLabel: string | null = item.timingLabel && /\byr\s+old\b/i.test(item.timingLabel) ? item.timingLabel : null;
  let warrantyStatus: string | null = null;
  let maintenanceLabel: string | null = null;
  let roomName: string | null = null;
  let isPinned = false;

  for (const raw of item.meta) {
    const entry = raw.trim();
    const lower = entry.toLowerCase();
    if (!entry) continue;
    if (lower === 'pinned') {
      isPinned = true;
    } else if (!recommendation && KNOWN_RECOMMENDATIONS.has(lower)) {
      recommendation = lower;
    } else if (!category && KNOWN_CATEGORIES.has(lower)) {
      category = lower;
    } else if (/\byr\s+old\b/i.test(entry)) {
      ageLabel = ageLabel ?? entry;
    } else if (/^warranty:\s*/i.test(entry)) {
      warrantyStatus = entry.replace(/^warranty:\s*/i, '').trim().toLowerCase();
    } else if (/\bmaintenance\s+tasks?\b/i.test(entry)) {
      maintenanceLabel = entry;
    } else if (!roomName) {
      roomName = entry;
    }
  }

  let lifespanPercent: number | null = null;
  let expectedLifeYears: number | null = null;
  let isPastLife = false;

  const desc = item.description ?? '';
  const pctMatch = /(\d+)\s*%\s*of\s*expected\s*life/i.exec(desc);
  const pastMatch = /past\s*expected\s*life(?:\s*\((\d+)\s*yr\))?/i.exec(desc);
  if (pctMatch) {
    lifespanPercent = Math.min(100, Math.max(0, Number(pctMatch[1])));
  } else if (pastMatch) {
    isPastLife = true;
    lifespanPercent = 100;
    if (pastMatch[1]) expectedLifeYears = Number(pastMatch[1]);
  } else if (ageLabel && !item.needsInfo) {
    const ageNum = parseFloat(ageLabel);
    if (!Number.isNaN(ageNum) && ageNum >= 0) {
      lifespanPercent = Math.min(95, Math.max(8, Math.round((ageNum / 15) * 100)));
    }
  }

  if (!expectedLifeYears && lifespanPercent && lifespanPercent > 0 && ageLabel) {
    const ageNum = parseFloat(ageLabel);
    if (!Number.isNaN(ageNum) && ageNum > 0) {
      expectedLifeYears = Math.round(ageNum / (lifespanPercent / 100));
    }
  }

  return {
    recommendation,
    category,
    ageLabel,
    warrantyStatus,
    maintenanceLabel,
    roomName,
    isPinned,
    lifespanPercent,
    expectedLifeYears,
    isPastLife,
  };
}

function getCategoryIcon(category: string | null, title: string) {
  const combined = `${category ?? ''} ${title}`.toLowerCase();
  if (combined.includes('hvac') || combined.includes('furnace') || combined.includes('heater') || combined.includes('boiler') || combined.includes('thermostat') || combined.includes('system')) {
    return Flame;
  }
  if (combined.includes('smoke') || combined.includes('alarm') || combined.includes('detector') || combined.includes('safety') || combined.includes('extinguisher')) {
    return Shield;
  }
  if (combined.includes('roof') || combined.includes('structure') || combined.includes('foundation') || combined.includes('window') || combined.includes('door')) {
    return Building2;
  }
  if (combined.includes('tv') || combined.includes('electronic') || combined.includes('router') || combined.includes('camera') || combined.includes('smart')) {
    return Cpu;
  }
  return Wrench;
}

function getSectionTone(sectionId: string, title: string): 'ACTION' | 'MONITOR' | 'GOOD' | 'MISSING' {
  const key = `${sectionId} ${title}`.toLowerCase();
  if (key.includes('action')) return 'ACTION';
  if (key.includes('monitor')) return 'MONITOR';
  if (key.includes('missing') || key.includes('needs-info')) return 'MISSING';
  return 'GOOD';
}

const SECTION_TONE_STYLES = {
  ACTION: {
    tabSelected: 'border-rose-600 bg-rose-50/80 text-rose-950 shadow-sm',
    tabIdle: 'border-transparent text-slate-600 hover:bg-rose-50/40 hover:text-rose-900',
    countSelected: 'bg-rose-600 text-white',
    countIdle: 'bg-rose-100 text-rose-800',
    iconColor: 'text-rose-600',
    stripe: 'bg-rose-500',
    avatarBg: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-rose-500/20',
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    barColor: 'bg-gradient-to-r from-amber-500 to-rose-600',
    Icon: AlertTriangle,
  },
  MONITOR: {
    tabSelected: 'border-amber-500 bg-amber-50/80 text-amber-950 shadow-sm',
    tabIdle: 'border-transparent text-slate-600 hover:bg-amber-50/40 hover:text-amber-900',
    countSelected: 'bg-amber-500 text-white',
    countIdle: 'bg-amber-100 text-amber-800',
    iconColor: 'text-amber-600',
    stripe: 'bg-amber-400',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/20',
    badge: 'border-amber-200 bg-amber-50 text-amber-900',
    barColor: 'bg-gradient-to-r from-teal-500 via-amber-400 to-amber-500',
    Icon: Clock,
  },
  GOOD: {
    tabSelected: 'border-emerald-600 bg-emerald-50/80 text-emerald-950 shadow-sm',
    tabIdle: 'border-transparent text-slate-600 hover:bg-emerald-50/40 hover:text-emerald-900',
    countSelected: 'bg-emerald-600 text-white',
    countIdle: 'bg-emerald-100 text-emerald-800',
    iconColor: 'text-emerald-600',
    stripe: 'bg-emerald-500',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/20',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    barColor: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    Icon: CheckCircle2,
  },
  MISSING: {
    tabSelected: 'border-slate-600 bg-slate-100/90 text-slate-950 shadow-sm',
    tabIdle: 'border-transparent text-slate-600 hover:bg-slate-100/60 hover:text-slate-900',
    countSelected: 'bg-slate-700 text-white',
    countIdle: 'bg-slate-200 text-slate-700',
    iconColor: 'text-slate-500',
    stripe: 'bg-slate-400',
    avatarBg: 'bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-slate-500/15',
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    barColor: 'bg-slate-400',
    Icon: HelpCircle,
  },
} as const;

export function StatusAccordionView({
  sections,
  collection,
  onItemAction,
  disabled,
}: {
  sections: Section[];
  collection?: AskCollectionDescriptor;
  onItemAction: ItemActionHandler;
  disabled: boolean;
}) {
  const firstSection = sections.find((section) => section.items.length > 0) ?? sections[0];
  const [activeKey, setActiveKey] = useState(firstSection?.id ?? '');
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(firstSection?.items[0]?.id ?? null);
  const [searchQuery, setSearchQuery] = useState('');

  const activeSection = sections.find((section) => section.id === activeKey) ?? firstSection;
  const rawItems = activeSection?.items ?? [];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const allItems = normalizedQuery
    ? rawItems.filter((item) => {
        const haystack = [item.title, item.description, item.timingLabel, ...item.meta].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : rawItems;

  // The producer's disclosure boundary (initialVisibleCount) is a local view choice: the rest are already delivered.
  const limit = activeSection?.initialVisibleCount;
  const expandedList = !limit || showAll[activeSection?.id ?? ''] || allItems.length <= limit;
  const activeItems = expandedList ? allItems : allItems.slice(0, limit);
  const hiddenCount = allItems.length - activeItems.length;
  const activeLabel = tabLabel(activeSection?.title ?? 'Status');
  const activeTone = getSectionTone(activeSection?.id ?? '', activeSection?.title ?? '');

  // Compute aggregate health stats across all sections for the executive health header
  const countsByTone = sections.reduce(
    (acc, sec) => {
      const tone = getSectionTone(sec.id, sec.title);
      acc[tone] += sec.count;
      return acc;
    },
    { ACTION: 0, MONITOR: 0, GOOD: 0, MISSING: 0 },
  );
  const totalItems = countsByTone.ACTION + countsByTone.MONITOR + countsByTone.GOOD + countsByTone.MISSING;
  const ratedItems = countsByTone.ACTION + countsByTone.MONITOR + countsByTone.GOOD;
  const healthScore =
    ratedItems > 0
      ? Math.round((countsByTone.GOOD * 100 + countsByTone.MONITOR * 68 + countsByTone.ACTION * 22) / ratedItems)
      : null;

  const healthVerdict =
    countsByTone.ACTION > 0
      ? { label: 'Action Required', tone: 'text-rose-400', ringColor: '#f43f5e', bgPill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }
      : countsByTone.MONITOR > 0
        ? { label: 'Watch List Active', tone: 'text-amber-300', ringColor: '#f59e0b', ringBg: '#fbbf24', bgPill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
        : ratedItems > 0
          ? { label: 'Optimal Standing', tone: 'text-emerald-300', ringColor: '#10b981', bgPill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
          : { label: 'Awaiting Dates', tone: 'text-slate-300', ringColor: '#94a3b8', bgPill: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };

  const select = (key: string, items: AskGroupedListItem[]) => {
    setActiveKey(key);
    setExpandedId(items[0]?.id ?? null);
  };

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = healthScore !== null ? circumference - (healthScore / 100) * circumference : circumference * 0.75;

  return (
    <div data-status-accordion="" className="bg-slate-50/50">
      {/* Executive Visual Health Score & Condition Distribution Header */}
      {totalItems > 0 && (
        <div className="border-b border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 px-4 py-4 text-white sm:px-5" aria-hidden="true">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: SVG Circular Health Gauge Ring + Verdict */}
            <div className="flex items-center gap-4">
              <div className="relative flex h-18 w-18 shrink-0 items-center justify-center">
                <svg className="h-18 w-18 -rotate-90 transform" viewBox="0 0 68 68">
                  <circle cx="34" cy="34" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-700/70" />
                  <circle
                    cx="34"
                    cy="34"
                    r={radius}
                    stroke={healthVerdict.ringColor}
                    strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-base font-bold leading-none tracking-tight text-white tabular-nums">
                    {healthScore !== null ? `${healthScore}%` : '—'}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300">Health</span>
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide', healthVerdict.bgPill)}>
                    <Activity className="h-3 w-3" />
                    {healthVerdict.label}
                  </span>
                  <span className="text-xs font-medium text-slate-300 tabular-nums">
                    {totalItems} {totalItems === 1 ? 'system tracked' : 'systems tracked'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-white">
                  {countsByTone.ACTION > 0
                    ? `${countsByTone.ACTION} ${countsByTone.ACTION === 1 ? 'item requires' : 'items require'} priority attention`
                    : countsByTone.MONITOR > 0
                      ? `${countsByTone.MONITOR} aging ${countsByTone.MONITOR === 1 ? 'system' : 'systems'} on lifecycle watch`
                      : ratedItems > 0
                        ? `All ${ratedItems} rated systems operating within expected life`
                        : 'Add install dates to unlock lifecycle predictions'}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  {ratedItems} of {totalItems} rated from age, expected lifespan, warranty &amp; maintenance records
                </p>
              </div>
            </div>

            {/* Right: 4 Mini KPI Metric Tiles */}
            <div className="grid grid-cols-4 gap-2 sm:min-w-[22rem]">
              <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-center backdrop-blur-sm">
                <span className="block text-base font-bold text-rose-400 tabular-nums">{countsByTone.ACTION}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-300">Action</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-center backdrop-blur-sm">
                <span className="block text-base font-bold text-amber-300 tabular-nums">{countsByTone.MONITOR}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-300">Monitor</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-center backdrop-blur-sm">
                <span className="block text-base font-bold text-emerald-400 tabular-nums">{countsByTone.GOOD}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-300">Good</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-center backdrop-blur-sm">
                <span className="block text-base font-bold text-slate-300 tabular-nums">{countsByTone.MISSING}</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-300">Unrated</span>
              </div>
            </div>
          </div>

          {/* Multi-Segment Condition Distribution Bar */}
          <div className="mt-3.5">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800 p-0.5 ring-1 ring-white/10">
              {countsByTone.ACTION > 0 && (
                <div
                  style={{ width: `${(countsByTone.ACTION / totalItems) * 100}%` }}
                  className="h-full rounded-l-full bg-rose-500 transition-all duration-300"
                />
              )}
              {countsByTone.MONITOR > 0 && (
                <div
                  style={{ width: `${(countsByTone.MONITOR / totalItems) * 100}%` }}
                  className="h-full bg-amber-400 transition-all duration-300"
                />
              )}
              {countsByTone.GOOD > 0 && (
                <div
                  style={{ width: `${(countsByTone.GOOD / totalItems) * 100}%` }}
                  className="h-full bg-emerald-500 transition-all duration-300"
                />
              )}
              {countsByTone.MISSING > 0 && (
                <div
                  style={{ width: `${(countsByTone.MISSING / totalItems) * 100}%` }}
                  className="h-full rounded-r-full bg-slate-500 transition-all duration-300"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Condition Tab Strip (Accessible tablist) */}
      <div
        className={cn(
          'grid border-b border-slate-200 bg-white sm:grid-flow-col sm:auto-cols-fr',
          sections.length > 3 ? 'grid-cols-2' : 'grid-cols-1',
        )}
        role="tablist"
        aria-label="Home status condition"
      >
        {sections.map((section) => {
          const selected = section.id === activeSection?.id;
          const tone = getSectionTone(section.id, section.title);
          const style = SECTION_TONE_STYLES[tone];
          const TabIcon = style.Icon;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="status-accordion-panel"
              onClick={() => select(section.id, section.items)}
              className={cn(
                ' flex min-h-12 items-center justify-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600',
                selected ? style.tabSelected : style.tabIdle,
              )}
            >
              <TabIcon aria-hidden="true" className={cn('h-4 w-4 shrink-0', selected ? style.iconColor : 'text-slate-400')} />
              <span>{tabLabel(section.title)}</span>
              <span
                className={cn(
                  'inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums transition-colors',
                  selected ? style.countSelected : style.countIdle,
                )}
              >
                ({section.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Optional Quick Search Filter when a tab has 4+ items */}
      {rawItems.length >= 4 && (
        <div className="border-b border-slate-200/70 bg-white/80 px-3.5 py-2">
          <div className="relative flex items-center">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Filter ${activeLabel.toLowerCase()} items by name, room, or warranty...`}
              aria-label={`Filter ${activeLabel} items`}
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Condition Items Panel */}
      <ul
        id="status-accordion-panel"
        role="tabpanel"
        aria-label={`${activeLabel} items`}
        className="space-y-2.5 p-3 sm:p-4"
      >
        {activeItems.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
            <CheckCircle2 aria-hidden="true" className="mx-auto h-8 w-8 text-emerald-500/80" />
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {normalizedQuery ? 'No matching systems in this tab' : `No systems in "${activeLabel}"`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {normalizedQuery
                ? 'Try clearing your filter or switching to another condition tab above.'
                : 'Select another condition tab above to inspect your other home systems.'}
            </p>
          </li>
        ) : (
          activeItems.map((item) => {
            const expanded = expandedId === item.id;
            const detailsId = `status-accordion-${item.id}-details`;
            const parsed = parseItemDetails(item);
            const humanTitle = formatHumanTitle(item.title);
            const itemTone = item.needsInfo
              ? 'MISSING'
              : item.status === 'ACTION_NEEDED'
                ? 'ACTION'
                : item.status === 'MONITOR'
                  ? 'MONITOR'
                  : activeTone;
            const toneStyle = SECTION_TONE_STYLES[itemTone];
            const CategoryIcon = getCategoryIcon(parsed.category, humanTitle.display);
            const summaryLine = itemSummary(item);

            const wearTone =
              parsed.lifespanPercent === null
                ? 'bg-slate-300'
                : parsed.lifespanPercent >= 95
                  ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                  : parsed.lifespanPercent >= 75
                    ? 'bg-gradient-to-r from-teal-500 to-amber-500'
                    : 'bg-gradient-to-r from-emerald-400 to-teal-500';

            const wearBadgeClass =
              parsed.lifespanPercent === null
                ? 'border-slate-200 bg-slate-100 text-slate-600'
                : parsed.lifespanPercent >= 95
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : parsed.lifespanPercent >= 75
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800';

            return (
              <li
                key={item.id}
                data-status-accordion-item={item.id}
                className={cn(
                  'group relative overflow-hidden rounded-2xl border bg-white transition-all duration-200',
                  expanded
                    ? 'border-slate-300 shadow-md ring-1 ring-slate-900/5'
                    : 'border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow',
                )}
              >
                {/* Left Condition Color Accent Bar */}
                <div aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1.5', toneStyle.stripe)} />

                {/* Accordion Header Button */}
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 pl-4 pr-3.5 py-3 text-left transition-colors hover:bg-slate-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600 sm:pl-5 sm:pr-4"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3.5">
                    {/* Category Icon Avatar */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm',
                        toneStyle.avatarBg,
                      )}
                    >
                      <CategoryIcon className="h-5 w-5" />
                    </span>

                    {/* Title, Subtitle & Visual Chips */}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">
                          {humanTitle.changed ? (
                            <>
                              <span aria-hidden="true">{humanTitle.display}</span>
                              <span className="sr-only">{item.title}</span>
                            </>
                          ) : (
                            item.title
                          )}
                        </span>

                        {/* Decorative Visual Chips (aria-hidden so accessible button name stays exact) */}
                        <span aria-hidden="true" className="inline-flex flex-wrap items-center gap-1.5">
                          {parsed.isPinned && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              <Pin className="h-2.5 w-2.5" />
                              Pinned
                            </span>
                          )}
                          {parsed.roomName && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              <MapPin className="h-2.5 w-2.5 text-slate-400" />
                              {parsed.roomName}
                            </span>
                          )}
                          {parsed.recommendation && (
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                                parsed.recommendation === 'replace soon' || parsed.recommendation === 'replace'
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : parsed.recommendation === 'repair'
                                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                              )}
                            >
                              {parsed.recommendation}
                            </span>
                          )}
                          {item.needsInfo && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              <Calendar className="h-2.5 w-2.5" />
                              Date Needed
                            </span>
                          )}
                        </span>
                      </span>

                      {summaryLine && (
                        <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                          {summaryLine}
                        </span>
                      )}
                    </span>
                  </span>

                  {/* Right Side: Visual Lifespan Progress Meter + Expand Chevron */}
                  <span className="flex shrink-0 items-center gap-3">
                    {parsed.lifespanPercent !== null && (
                      <span aria-hidden="true" className="hidden flex-col items-end gap-1 sm:flex sm:w-28">
                        <span className="flex w-full items-center justify-between text-[11px] font-semibold tabular-nums">
                          <span className="text-slate-400">Lifespan</span>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.2 text-[10px] font-bold border',
                              wearBadgeClass,
                            )}
                          >
                            {parsed.isPastLife ? 'Past EOL' : `${parsed.lifespanPercent}%`}
                          </span>
                        </span>
                        <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
                          <span
                            style={{ width: `${Math.min(100, Math.max(6, parsed.lifespanPercent))}%` }}
                            className={cn('block h-full rounded-full transition-all duration-300', wearTone)}
                          />
                        </span>
                      </span>
                    )}

                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
                        expanded
                          ? 'border-teal-200 bg-teal-50 text-teal-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:bg-white',
                      )}
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </span>
                </button>

                {/* Expanded Bento Detail Panel */}
                {expanded && (
                  <div
                    id={detailsId}
                    className="border-t border-slate-100 bg-gradient-to-b from-slate-50/70 to-white pl-4 pr-3.5 py-3.5 sm:pl-5 sm:pr-4"
                  >
                    {/* Visual 4-Tile Bento Grid */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
                      {/* Tile 1: Lifespan & Age Gauge */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          <span>Lifecycle Stage</span>
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <p className="mt-1.5 text-sm font-bold text-slate-900 tabular-nums">
                          {parsed.ageLabel ?? (item.needsInfo ? 'Install date missing' : 'Age recorded')}
                        </p>
                        {parsed.lifespanPercent !== null ? (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                              <span>{parsed.isPastLife ? 'Exceeded expected life' : `${parsed.lifespanPercent}% of life used`}</span>
                              {parsed.expectedLifeYears && (
                                <span className="text-slate-400">~{parsed.expectedLifeYears} yr life</span>
                              )}
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                style={{ width: `${Math.min(100, Math.max(6, parsed.lifespanPercent))}%` }}
                                className={cn('h-full rounded-full', wearTone)}
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">
                            Add install or purchase date to calculate remaining lifespan.
                          </p>
                        )}
                      </div>

                      {/* Tile 2: Action & Recommendation Verdict */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          <span>Recommendation</span>
                          <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                        </div>
                        <p className="mt-1.5 text-sm font-bold capitalize text-slate-900">
                          {parsed.recommendation === 'replace soon'
                            ? 'Plan Replacement Soon'
                            : parsed.recommendation === 'repair'
                              ? 'Schedule Inspection / Repair'
                              : item.needsInfo
                                ? 'Record Install Date'
                                : 'Routine Upkeep Only'}
                        </p>
                        <p className="mt-1 text-xs leading-4 text-slate-500">
                          {parsed.recommendation === 'replace soon'
                            ? 'Approaching or past typical service life; budget for replacement.'
                            : parsed.recommendation === 'repair'
                              ? 'Flagged for attention based on condition or open tasks.'
                              : item.needsInfo
                                ? 'Cannot predict wear until install date is added.'
                                : 'Operating within normal age parameters.'}
                        </p>
                      </div>

                      {/* Tile 3: Warranty Coverage */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          <span>Warranty Status</span>
                          {parsed.warrantyStatus === 'active' ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          ) : parsed.warrantyStatus === 'expired' || parsed.warrantyStatus === 'expiring soon' ? (
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                          ) : (
                            <Shield className="h-3.5 w-3.5 text-slate-400" />
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-bold capitalize',
                              parsed.warrantyStatus === 'active'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                : parsed.warrantyStatus === 'expiring soon'
                                  ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                  : parsed.warrantyStatus === 'expired'
                                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                    : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            {parsed.warrantyStatus ?? 'None recorded'}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-4 text-slate-500">
                          {parsed.warrantyStatus === 'active'
                            ? 'Covered by an active warranty record on file.'
                            : parsed.warrantyStatus === 'expiring soon'
                              ? 'Coverage expires soon — review terms before servicing.'
                              : parsed.warrantyStatus === 'expired'
                                ? 'Recorded warranty coverage has expired.'
                                : 'No active warranty linked to this system.'}
                        </p>
                      </div>

                      {/* Tile 4: Room Location & Maintenance */}
                      <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          <span>Location &amp; Upkeep</span>
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <p className="mt-1.5 text-sm font-bold text-slate-900">
                          {parsed.roomName ?? 'Whole Home / Unassigned'}
                        </p>
                        <p className="mt-1 text-xs leading-4 text-slate-500">
                          {parsed.maintenanceLabel
                            ? parsed.maintenanceLabel
                            : parsed.category
                              ? `Category: ${parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1)}`
                              : 'No open maintenance tasks recorded.'}
                        </p>
                      </div>
                    </div>

                    {/* Canonical Record Trace & Actions Footer */}
                    <div className="mt-3 flex flex-col justify-between gap-3 border-t border-slate-200/60 pt-3 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        {item.description && (
                          <p className="text-xs font-medium leading-5 text-slate-700">{item.description}</p>
                        )}
                        {item.meta.length > 0 && (
                          <p className={cn('text-xs leading-5 text-slate-500', item.description && 'mt-0.5')}>
                            {item.meta.join(' · ')}
                          </p>
                        )}
                      </div>

                      {item.actions && item.actions.length > 0 && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {item.actions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                onItemAction(
                                  item.entityType,
                                  item.id,
                                  action.message,
                                  action.operationId,
                                  action.interactionType,
                                )
                              }
                              className={cn(
                                'inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-2xs transition-all disabled:opacity-50',
                                action.style === 'PRIMARY'
                                  ? 'bg-teal-700 text-white hover:bg-teal-800'
                                  : 'border border-slate-200 bg-white text-slate-800 hover:border-teal-300 hover:bg-teal-50/40 hover:text-teal-900',
                              )}
                            >
                              <Wrench aria-hidden="true" className="h-3.5 w-3.5" />
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>

      {(hiddenCount > 0 || (limit && showAll[activeSection?.id ?? ''] && allItems.length > limit)) && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() =>
              setShowAll((current) => ({
                ...current,
                [activeSection?.id ?? '']: !current[activeSection?.id ?? ''],
              }))
            }
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-teal-800 shadow-2xs transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            {hiddenCount > 0 ? `Show ${hiddenCount} more` : 'Show fewer'}
          </button>
        </div>
      )}
      <CollectionStatusNote collection={collection} className="px-4 pb-3.5 text-xs text-slate-500" />
    </div>
  );
}
