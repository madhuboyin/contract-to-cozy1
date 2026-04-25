'use client';

import Link from 'next/link';
import { ArrowUpRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ValueStripTone = 'teal' | 'amber' | 'red' | 'blue' | 'slate';

export interface ValueStripTile {
  id: string;
  label: string;
  value: string;
  delta?: string | null;
  icon: LucideIcon;
  tone: ValueStripTone;
  href?: string;
}

interface HeroValueStripProps {
  tiles: ValueStripTile[];
  momentumLabel?: string | null;
}

function toneClasses(tone: ValueStripTone) {
  if (tone === 'teal') {
    return 'border-teal-200/80 bg-teal-50/70 text-teal-900';
  }
  if (tone === 'amber') {
    return 'border-amber-200/80 bg-amber-50/80 text-amber-900';
  }
  if (tone === 'red') {
    return 'border-red-200/80 bg-red-50/80 text-red-900';
  }
  if (tone === 'blue') {
    return 'border-blue-200/80 bg-blue-50/80 text-blue-900';
  }
  return 'border-slate-200/80 bg-slate-50/80 text-slate-900';
}

export function HeroValueStrip({ tiles, momentumLabel }: HeroValueStripProps) {
  if (!tiles.length) return null;

  return (
    <section className="mt-3 animate-fade-in-up rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-sm sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-semibold tracking-normal text-slate-500">
          Home At A Glance
        </p>
        {momentumLabel ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            {momentumLabel}
          </span>
        ) : null}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 lg:grid-cols-5 sm:overflow-visible">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const cardClass = cn(
            'group min-w-[168px] rounded-xl border px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm sm:min-w-0',
            toneClasses(tile.tone),
          );
          const body = (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/70">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {tile.delta ? (
                  <span className="text-[10px] font-semibold tracking-normal text-slate-600">
                    {tile.delta}
                  </span>
                ) : null}
              </div>
              <div className="text-base font-semibold leading-tight">{tile.value}</div>
              <div className="mt-0.5 text-[11px] text-slate-600">{tile.label}</div>
              {tile.href ? (
                <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 opacity-0 transition-opacity group-hover:opacity-100">
                  Open <ArrowUpRight className="h-3 w-3" />
                </div>
              ) : null}
            </>
          );

          if (tile.href) {
            return (
              <Link key={tile.id} href={tile.href} className={cardClass}>
                {body}
              </Link>
            );
          }

          return (
            <div key={tile.id} className={cardClass}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
