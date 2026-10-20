import Link from 'next/link';
import type { AskDestinationId } from '@/features/ask/destinations';
import { AskFocusedPanel } from '../presentation/AskLayoutPrimitives';

const COPY: Record<Exclude<AskDestinationId, 'home' | 'history' | 'record'>, { title: string; description: string; scope: string }> = {
  work: {
    title: 'Work',
    description: 'A durable place for active and completed home workflows.',
    scope: 'Pending confirmations and captures remain available from Home while the complete Work index is being connected.',
  },
  saved: {
    title: 'Saved',
    description: 'A durable place for homeowner-saved reports, comparisons, and decisions.',
    scope: 'This destination will show canonical artifacts only after their identity, freshness, and retention contracts are connected.',
  },
};

export function AskDestinationFoundation({ destination }: { destination: keyof typeof COPY }) {
  const copy = COPY[destination];
  return (
    <section className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-10" aria-labelledby={`ask-${destination}-title`}>
      <AskFocusedPanel className="max-w-4xl rounded-3xl px-5 py-8 shadow-sm sm:px-8 sm:py-10" data-presentation-contract={`ask.destination.${destination}`}>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Ask Cozy destination</p>
        <h1 id={`ask-${destination}-title`} className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950">{copy.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{copy.description}</p>
        <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950" role="status">
          {copy.scope}
        </div>
        <Link href="/dashboard/ask" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900">
          Return to Ask Cozy Home
        </Link>
      </AskFocusedPanel>
    </section>
  );
}
