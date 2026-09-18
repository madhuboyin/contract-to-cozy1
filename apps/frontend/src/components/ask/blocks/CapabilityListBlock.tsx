import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';
import { AskContextLink } from './context';
import type { AskBlockRenderer } from './types';

function CapabilityCard({ capability }: {
  capability: Extract<AskPresentationBlock, { type: 'CAPABILITY_LIST' }>['capabilities'][number];
}) {
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
        {!unavailable && <ExternalLink className="h-4 w-4 shrink-0 text-teal-700" />}
      </div>
      <p className="mt-3 text-xs font-medium text-teal-800">You’ll get: {capability.expectedOutput}</p>
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
    </>
  );
  const className = cn(
    'block rounded-2xl border p-4',
    unavailable
      ? 'border-slate-200 bg-slate-50'
      : 'group border-teal-100 bg-teal-50/60 transition hover:border-teal-300 hover:bg-teal-50',
  );
  return unavailable
    ? <div className={className} aria-label={`${capability.label} unavailable`}>{content}</div>
    : <AskContextLink href={capability.href} className={className}>{content}</AskContextLink>;
}

export const CapabilityListBlock: AskBlockRenderer<'CAPABILITY_LIST'> = ({ block }) => (
  <section className="space-y-3">
    <div><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}</div>
    {block.capabilities.map((capability) => (
      <CapabilityCard key={capability.id} capability={capability} />
    ))}
  </section>
);
