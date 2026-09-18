import { cn } from '@/lib/utils';
import { formatLegacyAskCurrency } from '@/features/ask/presentationCompatibility';
import { ActionLink } from './context';
import type { AskBlockRenderer } from './types';

export const DecisionTraceBlock: AskBlockRenderer<'DECISION_TRACE'> = ({ block }) => (
  <details className="rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer font-semibold text-slate-900">{block.title}</summary>
    <ol className="mt-3 space-y-3">{block.steps.map((step, index) => <li key={`${step.label}-${index}`} className="text-sm"><p className="font-medium text-slate-800">{index + 1}. {step.label}</p><p className="mt-1 text-slate-600">{formatLegacyAskCurrency(step.detail)}</p>{step.outcome && <p className="mt-1 text-xs font-semibold text-teal-700">{step.outcome}</p>}</li>)}</ol>
  </details>
);

export const DecisionProgressBlock: AskBlockRenderer<'DECISION_PROGRESS'> = ({ block }) => {
  // FRD §21.4: lifecycleStatus and contextStatus are independent and both
  // shown distinctly (never collapsed into one status string), and a
  // stale/conflicted recommendation is never presented as current -- the
  // caution banner below is the only place the verdict renders when
  // contextStatus isn't CURRENT.
  const contextIsCurrent = block.contextStatus === 'CURRENT';
  return (
    <section className={cn('rounded-2xl border p-4', contextIsCurrent ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/70')}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{block.lifecycleStatus.replace(/_/g, ' ')}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', contextIsCurrent ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-900')}>
          {contextIsCurrent ? 'Up to date' : block.contextStatus === 'CONFLICTED' ? 'Needs your input' : 'Needs refresh'}
        </span>
      </div>
      {!contextIsCurrent && (
        <p className="mt-2 text-sm leading-5 text-amber-900">
          {block.contextStatus === 'CONFLICTED'
            ? 'Something about this decision could not be reconciled automatically. Review it before relying on the recommendation below.'
            : 'A recorded fact changed since this recommendation was generated. It will be recalculated the next time you open this decision.'}
        </p>
      )}
      {block.verdict && (
        <p className="mt-3 text-lg font-semibold text-slate-950">
          {block.verdict.replace(/_/g, ' ')}
          {block.confidenceLabel && <span className="ml-2 text-xs font-medium uppercase tracking-wide text-slate-500">{block.confidenceLabel.toLowerCase()} confidence</span>}
        </p>
      )}
      {block.reasonCodes.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">{block.reasonCodes.map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
        </div>
      )}
      {block.limitationCodes.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">Limitations ({block.limitationCodes.length})</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">{block.limitationCodes.map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
        </details>
      )}
      {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
};

export const ScenarioComparisonBlock: AskBlockRenderer<'SCENARIO_COMPARISON'> = ({ block }) => {
  const columns = [
    { key: 'baseline' as const, data: block.baseline, label: 'Current recommendation' },
    { key: 'scenario' as const, data: block.scenario, label: block.scenario.label },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {block.comparisonDirection === 'NO_CHANGE'
          ? 'This scenario does not change the recommendation.'
          : block.comparisonDirection === 'SCENARIO_FAVORS_REPLACE'
            ? 'This scenario shifts the recommendation toward replacing.'
            : 'This scenario shifts the recommendation toward repairing.'}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {columns.map((column) => (
          <div key={column.key} className="rounded-xl border border-slate-200 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{column.label}</h4>
            <p className="mt-1 font-semibold text-slate-900">{column.data.verdict.replace(/_/g, ' ')}</p>
            {column.data.reasonCodes.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">{column.data.reasonCodes.slice(0, 4).map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>}
          </div>
        ))}
      </div>
      {block.scenario.assumptions.length > 0 && (
        <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 px-3">
          {block.scenario.assumptions.map((assumption) => (
            <div key={assumption.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-slate-500">{assumption.label}</dt>
              <dd className="font-medium text-slate-800">{assumption.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
};

export const PreferenceReferenceBlock: AskBlockRenderer<'PREFERENCE_REFERENCE'> = ({ block }) => (
  // FRD §11.4: privacy-appropriate summary copy only, plus a visibility
  // disclosure -- "change/forget" controls are suggested follow-up
  // messages (the chip row below the response), not action links, since
  // these are commands rather than navigation.
  <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">{block.visibility.replace(/_/g, ' ').toLowerCase()}</span>
    </div>
    <p className="mt-2 text-sm leading-5 text-slate-700">{block.summary}</p>
    {block.expiresAt && <p className="mt-2 text-xs text-slate-600">Expires {new Date(block.expiresAt).toLocaleDateString()} unless reconfirmed.</p>}
  </section>
);

export const WhyNowBlock: AskBlockRenderer<'WHY_NOW'> = ({ block }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.confidenceLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{block.confidenceLabel.toLowerCase()} confidence</span>}
    </div>
    {block.timingNote && <p className="mt-2 text-sm text-slate-600">{block.timingNote}</p>}
    {block.triggerCodes.length > 0 && (
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{block.triggerCodes.map((code) => <li key={code}>{code.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
    )}
  </section>
);

export const RecommendationChangeBlock: AskBlockRenderer<'RECOMMENDATION_CHANGE'> = ({ block }) => {
  const categoryLabel = block.category === 'MATERIAL' ? 'This changes the recommendation'
    : block.category === 'CONFIDENCE_ONLY' ? 'The recommendation stayed the same; confidence changed'
      : block.category === 'SYSTEM_METHOD_ONLY' ? 'Only the calculation method changed, not your home’s facts'
        : 'Nothing material changed';
  return (
    <section className={cn('rounded-2xl border p-4', block.category === 'MATERIAL' ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white')}>
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      <p className="mt-2 text-sm leading-5 text-slate-700">{categoryLabel}</p>
      {block.previousVerdict !== block.currentVerdict && (
        <p className="mt-2 text-sm text-slate-800"><span className="line-through text-slate-500">{block.previousVerdict.replace(/_/g, ' ')}</span> {'→'} <span className="font-semibold">{block.currentVerdict.replace(/_/g, ' ')}</span></p>
      )}
      {block.changedFactors.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">{block.changedFactors.map((factor) => <li key={factor} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{factor.replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
      )}
    </section>
  );
};

export const ChangeSummaryBlock: AskBlockRenderer<'CHANGE_SUMMARY'> = ({ block }) => {
  const materialityTone = block.materiality === 'URGENT' ? 'border-red-200 bg-red-50'
    : block.materiality === 'IMPORTANT' ? 'border-amber-200 bg-amber-50/70'
      : 'border-slate-200 bg-white';
  const materialityBadge = block.materiality === 'URGENT' ? 'bg-red-100 text-red-800'
    : block.materiality === 'IMPORTANT' ? 'bg-amber-200 text-amber-900'
      : 'bg-slate-100 text-slate-600';
  return (
    <section className={cn('rounded-2xl border p-4', materialityTone)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-950">{block.source}</h3>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', materialityBadge)}>{block.materiality.toLowerCase()}</span>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-700">{block.summary}</p>
      <p className="mt-2 text-xs text-slate-600">
        Detected {new Date(block.detectedAt).toLocaleDateString()}
        {block.effectiveAt && ` · Effective ${new Date(block.effectiveAt).toLocaleDateString()}`}
      </p>
      {block.linkedAction && <div className="mt-3"><ActionLink action={{ id: `${block.id}-linked-action`, label: block.linkedAction.label, href: block.linkedAction.href, style: 'SECONDARY' }} /></div>}
    </section>
  );
};
