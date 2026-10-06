'use client';

import Link from 'next/link';
import { ComponentProps, createContext, ReactNode, useContext } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { addAskReturnContext } from '@/lib/navigation/askNavigation';

// Shared by every block renderer under ./blocks (see ./registry.tsx) as well
// as the non-block-view parts of AskWorkspace.tsx (capture cards, the
// contextual info panel) that also need to link back into the dashboard
// without losing the Ask session's return context.
export const AskActionReturnContext = createContext('');
export const AskBlockActionContext = createContext<{
  disabled: boolean;
  invoke: (action: AskAction) => void;
} | null>(null);

// CAPITAL_RESERVE_PLAN already renders both canonical reads inside Ask. Keep
// legacy and freshly-generated tool links in the conversation by targeting
// those result sections instead of reopening the desktop tool workspace.
function inlineAskTarget(href: string): string | null {
  const path = href.split(/[?#]/, 1)[0];
  if (/^\/dashboard\/properties\/[^/]+\/tools\/capital-timeline\/?$/.test(path)) return 'capital-timeline-table';
  if (/^\/dashboard\/properties\/[^/]+\/tools\/reserve-fund\/?$/.test(path)) return 'reserve-allocations';
  return null;
}

export function AskContextLink({ href, onClick, ...props }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const askReturnHref = useContext(AskActionReturnContext);
  const controls = useContext(ResultViewContext);
  let destination = href;
  if (controls && href.startsWith('/dashboard/maintenance?')) {
    const url = new URL(href, 'https://contracttocozy.local');
    if (controls.maintenanceHref) {
      const source = new URL(controls.maintenanceHref, 'https://contracttocozy.local');
      for (const key of ['propertyId', 'priority', 'filter', 'system']) {
        const value = source.searchParams.get(key);
        if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
      }
    }
    if (controls.view.selectedTaskId && !url.searchParams.has('taskId')) url.searchParams.set('taskId', controls.view.selectedTaskId);
    destination = `${url.pathname}${url.search}${url.hash}`;
  }
  const inlineTarget = inlineAskTarget(destination);
  const contextualHref = askReturnHref ? addAskReturnContext(destination, askReturnHref) : destination;
  return <Link href={contextualHref} {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || !inlineTarget || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.currentTarget.target === '_blank') return;
    const target = document.getElementById(inlineTarget);
    if (!target) return;
    event.preventDefault();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${inlineTarget}`);
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }} />;
}

// `icon` replaces the trailing arrow with a leading icon, for a row of next-step buttons that each name a different kind of step.
export function ActionLink({ action, icon }: { action: AskAction; icon?: ReactNode }) {
  const workflowControls = useContext(AskBlockActionContext);
  const className = cn(
    'inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    action.style === 'PRIMARY' ? 'bg-teal-700 text-white hover:bg-teal-800' : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
  );
  if (action.interactionType === 'START_WORKFLOW') {
    const supported = Boolean(action.message && action.operationId && workflowControls);
    return (
      <button
        type="button"
        disabled={!supported || workflowControls?.disabled}
        onClick={() => workflowControls?.invoke(action)}
        className={className}
        title={supported ? undefined : 'This inline action is not available.'}
      >
        {icon}{action.label}{!icon && <ArrowRight className="h-4 w-4" />}
      </button>
    );
  }
  if (!action.href) return null;
  return (
    <AskContextLink
      href={action.href}
      className={className}
    >
      {icon}{action.label}{!icon && <ArrowRight className="h-4 w-4" />}
    </AskContextLink>
  );
}
