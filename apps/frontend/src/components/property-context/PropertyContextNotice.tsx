'use client';

import Link from 'next/link';

export type PropertyContextDecision = {
  status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  reasonCodes: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  validUntil: string | null;
  correctionPaths?: string[];
};

export type PropertyContextEnvelope = {
  contextVersion: string;
  generatedContextVersion?: string | null;
  isStale?: boolean;
  decision: PropertyContextDecision;
  reconciliation?: {
    status: 'CURRENT' | 'REVIEW_REQUIRED';
    requiresReview: boolean;
    contextVersion?: string;
    reasonCodes: string[];
    affectedOutputs?: Array<{ factKey: string; outputType: string; count: number }>;
  };
};

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

export function PropertyContextNotice({
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
    <div className={`rounded-2xl border p-4 text-sm ${needsAttention ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
      <p className="font-semibold">{context.isStale ? `${title} changed` : title}</p>
      <p className="mt-1">
        {context.isStale
          ? 'This result was generated from an older property context. Refresh or rerun it before acting.'
          : context.decision.reasonCodes.map(label).join(' · ')}
      </p>
      {(context.decision.missingFactKeys.length > 0 || context.decision.conflictedFactKeys.length > 0) ? (
        <p className="mt-1 text-xs opacity-80">
          {[...context.decision.missingFactKeys, ...context.decision.conflictedFactKeys].map(label).join(' · ')}
        </p>
      ) : null}
      {paths.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-3">
          {paths.map((path, index) => (
            <Link key={`${path}-${index}`} href={path} className="font-medium underline underline-offset-2">
              Correct property details{paths.length > 1 ? ` ${index + 1}` : ''}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
