import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';
import { AskContextLink } from './context';
import { AskBlockActionContext } from './context';
import { useContext } from 'react';
import type { AskBlockRenderer } from './types';
import { useCalmChrome, useCalmSecondary } from './calmContext';

function CapabilityCard({ capability }: {
  capability: Extract<AskPresentationBlock, { type: 'CAPABILITY_LIST' }>['capabilities'][number];
}) {
  const actions = useContext(AskBlockActionContext);
  const unavailable = capability.readiness === 'UNAVAILABLE';
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">{capability.label}</p>
            {capability.releaseStage === 'BETA' && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-teal-800">BETA</span>}
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-600">{capability.description}</p>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-teal-800">Full tool: {capability.expectedOutput}</p>
      {capability.readinessLabel && (
        <p className={cn('mt-2 text-xs font-semibold', capability.readiness === 'READY' ? 'text-emerald-700' : unavailable ? 'text-red-700' : 'text-amber-700')}>
          {capability.readinessLabel}
        </p>
      )}
      {capability.readinessReasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">
          {capability.readinessReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-600">{capability.inlineBoundary}</p>
      {!unavailable && <div className="mt-3 flex flex-wrap gap-2">
        {capability.inlineLaunch && <button type="button" disabled={!actions || actions.disabled || capability.readiness === 'NEEDS_PROPERTY'} onClick={() => actions?.invoke({ id: `launch-${capability.id}`, label: `Explore ${capability.label} in Ask`, interactionType: 'START_WORKFLOW', operationId: capability.inlineLaunch!.operationId, message: capability.inlineLaunch!.message, capabilityId: capability.id, style: 'PRIMARY' })} className="min-h-10 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Explore in Ask</button>}
        <AskContextLink href={capability.href} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800">Open {capability.label}<ExternalLink className="h-4 w-4" /></AskContextLink>
      </div>}
    </>
  );
  const className = cn(
    'block rounded-2xl border p-4',
    unavailable
      ? 'border-slate-200 bg-slate-50'
      : 'group border-teal-100 bg-teal-50/60 transition hover:border-teal-300 hover:bg-teal-50',
  );
  return <div className={className} aria-label={unavailable ? `${capability.label} unavailable` : undefined}>{content}</div>;
}

type Capability = Extract<AskPresentationBlock, { type: 'CAPABILITY_LIST' }>['capabilities'][number];

// IW-CONV-001/002/003 (FRD v1.112): in the calm shell a tool is one row: its name, one line of description, one action to explore it
// in Ask, and a quiet link to the full page. The long "Full tool" sentence, the "Ready for this home" line and the boundary
// paragraph are not repeated for each tool; a tool that is not ready, or cannot be launched here, still says so in one short line,
// and an unavailable tool still has no launch control.
function CalmCapabilityRow({ capability }: { capability: Capability }) {
  const actions = useContext(AskBlockActionContext);
  const unavailable = capability.readiness === 'UNAVAILABLE';
  const notReady = capability.readiness !== 'READY' && capability.readiness !== 'AVAILABLE';
  const note = notReady ? [capability.readinessLabel, capability.readinessReasons[0]].filter(Boolean).join(' · ') : !capability.inlineLaunch ? 'Opens the full page' : null;
  return (
    <li className="flex items-start justify-between gap-3 py-2.5" aria-label={unavailable ? `${capability.label} unavailable` : undefined}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{capability.label}{capability.releaseStage === 'BETA' && <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Beta</span>}</p>
        <p className="line-clamp-1 text-sm text-slate-500">{capability.description}</p>
        {note && <p className={cn('mt-0.5 text-xs', unavailable ? 'text-red-700' : 'text-amber-700')}>{note}</p>}
      </div>
      {!unavailable && <div className="flex shrink-0 items-center gap-1">
        {capability.inlineLaunch && <button type="button" disabled={!actions || actions.disabled || capability.readiness === 'NEEDS_PROPERTY'} onClick={() => actions?.invoke({ id: `launch-${capability.id}`, label: `Explore ${capability.label} in Ask`, interactionType: 'START_WORKFLOW', operationId: capability.inlineLaunch!.operationId, message: capability.inlineLaunch!.message, capabilityId: capability.id, style: 'SECONDARY' })} className="min-h-9 rounded-lg px-2.5 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50">Explore<span className="sr-only"> {capability.label} in Ask</span></button>}
        <AskContextLink href={capability.href} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ExternalLink className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Open {capability.label}</span></AskContextLink>
      </div>}
    </li>
  );
}

export const CapabilityListBlock: AskBlockRenderer<'CAPABILITY_LIST'> = ({ block }) => {
  const calm = useCalmChrome();
  const secondary = useCalmSecondary();
  if (calm) {
    const rows = <ul className="divide-y divide-slate-100">{block.capabilities.map((capability) => <CalmCapabilityRow key={capability.id} capability={capability} />)}</ul>;
    if (secondary) {
      return (
        <details data-calm-secondary="" className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 text-sm text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
            {block.title} · {block.capabilities.length} {block.capabilities.length === 1 ? 'tool' : 'tools'}<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-1">{rows}</div>
        </details>
      );
    }
    return <section><h3 className="text-sm font-semibold text-slate-900">{block.title}</h3>{block.description && <p className="mt-0.5 text-sm text-slate-500">{block.description}</p>}<div className="mt-1">{rows}</div></section>;
  }
  return (
    <section className="space-y-3">
      <div><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}</div>
      {block.capabilities.map((capability) => (
        <CapabilityCard key={capability.id} capability={capability} />
      ))}
    </section>
  );
};
