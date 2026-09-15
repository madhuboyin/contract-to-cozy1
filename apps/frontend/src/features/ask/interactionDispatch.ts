import type { AskItemActionInteractionType } from './types';

// ASK_COZY_INTERACTION_MODEL_UI_FRD §7 (ACT-001/ACT-003), external review
// round (2026-09-14): item actions carried a typed `interactionType` on the
// contract, but every one of them still fell through to a single generic
// `ask()` call at the render layer -- the type was decorative. This is the
// one place that decision is made, so a new interactionType added to
// AskItemActionInteractionType has to be given a branch here (the `never`
// check below fails the build otherwise) instead of silently inheriting
// whatever the fallthrough case used to do.
export type ItemActionDispatch =
  // MUTATE_RECORD/CONVERSATION_CONTINUE: routed through the existing
  // AskExecution/ask() pipeline with the item's own entity/operation
  // forced, per the user's explicit decision to keep that machinery (the
  // receipt/reconciliation/history/revalidation work in FRD §§18-31 is
  // built on AskExecution rows; a row action still produces one).
  | { kind: 'ASK_WITH_ENTITY_CONTEXT' }
  // FILTER_RESULT: identical to a declared filter chip -- message only, no
  // entity/operation forced, since a filter targets the result, not a row.
  | { kind: 'ASK_FILTER_ONLY' }
  // REFRESH: no ask() turn at all -- re-reads the current execution.
  | { kind: 'REFRESH' }
  // Declared but not reachable from an item action today (either the
  // domain policy doesn't exist yet -- DISMISS/REMIND_LATER, see FRD §16 --
  // or the contract has no data this dispatcher could act on -- CONFIRM/
  // EDIT_PROPOSAL belong to ConfirmationCard's own execution, and NAVIGATE
  // has no href on AskGroupedListItemAction). ACT-003: "Unsupported actions
  // fail visibly and safely" -- this never silently no-ops.
  | { kind: 'UNSUPPORTED'; reason: string };

export function resolveItemActionDispatch(interactionType: AskItemActionInteractionType): ItemActionDispatch {
  switch (interactionType) {
    case 'CONVERSATION_CONTINUE':
    case 'MUTATE_RECORD':
      return { kind: 'ASK_WITH_ENTITY_CONTEXT' };
    case 'FILTER_RESULT':
      return { kind: 'ASK_FILTER_ONLY' };
    case 'REFRESH':
      return { kind: 'REFRESH' };
    case 'DISMISS':
    case 'REMIND_LATER':
      return { kind: 'UNSUPPORTED', reason: 'This action is not available yet.' };
    case 'CONFIRM':
    case 'EDIT_PROPOSAL':
      return { kind: 'UNSUPPORTED', reason: 'Use the confirmation card to review and confirm this change.' };
    case 'NAVIGATE':
      return { kind: 'UNSUPPORTED', reason: 'This link is not available from here.' };
    default: {
      const exhaustive: never = interactionType;
      throw new Error(`No dispatch declared for interaction type: ${String(exhaustive)}`);
    }
  }
}
