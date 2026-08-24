'use client';

// Home Intelligence Functional Completeness FRD Phase 3B, work item 1 — a
// reusable Home Action detail block for the decision-contract fields that
// already exist on every HomeAction (assumptions, options, trade-offs,
// governance disclosures, recommendation availability) but weren't rendered
// anywhere yet, plus Phase 3A's decisionLineage. Home is the first
// consumer; §12.3 asks Cozy to render "the same action identity and
// explanation blocks" — reuse this component there rather than
// reimplementing the same fields.

import type { RankedHomeActionDTO } from '@/types';
import { Badge } from '@/components/ui/badge';

const LIFECYCLE_LABELS: Record<string, string> = {
  OPEN: 'Started',
  GATHERING_CONTEXT: 'Gathering context',
  READY_TO_COMPARE: 'Ready to compare',
  RECOMMENDATION_AVAILABLE: 'Recommendation ready',
  ACTION_IN_PROGRESS: 'In progress',
  DECIDED: 'Decided',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
  ARCHIVED: 'Archived',
};

function DecisionLineageStatus({ decisionLineage }: { decisionLineage: RankedHomeActionDTO['decisionLineage'] }) {
  if (!decisionLineage || decisionLineage.status === 'NOT_APPLICABLE') return null;

  if (decisionLineage.status === 'UNAVAILABLE') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Decision tracking unavailable</p>
        <p className="mt-1 text-sm text-amber-800">
          {decisionLineage.reason ?? 'This decision could not be tracked right now. The recommendation below is still current.'}
        </p>
      </div>
    );
  }

  if (decisionLineage.status === 'AMBIGUOUS') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Multiple decisions in progress</p>
        <p className="mt-1 text-sm text-amber-800">More than one decision thread exists for this item. Contact support to reconcile them.</p>
      </div>
    );
  }

  if (decisionLineage.status === 'NOT_STARTED') {
    return (
      <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision tracking</p>
        <p className="mt-1 text-sm text-slate-700">Opening this recommendation starts a tracked decision you can revisit and compare later.</p>
      </div>
    );
  }

  const thread = decisionLineage.thread;
  return (
    <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision tracking</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="rounded-full border-teal-200 bg-teal-50 text-teal-700">
          {thread ? LIFECYCLE_LABELS[thread.lifecycleStatus] ?? thread.lifecycleStatus : 'Tracked'}
        </Badge>
        {thread?.contextStatus && thread.contextStatus !== 'CURRENT' && (
          <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
            {thread.contextStatus === 'STALE' ? 'Recommendation may be outdated' : 'Facts need review'}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-700">This decision is tracked with a durable history you can return to and compare against later choices.</p>
    </div>
  );
}

/**
 * Home Intelligence Functional Completeness FRD HI-DEC-001 — everything on
 * a material recommendation the contract already carries: assumptions
 * (with which are editable), realistic alternatives and the recommended
 * one, trade-offs, recommendation availability/safe-next-action, governance
 * disclosures, and decision-thread lineage. Evidence, expected outcome, and
 * timing render alongside this in the caller (already present before this
 * component existed).
 */
export function HomeActionDecisionDetail({ action }: { action: RankedHomeActionDTO }) {
  const { recommendationResponse, governance } = action;
  const hasAssumptions = action.assumptions.length > 0;
  const hasOptions = action.options.length > 0;
  const hasTradeoffs = action.tradeoffs.length > 0;
  const degraded = recommendationResponse.status !== 'AVAILABLE';
  const hasDisclosure = governance.commercialDisclosure.involvesCommercialAction ||
    Boolean(governance.professionalBoundary) || Boolean(governance.conservativeFallback);

  if (!hasAssumptions && !hasOptions && !hasTradeoffs && !degraded && !hasDisclosure && !action.decisionLineage) {
    return null;
  }

  return (
    <>
      <DecisionLineageStatus decisionLineage={action.decisionLineage} />

      {degraded && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {recommendationResponse.status === 'LOW_CONFIDENCE' ? 'Low-confidence recommendation' :
              recommendationResponse.status === 'DATA_UNAVAILABLE' ? 'Recommendation unavailable' : 'Source temporarily unavailable'}
          </p>
          <p className="mt-1 text-sm text-amber-800">{recommendationResponse.message}</p>
          <p className="mt-1 text-sm font-medium text-amber-900">{recommendationResponse.safeNextAction}</p>
        </div>
      )}

      {hasOptions && (
        <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Options considered</p>
          <ul className="mt-2 space-y-2">
            {action.options.map((option) => (
              <li key={option.id} className="text-sm text-slate-700">
                <span className="font-medium">{option.label}</span>
                {option.recommended && (
                  <Badge variant="outline" className="ml-2 rounded-full border-teal-200 bg-teal-50 text-[11px] text-teal-700">Recommended</Badge>
                )}
                <p className="mt-0.5 text-slate-600">{option.summary}</p>
                {action.tradeoffs.filter((t) => t.optionId === option.id).map((tradeoff, index) => (
                  <p key={`${option.id}-${index}`} className="mt-0.5 text-xs text-slate-500">
                    <span className="font-medium uppercase tracking-wide">{tradeoff.dimension}:</span> {tradeoff.summary}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasAssumptions && (
        <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assumptions used</p>
          <ul className="mt-2 space-y-1">
            {action.assumptions.map((assumption) => (
              <li key={assumption.key} className="text-sm text-slate-700">
                <span className="font-medium">{assumption.label}:</span> {assumption.value}
                {assumption.editable && <span className="ml-1 text-xs text-slate-500">(editable)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasDisclosure && (
        <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Good to know</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {governance.professionalBoundary && <li>{governance.professionalBoundary}</li>}
            {governance.conservativeFallback && <li>{governance.conservativeFallback}</li>}
            {governance.commercialDisclosure.involvesCommercialAction && (
              <li>{governance.commercialDisclosure.summary}</li>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
