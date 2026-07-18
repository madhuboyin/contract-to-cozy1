import Link from 'next/link';
import type { PropertyContextEnvelope } from './propertyContextTypes';

const label = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());

/** Explanation-only rendering for aggregate, report, and advisory outputs. */
export function PropertyContextStatusNotice({
  context,
  title = 'Property context',
}: {
  context?: PropertyContextEnvelope | null;
  title?: string;
}) {
  if (!context) return null;
  const needsAttention = context.isStale || context.decision.status !== 'APPLICABLE';
  const paths = context.decision.correctionPaths ?? [];

  return (
    <section
      className={`rounded-2xl border p-4 text-sm ${needsAttention ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-800'}`}
      aria-live={needsAttention ? 'polite' : undefined}
      aria-label={title}
    >
      <p className="font-semibold">{context.isStale ? `${title} changed` : title}</p>
      <p className="mt-1">{context.isStale
        ? 'This result was generated from an older property context. Refresh or rerun it before acting.'
        : context.decision.reasonCodes.map(label).join(' · ')}</p>
      {(context.decision.missingFactKeys.length > 0 || context.decision.conflictedFactKeys.length > 0)
        ? <p className="mt-1 text-xs opacity-80">{[...context.decision.missingFactKeys, ...context.decision.conflictedFactKeys].map(label).join(' · ')}</p>
        : null}
      {paths.length > 0 ? <nav className="mt-2 flex flex-wrap gap-3" aria-label={`${title} correction links`}>
        {paths.map((path, index) => <Link key={`${path}-${index}`} href={path} className="font-medium underline underline-offset-2">Review property details{paths.length > 1 ? ` ${index + 1}` : ''}</Link>)}
      </nav> : null}
    </section>
  );
}
