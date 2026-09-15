import { resolveItemActionDispatch } from '../interactionDispatch';
import type { AskItemActionInteractionType } from '../types';

describe('resolveItemActionDispatch', () => {
  it('routes CONVERSATION_CONTINUE and MUTATE_RECORD through the ask() pipeline with entity context', () => {
    expect(resolveItemActionDispatch('CONVERSATION_CONTINUE')).toEqual({ kind: 'ASK_WITH_ENTITY_CONTEXT' });
    expect(resolveItemActionDispatch('MUTATE_RECORD')).toEqual({ kind: 'ASK_WITH_ENTITY_CONTEXT' });
  });

  it('routes FILTER_RESULT through ask() without forcing entity/operation context', () => {
    expect(resolveItemActionDispatch('FILTER_RESULT')).toEqual({ kind: 'ASK_FILTER_ONLY' });
  });

  it('routes REFRESH to a direct re-read, not an ask() turn', () => {
    expect(resolveItemActionDispatch('REFRESH')).toEqual({ kind: 'REFRESH' });
  });

  it('fails visibly rather than silently for interaction types no UI wires up yet', () => {
    const unsupported: AskItemActionInteractionType[] = ['DISMISS', 'REMIND_LATER', 'CONFIRM', 'EDIT_PROPOSAL', 'NAVIGATE'];
    for (const type of unsupported) {
      const dispatch = resolveItemActionDispatch(type);
      expect(dispatch.kind).toBe('UNSUPPORTED');
      expect(dispatch.kind === 'UNSUPPORTED' && dispatch.reason.length).toBeTruthy();
    }
  });

  it('throws rather than silently no-opping for an interaction type with no declared branch', () => {
    expect(() => resolveItemActionDispatch('SOMETHING_NEW' as AskItemActionInteractionType)).toThrow();
  });
});
