'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bookmark, BriefcaseBusiness, History, Home, NotebookTabs, type LucideIcon } from 'lucide-react';
import { ASK_DESTINATIONS, askDestinationForPath, buildAskDestinationHref, type AskDestinationId } from '@/features/ask/destinations';
import { cn } from '@/lib/utils';

const ICONS: Record<AskDestinationId, LucideIcon> = {
  home: Home,
  work: BriefcaseBusiness,
  record: NotebookTabs,
  saved: Bookmark,
  history: History,
};

function DestinationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = askDestinationForPath(pathname);

  return ASK_DESTINATIONS.map((destination) => {
    const Icon = ICONS[destination.id];
    const selected = active === destination.id;
    return (
      <Link
        key={destination.id}
        href={buildAskDestinationHref(destination, searchParams)}
        aria-current={selected ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2',
          mobile && 'min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-1 py-1 text-[11px]',
          selected ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:bg-stone-100 hover:text-slate-950',
        )}
      >
        <Icon className={cn('h-4 w-4', mobile && 'h-[18px] w-[18px]')} aria-hidden="true" />
        <span>{destination.label}</span>
      </Link>
    );
  });
}

export function AskDestinationNav() {
  return (
    <>
      <nav className="hidden shrink-0 border-b border-stone-200 bg-[#fcfbf8] px-6 py-2 md:block" aria-label="Ask Cozy destinations">
        <div className="mx-auto flex max-w-[1440px] items-center gap-1">
          <DestinationLinks />
        </div>
      </nav>
      <nav className="shrink-0 border-t border-stone-200 bg-white px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 md:hidden" aria-label="Ask Cozy destinations">
        <div className="flex items-stretch gap-0.5">
          <DestinationLinks mobile />
        </div>
      </nav>
    </>
  );
}
