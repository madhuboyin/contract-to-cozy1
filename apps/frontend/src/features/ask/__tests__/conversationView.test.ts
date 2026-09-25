import {
  canFoldResult, conversationViewKey, EMPTY_CONVERSATION_VIEW, readConversationView, reconcileConversationView, resultHeadline, toggleId, writeConversationView,
} from '../conversationView';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 IW-PRES-021 (FRD v1.95).

const memory = (): Storage => {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, clear: () => data.clear(), getItem: (key) => data.get(key) ?? null, key: (index) => Array.from(data.keys())[index] ?? null, removeItem: (key) => { data.delete(key); }, setItem: (key, value) => { data.set(key, value); } };
};

describe('folding and pinning state', () => {
  test('round trips per session, and one session never sees another\'s', () => {
    const storage = memory();
    writeConversationView(storage, 's1', { folded: ['a'], pinned: ['b'] });
    expect(readConversationView(storage, 's1')).toEqual({ folded: ['a'], pinned: ['b'] });
    expect(readConversationView(storage, 's2')).toEqual(EMPTY_CONVERSATION_VIEW);
    expect(storage.getItem(conversationViewKey('s1'))).not.toContain('question');
  });

  test('unreadable or hostile stored values give the empty view, and ids are bounded and unique', () => {
    const storage = memory();
    storage.setItem(conversationViewKey('s1'), '{not json');
    expect(readConversationView(storage, 's1')).toEqual(EMPTY_CONVERSATION_VIEW);
    storage.setItem(conversationViewKey('s1'), JSON.stringify({ folded: ['a', 'a', 7, '', 'x'.repeat(200)], pinned: 'nope' }));
    expect(readConversationView(storage, 's1')).toEqual({ folded: ['a'], pinned: [] });
    storage.setItem(conversationViewKey('s1'), JSON.stringify({ folded: Array.from({ length: 150 }, (_, index) => `e${index}`), pinned: [] }));
    expect(readConversationView(storage, 's1').folded).toHaveLength(100);
  });

  test('toggling adds and removes an id, and a result that left the conversation cannot stay pinned', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
    const view = { folded: ['a', 'gone'], pinned: ['b', 'gone'] };
    expect(reconcileConversationView(view, [{ executionId: 'a' }, { executionId: 'b' }])).toEqual({ folded: ['a'], pinned: ['b'] });
    expect(reconcileConversationView({ folded: ['a'], pinned: [] }, [{ executionId: 'a' }])).toEqual({ folded: ['a'], pinned: [] });
  });
});

describe('the headline and what can fold', () => {
  const blocks = (list: unknown[]) => list as Parameters<typeof resultHeadline>[0]['blocks'];
  test('the headline is the summary title, else the first block title, else the question, and is cut at 140 characters', () => {
    expect(resultHeadline({ question: 'Q?', blocks: blocks([{ type: 'BOUNDARY', id: 'x', title: 'Not this', body: '', severity: 'INFO', suggestions: [] }, { type: 'SUMMARY', id: 's', title: 'Two tasks are overdue', body: '', tone: 'DEFAULT', actions: [] }]) })).toBe('Two tasks are overdue');
    expect(resultHeadline({ question: 'Q?', blocks: blocks([{ type: 'BOUNDARY', id: 'x', title: 'Planning range', body: '', severity: 'INFO', suggestions: [] }]) })).toBe('Planning range');
    expect(resultHeadline({ question: '  What is due?  ', blocks: [] })).toBe('What is due?');
    expect(resultHeadline({ question: 'Q', blocks: blocks([{ type: 'SUMMARY', id: 's', title: 'x'.repeat(200), body: '', tone: 'DEFAULT', actions: [] }]) })).toHaveLength(140);
    expect(resultHeadline({ question: 'Q', blocks: blocks([{ type: 'SUMMARY', id: 's', title: 'x'.repeat(140), body: '', tone: 'DEFAULT', actions: [] }]) })).toHaveLength(140);
    expect(resultHeadline({ question: 'Q', blocks: blocks([{ type: 'SUMMARY', id: 's', title: 'x'.repeat(145), body: '', tone: 'DEFAULT', actions: [] }]) })).toBe(`${'x'.repeat(139)}…`);
  });

  test('a result still waiting on the homeowner cannot fold', () => {
    const settled = { status: 'ANSWERED', confirmation: null, clarification: null, captureRequests: [] } as never;
    expect(canFoldResult(settled)).toBe(true);
    expect(canFoldResult({ ...(settled as object), status: 'NEEDS_CONFIRMATION' } as never)).toBe(false);
    expect(canFoldResult({ ...(settled as object), confirmation: { confirmationId: 'c' } } as never)).toBe(false);
    expect(canFoldResult({ ...(settled as object), captureRequests: [{}] } as never)).toBe(false);
    expect(canFoldResult({ ...(settled as object), status: 'RUNNING' } as never)).toBe(false);
  });
});
