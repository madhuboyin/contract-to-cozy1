'use client';

import { Sparkles, X } from 'lucide-react';
import type { RouteAskContext } from '@/features/ask/routeContext';

// UX-10: a dismissible starter for the page the panel was opened on. It only asks; the server reauthorizes the home and the record.
export function RouteContextStarter({ context, disabled, onStart, onDismiss }: { context: RouteAskContext; disabled?: boolean; onStart: (context: RouteAskContext) => void; onDismiss: () => void }) {
  return (
    <div data-route-context-starter="" className="mx-auto mb-4 flex w-full max-w-2xl items-center gap-1 rounded-2xl border border-teal-200 bg-teal-50/70 pl-1 pr-1">
      <button type="button" disabled={disabled} onClick={() => onStart(context)} className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-teal-900 hover:bg-teal-100/70 disabled:opacity-50">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />Ask about {context.label}
      </button>
      <button type="button" onClick={onDismiss} aria-label={`Dismiss the suggestion to ask about ${context.label}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-teal-800 hover:bg-teal-100/70"><X className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  );
}
