'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileQuestion,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { anchorForFactLabel, propertyEditHref } from '@/lib/property/editPageAnchors';

type CoverageState = 'CURRENT' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | string;

export type CoverageSourceSummary = {
  source: { key: string; family?: string; provider: string };
  state: string;
  checkedThrough: string | null;
  geography?: { type: string; key: string | null } | null;
  limitations?: string[];
};

const humanize = (value: string) =>
  value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value: string | null) => {
  if (!value) return 'not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

export function TruthStateBadge({
  state,
  className,
}: {
  state: 'VERIFIED' | 'HOMEOWNER_CONFIRMED' | 'REPORTED' | 'INFERRED' | 'UNKNOWN' | 'NO_OBSERVED_EFFECT' | 'OBSERVED_EFFECT_CONFIRMED' | string;
  className?: string;
}) {
  const verified = state === 'VERIFIED' || state === 'HOMEOWNER_CONFIRMED' || state === 'NO_OBSERVED_EFFECT';
  const warning = state === 'INFERRED' || state === 'UNKNOWN';
  const Icon = verified ? ShieldCheck : warning ? CircleHelp : Info;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold',
        verified && 'border-emerald-200 bg-emerald-50 text-emerald-800',
        warning && 'border-amber-200 bg-amber-50 text-amber-800',
        !verified && !warning && 'border-sky-200 bg-sky-50 text-sky-800',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {humanize(state)}
    </span>
  );
}

export function DatePrecisionLabel({
  value,
  precision,
}: {
  value: string | null;
  precision: 'EXACT_DATE' | 'MONTH' | 'YEAR' | 'RANGE' | 'UNKNOWN' | string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
      {formatDate(value)} · {humanize(precision)}
    </span>
  );
}

export function WhyThisMatters({
  children,
  boundary,
}: {
  children: React.ReactNode;
  boundary?: React.ReactNode;
}) {
  return (
    <aside className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm" aria-label="Why this matters">
      <p className="font-semibold text-slate-950">Why this matters</p>
      <div className="mt-1 text-slate-700">{children}</div>
      {boundary ? <div className="mt-2 text-xs leading-5 text-slate-600">{boundary}</div> : null}
    </aside>
  );
}

export function MissingFactPrompt({
  propertyId,
  facts,
  benefit,
}: {
  propertyId: string;
  facts: string[];
  benefit: string;
}) {
  const uniqueFacts = [...new Set(facts.filter(Boolean))];
  if (uniqueFacts.length === 0) return null;
  return (
    <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Missing property facts">
      <div className="flex items-start gap-3">
        <FileQuestion className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-950">Add context to improve this explanation</p>
          <p className="mt-1 text-sm leading-6 text-amber-900">{benefit}</p>
          <p className="mt-2 text-xs text-amber-800">Missing: {uniqueFacts.map(humanize).join(', ')}.</p>
          <Link
            href={propertyEditHref(propertyId, anchorForFactLabel(uniqueFacts[0]))}
            className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 outline-none transition-colors hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-600 motion-reduce:transition-none"
          >
            Update Home Record <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function SourceCoverageSummary({
  state,
  checkedThrough,
  comprehensive,
  sources,
  limitations,
  title = 'Source coverage',
}: {
  state: CoverageState;
  checkedThrough?: string | null;
  comprehensive: boolean;
  sources: CoverageSourceSummary[];
  limitations: string[];
  title?: string;
}) {
  const current = state === 'CURRENT';
  const Icon = current ? CheckCircle2 : AlertTriangle;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="source-coverage-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="source-coverage-title" className="font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {checkedThrough ? `Checked through ${formatDate(checkedThrough)}` : 'No overall checked-through date is available.'}
          </p>
        </div>
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
          current ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900',
        )}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {humanize(state)}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        {comprehensive
          ? 'The listed providers define the stated coverage window.'
          : 'Coverage is not comprehensive. Unlisted, unavailable, stale, or failed sources cannot support an all-clear.'}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {sources.map((source) => (
          <div key={source.source.key} className="rounded-lg border border-slate-200 p-3 text-xs">
            <p className="font-semibold text-slate-900">{source.source.provider}</p>
            <p className="mt-1 text-slate-600">
              {source.source.family ? `${humanize(source.source.family)} · ` : ''}
              {humanize(source.state)} · checked through {formatDate(source.checkedThrough)}
            </p>
            {source.geography ? (
              <p className="mt-1 text-slate-500">
                {humanize(source.geography.type)} {source.geography.key ?? 'scope'}
              </p>
            ) : null}
          </div>
        ))}
        {sources.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">No reviewed source coverage is configured.</p>
        ) : null}
      </div>
      {[...new Set([...limitations, ...sources.flatMap((source) => source.limitations ?? [])])].map((limitation) => (
        <p key={limitation} className="mt-2 text-xs leading-5 text-slate-600">• {limitation}</p>
      ))}
    </section>
  );
}

export function PropertyIntelligenceJourneyLinks({
  propertyId,
  current,
}: {
  propertyId: string;
  current: 'BRIEFING' | 'TIMELINE' | 'ACTIONS' | 'SOURCE_VIEW';
}) {
  const links = [
    {
      key: 'BRIEFING',
      label: 'Home Briefing',
      description: 'Review meaningful changes',
      href: `/dashboard/properties/${propertyId}/tools/home-briefing`,
    },
    {
      key: 'ACTIONS',
      label: 'Home Actions',
      description: 'Take the canonical next step',
      href: '/dashboard/actions',
    },
    {
      key: 'TIMELINE',
      label: 'Home Timeline',
      description: 'See verified property history',
      href: `/dashboard/properties/${propertyId}/timeline`,
    },
  ].filter((link) => link.key !== current);
  return (
    <nav aria-label="Continue the Property Intelligence journey" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Continue the journey</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className="rounded-xl border border-slate-200 bg-white p-3 outline-none transition-colors hover:border-indigo-300 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-600 motion-reduce:transition-none"
          >
            <span className="block text-sm font-semibold text-slate-950">{link.label}</span>
            <span className="mt-1 block text-xs text-slate-600">{link.description}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
