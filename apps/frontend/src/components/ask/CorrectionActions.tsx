'use client';

import type { AskItemActionInteractionType } from '@/features/ask/types';

type CorrectionAction = { id: string; label: string; message: string; operationId: string; interactionType: AskItemActionInteractionType };

export type CorrectionActionHandler = (
  entityType: string | null | undefined,
  entityId: string,
  message: string,
  operationId: string,
  interactionType: AskItemActionInteractionType,
) => void;

// The correction buttons a record's inline detail offers. Up to three sit inline; a longer list is folded behind one
// "Correct a detail" disclosure so the detail stays readable. Each button dispatches its exact declared action with
// the record's own identity.
export function CorrectionActions({ actions, subject, entityType, entityId, disabled, onAction }: {
  actions: readonly CorrectionAction[];
  subject: string;
  entityType: string | null | undefined;
  entityId: string;
  disabled?: boolean;
  onAction: CorrectionActionHandler;
}) {
  if (actions.length === 0) return null;
  const buttons = actions.map((action) => (
    <button
      key={action.id} type="button" disabled={disabled}
      className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
      onClick={() => onAction(entityType, entityId, action.message, action.operationId, action.interactionType)}
    >
      {action.label}<span className="sr-only"> for {subject}</span>
    </button>
  ));
  const group = <div className="flex flex-wrap gap-2" role="group" aria-label={`Corrections for ${subject}`}>{buttons}</div>;
  if (buttons.length <= 3) return <div className="mt-4">{group}</div>;
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <summary className="min-h-8 cursor-pointer text-sm font-semibold text-teal-800">Correct a detail</summary>
      <div className="mt-3">{group}</div>
    </details>
  );
}
