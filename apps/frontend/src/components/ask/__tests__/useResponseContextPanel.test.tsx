/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useResponseContextPanel } from '../workspace/useResponseContextPanel';
import { contextPanelStorageKey } from '../workspace/support';

const withContext = (id: string, extra: Record<string, unknown> = {}) => ({ executionId: id, sessionId: 's1', property: { id: 'p1' }, blocks: [{ type: 'ASSUMPTIONS', items: [{}] }], ...extra }) as any;
const plain = (id: string) => ({ executionId: id, sessionId: 's1', property: { id: 'p1' }, blocks: [] }) as any;
const key = contextPanelStorageKey('s1', 'p1');

function setup(executions: any[], overrides: Record<string, unknown> = {}) {
  const props = { mode: 'page' as const, sessionId: 's1', selectedPropertyId: 'p1', executions, ...overrides };
  const hook = renderHook((p: typeof props) => useResponseContextPanel(p as any), { initialProps: props });
  return { hook, props };
}

beforeEach(() => { window.sessionStorage.clear(); window.history.replaceState(null, '', '/'); (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }); });

describe('useResponseContextPanel', () => {
  it('opens a result\'s context: records it, pushes one history entry, and closing goes back', () => {
    const { hook } = setup([withContext('e1')]);
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    act(() => hook.result.current.openResponseContext(withContext('e1'), trigger));
    expect(hook.result.current.contextExecutionId).toBe('e1');
    expect(hook.result.current.contextContentAvailable).toBe(true);
    expect(window.sessionStorage.getItem(key)).toBe('e1');
    expect(window.history.state.askResponseContext).toEqual({ sessionId: 's1', propertyId: 'p1', executionId: 'e1' });
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    act(() => hook.result.current.closeResponseContext());
    expect(hook.result.current.contextExecutionId).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('opening the same result twice adds only one history entry', () => {
    const { hook } = setup([withContext('e1')]);
    const trigger = document.createElement('button');
    const push = jest.spyOn(window.history, 'pushState');
    act(() => hook.result.current.openResponseContext(withContext('e1'), trigger));
    act(() => hook.result.current.openResponseContext(withContext('e1'), trigger));
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('closing does not go back when there is no history entry for that result', () => {
    const { hook } = setup([withContext('e1')]);
    window.sessionStorage.setItem(key, 'e1');
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    act(() => hook.result.current.closeResponseContext());
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('closing does not go back when the history entry belongs to another result', () => {
    const { hook } = setup([withContext('e1'), withContext('e2')]);
    act(() => hook.result.current.openResponseContext(withContext('e2'), document.createElement('button')));
    act(() => hook.result.current.openResponseContext(withContext('e1'), document.createElement('button')));
    window.history.replaceState({ askResponseContext: { sessionId: 's1', propertyId: 'p1', executionId: 'e2' } }, '', window.location.href);
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    act(() => hook.result.current.closeResponseContext());
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('reopens the stored result after a reload, only if it still has context', () => {
    window.sessionStorage.setItem(key, 'e1');
    const ok = setup([withContext('e1')]);
    expect(ok.hook.result.current.contextExecutionId).toBe('e1');
    window.sessionStorage.setItem(key, 'e2');
    const gone = setup([plain('e2')]);
    expect(gone.hook.result.current.contextExecutionId).toBeNull();
  });

  it('closes itself when the open result loses its context', () => {
    const { hook, props } = setup([withContext('e1')]);
    act(() => hook.result.current.openResponseContext(withContext('e1'), document.createElement('button')));
    expect(hook.result.current.contextExecutionId).toBe('e1');
    hook.rerender({ ...props, executions: [plain('e1')] });
    expect(hook.result.current.contextExecutionId).toBeNull();
  });

  it('back and forward move the panel between the recorded result and closed', () => {
    const { hook } = setup([withContext('e1')]);
    act(() => { window.dispatchEvent(Object.assign(new Event('popstate'), { state: { askResponseContext: { sessionId: 's1', propertyId: 'p1', executionId: 'e1' } } })); });
    expect(hook.result.current.contextExecutionId).toBe('e1');
    expect(window.sessionStorage.getItem(key)).toBe('e1');
    act(() => { window.dispatchEvent(Object.assign(new Event('popstate'), { state: null })); });
    expect(hook.result.current.contextExecutionId).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    act(() => { window.dispatchEvent(Object.assign(new Event('popstate'), { state: { askResponseContext: { sessionId: 'other', propertyId: 'p1', executionId: 'e1' } } })); });
    expect(hook.result.current.contextExecutionId).toBeNull();
    act(() => { window.dispatchEvent(Object.assign(new Event('popstate'), { state: { askResponseContext: { sessionId: 's1', propertyId: 'p2', executionId: 'e1' } } })); });
    expect(hook.result.current.contextExecutionId).toBeNull();
  });

  it('is a wide side panel only on the page at a wide screen', () => {
    (window as any).matchMedia = (q: string) => ({ matches: q === '(min-width: 1280px)', media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    expect(setup([]).hook.result.current.wideContextPanel).toBe(true);
    expect(setup([], { mode: 'panel' }).hook.result.current.wideContextPanel).toBe(false);
  });
});
