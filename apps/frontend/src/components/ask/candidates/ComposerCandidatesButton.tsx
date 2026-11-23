'use client';

import { Home } from 'lucide-react';

/** The composer's entry to the buyer's own list of homes (BICC-4.1). It only opens the dialog; the workspace owns the dialog so focus returns here. */
export function ComposerCandidatesButton({ disabled, embedded = false, onOpen }: { disabled?: boolean; embedded?: boolean; onOpen: (opener: HTMLButtonElement) => void }) {
  return (
    <button
      type="button" disabled={disabled} onClick={(event) => onOpen(event.currentTarget)} aria-label="Homes I’m considering" aria-haspopup="dialog" title="Homes I’m considering: add, change or compare the homes you might buy"
      className={`grid h-10 w-10 shrink-0 place-items-center transition disabled:cursor-not-allowed disabled:opacity-40 ${embedded ? 'rounded-full text-slate-600 hover:bg-slate-100' : 'rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      <Home className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
