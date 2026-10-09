'use client';

import { Compass, History, LogOut, MessageSquarePlus, UserRound } from 'lucide-react';

export function CollapsedConversationRail({ accountLabel, loggingOut, onNew, onExpand, onExplore, onLogout }: { accountLabel?: string; loggingOut: boolean; onNew: () => void; onExpand: () => void; onExplore?: () => void; onLogout: () => void }) {
  return <aside className="hidden w-[4.5rem] shrink-0 flex-col items-center border-r border-stone-200 bg-[#f4f2ed] px-2 py-4 lg:flex" aria-label="Ask Cozy conversation navigation">
    <nav className="flex w-full flex-col items-center gap-2" aria-label="Conversation actions">
      <button type="button" onClick={onNew} aria-label="New conversation" title="New conversation" className="grid h-11 w-11 place-items-center rounded-xl text-emerald-950 transition hover:bg-white"><MessageSquarePlus className="h-5 w-5" aria-hidden="true" /></button>
      {onExplore && <button type="button" onClick={onExplore} aria-label="Explore with Cozy" title="Explore with Cozy" className="grid h-11 w-11 place-items-center rounded-xl text-slate-700 transition hover:bg-white"><Compass className="h-5 w-5" aria-hidden="true" /></button>}
      <button type="button" id="ask-history-toggle" onClick={onExpand} aria-label="History" title="History" aria-expanded="false" aria-controls="ask-history-rail" className="grid h-11 w-11 place-items-center rounded-xl text-slate-700 transition hover:bg-white"><History className="h-5 w-5" aria-hidden="true" /></button>
    </nav>
    <div className="mt-auto flex w-full flex-col items-center gap-2 border-t border-stone-300 pt-3" aria-label="Account">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-600" title={accountLabel || 'Signed in'}><UserRound className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{accountLabel || 'Signed in'}</span></span>
      <button type="button" disabled={loggingOut} onClick={onLogout} aria-label={loggingOut ? 'Logging out' : 'Log out'} title={loggingOut ? 'Logging out' : 'Log out'} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"><LogOut className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  </aside>;
}
